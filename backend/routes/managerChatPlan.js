import { normalizeManagerPlan, validateManagerPlan } from '../agents/schemas.js';

// Exact commands only: questions, negations and scope changes are not approval.
export function isManagerApproval(message) {
    const text = String(message || '').toLocaleLowerCase('tr-TR').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').trim()
        .replace(/[.!]+$/, '').replace(/\s+/g, ' ');
    return /^(?:varsayimlarla devam (?:et|edelim)|(?:bu |mevcut )?plani onayliyorum|onayliyorum|onayla|(?:projeyi |uretimi |uretime )?(?:baslat|basla|baslayalim|gec)|tamam|tamamdir|yapalim|insa et|uret)$/.test(text);
}

const patchFailure = error => ({ plan: null, candidate: null, error, isPatch: true });
function inspectBrowserPatch(envelope, baseContract) {
    try {
        if (Buffer.byteLength(JSON.stringify(envelope), 'utf8') > 131072) throw new Error('Plan patch exceeds size limit.');
        let nodes = 0;
        const checkKeys = (value, depth = 0) => {
            if (++nodes > 4096 || depth > 24) throw new Error('Plan patch exceeds structural limits.');
            if (!value || typeof value !== 'object') return;
            for (const key of Object.keys(value)) {
                if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe plan patch key.');
                checkKeys(value[key], depth + 1);
            }
        };
        checkKeys(envelope);
        const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
            && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
        const patch = envelope.planPatch;
        if (!exactKeys(envelope, ['planPatch']) || !exactKeys(patch, ['baseContractId', 'baseContractHash', 'set'])
            || !exactKeys(patch.set, ['browser']) || !exactKeys(patch.set.browser, ['roleJourneys'])
            || !Array.isArray(patch.set.browser.roleJourneys)) throw new Error('Plan patch accepts only set.browser.roleJourneys.');
        if (!baseContract || baseContract.status !== 'approved' || typeof patch.baseContractId !== 'string'
            || !/^[a-f0-9]{64}$/.test(patch.baseContractHash)
            || patch.baseContractId !== baseContract.id || patch.baseContractHash !== baseContract.contract_hash) {
            return { ...patchFailure('Plan patch approved base is missing or stale.'), stale: true };
        }
        const base = typeof baseContract.contract_json === 'string' ? JSON.parse(baseContract.contract_json) : structuredClone(baseContract.contract_json);
        const draft = structuredClone(base);
        draft.browser = { ...draft.browser, ...structuredClone(patch.set.browser) };
        validateManagerPlan(draft, { requireManagement: true });
        // Normalize a separate copy: normalization must never rewrite approved non-browser scope.
        const normalized = normalizeManagerPlan(structuredClone(draft));
        draft.browser = normalized.browser;
        validateManagerPlan(draft, { requireManagement: true });
        return { plan: draft, candidate: draft, error: null, isPatch: true,
            baseContractId: patch.baseContractId, baseContractHash: patch.baseContractHash };
    } catch (error) { return patchFailure(error.message); }
}

export function inspectManagerPlan(text, baseContract = null) {
    const source = String(text || '').trim();
    const blocks = [...source.matchAll(/```json\s*\n?([\s\S]*?)```/gi)].map(match => match[1]);
    if (source.startsWith('{')) blocks.push(source);
    // Typed patches cannot fall through to prose, legacy full plans, or automatic repair.
    for (const block of blocks) {
        try {
            const value = JSON.parse(block);
            if (value && typeof value === 'object' && Object.hasOwn(value, 'planPatch')) return inspectBrowserPatch(value, baseContract);
        } catch {}
    }
    if (/"planPatch"\s*:/.test(source)) return patchFailure('Plan patch JSON is malformed.');
    let candidate = null;
    let error = null;
    for (const block of blocks) {
        try {
            const value = JSON.parse(block);
            if (!value || typeof value !== 'object' || Array.isArray(value)
                || !(value.summary || value.talimatname || value.domains)) continue;
            candidate = value;
            validateManagerPlan(value, { requireManagement: true });
            return { plan: normalizeManagerPlan(value), candidate: value, error: null };
        } catch (failure) {
            error = candidate ? failure.message : 'Plan JSON nesnesi eksik veya geçersiz.';
        }
    }
    if (!blocks.length && /"(?:talimatname|domains)"\s*:|\[PLAN_HAZIR\]/.test(source)) {
        error = 'Plan, eksiksiz tek bir JSON nesnesi olarak verilmelidir.';
    }
    return { plan: null, candidate, error };
}

export function canRepairManagerFixtures(result) {
    return Boolean(result.candidate?.management?.needed
        && /management\.resources\.verification|management browser\.roleJourneys/.test(result.error || ''));
}

export function buildManagerPlanRepairRequest(result, message, previousResponse = '') {
    if (!canRepairManagerFixtures(result)) return {
        task: 'Eksiksiz plan JSON nesnesini üret. Kullanıcının kapsamını ve varsayımlarını koru.',
        validationError: result.error, request: message, draft: result.candidate || previousResponse
    };
    const draft = result.candidate;
    const issues = [];
    for (const resource of draft.management?.resources || []) {
        const retention = resource.verification?.retention;
        if (['preserve', 'cascade'].includes(resource.deletionPolicy?.relatedData)
            && (!retention?.createPath || !retention.itemPath || !retention.parentField
                || !JSON.stringify(retention.createBody || {}).includes('{parentId}'))) {
            issues.push(`${resource.name}: gerçek bağlı kayıt için verification.retention eksik/geçersiz. createBody içinde bu kaynağın ID'sini temsil eden {parentId} zorunlu; ilgisiz modele ait sabit ID kullanma.`);
        }
    }
    for (const role of draft.management?.roles || []) {
        for (const kind of ['positive', 'negative']) {
            if (!draft.browser?.roleJourneys?.some(journey => journey.role === role.name && journey.kind === kind)) {
                issues.push(`${role.name}: ${kind} tarayıcı yolculuğu eksik. Gerekirse negative için authState anonymous seç ve reddedilen erişimi somut adımlarla tanımla.`);
            }
        }
    }
    return {
        task: 'Tam planı, şartnameyi ve SQL/kodu tekrar YAZMA. Yalnız eksik test sözleşmesi alanlarını düzelt. Tek JSON nesnesi: {"resourceUpdates":[{"name":"mevcut kaynak adı","verification":{...düzeltilen fixture alanları...}}],"roleJourneys":[...yalnız eksik/düzeltilecek yolculuklar...]}. Kaynak, rol, izin, API yolu veya silme politikası değiştirme. Önceden verilen deleteExpectation değeri ve türünü aynen koru; changed/value eşanlamları sunucu tarafından field/equals olarak çevrilir.',
        validationError: result.error, issues, request: message, draft
    };
}

export function applyManagerPlanCorrection(original, response) {
    const fullPlan = inspectManagerPlan(response);
    if (!original) return fullPlan;
    // Legacy full responses may supply fixtures, but cannot change an existing scope.
    if (fullPlan.plan) {
        if (!canRepairManagerFixtures(inspectManagerPlan(JSON.stringify(original)))) {
            if (typeof original.management?.needed === 'boolean'
                && original.management.needed !== fullPlan.plan.management.needed) return { plan:null, candidate:original, error:'Düzeltme mevcut yönetim kapsamını değiştiremez.' };
            return fullPlan;
        }
        response = JSON.stringify({
            resourceUpdates: (fullPlan.plan.management.resources || []).map(resource => ({ name: resource.name, verification: resource.verification })),
            roleJourneys: fullPlan.plan.browser?.roleJourneys || []
        });
    }
    try {
        const block = String(response).trim().match(/^```json\s*([\s\S]*?)\s*```$/i);
        const patch = JSON.parse(block ? block[1] : response);
        if (!patch || Object.keys(patch).some(key => !['resourceUpdates', 'roleJourneys'].includes(key))) return fullPlan;
        const draft = structuredClone(original);
        const names = new Set();
        for (const update of patch.resourceUpdates || []) {
            const resource = draft.management?.resources?.find(item => item.name === update.name);
            if (!resource || names.has(update.name) || !update.verification || typeof update.verification !== 'object' || Array.isArray(update.verification)
                || Object.keys(update).some(key => !['name', 'verification'].includes(key))) throw new Error('Düzeltme yalnız mevcut kaynakların test fixture alanlarını değiştirebilir.');
            names.add(update.name);
            const expectation = resource.verification?.deleteExpectation;
            resource.verification = { ...resource.verification, ...update.verification };
            if (expectation) resource.verification.deleteExpectation = expectation;
        }
        for (const resource of draft.management?.resources || []) {
            const expectation = resource.verification?.deleteExpectation;
            if (expectation?.kind === 'changed' && Object.hasOwn(expectation, 'value')) {
                resource.verification.deleteExpectation = { kind: 'field', field: expectation.field, equals: expectation.value };
            }
        }
        const journeyKeys = new Set();
        for (const journey of patch.roleJourneys || []) {
            const key = `${journey.role}:${journey.kind}`;
            if (!draft.management?.roles?.some(role => role.name === journey.role)
                || !['positive', 'negative'].includes(journey.kind) || journeyKeys.has(key)) throw new Error('Yolculuk düzeltmesi mevcut rol ve test türüne ait olmalıdır.');
            journeyKeys.add(key);
            draft.browser ||= {};
            draft.browser.roleJourneys ||= [];
            const index = draft.browser.roleJourneys.findIndex(item => item.role === journey.role && item.kind === journey.kind);
            if (index < 0) draft.browser.roleJourneys.push(journey);
            else draft.browser.roleJourneys[index] = journey;
        }
        return inspectManagerPlan(JSON.stringify(draft));
    } catch (failure) {
        return { plan: null, candidate: original, error: failure.message.startsWith('Düzeltme') || failure.message.startsWith('Yolculuk') ? failure.message : 'Plan düzeltme JSON nesnesi geçersiz.' };
    }
}

export const MANAGER_PLAN_CONTRACT_RULES = `
Yalnız onaylı planın tarayıcı yolculuklarını değiştirme istendiğinde tam planı tekrar üretme. Sunucunun verdiği mevcut APPROVED baseContractId/baseContractHash değerlerini aynen kullan: {"planPatch":{"baseContractId":"...","baseContractHash":"64 hex","set":{"browser":{"roleJourneys":[...]}}}}. Başka set/envelope anahtarı yasaktır. Pending taslak base değildir. Tüm rol positive/negative yolculuklarını gerçek navigate/fill/select/submit adımlarıyla koru; patch yalnız yeni onay bekleyen taslak oluşturur, onay veya üretim başlatmaz.
PLAN SÖZLEŞMESİ: Yalnız tek, eksiksiz JSON nesnesi döndür; önsöz, Markdown kod bloğu, SQL/uygulama kodu veya düğme talimatı yazma.
summary, talimatname, domains, requirements, management alanları zorunlu. management.needed=false ise somut gerekçe yaz; yönetim gerektiren bir projede doğrulamadan kaçmak için false seçme.
management.needed=true ise authentication, resources, roles ve her rol için browser.roleJourneys positive/negative zorunlu.
Yeni/revize create kaynaklarında verification.createBody gerçek zorunlu model alanlarını ve identityField ile seçilen benzersiz alanda tam "{nonce}" değerini içermeli; update varsa somut updateBody içinde aynı identityField ve "{nonce}" bulunmalı. Genel name/title gövdesini başka modellere uygulama. Mevcut kanonik verification, deletionPolicy ve retention alanlarını koruyarak eksikleri tamamla.
Yabancı anahtar için gerçek kayıt oluştur: verification.setup veya ayrı verification.retention.setup en fazla 8 adım içerir. Adım yalnız name/resource/role/createPath/createBody alanlarını taşır; name benzersiz harfle başlayan en fazla 32 harf/rakam/alt çizgi, resource create işlemi olan tanımlı kaynak, createPath onun apiPath değeriyle aynı güvenli yerel yoldur. role isteğe bağlıdır; varsa ilgili create izni olmalıdır. Global URL, method, headers veya sabit/uydurma ID kullanma.
Önceki setup adımının ID'sini tam "{fixture:room.id}" değeriyle türünü koruyarak kullan; gömülü/ileri/bilinmeyen referans üretme. Ana createBody/updateBody kendi setup adlarını; retention.createBody yalnız retention.setup adlarını ve "{parentId}" kullanır. Göreli tarih tam "{date:+1d}"/"{date:-1d}"/"{date:0d}" biçimindedir, ofset -3650..3650 gün; bilinmeyen şablon yasak. Her gövde boş olmayan JSON nesnesi, en fazla 32768 UTF-8 bayt, derinlik 20 ve 2048 düğümdür.
Silme beklentisi deleteExpectation: {"kind":"absent"} veya {"kind":"field","field":"status","equals":"void"}; "changed"/"value" kullanma.
deletionPolicy.relatedData preserve/cascade olduğunda somut retentionRule VE verification.retention zorunlu:
{"createPath":"/api/related","createBody":{"parentId":"{parentId}","note":"{nonce}"},"parentField":"parentId","itemPath":"/api/related/{id}"}.
Örnek yolları kopyalama; her kaynak için gerçek ilişkili modele, gerekli alanlara ve planın API yollarına uyarlayıp doldur.
Sadece okunan kaynaklarda mutation/silme beklentisi üretme. Kaynak işlemleri en az bir rolün permissions listesinde kapsanmalıdır.
Plan özeti, şartname ve domain açıklamalarında aynı bilgiyi tekrarlama; uygulama kodu üretme.
`;
