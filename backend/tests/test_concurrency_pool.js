/**
 * ⚡ XFactor Concurrency Pool & Wave Executor Test Suite
 * Task concurrency limits, pool active task monitoring & wave isolation
 */

import assert from 'assert';
import { runWithConcurrency } from '../engine/workflow.js';

console.log("==================================================");
console.log("⚡ XFactor Concurrency Pool & Wave Executor Tests");
console.log("==================================================");

let passedCount = 0;
let failedCount = 0;

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         Hata: ${err.message}`);
        failedCount++;
    }
}

// 1. Wave Size = 1
await runTest("1. Wave Size = 1: Tek elemanlı dalga doğru tamamlanmalı", async () => {
    let activeTasks = 0;
    let maxActive = 0;

    const items = ['task-1'];
    const results = await runWithConcurrency(items, 2, async (taskId) => {
        activeTasks++;
        maxActive = Math.max(maxActive, activeTasks);
        await new Promise(r => setTimeout(r, 20));
        activeTasks--;
        return { success: true, taskId };
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].taskId, 'task-1');
    assert.strictEqual(maxActive, 1, 'Maksimum aktif görev 1 olmalı');
    assert.strictEqual(activeTasks, 0, 'Tüm görevler bittiğinde aktif görev 0 olmalı');
});

// 2. Wave Size = 2 (Concurrency = 2)
await runTest("2. Wave Size = 2: İki elemanlı dalga paralel çalışmalı ve limit aşılmamalı", async () => {
    let activeTasks = 0;
    let maxActive = 0;

    const items = ['task-1', 'task-2'];
    const results = await runWithConcurrency(items, 2, async (taskId) => {
        activeTasks++;
        maxActive = Math.max(maxActive, activeTasks);
        await new Promise(r => setTimeout(r, 30));
        activeTasks--;
        return { success: true, taskId };
    });

    assert.strictEqual(results.length, 2);
    assert.strictEqual(maxActive, 2, 'Maksimum aktif görev tam 2 olmalı');
    assert.strictEqual(activeTasks, 0, 'Havuz tamamen boşalmalı');
});

// 3. Wave Size = 5, Concurrency = 2 (KRİTİK TEST: Max active hiçbir zaman 2'yi aşmamalı)
await runTest("3. Wave Size = 5, Concurrency = 2: 5 görev havuzlanarak çalışmalı, aktif görev sayısı asla 2'yi geçmemeli", async () => {
    let activeTasks = 0;
    let maxActive = 0;
    const executionLog = [];

    const items = ['t1', 't2', 't3', 't4', 't5'];
    const results = await runWithConcurrency(items, 2, async (taskId) => {
        activeTasks++;
        maxActive = Math.max(maxActive, activeTasks);
        executionLog.push({ event: 'start', taskId, active: activeTasks });

        // Görevlerin tamamlanma süreleri farklı
        const duration = taskId === 't1' ? 40 : (taskId === 't2' ? 20 : 30);
        await new Promise(r => setTimeout(r, duration));

        activeTasks--;
        executionLog.push({ event: 'end', taskId, active: activeTasks });
        return { success: true, taskId };
    });

    assert.strictEqual(results.length, 5, '5 görevin tamamı sonuçlanmalı');
    assert.strictEqual(maxActive, 2, `Maksimum aktif görev tam 2 olmalı (Ölçülen: ${maxActive})`);
    assert.strictEqual(activeTasks, 0, 'Havuz tamamen boşalmalı');

    // Her an için aktif görev sayısının <= 2 olduğunu doğrula
    for (const log of executionLog) {
        assert.ok(log.active <= 2, `Hiçbir anda aktif görev sayısı 2'yi aşamaz! (Kayıt: ${JSON.stringify(log)})`);
    }
});

// 4. Görevlerden biri hata veriyor (Failure & Rejection handling)
await runTest("4. Task Failure Handling: Havuzdaki bir görev hata verdiğinde güvenle yakalanmalı", async () => {
    let activeTasks = 0;
    let maxActive = 0;

    const items = ['t1-ok', 't2-fail', 't3-ok'];
    const results = await runWithConcurrency(items, 2, async (taskId) => {
        activeTasks++;
        maxActive = Math.max(maxActive, activeTasks);
        await new Promise(r => setTimeout(r, 20));
        activeTasks--;

        if (taskId === 't2-fail') {
            return { success: false, taskId, error: 'Reviewer vetosu' };
        }
        return { success: true, taskId };
    });

    assert.strictEqual(results.length, 3, 'Tüm görevler havuzdan geçmeli');
    assert.strictEqual(maxActive, 2, 'Maksimum aktif görev 2 olmalı');
    assert.strictEqual(activeTasks, 0);

    const failed = results.find(r => !r.success);
    assert.ok(failed, 'Hata veren görev bulunmalı');
    assert.strictEqual(failed.taskId, 't2-fail');
    assert.strictEqual(failed.error, 'Reviewer vetosu');
});

// 5. Farklı sürelerde tamamlanan görevler (Out-of-order completion stresi)
await runTest("5. Variable Duration Tasks: Farklı sürelerde (50ms, 10ms, 80ms, 20ms, 30ms) biten görevlerde havuz doğrulaması", async () => {
    let activeTasks = 0;
    let maxActive = 0;

    const items = [
        { id: 't1', duration: 50 },
        { id: 't2', duration: 10 },
        { id: 't3', duration: 80 },
        { id: 't4', duration: 20 },
        { id: 't5', duration: 30 }
    ];

    const results = await runWithConcurrency(items, 2, async (task) => {
        activeTasks++;
        maxActive = Math.max(maxActive, activeTasks);
        await new Promise(r => setTimeout(r, task.duration));
        activeTasks--;
        return { success: true, id: task.id, duration: task.duration };
    });

    assert.strictEqual(results.length, 5, 'Tüm 5 görev tamamlanmalı');
    assert.strictEqual(maxActive, 2, `Maksimum aktif görev sınırı (2) aşılmamalı (Ölçülen: ${maxActive})`);
    assert.strictEqual(activeTasks, 0, 'Havuz temizlenmeli');
});

// 6. Concurrency = 3 ile 10 Görevlik Büyük Havuz
await runTest("6. Concurrency = 3 & 10 Tasks: 10 görevlik dalgada limit 3 olarak katı korunmalı", async () => {
    let activeTasks = 0;
    let maxActive = 0;

    const items = Array.from({ length: 10 }, (_, i) => `task-${i + 1}`);
    const results = await runWithConcurrency(items, 3, async (taskId) => {
        activeTasks++;
        maxActive = Math.max(maxActive, activeTasks);
        await new Promise(r => setTimeout(r, 15));
        activeTasks--;
        return { success: true, taskId };
    });

    assert.strictEqual(results.length, 10);
    assert.strictEqual(maxActive, 3, `Maksimum aktif görev tam 3 olmalı (Ölçülen: ${maxActive})`);
    assert.strictEqual(activeTasks, 0);
});

console.log("==================================================");
console.log(`🎉 Concurrency Pool Testleri: ${passedCount} Başarılı, ${failedCount} Hatalı`);
console.log("==================================================");

if (failedCount > 0) {
    process.exit(1);
}
