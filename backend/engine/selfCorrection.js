/**
 * Otonom Kod İnceleme & Self-Correction (Otomatik Düzeltme) Döngüsü
 * Referans: Archon Self-Correction & Review Gate
 */

import { getAgent } from '../agents/index.js';
import { generateLLMResponse } from '../llm.js';

/**
 * Coder ve Reviewer arasında iterative geri besleme döngüsü yürütür.
 */
export async function executeCorrectionLoop({
    taskId,
    taskTitle,
    targetFiles,
    initialCoderOutput,
    coderPrompt,
    maxRetries = 2,
    onFeedback
}) {
    let currentOutput = initialCoderOutput;
    let iterations = 0;
    const reviewer = getAgent('reviewer');
    const coder = getAgent('coder');

    while (iterations <= maxRetries) {
        iterations++;

        // 1. Reviewer İncelemesi
        const reviewPrompt = reviewer.buildPrompt(taskTitle, targetFiles, currentOutput.files);
        const reviewMessages = [
            { role: 'system', content: reviewer.systemPrompt },
            { role: 'user', content: reviewPrompt }
        ];

        const rawReview = await generateLLMResponse(reviewMessages);
        const reviewResult = reviewer.parseResponse(rawReview);

        // Onaylandı ise başarıyla çık
        if (reviewResult.approved) {
            return {
                approved: true,
                finalOutput: currentOutput,
                review: reviewResult,
                iterations
            };
        }

        // Onaylanmadı ve deneme hakkı dolduysa
        if (iterations > maxRetries) {
            return {
                approved: false,
                finalOutput: currentOutput,
                review: reviewResult,
                iterations
            };
        }

        // Onaylanmadıysa geri bildirim yayınla ve Coder'a düzeltme yaptır
        if (onFeedback) {
            await onFeedback({
                iteration: iterations,
                feedback: reviewResult.feedback,
                summary: reviewResult.summary
            });
        }

        const fixPrompt = `${coderPrompt}\n\nÖnceki İnceleme Geri Bildirimi (${iterations}. Tur):\n"""\n${reviewResult.feedback || reviewResult.summary}\n"""\nLütfen belirtilen eksiklikleri/hataları düzelterek kodları JSON formatında yeniden üret.`;
        const coderMessages = [
            { role: 'system', content: coder.systemPrompt },
            { role: 'user', content: fixPrompt }
        ];

        const rawCoder = await generateLLMResponse(coderMessages);
        currentOutput = coder.parseResponse(rawCoder);
    }

    return {
        approved: false,
        finalOutput: currentOutput,
        iterations
    };
}
