import assert from 'node:assert/strict';
import { db } from '../db.js';
import { runLLMTaskWithRetry } from '../engine/llmTaskRetry.js';
import { generateLLMResponse } from '../llm.js';
import { formatProjectTokenUsage, getProjectTokenUsage, normalizeTokenUsage, recordProjectTokenUsage } from '../projectTokenUsage.js';

const projectId = 'token-usage-test';
db.prepare('INSERT INTO projects (id, title, status) VALUES (?, ?, ?)').run(projectId, 'Token usage', 'planning');

assert.deepEqual(normalizeTokenUsage({ promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 }), { inputTokens: 120, outputTokens: 30, totalTokens: 150 });
assert.deepEqual(normalizeTokenUsage({ prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }), { inputTokens: 20, outputTokens: 10, totalTokens: 30 });
assert.equal(formatProjectTokenUsage(getProjectTokenUsage(projectId)), 'Token kullanımı: sağlayıcı henüz kullanım bilgisi vermedi.');

await runLLMTaskWithRetry({
    agentRole: 'coder',
    messages: [{ role: 'user', content: 'test' }],
    generate: async (_, options) => {
        options.onUsage({ promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 });
        return 'ok';
    },
    onUsage: usage => recordProjectTokenUsage(projectId, 'google', usage)
});
recordProjectTokenUsage(projectId, 'openai', { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 });
assert.deepEqual(getProjectTokenUsage(projectId), { inputTokens: 140, outputTokens: 40, totalTokens: 180, calls: 2, missingCalls: 0 });
assert.match(formatProjectTokenUsage(getProjectTokenUsage(projectId)), /140 giriş, 40 çıkış, toplam 180 token/);

recordProjectTokenUsage(projectId, 'google', null);
assert.equal(getProjectTokenUsage(projectId).missingCalls, 1);
assert.match(formatProjectTokenUsage(getProjectTokenUsage(projectId)), /en az 180 token.*1 çağrının kullanımı bildirilmedi/);

const originalFetch = globalThis.fetch;
let reportedUsage;
try {
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } })
    });
    assert.equal(await generateLLMResponse([{ role: 'user', content: 'hello' }], {
        provider: 'openai', apiKey: 'test-key', baseURL: 'https://example.invalid/v1/chat/completions',
        onUsage: usage => { reportedUsage = usage; }
    }), 'hello');
    assert.deepEqual(normalizeTokenUsage(reportedUsage), { inputTokens: 7, outputTokens: 3, totalTokens: 10 });
} finally {
    globalThis.fetch = originalFetch;
}
console.log('Project token usage: passed');
