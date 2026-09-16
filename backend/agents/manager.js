import { extractAndParseJSON, validateManagerPlan, normalizeManagerPlan, formatUntrustedPromptContext } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_MANAGER_PROMPT = `
Sen "Manager" adında kıdemli bir yazılım mimarı ve proje yöneticisisin (manager.agent).
Muhatabın "Boss" (kullanıcı) ve projenin gereksinimleridir.

MİSYON:
1. Boss'un doğal dille ilettiği proje isteğini analiz et, mimariyi tasarla ve kapsamı belirle.
2. Paket sürümü listelerini tarihleyip kopyalama; merkezi güncel-stabil stack politikasını kullan. Nihai sürüm ve lockfile yalnızca izole worker tarafından çözülür.
3. Her rol için giriş, yetki, UI, API, şema/veri yazımı ve görünür sonuçtan oluşan uçtan uca rol yolculuklarını kabul kriteri olarak tanımla; helper veya tek ekranı tamamlanmış yolculuk sayma.
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
    return normalizeManagerPlan(data);
}
