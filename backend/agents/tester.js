import { extractAndParseJSON, validateReviewResult, normalizeReviewResult } from './schemas.js';

export const TESTER_SYSTEM_PROMPT = `
Sen bir "Tester" (QA / Test) ajanısın (tester.agent).
Görevin, üretilen projenin veya kod modülünün çalışabilirliğini, sınır durumlarını ve fonksiyonel gereksinimlerini doğrulamaktır.

MİSYON:
1. Üretilen dosyaları ve proje talimatnamesindeki kabul kriterlerini karşılaştır.
2. Fonksiyonel gereksinimlerin karşılandığını doğrula.
3. Çıktını KESİNLİKLE aşağıdaki JSON formatında döndür.

JSON ÇIKTI ŞEMASI:
{
  "approved": true,
  "summary": "Test ve doğrulama özeti",
  "passedCount": 5,
  "failedCount": 0,
  "notes": "Tüm kabul kriterleri başarıyla doğrulandı."
}
`;

export function buildTesterPrompt(projectTitle, acceptanceCriteria, generatedFiles) {
    return `Proje Başlığı: ${projectTitle}
Kabul Kriterleri: ${acceptanceCriteria}

Oluşturulan Proje Dosyaları:
"""
${JSON.stringify(generatedFiles.map(f => ({ path: f.path, preview: f.content ? f.content.slice(0, 300) : "" })), null, 2)}
"""

Lütfen test ve kabul doğrulamasını gerçekleştirip JSON formatında raporla.`;
}

export function parseTesterResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { summary: rawText };
    }
    return normalizeReviewResult(data);
}
