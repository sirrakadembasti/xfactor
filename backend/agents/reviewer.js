import { extractAndParseJSON, validateReviewResult, normalizeReviewResult } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_REVIEWER_PROMPT = `
Sen bir "Reviewer" (Kod İnceleme) ajanısın (reviewer.agent).
Görevin, Coder ajanı tarafından üretilen kodları syntax, mimari standartlar, güvenlik açıkları ve eksiklikler açısından incelemektir.

MİSYON:
1. Üretilen dosyaları ve görevin gereksinimlerini karşılaştır.
2. Kodda açık veya hata yoksa "approved: true" ver.
3. Hata veya eksiklik varsa "approved: false" vererek net düzeltme talimatlarını (feedback) yaz.
4. Çıktını KESİNLİKLE aşağıdaki JSON şemasında üret.

JSON ÇIKTI ŞEMASI:
{
  "approved": true,
  "summary": "Kod inceleme sonucu ve değerlendirmesi",
  "feedback": "Gerekli düzeltme adımları veya onay notu",
  "issues": []
}
`;

export const REVIEWER_SYSTEM_PROMPT = loadAgentPromptFromDocs('reviewer', FALLBACK_REVIEWER_PROMPT);
export function buildReviewerPrompt(taskTitle, targetFiles, producedFiles) {
    return `Görev Başlığı: ${taskTitle}
Hedef Dosyalar: ${JSON.stringify(targetFiles)}

Üretilen Dosyalar ve Kod İçerikleri:
"""
${JSON.stringify(producedFiles, null, 2)}
"""

Lütfen kodları incele ve değerlendirme kararını JSON formatında döndür.`;
}

export function parseReviewerResponse(rawText) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { summary: rawText };
    }
    return normalizeReviewResult(data);
}
