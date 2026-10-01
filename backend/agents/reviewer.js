import { extractAndParseJSON, validateReviewResult, normalizeReviewResult } from './schemas.js';
import { loadAgentPrompt } from './agentLoader.js';

export const REVIEWER_SYSTEM_PROMPT = loadAgentPrompt('reviewer');
export function buildReviewerPrompt(taskTitle, targetFiles, producedFiles, taskDescription = '') {
    return `Görev Başlığı: ${taskTitle}
Görev Gereksinimleri: ${taskDescription}
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
