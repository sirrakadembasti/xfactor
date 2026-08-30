import assert from 'assert';
import http from 'http';
import { createTestHarness } from './testHarness.js';
import { verifyBrowserJourney } from '../verification/browserVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. verifyBrowserJourney should execute mock frontend user flow and assert state', async () => {
    const server = http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>Test App</title></head>
                <body>
                    <div id="app">
                        <h1>Welcome to App</h1>
                        <input id="item-input" name="item" value="Initial Item" />
                        <button id="add-btn">Add Item</button>
                        <div id="status">Ready</div>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const frontendUrl = `http://127.0.0.1:${port}`;

    try {
        const journeySpec = {
            steps: [
                { action: 'navigate', url: frontendUrl },
                { action: 'assert_element', selector: '#app' },
                { action: 'assert_text', selector: 'h1', expectedText: 'Welcome to App' },
                { action: 'assert_element', selector: '#item-input' },
                { action: 'assert_element', selector: '#add-btn' }
            ]
        };

        const result = await verifyBrowserJourney(frontendUrl, journeySpec);
        assert.strictEqual(result.passed, true);
        assert.ok(result.checks.some(c => c.name === 'browser_page_load' && c.status === 'passed'));
        assert.ok(result.checks.some(c => c.name === 'browser_journey_steps' && c.status === 'passed'));
    } finally {
        await new Promise(r => server.close(r));
    }
});

await runAsyncTest('2. verifyBrowserJourney should fail-closed when server is unreachable', async () => {
    const result = await verifyBrowserJourney('http://127.0.0.1:49988', { steps: [] });
    assert.strictEqual(result.passed, false);
});

finish();
