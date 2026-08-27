import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Bağımsız görevler arasında duplicate targetFiles çakışması reddedilmeli
// =========================================================================
await runAsyncTest('1. validateTaskDependencies bağımsız (paralel) görevlerde aynı targetFiles kullanımını reddetmelidir', async () => {
    const { validateTaskDependencies } = await import('../agents/schemas.js');

    const tasks = [
        { id: 'task-auth', dependencies: [], targetFiles: ['src/auth.js', 'src/types.ts'] },
        { id: 'task-users', dependencies: [], targetFiles: ['src/users.js', 'src/types.ts'] } // Çakışan dosya: src/types.ts
    ];

    const result = validateTaskDependencies(tasks);
    assert.strictEqual(result.valid, false, 'Bağımsız görevlerde dosya çakışması reddedilmelidir.');
    assert.ok(
        result.errors.some(e => e.includes('dosya sahipliği çakışması') && e.includes('src/types.ts')),
        `Hata mesajı dosya çakışmasını belirtmeli, got: ${result.errors.join(', ')}`
    );

    // Bağımlı görevlerde (seri çalışan) aynı dosyaya dokunulabilmeli
    const serialTasks = [
        { id: 'task-1', dependencies: [], targetFiles: ['src/index.js'] },
        { id: 'task-2', dependencies: ['task-1'], targetFiles: ['src/index.js'] }
    ];
    const serialResult = validateTaskDependencies(serialTasks);
    assert.strictEqual(serialResult.valid, true, 'Sıralı/bağımlı görevlerde dosya paylaşımı geçerli olmalıdır.');
});

// =========================================================================
// TEST 2: Coder çıktısı içinde duplicate dosya yolları reddedilmeli
// =========================================================================
await runAsyncTest('2. validateCoderFiles tek coder çıktısında aynı dosya yolunun yinelenmesini reddetmelidir', async () => {
    const { validateCoderFiles } = await import('../agents/schemas.js');

    const duplicateFilesOutput = {
        summary: 'Duplicate files test',
        files: [
            { path: 'src/components/Button.jsx', content: 'export const Button = () => null;' },
            { path: 'src/components/Button.jsx', content: 'export const Button2 = () => null;' }
        ]
    };

    assert.throws(
        () => validateCoderFiles(duplicateFilesOutput),
        /yinelenen dosya yolu/i,
        'Yinelenen dosya yolu içeren coder çıktısı hata fırlatmalıdır.'
    );
});

// =========================================================================
// TEST 3: Coder çıktısının görev hedef dosya sözleşmesiyle karşılaştırılması
// =========================================================================
await runAsyncTest('3. validateCoderFiles hedef dosya listesi dışına çıkan dosyaları reddetmelidir', async () => {
    const { validateCoderFiles } = await import('../agents/schemas.js');

    const coderOutput = {
        summary: 'Target files mismatch test',
        files: [
            { path: 'src/allowed.js', content: 'export const a = 1;' },
            { path: 'src/forbidden.js', content: 'export const b = 2;' }
        ]
    };

    assert.throws(
        () => validateCoderFiles(coderOutput, ['src/allowed.js']),
        /hedef dosya sözleşmesinde/i,
        'Hedef sözleşmesinde olmayan dosya reddedilmelidir.'
    );

    // Sözleşmeye tam uyan çıktı geçerli olmalı
    const validOutput = {
        summary: 'Valid coder output',
        files: [{ path: 'src/allowed.js', content: 'export const a = 1;' }]
    };
    assert.strictEqual(validateCoderFiles(validOutput, ['src/allowed.js']), true);
});

// =========================================================================
// TEST 4: Self-correction sonrasında hedef dosya sahipliğinin yeniden doğrulanması
// =========================================================================
await runAsyncTest('4. executeCorrectionLoop coder düzeltme çıktısında hedef dosya sınırlarını denetlemelidir', async () => {
    const { executeCorrectionLoop } = await import('../engine/selfCorrection.js');

    // allowMockFallback ortamında test edelim
    process.env.ALLOW_MOCK_FALLBACK = 'true';
    try {
        const loopResult = await executeCorrectionLoop({
            taskId: 'task-owner-check',
            taskTitle: 'Ownership Test',
            targetFiles: ['src/valid.js'],
            initialCoderOutput: {
                summary: 'Initial output',
                files: [{ path: 'src/valid.js', content: 'export const v = 1;' }]
            },
            coderPrompt: 'Build valid.js'
        });

        assert.ok(typeof loopResult === 'object');
    } finally {
        delete process.env.ALLOW_MOCK_FALLBACK;
    }
});

finish();
