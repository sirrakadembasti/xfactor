import { isSafeWebSocketUrl } from './security.js';

const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const OPEN = 1;
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB
const MAX_BUFFERED_AMOUNT_BYTES = 1024 * 1024; // 1 MB backpressure limit
const MAX_MESSAGES_PER_SECOND = 20; // Flood protection

function sendJson(ws, payload) {
    if (ws.readyState !== OPEN) return;
    if (ws.bufferedAmount && ws.bufferedAmount > MAX_BUFFERED_AMOUNT_BYTES) {
        // Slow client backpressure: socket aşırı dolduğunda zorla sonlandır
        ws.close(1008, 'BACKPRESSURE_OVERFLOW');
        return;
    }
    try {
        ws.send(JSON.stringify(payload));
    } catch {
        // Socket kapanışı ve gönderim yarışı bu istemci için fail-closed kalır.
    }
}

function closeInvalidSession(ws) {
    if (ws.readyState === OPEN) {
        ws.close(1008, 'SESSION_INVALID');
    }
}
export function createProjectWebSocketHub({ getProjectRole, verifySessionId }) {
    const clients = new Set();

    function currentSession(sessionId) {
        try {
            return verifySessionId(sessionId);
        } catch {
            return null;
        }
    }

    function canView(session, projectId) {
        if (!session || typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
            return false;
        }
        if (session.user.isAdmin) {
            return true;
        }
        try {
            return Boolean(getProjectRole(session.user.id, projectId));
        } catch {
            return false;
        }
    }

    function handleMessage(ws, data, isBinary) {
        // 1. Payload Boyutu Sınırı
        const byteLength = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data || ''), 'utf8');
        if (byteLength > MAX_PAYLOAD_BYTES) {
            sendJson(ws, { type: 'error', code: 'PAYLOAD_TOO_LARGE' });
            ws.close(1009, 'PAYLOAD_TOO_LARGE');
            return;
        }

        // 2. Mesaj Hız Limiti (Rate Limiter)
        const now = Date.now();
        if (!ws.rateWindowStart || now - ws.rateWindowStart > 1000) {
            ws.rateWindowStart = now;
            ws.messageCount = 0;
        }
        ws.messageCount = (ws.messageCount || 0) + 1;
        if (ws.messageCount > MAX_MESSAGES_PER_SECOND) {
            sendJson(ws, { type: 'error', code: 'RATE_LIMIT_EXCEEDED' });
            return;
        }

        const session = currentSession(ws.authSessionId);
        if (!session) {
            closeInvalidSession(ws);
            return;
        }

        let message;
        try {
            if (isBinary) throw new Error('Binary message');
            message = JSON.parse(data.toString());
        } catch {
            sendJson(ws, { type: 'error', code: 'INVALID_MESSAGE' });
            return;
        }

        const keys = message && typeof message === 'object' && !Array.isArray(message)
            ? Object.keys(message)
            : [];
        if (
            keys.length !== 2 ||
            !keys.includes('type') ||
            !keys.includes('projectId') ||
            message.type !== 'subscribe' ||
            typeof message.projectId !== 'string' ||
            !PROJECT_ID_PATTERN.test(message.projectId)
        ) {
            sendJson(ws, { type: 'error', code: 'INVALID_MESSAGE' });
            return;
        }

        if (!canView(session, message.projectId)) {
            sendJson(ws, {
                type: 'error',
                code: 'PROJECT_FORBIDDEN',
                projectId: message.projectId
            });
            return;
        }

        ws.activeProjectId = message.projectId;
        sendJson(ws, { type: 'subscribed', projectId: message.projectId });
    }

    function handleConnection(ws, req) {
        if (!isSafeWebSocketUrl(req.url)) {
            ws.close(1008, 'INVALID_URL');
            return;
        }

        const sessionId = req.authSessionId;
        if (!sessionId || !currentSession(sessionId)) {
            ws.close(1008, 'SESSION_INVALID');
            return;
        }

        ws.authSessionId = sessionId;
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        clients.add(ws);
        ws.on('message', (data, isBinary) => handleMessage(ws, data, isBinary));
        ws.on('close', () => clients.delete(ws));
    }
    function publish(event) {
        if (!event || typeof event.projectId !== 'string') return;

        let eventString;
        try {
            eventString = JSON.stringify(event);
        } catch {
            return;
        }

        for (const client of clients) {
            if (client.readyState !== OPEN) {
                continue;
            }

            if (client.bufferedAmount && client.bufferedAmount > MAX_BUFFERED_AMOUNT_BYTES) {
                client.close(1008, 'BACKPRESSURE_OVERFLOW');
                continue;
            }

            const session = currentSession(client.authSessionId);
            if (!session) {
                closeInvalidSession(client);
                continue;
            }
            if (
                client.activeProjectId !== event.projectId ||
                !canView(session, event.projectId)
            ) {
                continue;
            }

            try {
                client.send(eventString);
            } catch {
                // Diğer istemcilerin teslimatını tek socket hatası etkilemez.
            }
        }
    }

    function closeUserSockets(userId) {
        for (const client of clients) {
            const session = currentSession(client.authSessionId);
            if (!session || (userId && session.user?.id === userId)) {
                closeInvalidSession(client);
            }
        }
    }

    // Periyodik heartbeat & ölü socket temizleme intervali (30 saniye)
    const heartbeatInterval = setInterval(() => {
        for (const client of clients) {
            if (client.isAlive === false) {
                client.terminate();
                clients.delete(client);
                continue;
            }
            client.isAlive = false;
            if (client.readyState === OPEN) {
                try {
                    client.ping();
                } catch {}
            }
        }
    }, 30000);

    if (typeof heartbeatInterval.unref === 'function') {
        heartbeatInterval.unref();
    }

    return { clients, handleConnection, publish, closeUserSockets, heartbeatInterval };
}
