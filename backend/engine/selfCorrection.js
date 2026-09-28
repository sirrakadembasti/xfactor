/**
 * Otonom Kod İnceleme & Self-Correction (Otomatik Düzeltme) Döngüsü
 * Referans: Archon Self-Correction & Review Gate
 */

import { parse } from '@babel/parser';
import { getAgent } from '../agents/index.js';
import { runLLMTaskWithRetry } from './llmTaskRetry.js';
import { logWarning } from '../observability.js';
import { validateCoderFiles } from '../agents/schemas.js';

/**
 * Coder ve Reviewer arasında iterative geri besleme döngüsü yürütür.
 */
export async function executeCorrectionLoop({
    taskId,
    taskTitle,
    taskDescription = '',
    targetFiles,
    initialCoderOutput,
    coderPrompt,
    maxRetries = 2,
    onFeedback,
    onLLMDiagnostic = null,
    onUsage = null,
    signal = null
}) {
    let currentOutput = initialCoderOutput;
    let iterations = 0;
    const reviewer = getAgent('reviewer');
    const coder = getAgent('coder');

    while (iterations <= maxRetries) {
        if (signal?.aborted) {
            throw new Error(`Self-correction loop aborted: ${signal.reason || 'ABORTED'}`);
        }
        iterations++;

        // 0. Deterministik Sözdizimi Kontrolü (Babel AST)
        const syntaxIssues = [];
        for (const file of currentOutput?.files || []) {
            const ext = typeof file?.path === 'string' ? file.path.toLowerCase() : '';
            if (ext.endsWith('.ts') || ext.endsWith('.tsx') || ext.endsWith('.js') || ext.endsWith('.jsx')) {
                const plugins = [];
                if (ext.endsWith('.jsx') || ext.endsWith('.tsx') || ext.endsWith('.js')) plugins.push('jsx');
                if (ext.endsWith('.ts') || ext.endsWith('.tsx')) plugins.push('typescript');
                try {
                    parse(file.content, { sourceType: 'unambiguous', plugins });
                } catch (syntaxErr) {
                    syntaxIssues.push(`Sözdizimi hatası veya yarım kalan kod (${file.path}): ${syntaxErr.message}`);
                }
            }
        }

        let reviewResult;
        if (syntaxIssues.length > 0) {
            reviewResult = {
                approved: false,
                summary: syntaxIssues[0],
                feedback: `KOD PARSER HATASI / SÖZDİZİMİ KESİLMESİ:\n${syntaxIssues.join('\n')}\nDosyayı token sınırına takılmadan eksiksiz ve geçerli kapat.`
            };
        } else {
            // 1. Reviewer İncelemesi
            const reviewPrompt = reviewer.buildPrompt(taskTitle, targetFiles, currentOutput.files, taskDescription);
            reviewResult = await runLLMTaskWithRetry({
                agentRole: 'reviewer',
                taskId: `${taskId}.review.${iterations}`,
                signal,
                onDiagnostic: onLLMDiagnostic || undefined,
                onUsage,
                messages: [
                    { role: 'system', content: reviewer.systemPrompt },
                    { role: 'user', content: reviewPrompt }
                ],
                parseResponse: rawReview => reviewer.parseResponse(rawReview)
            });
        }

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

        const fixPrompt = `${coderPrompt}\n\nÖnceki İnceleme Geri Bildirimi (${iterations}. Tur):\n"""\n${reviewResult.feedback || reviewResult.summary}\n"""\n\nKRİTİK VE ZORUNLU TALİMAT:\n1. Belirtilen eksiklikleri, kapanmamış JSX etiketlerini ve sözdizimi hatalarını düzelterek hedef dosyaları (${JSON.stringify(targetFiles)}) eksiksiz kodla.\n2. TOKEN KORUMA & KOMPAKT KOD KURALI: Formu veya bileşeni gereksiz uzunlukta şişirme (maksimum 120-180 satır). Temiz, modern, tip-güvenli, çalışan ve kompakt bir bileşen yaz. Kodun ASLA token sınırına takılıp yarım kesilmesine (truncation) izin verme; tüm fonksiyon ve JSX kapanış etiketlerini mutlaka eksiksiz kapat.\n3. Yanıtını KESİNLİKLE \`\`\`json { "summary": "...", "files": [ { "path": "...", "content": "..." } ] } \`\`\` formatında döndür. Asla boş "files": [] döndürme!`;
        try {
            const newOutput = await runLLMTaskWithRetry({
                agentRole: 'coder',
                taskId: `${taskId}.repair.${iterations}`,
                signal,
                onDiagnostic: onLLMDiagnostic || undefined,
                onUsage,
                messages: [
                    { role: 'system', content: coder.systemPrompt },
                    { role: 'user', content: fixPrompt }
                ],
                parseResponse: rawCoder => {
                    const parsed = coder.parseResponse(rawCoder);
                    validateCoderFiles(parsed, targetFiles);
                    return parsed;
                }
            });
            currentOutput = newOutput;
        } catch (error) {
            logWarning('workflow.coder_output_failed', error, { iteration: iterations });
            throw error;
        }
    }

    return {
        approved: false,
        finalOutput: currentOutput,
        iterations
    };
}
