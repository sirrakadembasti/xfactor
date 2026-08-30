import http from 'http';
import https from 'https';
import { URL } from 'url';

export async function probeServiceHealth(healthUrl, startupTimeoutMs = 10000, options = {}) {
    const startTime = Date.now();
    const parsedUrl = new URL(healthUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    let delay = options.initialDelayMs || 50;
    const maxDelay = options.maxDelayMs || 500;
    let lastError = 'No response';
    let lastStatusCode = 0;

    while (Date.now() - startTime < startupTimeoutMs) {
        const attemptResult = await new Promise((resolve) => {
            const req = client.get(healthUrl, { timeout: Math.min(2000, startupTimeoutMs) }, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    const statusCode = res.statusCode || 0;
                    if (statusCode >= 200 && statusCode < 300) {
                        resolve({
                            responsive: true,
                            statusCode,
                            latencyMs: Date.now() - startTime,
                            body
                        });
                    } else {
                        resolve({
                            responsive: false,
                            statusCode,
                            error: `Service responded with HTTP ${statusCode}`
                        });
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ responsive: false, statusCode: 0, error: 'Request timeout' });
            });

            req.on('error', (err) => {
                resolve({ responsive: false, statusCode: 0, error: err.message });
            });
        });

        if (attemptResult.responsive) {
            return attemptResult;
        }

        lastError = attemptResult.error || lastError;
        lastStatusCode = attemptResult.statusCode || lastStatusCode;

        // Non-2xx status from an actual responding server (e.g. 500) fails immediately if requested or after retry
        if (lastStatusCode >= 400 && lastStatusCode < 600 && options.failFastOnServerError) {
            return {
                responsive: false,
                statusCode: lastStatusCode,
                error: lastError
            };
        }

        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 1.5, maxDelay);
    }

    return {
        responsive: false,
        statusCode: lastStatusCode,
        error: `Readiness probe timed out after ${startupTimeoutMs}ms: ${lastError}`
    };
}
