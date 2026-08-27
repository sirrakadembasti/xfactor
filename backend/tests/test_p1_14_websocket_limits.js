import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { createProjectWebSocketHub } from '../websocketHub.js';

const { runAsyncTest, finish } = createTestHarness();

// Mock WebSocket helper
function createMockWs(sessionId, initialRole = 'viewer') {
    const listeners = {};
    const sent = [];
    let closed = false;
    let closeCode = null;
    let closeReason = null;

    const ws = {
        authSessionId: sessionId,
        readyState: 1, // OPEN
        bufferedAmount: 0,
        send: (data) => { sent.push(JSON.parse(data)); },
        close: (code, reason) => {
            closed = true;
            closeCode = code;
            closeReason = reason;
            ws.readyState = 2;
            if (listeners['close']) listeners['close']();
        },
        on: (evt, cb) => { listeners[evt] = cb; },
        emit: (evt, ...args) => { if (listeners[evt]) listeners[evt](...args); },
        sent,
        get closed() { return closed; },
        get closeCode() { return closeCode; },
        get closeReason() { return closeReason; }
    };
    return ws;
}

// =========================================================================
// TEST 1: Oversized payload rejection (> 64 KB)
// =========================================================================
await runAsyncTest('1. handleMessage should reject oversized payload and close socket with 1009', async () => {
    const hub = createProjectWebSocketHub({
        getProjectRole: () => 'owner',
        verifySessionId: (sid) => ({ user: { id: 'u1', isAdmin: false } })
    });

    const ws = createMockWs('valid-session-1');
    hub.handleConnection(ws, { url: '/ws', authSessionId: 'valid-session-1' });

    // Send payload larger than 64 KB
    const hugePayload = 'x'.repeat(70 * 1024);
    ws.emit('message', Buffer.from(hugePayload), false);

    assert.strictEqual(ws.closed, true);
    assert.strictEqual(ws.closeCode, 1009);
    assert.strictEqual(ws.closeReason, 'PAYLOAD_TOO_LARGE');
});

// =========================================================================
// TEST 2: Message rate limiter & flood protection (> 20 msg/sec)
// =========================================================================
await runAsyncTest('2. handleMessage should rate limit excessive client messages', async () => {
    const hub = createProjectWebSocketHub({
        getProjectRole: () => 'owner',
        verifySessionId: (sid) => ({ user: { id: 'u1', isAdmin: false } })
    });

    const ws = createMockWs('valid-session-2');
    hub.handleConnection(ws, { url: '/ws', authSessionId: 'valid-session-2' });

    const msg = JSON.stringify({ type: 'subscribe', projectId: 'project-valid-1' });

    // Send 25 messages rapidly
    for (let i = 0; i < 25; i++) {
        ws.emit('message', Buffer.from(msg), false);
    }

    const errorMsg = ws.sent.find(s => s.code === 'RATE_LIMIT_EXCEEDED');
    assert.ok(errorMsg, 'RATE_LIMIT_EXCEEDED hatası dönmelidir.');
});

// =========================================================================
// TEST 3: Proactive user socket revocation on session logout
// =========================================================================
await runAsyncTest('3. closeUserSockets should proactively terminate sockets belonging to revoked user', async () => {
    const hub = createProjectWebSocketHub({
        getProjectRole: () => 'owner',
        verifySessionId: (sid) => sid === 'user-1-session' ? { user: { id: 'user-1' } } : { user: { id: 'user-2' } }
    });

    const ws1 = createMockWs('user-1-session');
    const ws2 = createMockWs('user-2-session');

    hub.handleConnection(ws1, { url: '/ws', authSessionId: 'user-1-session' });
    hub.handleConnection(ws2, { url: '/ws', authSessionId: 'user-2-session' });

    assert.strictEqual(hub.clients.size, 2);

    hub.closeUserSockets('user-1');

    assert.strictEqual(ws1.closed, true);
    assert.strictEqual(ws2.closed, false);
});

finish();
