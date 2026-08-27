import { verifySessionToken } from './auth.js';
import { isValidCsrfRequest } from './security.js';

export const SESSION_COOKIE_NAME = 'xfactor_session';
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function cookieAttributes({ production, expires, maxAge }) {
    const attributes = [
        `Max-Age=${maxAge}`,
        `Expires=${expires}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax'
    ];
    if (production) {
        attributes.push('Secure');
    }
    return attributes.join('; ');
}

export function readSessionToken(req) {
    const cookieHeader = req?.headers?.cookie;
    if (typeof cookieHeader !== 'string') {
        return null;
    }

    for (const part of cookieHeader.split(';')) {
        const [name, ...valueParts] = part.trim().split('=');
        if (name !== SESSION_COOKIE_NAME) {
            continue;
        }
        const value = valueParts.join('=');
        return TOKEN_PATTERN.test(value) ? value : null;
    }

    return null;
}

export function serializeSessionCookie(token, expiresAt, { production = false } = {}) {
    if (!TOKEN_PATTERN.test(token)) {
        throw new Error('Session token must be 64 lowercase hexadecimal characters.');
    }
    const expires = new Date(expiresAt);
    if (!Number.isFinite(expires.getTime())) {
        throw new Error('Session expiry must be a valid date.');
    }

    return `${SESSION_COOKIE_NAME}=${token}; ${cookieAttributes({
        production,
        expires: expires.toUTCString(),
        maxAge: SESSION_MAX_AGE_SECONDS
    })}`;
}

export function serializeClearedSessionCookie({ production = false } = {}) {
    return `${SESSION_COOKIE_NAME}=; ${cookieAttributes({
        production,
        expires: new Date(0).toUTCString(),
        maxAge: 0
    })}`;
}

export function createRequireAuth({ production = false } = {}) {
    return (req, res, next) => {
        const token = readSessionToken(req);
        const session = token ? verifySessionToken(token) : null;
        if (!session) {
            res.setHeader('Set-Cookie', serializeClearedSessionCookie({ production }));
            return res.status(401).json({
                error: 'Oturum gerekli.',
                code: 'AUTH_REQUIRED'
            });
        }

        req.user = session.user;
        req.authSessionId = session.id;
        return next();
    };
}

export function createCsrfProtection({ allowedOrigins = [] } = {}) {
    return (req, res, next) => {
        if (isValidCsrfRequest(req, allowedOrigins)) {
            return next();
        }

        return res.status(403).json({
            error: 'İstek kaynağı doğrulanamadı.',
            code: 'CSRF_REJECTED'
        });
    };
}
