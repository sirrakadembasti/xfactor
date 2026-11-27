import { digest, safeWorkerPath } from '../verification/workerFailures.js';
import { isProtectedOrchestrationPath } from './codeGenerator.js';

const HASH = /^[a-f0-9]{64}$/;
const MAX_TARGETS = 12;
export function protectedSuccessfulRepairPaths(context) {
    const seedChecks = (context?.checks || []).filter(check => ['prisma_seed','prisma_seed_accounts'].includes(check.gate_name));
    return seedChecks.some(check => check.gate_name === 'prisma_seed_accounts' && check.status === 'PASS')
        && !seedChecks.some(check => check.status === 'FAIL')
        ? (context.files || []).filter(file => file.path === 'prisma/seed.ts').map(file => file.path) : [];
}
export const controlledRepairSourceHash = files => digest(files.map(file => ({ path: file.path, sha256: file.sha256 || digest(file.content) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb']);
const fail = (message, stale = false) => { throw Object.assign(new Error(message), {
    code: stale ? 'CONTROLLED_REPAIR_STALE' : 'CONTROLLED_REPAIR_PLAN_INVALID', status: stale ? 409 : 400
}); };
function record(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
        || Object.keys(value).some(key => !allowed.includes(key))) fail('Geçersiz onarım önerisi alanı.');
}
function text(value, limit) {
    if (typeof value !== 'string' || !value.trim() || value.length > limit) fail('Onarım açıklaması eksik veya sınırı aşıyor.');
    return value.trim();
}
function strings(value, limit, required = true, label = 'liste') {
    const reason = !Array.isArray(value) ? 'dizi değil' : value.length > limit ? `en fazla ${limit} öğe`
        : required && !value.length ? 'boş'
        : value.some(item => typeof item !== 'string' || !item || item.length > 300) ? 'geçersiz öğe'
        : new Set(value).size !== value.length ? 'yinelenen öğe' : null;
    if (reason) fail(`Geçersiz onarım bağlantı listesi (${label}: ${reason}).`);
    return [...value].sort();
}
function canonicalPath(value) {
    const normalized = safeWorkerPath(value);
    if (!normalized || normalized !== value || normalized.split('/').some(part => /[. ]$|[<>"|?*]/.test(part)
        || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i.test(part))) fail('Dosya yolu platformlar arasında tek bir güvenli dosyayı tanımlamıyor.');
    return normalized;
}
function sourcePath(value, target = false) {
    const normalized = canonicalPath(value);
    if (isProtectedOrchestrationPath(normalized)
        || /(?:^|\/)\.env(?!\.example$)(?:[./]|$)/i.test(normalized)
        || /(?:^|\/)\.npmrc$/i.test(normalized)
        || LOCKFILES.has(normalized.split('/').at(-1).toLowerCase())) fail('Onarım dosya yolu güvenli veya izinli değil.');
    if (target && (/(?:^|\/)(?:eslint\.config\.[^/]+|\.eslintrc(?:\.[^/]+)?|tsconfig(?:\.[^/]+)?\.json)$/i.test(normalized)
        || (!/\.(?:[cm]?[jt]sx?|json|prisma|css|md|sql|html)$/i.test(normalized)
            && !['Dockerfile', '.dockerignore', '.env.example'].includes(normalized)))) fail('Bu dosya türü onarım hedefi olamaz.');
    return normalized;
}

// Pure proposal inspection: no filesystem writes, model dispatch, lease or approval.
export function requiredLintRepairPaths(context) {
    const paths = new Set(context.files.map(file => file.path));
    const result = new Set();
    for (const check of context.checks) {
        if (check.gate_name !== 'lint' || check.status !== 'FAIL') continue;
        for (const match of `${check.stdout || ''}\n${check.stderr || ''}`.matchAll(/^\/workspace\/([^:\r\n]+):\d+:\d+\s*$/gm)) {
            if (paths.has(match[1])) result.add(match[1]);
        }
    }
    return [...result].sort();
}
export function inspectControlledRepairPlan(payload, context) {
    let serialized;
    try { serialized = JSON.stringify(payload); } catch { fail('Onarım önerisi serileştirilemiyor.'); }
    if (!serialized || Buffer.byteLength(serialized) > 65536) fail('Onarım önerisi boyut sınırını aşıyor.');
    record(payload, ['summary', 'targets']);
    const { projectId, contract, artifact, run } = context || {};
    if (!projectId || !contract?.id || contract.status !== 'approved' || !HASH.test(contract.contract_hash || '')
        || !Number.isInteger(contract.revision) || contract.revision < 1
        || !artifact?.id || !HASH.test(artifact.sha256 || '') || artifact.project_id !== projectId
        || artifact.contract_id !== contract.id || typeof run?.id !== 'string' || !run.id.trim()
        || run?.project_id !== projectId || run?.contract_id !== contract.id
        || run.status !== 'failed' || artifact.verification_run_id !== run.id) fail('Onaylı sözleşme veya son başarısız kaynak kaydı eşleşmiyor.', true);
    let approved;
    try { approved = JSON.parse(contract.contract_json); } catch { fail('Onaylı kapsam okunamıyor.', true); }
    if (!Array.isArray(approved.requirements) || !approved.requirements.length) fail('Onaylı gereksinimler eksik.', true);
    const requirementIds = new Set();
    for (const requirement of approved.requirements) {
        if (typeof requirement.id !== 'string' || !requirement.id || requirementIds.has(requirement.id)) fail('Onaylı gereksinim kimlikleri geçersiz.', true);
        requirementIds.add(requirement.id);
    }
    if (!Array.isArray(context.files) || !context.files.length || !Array.isArray(context.checks) || !context.checks.length) fail('Kaynak veya kontrol envanteri eksik.');
    const files = new Map(), aliases = new Set();
    for (const file of context.files) {
        const normalized = canonicalPath(file.path);
        if (!HASH.test(file.sha256 || '') || aliases.has(normalized.toLowerCase())) fail('Kaynak envanteri belirsiz veya geçersiz.');
        aliases.add(normalized.toLowerCase()); files.set(normalized, file);
    }
    const checks = new Map();
    for (const check of context.checks) {
        if (!check.id || checks.has(check.id)) fail('Kontrol kimliği belirsiz.');
        if (check.run_id !== run.id || check.contract_id !== contract.id) fail('Kontrol kaydı başka koşu veya sözleşmeye ait.', true);
        checks.set(check.id, check);
        const reason = check.reason || '';
        if (check.gate_name === 'clean_install' && ['FAIL','BLOCKED'].includes(check.status)
            && /timed\s*out|timeout|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ENOTFOUND|ETIMEDOUT/i.test(reason)) {
            fail('Bağımlılık kurulumunun ortam/zaman aşımı engeli kaynak onarımına çevrilemez; önce çalıştırma ortamını doğrulayın.');
        }
        if (['FAIL', 'BLOCKED'].includes(check.status) && /\bspawn(?:[^\r\n]{0,512})?\s(?:UNKNOWN|EACCES|EPERM|ENOENT|ENOMEM|EAGAIN)\b|LOCAL_HOST_/i.test(reason)) {
            fail('Çalıştırıcı engeli kaynak onarımına çevrilemez; önce doğrulama ortamı incelenmelidir.');
        }
    }
    if (!Array.isArray(payload.targets) || !payload.targets.length || payload.targets.length > MAX_TARGETS) fail('Onarım hedef sayısı sınır dışında.');
    const isTestPath = value => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\./i.test(value);
    const behaviorReferences = new Set([...files.keys()].filter(value => /\.[cm]?[jt]sx?$/i.test(value)
        && !isTestPath(value) && !/\.d\.ts$|(?:^|\/)(?:[^/]*\.config\.[^/]+|scripts\/)/i.test(value)));
    const targetAliases = new Set(), knownReferences = new Set(files.keys()), coveredChecks = new Set();
    const coveredRequirements = new Set(strings(context.projectedRequirementIds || [], 1024, false, 'projectedRequirementIds'));
    if ([...coveredRequirements].some(id => !requirementIds.has(id))) fail('Görev kapsamı onaylı gereksinimlerle eşleşmiyor.');
    const targets = payload.targets.map(target => {
        record(target, ['path', 'create', 'requirementIds', 'checkIds', 'instructions', 'referencePaths']);
        const path = sourcePath(target.path, true), alias = path.toLowerCase();
        if (protectedSuccessfulRepairPaths(context).includes(path)) fail('Başarılı seed kaynağı kayıtlı seed hatası olmadan değiştirilemez; eksik gereksinimi gerçek davranış testinde kapsayın.');
        if (targetAliases.has(alias) || typeof target.create !== 'boolean'
            || (target.create ? aliases.has(alias) : !files.has(path))) fail('Hedef yeni/mevcut kaynakla eşleşmiyor veya yineleniyor.');
        targetAliases.add(alias);
        const requirements = strings(target.requirementIds, 128, true, `${path} requirementIds`);
        const outOfScope = requirements.filter(id => !requirementIds.has(id));
        if (outOfScope.length) fail(`Hedef onaylı kapsam dışındaki bir gereksinimi kullanıyor (${path}: ${outOfScope.join(', ')}).`);
        const checkIds = strings(target.checkIds, 128, true, `${path} checkIds`);
        const notFailing = checkIds.filter(id => !['FAIL', 'BLOCKED'].includes(checks.get(id)?.status));
        if (notFailing.length) fail(`Hedef güncel başarısız kontrole bağlı değil (${path}: ${notFailing.join(', ')}). Geçerli kimlikler: `
            + `${[...checks.values()].filter(check => ['FAIL', 'BLOCKED'].includes(check.status)).map(check => check.id).join(', ')}.`);
        const references = strings(target.referencePaths, 32, false, `${path} referencePaths`).map(file => sourcePath(file));
        if (references.some(file => !knownReferences.has(file))) fail('Salt okunur referans eksik veya henüz oluşturulmamış.');
        const hasBehaviorReference = references.some(file => behaviorReferences.has(file));
        if (isTestPath(path) && !hasBehaviorReference) fail(`Gerçek davranış testi hedefi sınanacak uygulama modülünü salt okunur referans olarak belirtmeli; paket veya şema metni yeterli değildir (${path}). `
            + 'Test dışı bir uygulama kaynağı (.js/.ts/.tsx) ya da daha önce bu kuralı karşılamış bir test hedefi gerekir; tests/ altındaki yardımcılar tek başına sayılmaz.');
        for (const id of requirements) coveredRequirements.add(id);
        for (const id of checkIds) coveredChecks.add(id);
        knownReferences.add(path);
        if (isTestPath(path) && hasBehaviorReference) behaviorReferences.add(path);
        return { path, create: target.create, sourceSha256: target.create ? null : files.get(path).sha256,
            requirementIds: requirements, checkIds, instructions: text(target.instructions, 4096), referencePaths: references };
    });
    const missingLintPaths = requiredLintRepairPaths(context).filter(path => !targets.some(target => target.path === path));
    if (missingLintPaths.length) fail(`Kod denetiminde hata veren dosyalar öneride eksik: ${missingLintPaths.join(', ')}.`);
    const missingChecks = context.checks.filter(check => check.applicability === 'MANDATORY' && ['FAIL', 'BLOCKED'].includes(check.status)
        && !coveredChecks.has(check.id));
    if (missingChecks.length) fail(`Başarısız zorunlu kontrol için onarım hedefi eksik: ${[...new Set(missingChecks.map(check => check.gate_name))].join(', ')}.`);
    const uncoveredRequirementIds = approved.requirements.filter(requirement => requirement.mandatory !== false
        && !coveredRequirements.has(requirement.id)).map(requirement => requirement.id).sort();
    const proposal = { version: 1, projectId, contractId: contract.id, contractHash: contract.contract_hash,
        contractRevision: contract.revision, baselineArtifactId: artifact.id, baselineArtifactSha256: artifact.sha256,
        baselineRunId: run.id, baselineSourceHash: controlledRepairSourceHash([...files.values()]),
        summary: text(payload.summary, 2000), targets, uncoveredRequirementIds, ready: uncoveredRequirementIds.length === 0 };
    return { ...proposal, planHash: digest(proposal) };
}
