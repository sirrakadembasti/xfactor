export async function probeServiceHealth(healthUrl, startupTimeoutMs = 10000, options = {}) {
    if (typeof options.adapter?.request !== 'function' && typeof options.adapter?.execute !== 'function') return { responsive: false, statusCode: 0, error: 'SANDBOX_UNAVAILABLE: health adapter is required.' };
    const started = Date.now(); let delay = options.initialDelayMs || 50; let last = 'No response'; let statusCode = 0;
    while (Date.now() - started < startupTimeoutMs) {
        try {
            let response;
            if (typeof options.adapter.request === 'function') response = await options.adapter.request({ url: healthUrl, method: 'GET', timeoutMs: Math.min(2000, startupTimeoutMs), signal: options.signal });
            else {
                const result = await options.adapter.execute({ command: 'node', args: ['-e', `fetch(${JSON.stringify(healthUrl)}).then(async r=>process.stdout.write(JSON.stringify({statusCode:r.status,body:await r.text()}))).catch(e=>{console.error(e.message);process.exit(1)})`], workspace: options.workspace || '/workspace', timeoutMs: 2000, signal: options.signal });
                if (result.exitCode && result.exitCode !== 0) throw new Error(result.stderr || 'Sandbox health request failed');
                response = JSON.parse(result.stdout || '{}');
            }
            const code = response.statusCode || 0; statusCode = code; if (code >= 200 && code < 300) return { responsive: true, statusCode: code, latencyMs: Date.now() - started, body: response.body || response.rawBody || '' };
            last = `Service responded with HTTP ${code}`; if (options.failFastOnServerError && code >= 400) break;
        } catch (e) { last = e.message; }
        await new Promise(resolve => setTimeout(resolve, delay)); delay = Math.min(delay * 1.5, options.maxDelayMs || 500);
    }
    return { responsive: false, statusCode, error: `Readiness probe timed out after ${startupTimeoutMs}ms: ${last}` };
}
