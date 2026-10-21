import assert from 'assert';
import http from 'http';
import { createTestHarness } from './testHarness.js';
import { verifyBrowserJourney } from '../verification/browserVerifier.js';
import { isValidRoleJourney, interactiveJourneySteps } from '../contracts/browserJourneyContract.js';

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('0. sandbox browser request allows a cold frontend build', async () => {
    let timeoutMs;
    const adapter = {
        id: 'docker-worker',
        async request(request) {
            timeoutMs = request.timeoutMs;
            return { statusCode: 200, html: '<h1>Kütüphane</h1>' };
        }
    };
    const result = await verifyBrowserJourney('http://127.0.0.1:3000', { steps: [{ action: 'assert_text', expectedText: 'Kütüphane' }] }, { adapter });
    assert.strictEqual(result.passed, true);
    assert.ok(timeoutMs >= 30000);
});

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

await runAsyncTest('3. management flow cannot pass on HTML-only assertions', async () => {
    const adapter = { id: 'html-only', request: async () => ({ statusCode: 200, html: '<main><button>Save</button></main>' }) };
    const result = await verifyBrowserJourney('http://service', {
        steps: [{ action: 'assert_element', selector: 'main' }]
    }, { adapter, management: { needed: true, roles: [{ name: 'manager' }] } });
    assert.equal(result.passed, false);
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'blocked');
});
await runAsyncTest('4. a button click without a visible result fails the management journey', async () => {
    const adapter = {
        id: 'no-op-button', request: async () => ({ statusCode: 200, html: '<main><button>Save</button></main>' }),
        interact: async ({ kind }) => ({ passed: true, outcomeObserved: kind === 'negative', accessibleControls: true })
    };
    const result = await verifyBrowserJourney('http://service', { steps: [{ action: 'assert_element', selector: 'main' }] }, {
        adapter, management: { needed: true, roles: [{ name: 'manager' }] },
        roleJourneys: [
            { role: 'manager', kind: 'positive', steps: [{ action: 'click', target: 'Save' }], expectedOutcome: { kind: 'success', text: 'Saved' } },
            { role: 'manager', kind: 'negative', steps: [{ action: 'click', target: 'Delete' }], expectedOutcome: { kind: 'denied', text: 'Access denied' } }
        ]
    });
    assert.equal(result.passed, false);
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'failed');
});

const managedJourneys = [
    { role: 'manager', kind: 'positive', steps: [{ action: 'click', selector: '#create' }], expectedOutcome: { kind: 'success', text: 'Created' } },
    { role: 'manager', kind: 'negative', steps: [{ action: 'click', selector: '#delete' }], expectedOutcome: { kind: 'denied', text: 'Access denied' } }
];
const managedOptions = adapter => ({ adapter, management: { needed: true, roles: [{ name: 'manager' }] }, roleJourneys: managedJourneys });
const observedJourney = ({ role, kind, steps }) => ({
    passed: true,
    session: { authenticatedRole: role },
    actions: steps.map((step, index) => ({ index, action: step.action, target: step.selector, completed: true,
        accessibleName: kind === 'positive' ? 'Create record' : 'Delete record', keyboardReachable: true })),
    outcome: { kind: kind === 'positive' ? 'success' : 'denied', text: kind === 'positive' ? 'Created' : 'Access denied', visible: true },
    viewport: { width: 375, horizontalOverflow: false }
});

await runAsyncTest('5. boolean-only interaction claims do not prove role actions or design', async () => {
    const adapter = { id: 'boolean-only', request: async () => ({ statusCode: 200, html: '<main />' }),
        interact: async () => ({ passed: true, outcomeObserved: true, accessibleControls: true }) };
    const result = await verifyBrowserJourney('http://service', { steps: [] }, managedOptions(adapter));
    assert.equal(result.passed, false);
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'failed');
});

await runAsyncTest('6. denied role journey fails when the action succeeds visibly', async () => {
    const adapter = { id: 'wrong-outcome', request: async () => ({ statusCode: 200, html: '<main />' }),
        interact: async request => request.kind === 'negative'
            ? { ...observedJourney(request), outcome: { kind: 'success', text: 'Deleted', visible: true } }
            : observedJourney(request) };
    const result = await verifyBrowserJourney('http://service', { steps: [] }, managedOptions(adapter));
    assert.equal(result.passed, false);
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'failed');
});

await runAsyncTest('7. a role journey requires named, keyboard reachable controls and narrow-screen layout', async () => {
    const adapter = { id: 'inaccessible', request: async () => ({ statusCode: 200, html: '<main />' }),
        interact: async request => ({ ...observedJourney(request),
            actions: [{ ...observedJourney(request).actions[0], accessibleName: '', keyboardReachable: false }],
            viewport: { width: 375, horizontalOverflow: true } }) };
    const result = await verifyBrowserJourney('http://service', { steps: [] }, managedOptions(adapter));
    assert.equal(result.passed, false);
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'failed');
});

await runAsyncTest('8. matched role actions, visible outcomes and design evidence pass the interaction gate', async () => {
    const adapter = { id: 'observed', request: async () => ({ statusCode: 200, html: '<main />' }),
        interact: async request => observedJourney(request) };
    const result = await verifyBrowserJourney('http://service', { steps: [] }, managedOptions(adapter));
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'passed');
});

await runAsyncTest('9. a role can prove anonymous denial after logging out', async () => {
    const roleJourneys = [managedJourneys[0], { ...managedJourneys[1], authState: 'anonymous' }];
    const adapter = { id: 'logout-flow', request: async () => ({ statusCode: 200, html: '<main />' }),
        interact: async request => request.kind === 'negative'
            ? { ...observedJourney(request), session: { anonymous: true, authenticatedRole: null } }
            : observedJourney(request) };
    const result = await verifyBrowserJourney('http://service', { steps: [] }, {
        adapter, management: { needed: true, roles: [{ name: 'manager' }] }, roleJourneys
    });
    assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'passed');
});

await runAsyncTest('10. role contracts validate native select choices and bounded fill templates', async () => {
    const journey = step => ({ role: 'manager', kind: 'positive', steps: [step], expectedOutcome: { kind: 'success', text: 'Created' } });
    for (const step of [
        { action: 'click', selector: '#save' }, { action: 'fill', selector: '#empty', value: '' },
        { action: 'fill', selector: '#name', text: 'legacy text' }, { action: 'fill', selector: '#name', value: '{nonce}' },
        { action: 'fill', selector: '#date', value: '{date:+3650d}' }, { action: 'fill', selector: '#date', value: '{date:-0d}' },
        { action: 'select', selector: '#room', optionIndex: 0 }, { action: 'select', selector: '#room', optionIndex: 1000 },
        { action: 'select', selector: '#method', optionLabel: 'Credit card' }
    ]) assert.equal(isValidRoleJourney(journey(step), 'manager', 'positive'), true, JSON.stringify(step));
    for (const step of [
        { action: 'select', selector: '#room' }, { action: 'select', selector: '#room', optionValue: 'uuid' },
        { action: 'select', selector: '#room', optionIndex: -1 }, { action: 'select', selector: '#room', optionIndex: 1001 },
        { action: 'select', selector: '#room', optionIndex: 1.5 }, { action: 'select', selector: '#room', optionIndex: '1' },
        { action: 'select', selector: '#room', optionLabel: ' ' }, { action: 'select', selector: '#room', optionLabel: 3 },
        { action: 'select', selector: '#room', optionLabel: 'Room', optionIndex: 1 },
        { action: 'fill', selector: '#date', value: '{date:+3651d}' }, { action: 'fill', selector: '#date', value: '{date:-3651d}' },
        { action: 'fill', selector: '#date', value: '{date:2d}' }, { action: 'fill', selector: '#date', value: 'prefix-{date:+2d}' },
        { action: 'fill', selector: '#date', value: '{unknown}' }, { action: 'fill', selector: '#name', value: 'room-{nonce}' },
        { action: 'fill', selector: '#name', value: '{{nonce}}' }, { action: 'fill', selector: '#name' },
        { action: 'fill', selector: '#name', value: 42 }, { action: 'unknown', selector: '#name' }
    ]) assert.equal(isValidRoleJourney({ ...journey(step), steps: [{ action: 'click', selector: '#save' }, step] }, 'manager', 'positive'), false, JSON.stringify(step));
    assert.deepEqual(interactiveJourneySteps(journey({ action: 'select', selector: '#room', optionIndex: 1 })).map(step => step.action), ['select']);
});

await runAsyncTest('11. select receipts count and require the same observed accessibility as other actions', async () => {
    const roleJourneys = [{ ...managedJourneys[0], steps: [{ action: 'select', selector: '#room', optionIndex: 1 }] }, managedJourneys[1]];
    for (const accessible of [true, false]) {
        const adapter = { id: 'select-observed', request: async () => ({ statusCode: 200, html: '<main />' }),
            interact: async request => ({ ...observedJourney(request), actions: observedJourney(request).actions.map(action => ({
                ...action, accessibleName: accessible ? action.accessibleName : '', keyboardReachable: accessible
            })) }) };
        const result = await verifyBrowserJourney('http://service', { steps: [] }, {
            adapter, management: { needed: true, roles: [{ name: 'manager' }] }, roleJourneys
        });
        assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, accessible ? 'passed' : 'failed');
    }
});

finish();
