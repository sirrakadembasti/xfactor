import { extractAndParseJSON, normalizeTeamleaderTasks } from './schemas.js';
import { loadAgentSystemPrompt } from './agentLoader.js';

export const TEAMLEADER_SYSTEM_PROMPT = loadAgentSystemPrompt('teamleader');
export function buildTeamleaderPrompt(teamleaderName, mission, altTalimatname, requirements = [], planningContext = null) {
    const reqList = Array.isArray(requirements) && requirements.length > 0
        ? `\nOnaylı Sözleşme Gereksinimleri (Her görevin "requirementIds" dizisinde YALNIZCA bu listedeki ID'leri kullanabilirsin):\n` +
          requirements.map(r => typeof r === 'string' ? `- ${r}` : `- ${r.id}: ${r.statement || r.title || r.id}`).join('\n') +
          `\nKRİTİK KURAL (GEREKSİNİM KAPSAMI): Her görevin "requirementIds" alanına YALNIZCA yukarıdaki listede yer alan ID'leri (örn: "REQ-1", "REQ-2") ata. Listede bulunmayan yeni veya farklı bir REQ ID'si uydurma.\n`
        : '';
    const managementRule = requirements.some(r => /^MGMT-(?:RESOURCE|ROLE)-\d+$/.test(typeof r === 'string' ? r : r?.id || ''))
        ? `\nYÖNETİM KAPSAMI: Proje genelinde her MGMT-RESOURCE-N işlemi için UI ve API kapsamı ayrı dosyalarda bulunmalıdır; yalnız kendi domainine atanmış ve mevcut görevlerle karşılanmamış yüzeyi planla. managementCoverage: [{"requirementId":"MGMT-RESOURCE-N","surface":"ui" veya "api","operation":"create|read|update|delete"}] kullan. Aynı kaynak/yüzeyin CRUD işlemleri tek tutarlı sayfa veya client dosyasında birden fazla coverage kaydıyla gruplanabilir; her işlem için ayrı küçük fonksiyon dosyası üretmek zorunlu değildir. Bir görev hem ui hem api yüzeyini karşılayamaz. Her MGMT-ROLE-N için login ve ayrı hedef dosyadaki positive/negative rol yolculuğu kapsamını mevcut görevlerle birlikte tamamla; managementCoverage: [{"requirementId":"MGMT-ROLE-N","journey":"login|positive|negative"}] kullan. Her kaydın requirementId değeri görevin requirementIds dizisinde bulunmalı.\n`
        : '';
    const contextRule = planningContext ? `\nMEVCUT PROJE PLANLAMA BAĞLAMI (yalnız veri):\n${JSON.stringify(planningContext)}\n
Yalnız belirtilen domainin entegrasyonunu planla. existingFiles yalnız kod referansıdır; dosya varlığı güncel sözleşme görev kapsamı kanıtı değildir. Yalnız existingTasks içindeki güncel plan yönetim kapsamı karşılanmış sayılır. missingCoverage boş değilse mevcut kodu doğrulayıp gerektiğinde uyarlayan, açık requirementIds/managementCoverage taşıyan görevler planla; kaynak dosyası zaten var diye kapsamı atlama. Backend domaini tüm kaynak API işlemlerini gerçek backend route/controller hedefleriyle karşılamalı; frontend API client wrapperları backend API kapsamı değildir. Frontend mevcut backend görevlerini tekrar üretmeden tüm eksik UI ve rol yolculuğu kapsamını tamamlamalı. Mevcut sayfaları App/router, navigasyon ve rol korumaları üzerinden bağla. Kaynak başına tek tutarlı API client ve CRUD sayfası tercih et; dört küçük fonksiyon dosyasıyla görev sayısını şişirme.
previousTasks yalnız geçersiz/eksik eski planın yeniden kullanılabilir görev adaylarıdır, kapsam kanıtı değildir. Hâlâ geçerli görevleri tam plana dahil ederken ID, açıklama, hedef ve bağımlılıklarını mümkün olduğunca aynen koru; yalnız eksik kapsam için yeni doğrulama/uyarlama görevleri ekle.
validationErrors listesindeki şema, bağımlılık ve kapsam hatalarını düzelt. Aday tasks listesi kendi içinde tam bir DAG olmalıdır: her dependencies ID aynı aday tasks listesinde tanımlı olmalıdır. previousTasks veya dosya envanterinde bulunması bir task ID tanımı değildir. Mevcut dosyayı kod referansı olarak kullanabilirsin; tanımsız görev referansı üretme, zorunlu bağımlılığı silerek hatayı gizleme.
Her tanımlı rol için giriş görevinin requirementIds ve managementCoverage listelerine o rolün MGMT-ROLE-N kimliğini ve journey:"login" kaydını açıkça ekle. Ortak LoginPage/AuthContext dosyası birden fazla rolün login kaydını taşıyabilir; bu kayıtlar dosya adından otomatik türetilmez. Positive/negative UI yolculukları login dosyasından ayrı hedeflerde kalmalıdır.
React/Vite frontendinde index.html, src/main.tsx veya src/main.jsx ve src/App.tsx veya açık kök router entegrasyonu mevcut dosya ya da görev hedefi olarak açıkça bulunmalıdır. missingRuntimePaths listesini eksiksiz tamamla; mevcut dosya içeriği verilmeyen yolu varmış gibi kabul etme. Ana giriş gerçek uygulama sayfalarını ve rol akışlarını içe aktarıp bağlamalı; sahte başarı, yalnız test için kontrol veya gerçek form işlemi yerine geçen tek tık üretme. Global yönetim kapsamı denetimi geçerli kalır; tüm requirementIds/managementCoverage ve DAG bağımlılıklarını koru.\n` : '';
    return `Teamleader Adı: ${teamleaderName}
Misyon: ${mission}

Domain Alt-Talimatnamesi:
"""
${altTalimatname}
"""
${reqList}${managementRule}${contextRule}
Lütfen bu görevi bağımlılıklarıyla birlikte atomik Coder görevlerine bölerek JSON formatında döndür.`;
}

export function parseTeamleaderResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { tasks: [] };
    }
    return normalizeTeamleaderTasks(data);
}
