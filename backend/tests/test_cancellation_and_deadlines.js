import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. Cancellation registry should register, signal, and unregister controllers', async () => {
    const {
        registerProjectAbortController,
        abortProjectExecution,
        getProjectAbortSignal,
        unregisterProjectAbortController
    } = await import('../engine/cancellation.js');

    const projectId = `proj-cancel-${Date.now()}`;
    const controller = new AbortController();

    registerProjectAbortController(projectId, controller);
    assert.strictEqual(getProjectAbortSignal(projectId), controller.signal);
    assert.strictEqual(controller.signal.aborted, false);

    const aborted = abortProjectExecution(projectId, 'PAUSED');
    assert.strictEqual(aborted, true);
    assert.strictEqual(controller.signal.aborted, true);
    assert.strictEqual(controller.signal.reason, 'PAUSED');

    unregisterProjectAbortController(projectId);
    assert.strictEqual(getProjectAbortSignal(projectId), null);
});

await runAsyncTest('2. runWithConcurrency should immediately halt queue dispatch when signal aborts', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const controller = new AbortController();
    const executed = [];

    const items = [1, 2, 3, 4, 5, 6];
    const poolPromise = runWithConcurrency(items, 2, async (item) => {
        executed.push(item);
        if (item === 2) {
            controller.abort('STOP');
        }
        await new Promise(r => setTimeout(r, 20));
        return item * 10;
    }, { signal: controller.signal });

    const results = await poolPromise;
    assert.ok(executed.length <= 4, 'Pool must not execute remaining items after abort');
});

await runAsyncTest('3. generateLLMResponse should reject immediately on timeout or abort signal', async () => {
    const { generateLLMResponse } = await import('../llm.js');

    const controller = new AbortController();
    controller.abort('USER_CANCEL');

    await assert.rejects(
        () => generateLLMResponse([{ role: 'user', content: 'test' }], {
            signal: controller.signal,
            allowMockFallback: false
        }),
        /abort|cancel/i
    );

    const delayedSignal = AbortSignal.timeout(10);
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(delayedSignal.aborted, true);

    await assert.rejects(
        () => generateLLMResponse([{ role: 'user', content: 'timeout test' }], {
            signal: delayedSignal,
            allowMockFallback: false
        }),
        /abort|timeout/i
    );
});

await runAsyncTest('4. abortProjectExecution should release workflow attempt as paused', async () => {
    const { createProject, deleteProject } = await import('../projectRepository.js');
    const { acquireWorkflowLease, getActiveWorkflowAttempt } = await import('../workflowAttempts.js');
    const { registerProjectAbortController, abortProjectExecution } = await import('../engine/cancellation.js');
    const { db } = await import('../db.js');

    const project = await createProject({ title: 'Pause Abort Test Project' });
    const lease = acquireWorkflowLease(project.id, 'worker-pause-test');
    const controller = new AbortController();
    registerProjectAbortController(project.id, controller);

    assert.strictEqual(getActiveWorkflowAttempt(project.id)?.id, lease.attempt.id);

    const paused = abortProjectExecution(project.id, 'PAUSED');
    assert.strictEqual(paused, true);
    assert.strictEqual(controller.signal.aborted, true);

    const { releaseWorkflowLease } = await import('../workflowAttempts.js');
    releaseWorkflowLease(lease.attempt.id, 'paused', { leaseOwner: 'worker-pause-test' });

    const attempt = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(lease.attempt.id);
    assert.strictEqual(attempt.status, 'paused');
    assert.strictEqual(getActiveWorkflowAttempt(project.id), null, 'Lease must be free after pause');

    await deleteProject(project.id);
});

await runAsyncTest('5. computePlanHash should produce stable hash and detect plan revisions', async () => {
    const { computePlanHash } = await import('../engine/workflow.js');

    const plan1 = {
        summary: 'E-Ticaret',
        talimatname: '# Şartname v1',
        domains: [{ name: 'backend' }, { name: 'frontend' }]
    };
    const plan2 = {
        summary: 'E-Ticaret',
        talimatname: '# Şartname v1',
        domains: [{ name: 'backend' }, { name: 'frontend' }]
    };
    const planRevised = {
        summary: 'E-Ticaret Revize',
        talimatname: '# Şartname v2',
        domains: [{ name: 'backend' }, { name: 'frontend' }, { name: 'admin' }]
    };

    const hash1 = computePlanHash(plan1);
    const hash2 = computePlanHash(plan2);
    const hashRevised = computePlanHash(planRevised);

    assert.strictEqual(hash1, hash2, 'Identical plans must produce identical hashes');
    assert.notStrictEqual(hash1, hashRevised, 'Revised plan must produce different hash');
    assert.match(hash1, /^[a-f0-9]{64}$/);
    assert.strictEqual(hash1, computePlanHash({ domains: plan1.domains, talimatname: plan1.talimatname, summary: plan1.summary }));
    const managed = { ...plan1, requirements: [{ id: 'REQ-1', mandatory: true }],
        management: { roles: [{ name: 'admin', permissions: ['read'] }] },
        browser: { roleJourneys: [{ role: 'admin', kind: 'positive' }] } };
    for (const change of [
        { requirements: [{ id: 'REQ-1', mandatory: false }] },
        { management: { roles: [{ name: 'admin', permissions: ['delete'] }] } },
        { browser: { roleJourneys: [{ role: 'admin', kind: 'negative' }] } }
    ]) assert.notStrictEqual(computePlanHash(managed), computePlanHash({ ...managed, ...change }));
});

await runAsyncTest('6. LLM_TRUNCATED is thrown across all agent purposes including coder [AGT-2]', async () => {
    const { generateLLMResponse } = await import('../llm.js');
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({
            choices: [{
                finish_reason: 'length',
                message: { content: 'function unfinished(' }
            }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        await assert.rejects(
            () => generateLLMResponse([{ role: 'user', content: 'code this' }], {
                provider: 'openai',
                apiKey: 'test-key',
                baseURL: 'https://api.openai.com/v1',
                purpose: 'coder',
                allowMockFallback: false
            }),
            (err) => err.code === 'LLM_TRUNCATED'
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

await runAsyncTest('7. Google REST empty response throws LLM_EMPTY_RESPONSE without falling through [AGT-5]', async () => {
    const { generateLLMResponse } = await import('../llm.js');
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({
            candidates: [{
                content: { parts: [] }
            }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });

        await assert.rejects(
            () => generateLLMResponse([{ role: 'user', content: 'generate' }], {
                provider: 'google',
                apiKey: 'test-google-key',
                allowMockFallback: false
            }),
            (err) => err.code === 'LLM_EMPTY_RESPONSE'
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

finish();
