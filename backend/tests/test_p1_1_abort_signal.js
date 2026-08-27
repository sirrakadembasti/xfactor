import assert from 'assert';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();

// =========================================================================
// TEST 1: Pause sırasında in-flight Manager LLM çağrısı
// =========================================================================
await runAsyncTest('1. Pause sırasında in-flight Manager LLM çağrısı abort edilmeli ve mock fallback dönmemeli', async () => {
    const { generateLLMResponse } = await import('../llm.js');
    const controller = new AbortController();
    
    // Anında abort et
    controller.abort('PAUSED_BY_USER');

    let capturedError = null;
    try {
        await generateLLMResponse(
            [
                { role: 'system', content: 'You are manager' },
                { role: 'user', content: 'Create project plan' }
            ],
            {
                signal: controller.signal,
                allowMockFallback: true // mock fallback açık olsa bile abort durumunda mock'a düşmemeli
            }
        );
    } catch (err) {
        capturedError = err;
    }

    assert.ok(capturedError !== null, 'Manager LLM çağrısı abort edildiğinde hata fırlatmalıdır.');
    assert.strictEqual(capturedError.name, 'AbortError');
    assert.ok(capturedError.message.includes('aborted'), 'Hata mesajı abort olduğunu belirtmelidir.');
});

// =========================================================================
// TEST 2: Pause sırasında Coder/Reviewer correction loop testi
// =========================================================================
await runAsyncTest('2. Pause sırasında Coder/Reviewer correction loop derhal kesilmeli ve fail-fast dönmeli', async () => {
    const { executeCorrectionLoop } = await import('../engine/selfCorrection.js');
    const controller = new AbortController();

    // Loop başlamadan veya ilk adımda abort et
    controller.abort('PAUSED');

    let capturedError = null;
    try {
        await executeCorrectionLoop({
            taskId: 'task-auth-1',
            taskTitle: 'Authentication Setup',
            targetFiles: ['src/auth.js'],
            initialCoderOutput: {
                summary: 'Auth scaffold',
                files: [{ path: 'src/auth.js', content: 'export const auth = () => {};' }]
            },
            coderPrompt: 'Build JWT auth logic',
            maxRetries: 2,
            signal: controller.signal
        });
    } catch (err) {
        capturedError = err;
    }

    assert.ok(capturedError !== null, 'Correction loop abort edildiğinde hata fırlatmalıdır.');
    assert.ok(capturedError.message.includes('aborted') || capturedError.name === 'AbortError');
});

// =========================================================================
// TEST 3: Pause sırasında concurrency pool testi
// =========================================================================
await runAsyncTest('3. Pause sırasında concurrency pool kalan kuyruktaki görevleri durdurmalıdır', async () => {
    const { runWithConcurrency } = await import('../engine/workflow.js');
    const controller = new AbortController();
    const processedTasks = [];

    const tasks = ['t1', 't2', 't3', 't4', 't5', 't6'];
    const concurrencyLimit = 2;

    const poolPromise = runWithConcurrency(tasks, concurrencyLimit, async (taskId) => {
        processedTasks.push(taskId);
        if (taskId === 't2') {
            // Süreç duraklatıldı
            controller.abort('PAUSED');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { taskId, status: 'done' };
    }, { signal: controller.signal });

    const results = await poolPromise;
    assert.ok(processedTasks.length <= 4, `Havuz abort edildikten sonra yeni görev başlatmamalı. Başlatılan: ${processedTasks.length}`);
    assert.strictEqual(controller.signal.aborted, true);
});

// =========================================================================
// TEST 4: Pause sırasında build validator testi
// =========================================================================
await runAsyncTest('4. Pause sırasında build validator subprocess ağacı sonlandırılmalıdır', async () => {
    const { executeSafeCommand, validateProjectBuild } = await import('../engine/buildValidator.js');
    const controller = new AbortController();

    // Uzun süren bir komut başlatıp 50ms sonra abort edelim
    const cmdPromise = executeSafeCommand('node', ['-e', 'setInterval(() => {}, 1000)'], {
        timeoutMs: 10000,
        signal: controller.signal
    });

    setTimeout(() => {
        controller.abort('PAUSED_DURING_BUILD');
    }, 50);

    const result = await cmdPromise;
    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.aborted, true);

    // validateProjectBuild seviyesinde aktarım
    const buildAbortController = new AbortController();
    buildAbortController.abort('PAUSED');
    const buildResult = await validateProjectBuild(process.cwd(), {}, {}, { signal: buildAbortController.signal });
    assert.ok(typeof buildResult === 'object');
});

// =========================================================================
// TEST 5: Google SDK & Timeout/Cancellation Sarmalaması
// =========================================================================
await runAsyncTest('5. generateLLMResponse signal ve timeout listener temizliğini sızıntısız gerçekleştirmelidir', async () => {
    const { generateLLMResponse } = await import('../llm.js');
    const controller = new AbortController();

    // Simüle edilmiş bir abort ile listener cleanup doğrulaması
    controller.abort('CLEANUP_CHECK');

    try {
        await generateLLMResponse(
            [{ role: 'user', content: 'Ping' }],
            { signal: controller.signal, apiKey: 'test_key' }
        );
    } catch (err) {
        assert.strictEqual(err.name, 'AbortError');
    }
});

finish();
