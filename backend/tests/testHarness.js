export function createTestHarness({
    log = console.log,
    error = console.error,
    setExitCode = code => {
        process.exitCode = code;
    }
} = {}) {
    let passedTests = 0;
    let failedTests = 0;

    function runTest(name, fn) {
        try {
            fn();
            log(`[PASS] ${name}`);
            passedTests++;
        } catch (err) {
            error(`[FAIL] ${name}:`, err.message);
            failedTests++;
        }
    }

    async function runAsyncTest(name, fn) {
        try {
            await fn();
            log(`[PASS] ${name}`);
            passedTests++;
        } catch (err) {
            error(`[FAIL] ${name}:`, err.message);
            failedTests++;
        }
    }

    function getCounts() {
        return { passedTests, failedTests };
    }

    function finish() {
        const counts = getCounts();
        log('\n==========================================');
        log(`🎉 Testler Tamamlandı: ${passedTests} BAŞARILI, ${failedTests} HATALI`);
        log('==========================================');
        if (failedTests > 0) {
            setExitCode(1);
        }
        return counts;
    }

    return { runTest, runAsyncTest, getCounts, finish };
}
