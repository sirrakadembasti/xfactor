import assert from 'assert';
import http from 'http';
import { createTestHarness } from './testHarness.js';
import { probeServiceHealth } from '../verification/healthProber.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. probeServiceHealth should return unresponsive for non-listening endpoints', async () => {
    const res = await probeServiceHealth('http://127.0.0.1:49999/health', 200);
    assert.strictEqual(res.responsive, false);
    assert.ok(res.error);
});

await runAsyncTest('2. probeServiceHealth should return responsive true for 200 OK service', async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await probeServiceHealth(`http://127.0.0.1:${port}/healthz`, 3000);
        assert.strictEqual(res.responsive, true);
        assert.strictEqual(res.statusCode, 200);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

await runAsyncTest('3. probeServiceHealth should fail for 500 internal server error endpoints', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Database crashed' }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
        const res = await probeServiceHealth(`http://127.0.0.1:${port}/health`, 1000);
        assert.strictEqual(res.responsive, false);
        assert.strictEqual(res.statusCode, 500);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

finish();
