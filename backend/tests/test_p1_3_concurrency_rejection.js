import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Gerçek rejected Promise worker ve fail-fast testi
// =========================================================================
await runAsyncTest('1. runWithConcurrency worker hata fırlattığında ilk hatayı yukarı fırlatmalı ve fail-fast davranmalıdır', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const items = [1, 2, 3, 4, 5, 6];
    const started = [];

    let caughtError = null;
    try {
        await runWithConcurrency(items, 2, async (item) => {
            started.push(item);
            if (item === 2) {
                throw new Error('Worker failure on item 2');
            }
            await new Promise((r) => setTimeout(r, 40));
            return item * 10;
        });
    } catch (err) {
        caughtError = err;
    }

    assert.ok(caughtError !== null, 'Hata yakalanmalıdır');
    assert.strictEqual(caughtError.message, 'Worker failure on item 2');
});

// =========================================================================
// TEST 2: İlk hata sonrası yeni dispatch yapılmadığını doğrula
// =========================================================================
await runAsyncTest('2. runWithConcurrency ilk hata sonrası kuyruktaki yeni görevleri başlatmamalıdır', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const started = [];

    try {
        await runWithConcurrency(items, 2, async (item) => {
            started.push(item);
            if (item === 1) {
                throw new Error('Immediate error');
            }
            await new Promise((r) => setTimeout(r, 50));
            return item;
        });
    } catch (err) {
        // Expected
    }

    assert.ok(started.length <= 3, `Kuyrukta bekleyen görevler başlatılmamalı. Başlatılan: ${started.length}`);
});

// =========================================================================
// TEST 3: Başlatılmış tüm worker’ların settle edildiğini doğrula
// =========================================================================
await runAsyncTest('3. runWithConcurrency hata durumunda başlatılmış tüm workerların bitmesini beklemelidir (settle)', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const items = ['slow-1', 'fast-fail', 'slow-2'];
    const finished = [];

    try {
        await runWithConcurrency(items, 3, async (item) => {
            if (item === 'fast-fail') {
                await new Promise((r) => setTimeout(r, 10));
                throw new Error('Fast failure');
            }
            await new Promise((r) => setTimeout(r, 60));
            finished.push(item);
            return item;
        });
    } catch (err) {
        // Expected
    }

    assert.ok(finished.includes('slow-1'), 'slow-1 worker tamamlanmalı');
    assert.ok(finished.includes('slow-2'), 'slow-2 worker tamamlanmalı');
});

// =========================================================================
// TEST 4: Unhandled rejection oluşmadığını process-level testle doğrula
// =========================================================================
await runAsyncTest('4. runWithConcurrency hiçbir unhandledRejection üretmemelidir', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    let unhandledCount = 0;

    const onUnhandled = () => {
        unhandledCount++;
    };
    process.on('unhandledRejection', onUnhandled);

    try {
        await runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
            if (item % 2 === 0) {
                throw new Error(`Rejection ${item}`);
            }
            return item;
        });
    } catch (err) {
        // Expected
    } finally {
        process.removeListener('unhandledRejection', onUnhandled);
    }

    assert.strictEqual(unhandledCount, 0, 'Hiçbir unhandledRejection tetiklenmemelidir.');
});

// =========================================================================
// TEST 5: Sonuç sırasını input sırasına göre deterministik yap
// =========================================================================
await runAsyncTest('5. runWithConcurrency sonuçları tamamlama süresine göre değil girdi sırasına göre döndürmelidir', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const items = [
        { id: 'first', delay: 80 },
        { id: 'second', delay: 10 },
        { id: 'third', delay: 50 },
        { id: 'fourth', delay: 5 }
    ];

    const results = await runWithConcurrency(items, 2, async (item) => {
        await new Promise((r) => setTimeout(r, item.delay));
        return item.id;
    });

    assert.deepStrictEqual(results, ['first', 'second', 'third', 'fourth'], 'Sonuçlar tam olarak girdi sırasıyla dönmelidir.');
});

finish();
