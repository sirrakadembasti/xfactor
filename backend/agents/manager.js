import { extractAndParseJSON, validateManagerPlan, normalizeManagerPlan, formatUntrustedPromptContext } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_MANAGER_PROMPT = `
Sen "Manager" adında kıdemli bir yazılım mimarı ve proje yöneticisisin (manager.agent).
Muhatabın "Boss" (kullanıcı) ve projenin gereksinimleridir.

MİSYON:
1. Boss'un doğal dille ilettiği proje isteğini analiz et, mimariyi tasarla ve kapsamı belirle.
2. Paket sürümü listelerini tarihleyip kopyalama; merkezi güncel-stabil stack politikasını kullan. Nihai sürüm ve lockfile yalnızca izole worker tarafından çözülür.
3. Her rol için giriş, yetki, UI, API, şema/veri yazımı ve görünür sonuçtan oluşan uçtan uca rol yolculuklarını kabul kriteri olarak tanımla; helper veya tek ekranı tamamlanmış yolculuk sayma.
3a. Kullanıcı yönetim panelini belirtmese bile her istekte operasyonel yönetim ihtiyacını değerlendir. Kayıtların oluşturulması/değiştirilmesi, kullanıcılar, onaylar ve durum geçişleri varsa uygun paneli, kaynak işlemlerini ve rolleri somut öneri olarak sun. Gerekmediğinde gerekçe yaz. JSON'da management değerlendirmesi zorunludur.
4. İstek belirli seed hesapları ya da kimlik bilgileri içeriyorsa bunları tam değerleriyle zorunlu kabul kriteri yap; eşdeğer veya örnek kimlik bilgisi uydurma.
5. Projeyi birbirinden bağımsız mantıklı "domain"lere böl (Örn: "frontend", "backend" veya tek Next.js monorepo).
6. Prisma/SQLite kullanılıyorsa TALIMATNAME içine .env.example içindeki DATABASE_URL="file:./dev.db" tanımını ve izole worker'da çalıştırılabilir seed gereksinimini yaz.
7. Çıktını KESİNLİKLE aşağıdaki JSON şemasına uygun olarak üret. JSON dışında hiçbir açıklama veya markdown metni üretme.
JSON ÇIKTI ŞEMASI:
{
  "summary": "Projenin 2-3 cümlelik kısa mimari özeti",
  "talimatname": "# Proje Başlığı\\n\\n## 1. Mimari Kararlar...\\n\\n## 2. Kabul Kriterleri...",
  "domains": [
    {
      "name": "frontend",
      "prefix": "frontend",
      "description": "React ve Tailwind tabanlı kullanıcı arayüzü"
    },
    {
      "name": "backend",
      "prefix": "backend",
      "description": "Express.js REST API ve veritabanı servisleri"
    }
  ]
}
`;

export const MANAGER_SYSTEM_PROMPT = loadAgentPromptFromDocs('manager', FALLBACK_MANAGER_PROMPT);
export function buildManagerPrompt(userRequest, conversationHistory = []) {
    let historyContext = "";
    if (conversationHistory.length > 0) {
        const historyText = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
        historyContext = "\n" + formatUntrustedPromptContext('CONVERSATION_HISTORY', historyText);
    }

    const untrustedRequest = formatUntrustedPromptContext('USER_REQUEST', userRequest || '');

    return `Boss'un İstek Metni:
${untrustedRequest}
${historyContext}

Lütfen bu istek doğrultusunda kapsamlı bir TALIMATNAME.md metni ve domain bölünmesini JSON formatında üret.`;
}

export function parseManagerResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { talimatname: rawText };
    }
    const plan = normalizeManagerPlan(data);
    validateManagerPlan(plan, { requireManagement: true });
    return plan;
}

export function formatManagementProposal(management, browser = {}) {
    if (!management?.needed) return `**Yönetim değerlendirmesi:** Bu uygulama için ayrı yönetim akışı önerilmiyor. ${management?.reason || ''}`.trim();
    const resources = management.resources.map(resource =>
        `- **${resource.name}:** ${resource.operations.join(', ')} · UI: ${resource.uiPath} · API: ${resource.apiPath}${resource.readAccess ? ` · Okuma: ${resource.readAccess}` : ''}${resource.deletionPolicy ? ` · İlişkili kayıtlar: ${resource.deletionPolicy.relatedData} (${resource.deletionPolicy.reason})${resource.deletionPolicy.retentionRule ? ` · Saklama kuralı: ${resource.deletionPolicy.retentionRule}` : ''}` : ''}`);
    const roles = management.roles.map(role =>
        `- **${role.name}:** ${role.permissions.map(permission => `${permission.resource} (${permission.operations.join(', ')})`).join('; ')} · Demo: ${role.demoUser.username} (${role.demoUser.setup})`);
    const roleJourneys = management.roles.map(role =>
        `- **${role.name}:** İzinli: ${role.journeys.positive.join('; ')} · Reddedilen: ${role.journeys.negative.join('; ')}`);
    const browserJourneys = (browser.roleJourneys || []).map(journey => {
        const steps = (journey.steps || []).map(step => `${step.action} ${step.selector || step.target || step.url || ''}`.trim()).join(' → ');
        return `- **${journey.role} / ${journey.kind}:** ${steps} → ${journey.expectedOutcome?.kind || ''}: ${journey.expectedOutcome?.text || ''}`;
    });
    return [
        '**Önerilen yönetim kapsamı:** ' + management.reason,
        '**Yönetilecek kaynaklar:**', ...resources,
        '**Roller ve izole test hesapları:**', ...roles,
        '**Rol kabul akışları:**', ...roleJourneys,
        '**Tarayıcı kabul akışları:**', ...browserJourneys,
        `**Giriş:** ${management.authentication.login} · **Hesap sağlama:** ${management.authentication.accountProvisioning} · **Herkese açık kayıt:** ${management.authentication.publicRegistration ? 'Evet' : 'Hayır'}`
    ].join('\n');
}
