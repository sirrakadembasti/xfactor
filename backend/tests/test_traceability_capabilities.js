import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import {
    SUPPORTED_STACKS,
    validateContractCapabilities,
    extendSupportedStacks
} from '../contracts/projectContract.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. validateContractCapabilities should strictly reject unsupported frameworks without silent substitution', async () => {
    // 1. Angular is not supported
    const angularCheck = validateContractCapabilities({
        frontend: { framework: 'angular' },
        backend: { framework: 'express' },
        database: { engine: 'sqlite' }
    });
    assert.strictEqual(angularCheck.valid, false);
    assert.ok(angularCheck.errors.some(e => e.toLowerCase().includes('angular')));

    // 2. Svelte is not supported
    const svelteCheck = validateContractCapabilities({
        frontend: { framework: 'svelte' },
        backend: { framework: 'express' }
    });
    assert.strictEqual(svelteCheck.valid, false);
    assert.ok(svelteCheck.errors.some(e => e.toLowerCase().includes('svelte')));

    // 3. Supported stacks pass
    const reactCheck = validateContractCapabilities({
        frontend: { framework: 'react' },
        backend: { framework: 'express' },
        database: { engine: 'sqlite' }
    });
    assert.strictEqual(reactCheck.valid, true);
    assert.strictEqual(reactCheck.errors.length, 0);
});

await runAsyncTest('2. extendSupportedStacks should safely extend the single capability registry', async () => {
    assert.strictEqual(typeof extendSupportedStacks, 'function', 'extendSupportedStacks must be exported');

    const updatedRegistry = extendSupportedStacks({
        frontends: ['vue'],
        backends: ['fastify']
    });

    assert.ok(updatedRegistry.frontends.includes('vue'));
    assert.ok(updatedRegistry.backends.includes('fastify'));
    assert.ok(SUPPORTED_STACKS.frontends.includes('vue'));

    // After extending with adapter, Vue passes
    const vueCheck = validateContractCapabilities({
        frontend: { framework: 'vue' },
        backend: { framework: 'fastify' },
        database: { engine: 'sqlite' }
    });
    assert.strictEqual(vueCheck.valid, true);
});

finish();
