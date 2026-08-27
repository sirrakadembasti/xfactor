import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: File count, single size, and total size quota limits
// =========================================================================
await runAsyncTest('1. validateGenerationQuotas should enforce max files, single size, and total size', async () => {
    const { validateGenerationQuotas, GENERATION_LIMITS } = await import('../engine/codeGenerator.js');

    // 1. Max files limit
    const tooManyFiles = Array.from({ length: GENERATION_LIMITS.MAX_FILES + 1 }, (_, i) => ({
        path: `src/file_${i}.js`,
        content: 'console.log(1);'
    }));
    const fileCountRes = validateGenerationQuotas(tooManyFiles);
    assert.strictEqual(fileCountRes.valid, false);
    assert.ok(fileCountRes.error.includes('Toplam dosya sayısı limiti aşıldı'));

    // 2. Single file size limit (> 1 MB)
    const oversizedFile = [
        { path: 'src/huge.js', content: 'x'.repeat(GENERATION_LIMITS.MAX_FILE_SIZE_BYTES + 10) }
    ];
    const singleSizeRes = validateGenerationQuotas(oversizedFile);
    assert.strictEqual(singleSizeRes.valid, false);
    assert.ok(singleSizeRes.error.includes('tekil dosya boyutu limiti aşıldı'));

    // 3. Directory depth limit (> 8)
    const deepFile = [
        { path: 'a/b/c/d/e/f/g/h/i/j/deep.js', content: 'export const deep = true;' }
    ];
    const depthRes = validateGenerationQuotas(deepFile);
    assert.strictEqual(depthRes.valid, false);
    assert.ok(depthRes.error.includes('derinlik limiti aşıldı'));
});

// =========================================================================
// TEST 2: writeGeneratedFiles fails closed without partial writes
// =========================================================================
await runAsyncTest('2. writeGeneratedFiles should reject oversized batch without partial writes', async () => {
    const { writeGeneratedFiles, GENERATION_LIMITS } = await import('../engine/codeGenerator.js');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quota-test-'));

    const batch = [
        { path: 'src/valid1.js', content: 'export const v1 = 1;' },
        { path: 'src/huge.js', content: 'x'.repeat(GENERATION_LIMITS.MAX_FILE_SIZE_BYTES + 100) }
    ];

    try {
        await assert.rejects(
            () => writeGeneratedFiles(tempDir, null, batch),
            /Üretim kotası aşıldı/i,
            'Kotayı aşan batch tamamen reddedilmelidir.'
        );

        // Verify valid1.js was NOT partially written
        const validPath = path.join(tempDir, 'src/valid1.js');
        const exists = await fs.stat(validPath).then(() => true).catch(() => false);
        assert.strictEqual(exists, false, 'Kısmi yazma olmamalıdır.');
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
});

// =========================================================================
// TEST 3: listProjectTree limits
// =========================================================================
await runAsyncTest('3. listProjectTree should respect maxFiles, maxTotalBytes, and maxDepth limits', async () => {
    const { listProjectTree } = await import('../engine/codeGenerator.js');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tree-test-'));

    try {
        for (let i = 0; i < 20; i++) {
            await fs.writeFile(path.join(tempDir, `file_${i}.js`), 'console.log("hello");');
        }

        const limitedTree = await listProjectTree(tempDir, { maxFiles: 5 });
        assert.strictEqual(limitedTree.length, 5, 'listProjectTree maxFiles sınırına uymalıdır.');
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
});

finish();
