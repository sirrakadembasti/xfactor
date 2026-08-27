import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: asyncHandler wraps rejections and passes to next(err)
// =========================================================================
await runAsyncTest('1. asyncHandler should intercept async rejections and invoke next(err)', async () => {
    const { asyncHandler } = await import('../security.js');

    let passedError = null;
    const next = (err) => {
        passedError = err;
    };

    const faultyHandler = asyncHandler(async (req, res) => {
        throw new Error('Async repository error');
    });

    faultyHandler({}, {}, next);

    // Wait microtask tick for promise resolution
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(passedError !== null, 'Hata next fonksiyonuna aktarılmalıdır.');
    assert.strictEqual(passedError.message, 'Async repository error');
});

// =========================================================================
// TEST 2: Successful async handler completes without error
// =========================================================================
await runAsyncTest('2. asyncHandler should allow successful handlers to proceed normally', async () => {
    const { asyncHandler } = await import('../security.js');

    let called = false;
    let nextCalled = false;
    const next = () => {
        nextCalled = true;
    };

    const goodHandler = asyncHandler(async (req, res) => {
        called = true;
    });

    goodHandler({}, {}, next);
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(called, true);
    assert.strictEqual(nextCalled, false);
});

finish();
