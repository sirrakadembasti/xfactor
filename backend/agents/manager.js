import { extractAndParseJSON, validateManagerPlan, normalizeManagerPlan, formatUntrustedPromptContext } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_MANAGER_PROMPT = `
Sen "Manager" adında kıdemli bir yazılım mimarı ve proje yöneticisisin (manager.agent).
Muhatabın "Boss" (kullanıcı) ve projenin gereksinimleridir.

MİSYON:
1. Boss'un doğal dille ilettiği proje isteğini analiz et, mimariyi tasarla ve kapsamı belirle.
2. SEÇİLEN TEKNOLOJİ YIĞINININ EN GÜNCEL STABİL SÜRÜMLERİNİ KULLAN (Next.js 15+, React 19/18.3, Prisma 6+, Node 22 LTS). Boss farklı bir teknoloji (Nuxt/Vue, Python, .NET vb.) talep ettiğinde o teknolojinin en güncel stabil sürümlerini mimariye dök.
3. Projeyi birbirinden bağımsız mantıklı "domain"lere böl (Örn: "frontend", "backend" veya tek Next.js monorepo).
4. ÇALIŞTIRILABİLİRLİK GÜVENCESİ: Projede Prisma/SQLite kullanılıyorsa, TALIMATNAME içine mutlaka '.env.example' dosyasını '.env' olarak kopyala (copy .env), 'NEXTAUTH_SECRET' değerini uzun rastgele bir anahtarla değiştir ve 'DATABASE_URL="file:./dev.db"' tanımını koru dediğini yaz.
5. Çıktını KESİNLİKLE aşağıdaki JSON şemasına uygun olarak üret. JSON dışında hiçbir açıklama veya markdown metni üretme.
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
    return normalizeManagerPlan(data);
}
