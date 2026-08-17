import { extractAndParseJSON, validateManagerPlan, normalizeManagerPlan } from './schemas.js';

export const MANAGER_SYSTEM_PROMPT = `
Sen "Manager" adında kıdemli bir yazılım mimarı ve proje yöneticisisin (manager.agent).
Muhatabın "Boss" (kullanıcı) ve projenin gereksinimleridir.

MİSYON:
1. Boss'un doğal dille ilettiği proje isteğini analiz et, mimariyi tasarla ve kapsamı belirle.
2. Projeyi birbirinden bağımsız mantıklı "domain"lere böl (Örn: "frontend", "backend", gerekirse "database", "infrastructure").
3. Çıktını KESİNLİKLE aşağıdaki JSON şemasına uygun olarak üret. JSON dışında hiçbir açıklama veya markdown metni üretme.

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

export function buildManagerPrompt(userRequest, conversationHistory = []) {
    let historyContext = "";
    if (conversationHistory.length > 0) {
        historyContext = "\nÖnceki Sohbet Geçmişi:\n" + conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    return `Boss'un İstek Metni:
"""
${userRequest}
"""
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
