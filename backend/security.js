import fs from 'fs/promises';
import path from 'path';
import { isIP } from 'node:net';

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

    return origins.some((allowed) => allowed === normalizedOrigin);
}
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isValidCsrfRequest(req, allowedOrigins = []) {
    const method = String(req?.method || 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) {
        return true;
    }

    return req?.headers?.['x-xfactor-csrf'] === '1'
        && isAllowedOrigin(req?.headers?.origin, allowedOrigins);
}

export function isLoopbackAddress(address) {
    const normalized = String(address || '').trim().toLowerCase();
    if (normalized === '::1') return true;

    const ipv4Candidate = normalized.startsWith('::ffff:')
        ? normalized.slice('::ffff:'.length)
        : normalized;
    return isIP(ipv4Candidate) === 4 && ipv4Candidate.split('.')[0] === '127';
}

export function isSecureTransportRequest(req, { production = false, trustProxy = false } = {}) {
    if (!production) return true;
    if (req?.socket?.encrypted === true) return true;
    if (trustProxy !== 'loopback' || !isLoopbackAddress(req?.socket?.remoteAddress)) return false;

    const forwardedHeader = req?.headers?.['x-forwarded-proto'];
    const forwardedProtocol = (Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader)
        ?.split(',')[0]
        ?.trim()
        ?.toLowerCase();
    return forwardedProtocol === 'https';
}
export function createSecurityHeadersMiddleware({ production = false } = {}) {
    return (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none';");
        if (production && isSecureTransportRequest(req, { production: true, trustProxy: 'loopback' })) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        next();
    };
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

// ---------------------------------------------------------------------------
// Sembolik bağ (symlink) izolasyonu — P0.3
// ---------------------------------------------------------------------------

/**
 * Bir fs.Dirent öğesinin sembolik bağ (symlink) olup olmadığını döndürür.
 * Sembolik bağlar proje kök dizini dışına çıkış için kullanılabilir;
 * bu yüzden dosya/dizin listelemede atlanmalıdır.
 *
 * @param {import('fs').Dirent} entry
 * @returns {boolean}
 */
export function isSymlinkDirent(entry) {
    return !!(entry && typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink());
}

/**
 * Bir dosya/dizin yolunun proje kök dizini (root) içinde olduğunu canonical
 * (realpath) çözümlemesi ile doğrular. Kök veya dosya bulunamazsa, ya da dosya
 * kök dizininin dışında kalırsa hata fırlatır (fail-closed).
 *
 * @param {string} filePath Doğrulanacak dosya/dizin yolu
 * @param {string} root Proje kök dizini
 * @returns {Promise<string>} canonical (realpath) dosya yolu
 */
export async function assertPathInsideRoot(filePath, root) {
    const rootReal = await fs.realpath(root);
    const fileReal = await fs.realpath(filePath);
    const relative = path.relative(rootReal, fileReal);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(
            `Güvenlik ihlali: "${filePath}" proje kök dizininin (${root}) dışında yer alıyor.`
        );
    }
    return fileReal;
}

/**
 * Bir dosya/dizin yolunun, var olan en derin üst dizininin proje kök dizini
 * (root) içinde olduğunu realpath ile doğrular. Tam yol henüz oluşturulmamış
 * olabilir; bu durumda mevcut olan en yakın üst dizine kadar yukarı çıkılır.
 * Kaçış tespit edilirse hata fırlatır (fail-closed).
 *
 * Bu kontrol `fs.mkdir` çağrılmadan ÖNCE yapılır; böylece bir sembolik bağ
 * üst dizin zinciri proje kökünün dışına işaret ediyorsa, mkdir ile kök dışında
 * dizin oluşturulması engellenir (bkz. P0.3 F1).
 *
 * @param {string} filePath Doğrulanacak dosya/dizin yolu
 * @param {string} root Proje kök dizini
 */
export async function assertSafeExistingParent(filePath, root) {
    let current = path.resolve(filePath);
    // Mevcut olan en derin üst dizine kadar tırman.
    for (;;) {
        try {
            const real = await fs.realpath(current);
            await assertPathInsideRoot(real, root);
            return;
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                const parent = path.dirname(current);
                if (parent === current) {
                    // Dosya sistemi köküne ulaştık ve hâlâ mevcut üst dizin yok.
                    throw new Error(
                        `Güvenlik ihlali: "${filePath}" için mevcut üst dizin bulunamadı (kök: ${root}).`
                    );
                }
                current = parent;
                continue;
            }
            // assertPathInsideRoot kaçış hatası ya da diğer hatalar: olduğu gibi yay.
            throw err;
        }
    }
}

// Sözleşme ile uyumlu takma adlar (aynı davranış).
export const isSafeSymlinkEntry = isSymlinkDirent;
export const ensureFileInsideRoot = assertPathInsideRoot;

/**
 * Express async rota sarmalayıcısı (Unhandled promise rejections engeli)
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
