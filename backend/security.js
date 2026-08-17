import jwt from 'jsonwebtoken';
import path from 'path';

export function isAllowedOrigin(origin, allowedOrigins = []) {
    if (typeof origin !== 'string') {
        return false;
    }

    const normalizedOrigin = origin.trim();
    if (!normalizedOrigin) {
        return false;
    }

    const origins = Array.isArray(allowedOrigins)
        ? allowedOrigins
        : String(allowedOrigins || '').split(',').map((value) => value.trim()).filter(Boolean);

    return origins.some((allowed) => allowed === '*' || allowed === normalizedOrigin);
}

export function isSafeProjectPath(relativePath, projectRoot = '.') {
    if (typeof relativePath !== 'string' || typeof projectRoot !== 'string') {
        return false;
    }

    const normalizedInput = relativePath.replace(/\\/g, '/').trim();
    if (!normalizedInput || normalizedInput === '.' || normalizedInput.startsWith('/') || normalizedInput.startsWith('\\')) {
        return false;
    }

    if (normalizedInput.includes('..') || normalizedInput.includes('\0')) {
        return false;
    }

    const safeRoot = path.resolve(projectRoot);
    const resolvedCandidate = path.resolve(safeRoot, normalizedInput);
    const relativeToRoot = path.relative(safeRoot, resolvedCandidate);

    return relativeToRoot === '' || (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot));
}

export function isSafeWebSocketUrl(urlString = '') {
    try {
        const url = new URL(urlString, 'http://localhost');
        return !url.searchParams.has('token');
    } catch {
        return false;
    }
}

export function validateChatPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
    }

    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (!message || message.length === 0 || message.length > 4000) {
        return false;
    }

    return true;
}

export function validateLoginPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
    }

    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
        return false;
    }

    if (password.length < 12 || password.length > 256) {
        return false;
    }

    return true;
}

export function validateProjectTitle(title) {
    if (typeof title !== 'string') {
        return false;
    }

    const cleaned = title.trim();
    if (!cleaned || cleaned.length > 120) {
        return false;
    }

    if (/^(javascript:|data:|vbscript:|file:)/i.test(cleaned)) {
        return false;
    }

    if (/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s\-_]/.test(cleaned)) {
        return false;
    }

    return true;
}

export function extractWebSocketToken(subprotocols = []) {
    if (!Array.isArray(subprotocols)) {
        return null;
    }

    const candidate = subprotocols.find((value) => typeof value === 'string' && value.startsWith('xfactor-auth'));
    if (candidate && candidate.includes('.')) {
        return candidate.replace(/^xfactor-auth\./, '');
    }

    const index = subprotocols.findIndex((value) => value === 'xfactor-auth');
    if (index >= 0 && subprotocols[index + 1]) {
        return subprotocols[index + 1];
    }

    return null;
}

export function validateWebSocketAuthToken(token, secret) {
    if (typeof token !== 'string' || typeof secret !== 'string' || !token || !secret) {
        return null;
    }

    try {
        const payload = jwt.verify(token, secret);
        return payload?.userId || payload?.sub || payload?.username || null;
    } catch {
        return null;
    }
}
