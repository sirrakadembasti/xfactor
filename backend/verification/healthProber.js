import { setTimeout as pause } from 'node:timers/promises';

export async function probeServiceHealth(healthUrl, startupTimeoutMs = 10000, options = {}) {
    const throwIfCancelled = () => {
        if (options.signal?.aborted) throw options.signal.reason instanceof Error
            ? options.signal.reason : new Error('Cancelled by user');
    };
    throwIfCancelled();
    const started = Date.now();
    let delay = options.initialDelayMs || 50;
    let last = 'No response';
    let statusCode = 0;
    while (Date.now() - started < startupTimeoutMs) {
        throwIfCancelled();
        try {
            let response;
            if (typeof options.adapter?.request === 'function') {
                response = await options.adapter.request({ url: healthUrl, method: 'GET', timeoutMs: Math.min(2000, startupTimeoutMs), signal: options.signal });
            } else if (typeof options.adapter?.execute === 'function') {
                const result = await options.adapter.execute({ command: 'node', args: ['-e', `fetch(${JSON.stringify(healthUrl)}).then(async r=>process.stdout.write(JSON.stringify({statusCode:r.status,body:await r.text()}))).catch(e=>{console.error(e.message);process.exit(1)})`], workspace: options.workspace || '/workspace', timeoutMs: 2000, signal: options.signal });
                if (result.exitCode && result.exitCode !== 0) throw new Error(result.stderr || 'Sandbox health request failed');
                response = JSON.parse(result.stdout || '{}');
            } else {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort('TIMEOUT'), Math.min(2000, startupTimeoutMs));
                try {
                    const res = await fetch(healthUrl, {
                        signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
                    });
                    const body = await res.text();
                    response = { statusCode: res.status, body };
                } finally {
                    clearTimeout(timer);
                }
            }
            throwIfCancelled();
            const code = response.statusCode || 0;
            statusCode = code;
            if (code >= 200 && code < 300) {
                return { responsive: true, statusCode: code, latencyMs: Date.now() - started, body: response.body || response.rawBody || '' };
            }
            last = `Service responded with HTTP ${code}`;
            if (options.failFastOnServerError && code >= 400) break;
        } catch (e) {
            // Cancellation ends readiness; it must not be treated as a transient probe failure.
            throwIfCancelled();
            last = e.message;
        }
        try { await pause(delay, undefined, { signal: options.signal }); }
        catch (error) { throwIfCancelled(); throw error; }
        delay = Math.min(delay * 1.5, options.maxDelayMs || 500);
    }
    throwIfCancelled();
    return { responsive: false, statusCode, error: `Readiness probe timed out after ${startupTimeoutMs}ms: ${last}` };
}
