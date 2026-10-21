import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAgent } from '../agents/index.js';
import { buildReviewerPrompt, parseReviewerResponse } from '../agents/reviewer.js';
import { executeCorrectionLoop } from '../engine/selfCorrection.js';

const context = 'CURRENT PROJECT CONTEXT\nFile: prisma/schema.prisma\nmodel User { role String }\nFile: src/lib/auth.ts\nexport function hashPassword(value: string): string { return value; }\nOMITTED CONTEXT\n- src/routes/large.ts: budget (whole file)';
const files = [{ path: 'prisma/seed.ts', content: 'export const seeded = true;' }];

test('correction sends the same scoped integration context to each real reviewer request', async () => {
    const reviewer = getAgent('reviewer');
    const build = reviewer.buildPrompt;
    // Before the fix, fail before any provider call: tests must never contact a live LLM.
    reviewer.buildPrompt = (...args) => {
        assert.equal(args[4], context, 'Correction must forward scoped project context before requesting a review');
        return build(...args);
    };
    const messages = [];
    try {
        const result = await executeCorrectionLoop({ taskId: 'seed-task', taskTitle: 'Seed', targetFiles: ['prisma/seed.ts'],
            initialCoderOutput: { files }, coderPrompt: 'Existing coder contract', projectContext: context, maxRetries: 1,
            generate: async request => {
                messages.push(request);
                if (messages.length === 1) return JSON.stringify({ approved: false, summary: 'Actual defect', feedback: 'Fix seed content', issues: ['prisma/seed.ts:1 concrete mismatch'] });
                if (messages.length === 2) return JSON.stringify({ summary: 'Fixed', files });
                return JSON.stringify({ approved: true, summary: 'Approved', issues: [], suggestions: ['Optional cleanup'] });
            } });
        assert.equal(result.approved, true);
        assert.equal(messages.length, 3);
        for (const request of [messages[0], messages[2]]) {
            assert.ok(request[1].content.includes(context));
            assert.match(request[1].content, /prisma\/seed\.ts/);
            assert.match(request[1].content, /CURRENT PROJECT CONTEXT/);
        }
    } finally {
        reviewer.buildPrompt = build;
    }
});

test('explicit unresolved issues reject optimistic prose while optional suggestions preserve explicit approval', () => {
    assert.equal(parseReviewerResponse(JSON.stringify({ approved: true, summary: 'Kod onaylandı',
        issues: ['prisma/seed.ts:1 incompatible model field'], suggestions: [] })).approved, false);
    assert.equal(parseReviewerResponse(JSON.stringify({ approved: false, summary: 'Kod onaylandı', issues: [], suggestions: ['Optional cleanup'] })).approved, false);
    assert.equal(parseReviewerResponse('Kod onaylandı. Yalnız isteğe bağlı öneriler var.').approved, false);
    assert.equal(parseReviewerResponse(JSON.stringify({ approved: true, summary: 'Approved', issues: [], suggestions: ['Optional cleanup'] })).approved, true);
});

test('reviewer prompt remains compatible without context and states evidence-based blocker rules', () => {
    const prompt = buildReviewerPrompt('Seed', ['prisma/seed.ts'], files, 'Seed requirements', context);
    assert.ok(prompt.includes(context));
    assert.match(prompt, /suggestions/);
    assert.match(prompt, /issues/);
    assert.ok(!buildReviewerPrompt('Legacy', [], []).includes('undefined'));
});
