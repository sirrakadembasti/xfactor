import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import { validateRuntimeConfig } from './config.js';
import {
    isSafeWebSocketUrl,
    extractWebSocketToken,
    isAllowedOrigin
} from './security.js';
import {
    getProjectRole,
    canViewProject,
    canEditProject,
    canDeleteProject
} from './auth.js';
import { generateRequestId, buildStructuredLog, buildErrorResponse } from './observability.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createProjectRouter } from './routes/projectRoutes.js';

dotenv.config();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use((req, res, next) => {
    req.requestId = generateRequestId();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (isAllowedOrigin(origin, allowedOrigins)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());

// API Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 50,
    message: { error: "Sunucuya çok fazla istek yapıldı, lütfen biraz bekleyin." },
    skip: (req) => {
        const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
});

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

const runtimeConfig = validateRuntimeConfig(process.env);
const JWT_SECRET = runtimeConfig.JWT_SECRET;
const ADMIN_USER = runtimeConfig.ADMIN_USER;
const ADMIN_PASS = runtimeConfig.ADMIN_PASS;

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/logs' });
const wsClients = new Set();

// WebSocket Auth Check
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tokenFromQuery = url.searchParams.get('token');
    const authHeader = req.headers.authorization;
    const subprotocol = req.headers['sec-websocket-protocol'];

    if (!isSafeWebSocketUrl(req.url)) {
        ws.close(1008, 'Token query string güvenli değil. Authorization header veya secure subprotocol kullanın.');
        return;
    }

    if (tokenFromQuery) {
        ws.close(1008, 'Token query string güvenli değil. Authorization header veya secure subprotocol kullanın.');
        return;
    }

    const secureToken = extractWebSocketToken(Array.isArray(subprotocol) ? subprotocol : [subprotocol].filter(Boolean));
    const token = secureToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) {
        ws.close(1008, 'Token gerekli');
        return;
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        ws.user = payload;
        wsClients.add(ws);
        ws.on('close', () => wsClients.delete(ws));
    } catch (e) {
        ws.close(1008, 'Geçersiz token');
    }
});

// Kimlik Doğrulama Middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Yetkisiz erişim. Token bulunamadı." });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
    }
};

const projectAccess = (requiredRole = 'viewer') => (req, res, next) => {
    const projectId = req.params.id;
    const user = req.user || {};
    const userId = user.userId || user.id;
    const isAdmin = user.username === ADMIN_USER;

    if (isAdmin) {
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
app.use('/api', createAuthRouter({ JWT_SECRET, ADMIN_USER, ADMIN_PASS }));
app.use('/api/projects', createProjectRouter({ requireAuth, projectAccess, wsClients, ADMIN_USER }));

// Global Error Handler
app.use((err, req, res, next) => {
    const requestId = req.requestId || generateRequestId();
    const payload = buildErrorResponse(err, 'İşlem başarısız oldu.');
    payload.requestId = requestId;

    console.error(JSON.stringify(buildStructuredLog('api.error', {
        requestId,
        status: 500,
        message: err && err.message ? err.message : 'Unknown error'
    })));

    res.status(500).json(payload);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Backend hazır: http://127.0.0.1:${PORT}`);
});
