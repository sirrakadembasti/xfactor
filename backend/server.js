import './networkResolver.js';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import WebSocket from 'ws';
import { validateRuntimeConfig } from './config.js';
import { isAllowedOrigin, isSecureTransportRequest, createSecurityHeadersMiddleware } from './security.js';
import {
    getProjectRole,
    canViewProject,
    canEditProject,
    canDeleteProject,
    verifySessionId,
    verifySessionToken
} from './auth.js';
import { generateRequestId, buildErrorResponse, compactStaleEvidencePayloads, logError } from './observability.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createProjectRouter } from './routes/projectRoutes.js';
import { createProjectWebSocketHub } from './websocketHub.js';
import {
    createCsrfProtection,
    createRequireAuth,
    readSessionToken
} from './sessionAuth.js';
import { db, getSchemaVersion, checkpointWAL } from './db.js';
import { getProjectsRoot } from './projectRepository.js';
dotenv.config();

const runtimeConfig = validateRuntimeConfig(process.env);
const transportPolicy = {
    production: runtimeConfig.production,
    trustProxy: runtimeConfig.TRUST_PROXY
};
const allowedOrigins = runtimeConfig.ALLOWED_ORIGINS.length > 0
    ? runtimeConfig.ALLOWED_ORIGINS
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const app = express();
if (runtimeConfig.production) {
    app.set('trust proxy', runtimeConfig.TRUST_PROXY);
}
app.use(createSecurityHeadersMiddleware({ production: runtimeConfig.production }));

app.use((req, res, next) => {
    req.requestId = generateRequestId();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

// Liveness & Readiness Probes (CSRF ve Auth dışı, internal/reverse proxy erişim sözleşmesi)
app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/readyz', (req, res) => {
    try {
        const row = db.prepare('SELECT 1 as alive').get();
        if (!row || row.alive !== 1) {
            return res.status(503).json({ status: 'not_ready', error: 'Database query failed' });
        }

        const projectsRoot = getProjectsRoot();
        if (!fs.existsSync(projectsRoot)) {
            fs.mkdirSync(projectsRoot, { recursive: true });
        }

        const schemaVersion = getSchemaVersion();

        res.status(200).json({
            status: 'ready',
            database: 'connected',
            projectsRoot: 'accessible',
            schemaVersion
        });
    } catch (err) {
        logError('readyz.failed', err, { requestId: req.requestId });
        res.status(503).json({
            status: 'not_ready',
            error: 'Service temporarily unavailable'
        });
    }
});

app.use((req, res, next) => {
    if (isSecureTransportRequest(req, transportPolicy)) {
        return next();
    }

    return res.status(426).json(buildErrorResponse(
        null,
        'HTTPS bağlantısı gerekli.',
        req.requestId,
        'HTTPS_REQUIRED'
    ));
});
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin, allowedOrigins)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true
}));
app.use('/api', createCsrfProtection({ allowedOrigins }));
app.use(express.json());
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: "Sunucuya çok fazla istek yapıldı, lütfen biraz bekleyin." },
    skip: (req) => {
        const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Çok fazla başarısız giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin." },
    skip: (req) => {
        const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
});

app.use('/api/login', loginLimiter);
app.use('/api/', apiLimiter);

// Global Path Traversal Koruması
app.use((req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        const resolvedPath = path.posix.resolve('/', decodedPath.replace(/^\/+/, ''));
        if (resolvedPath !== '/' + decodedPath.replace(/^\/+/, '') && decodedPath !== '/') {
            return res.status(400).json({ error: "Geçersiz veya tehlikeli istek dizini." });
        }
    } catch (e) {
        return res.status(400).json({ error: "Geçersiz URL formatı." });
    }
    next();
});

// Path Traversal Koruması: id parametresi sadece alfanümerik ve tire/altçizgi içerebilir
app.param('id', (req, res, next, id) => {
    if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
        return res.status(400).json({ error: "Geçersiz veya tehlikeli proje ID formatı." });
    }
    next();
});


const server = http.createServer(app);
const wss = new WebSocketServer({
    server,
    path: '/ws/logs',
    verifyClient: ({ req }, done) => {
        if (!isSecureTransportRequest(req, transportPolicy)) {
            done(false, 426, 'HTTPS Required');
            return;
        }
        if (!isAllowedOrigin(req.headers.origin, allowedOrigins)) {
            done(false, 403, 'Forbidden Origin');
            return;
        }
        if (req.headers['sec-websocket-protocol']) {
            done(false, 400, 'WebSocket subprotocols are not accepted');
            return;
        }

        const token = readSessionToken(req);
        const session = token ? verifySessionToken(token) : null;
        if (!session) {
            done(false, 401, 'Unauthorized');
            return;
        }

        req.authSessionId = session.id;
        done(true);
    }
});
const wsHub = createProjectWebSocketHub({
    getProjectRole,
    verifySessionId
});

wss.on('connection', wsHub.handleConnection);

const requireAuth = createRequireAuth({ production: runtimeConfig.production });

const projectAccess = (requiredRole = 'viewer') => (req, res, next) => {
    const projectId = req.params.id;
    const userId = req.user.id;

    if (req.user.isAdmin === true) {
        return next();
    }

    const role = getProjectRole(userId, projectId);
    if (!role) {
        return res.status(403).json({ error: "Bu projeye erişim yetkiniz yok." });
    }

    const rolePriority = { viewer: 1, editor: 2, owner: 3 };
    const requiredPriority = rolePriority[requiredRole] || 1;
    const rolePriorityValue = rolePriority[role] || 0;

    if (rolePriorityValue < requiredPriority) {
        return res.status(403).json({ error: "Bu işlemi yapma yetkiniz yok." });
    }

    const permissionCheckMap = {
        viewer: canViewProject,
        editor: canEditProject,
        owner: canDeleteProject
    };
    const check = permissionCheckMap[requiredRole] || canViewProject;
    if (!check(userId, projectId)) {
        return res.status(403).json({ error: "Bu işlemi yapma yetkiniz yok." });
    }

    return next();
};

// Router'ları Bağla
app.use('/api', createAuthRouter({
    requireAuth,
    production: runtimeConfig.production
}));
app.use('/api/projects', createProjectRouter({ requireAuth, projectAccess, wsHub }));

// Global Error Handler
app.use((err, req, res, _next) => {
    const requestId = req.requestId || generateRequestId();
    const status = 500;
    const code = 'INTERNAL_ERROR';

    logError('api.error', err, {
        requestId,
        status,
        code,
        method: req.method,
        path: req.path
    });

    res.status(status).json(buildErrorResponse(err, 'İşlem başarısız oldu.', requestId, code));
});

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '127.0.0.1';

server.listen(PORT, HOST, () => {
    console.log(`Backend hazır: http://${HOST}:${PORT}`);
});

const EVIDENCE_RETENTION_DAYS = 30;
const EVIDENCE_COMPACTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
function runEvidenceCompaction() {
    try {
        compactStaleEvidencePayloads(db, EVIDENCE_RETENTION_DAYS);
    } catch (error) {
        logError('evidence.compaction_failed', error);
    }
}
const initialEvidenceCompactionTimer = setTimeout(runEvidenceCompaction, 0);
initialEvidenceCompactionTimer.unref();
const evidenceCompactionTimer = setInterval(runEvidenceCompaction, EVIDENCE_COMPACTION_INTERVAL_MS);
evidenceCompactionTimer.unref();

let isShuttingDown = false;

function handleGracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    clearTimeout(initialEvidenceCompactionTimer);
    clearInterval(evidenceCompactionTimer);

    // 1. WebSocket istemcilerini kapat
    try {
        for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.close(1001, 'Server shutting down');
            }
        }
    } catch {}

    // 2. HTTP sunucusunu durdur
    server.close(() => {
        // 3. SQLite WAL checkpoint
        try {
            checkpointWAL(db);
        } catch {}

        process.exit(0);
    });

    setTimeout(() => {
        process.exit(0);
    }, 3000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

export { server, wss, wsHub };
