import { db } from './db.js';

function count(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function normalizeTokenUsage(usage) {
    const inputTokens = count(usage?.promptTokenCount ?? usage?.prompt_tokens);
    const outputTokens = count(usage?.candidatesTokenCount ?? usage?.completion_tokens);
    const totalTokens = count(usage?.totalTokenCount ?? usage?.total_tokens ??
        (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null));
    return { inputTokens, outputTokens, totalTokens };
}

export function recordProjectTokenUsage(projectId, provider, usage) {
    const { inputTokens, outputTokens, totalTokens } = normalizeTokenUsage(usage);
    db.prepare(`
        INSERT INTO project_llm_usage (project_id, provider, input_tokens, output_tokens, total_tokens)
        VALUES (?, ?, ?, ?, ?)
    `).run(projectId, provider, inputTokens, outputTokens, totalTokens);
}

export function getProjectTokenUsage(projectId) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(input_tokens), 0) AS inputTokens,
               COALESCE(SUM(output_tokens), 0) AS outputTokens,
               COALESCE(SUM(total_tokens), 0) AS totalTokens,
               COUNT(*) AS calls,
               SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL OR total_tokens IS NULL THEN 1 ELSE 0 END) AS missingCalls
        FROM project_llm_usage WHERE project_id = ?
    `).get(projectId);
    return { inputTokens: row.inputTokens, outputTokens: row.outputTokens, totalTokens: row.totalTokens, calls: row.calls, missingCalls: row.missingCalls || 0 };
}

export function formatProjectTokenUsage(usage) {
    if (!usage?.calls) return 'Token kullanımı: sağlayıcı henüz kullanım bilgisi vermedi.';
    if (usage.missingCalls) {
        return `Kaydedilen token kullanımı: en az ${usage.totalTokens.toLocaleString('tr-TR')} token; ${usage.missingCalls} çağrının kullanımı bildirilmedi.`;
    }
    return `Kaydedilen token kullanımı: ${usage.inputTokens.toLocaleString('tr-TR')} giriş, ${usage.outputTokens.toLocaleString('tr-TR')} çıkış, toplam ${usage.totalTokens.toLocaleString('tr-TR')} token.`;
}
