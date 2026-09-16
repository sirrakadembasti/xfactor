import path from 'node:path';
import { getMfaEncryptionKeys } from './crypto/mfaCrypto.js';
function normalize(value) {
    return String(value ?? '').trim();
}

const BROWSER_ORIGIN_PROTOCOLS = new Set(['http:', 'https:']);

export function normalizeOrigin(value, { production = false } = {}) {
    const raw = normalize(value);
    if (!raw) {
        throw new Error('origin is empty');
    }

    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(`origin "${raw}" is not a valid URL`);
    }

    if (!BROWSER_ORIGIN_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`origin "${raw}" must use HTTP or HTTPS`);
    }
    if (production && parsed.protocol !== 'https:') {
        throw new Error(`origin "${raw}" must use HTTPS in production`);
    }
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error(`origin "${raw}" must contain only scheme, host, and optional port`);
    }

    const normalized = parsed.origin;
    if (!normalized || normalized === 'null') {
        throw new Error(`origin "${raw}" is not a usable origin`);
    }
    return normalized;
}

function parseAllowedOrigins(value, options = {}) {
    const entries = normalize(value)
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
    const origins = [];
    const seen = new Set();
    for (const entry of entries) {
        const origin = normalizeOrigin(entry, options);
        if (!seen.has(origin)) {
            seen.add(origin);
            origins.push(origin);
        }
    }
    return origins;
}

function isHttpsOrigin(origin) {
    try {
        return normalizeOrigin(origin, { production: true }).startsWith('https://');
    } catch {
        return false;
    }
}

export function validateRuntimeConfig(env = process.env) {
    const nodeEnvironment = normalize(env.NODE_ENV).toLowerCase() || 'development';
    const production = nodeEnvironment === 'production';
    const trustProxy = normalize(env.TRUST_PROXY).toLowerCase();
    const issues = [];
    let allowedOrigins = [];
    try {
        allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS, { production });
    } catch (error) {
        issues.push(`ALLOWED_ORIGINS is invalid: ${error.message}`);
    }
    const artifactsRoot = normalize(env.ARTIFACTS_ROOT);
    const projectsRoot = normalize(env.PROJECTS_ROOT);
    const dbPath = normalize(env.DB_PATH);
    const workerUrl = normalize(env.EXECUTION_WORKER_URL) || 'http://127.0.0.1:8080';
    let workerToken = normalize(env.EXECUTION_WORKER_TOKEN);
    if (!production && !workerToken) {
        workerToken = 'dev-worker-token-internal';
    }
    if (production) {
        if (trustProxy !== 'loopback') {
            issues.push('TRUST_PROXY must be loopback in production');
        }
        if (allowedOrigins.length === 0) {
            issues.push('ALLOWED_ORIGINS must contain at least one HTTPS origin in production');
        } else if (allowedOrigins.some(origin => !isHttpsOrigin(origin))) {
            issues.push('ALLOWED_ORIGINS must contain only HTTPS origins in production');
        }
    }
    if (production && !path.isAbsolute(artifactsRoot)) {
        issues.push('ARTIFACTS_ROOT must be an absolute path in production');
    }
    if (production && !path.isAbsolute(projectsRoot)) {
        issues.push('PROJECTS_ROOT must be an absolute path in production');
    }
    if (production && !path.isAbsolute(dbPath)) {
        issues.push('DB_PATH must be an absolute path in production');
    }
    if (production && !workerToken) {
        issues.push('EXECUTION_WORKER_TOKEN is required in production');
    }
    if (production) {
        try {
            getMfaEncryptionKeys(env);
        } catch {
            issues.push('MFA_ENCRYPTION_KEY must be a valid 32-byte key in production');
        }
    }

    if (issues.length > 0) {
        throw new Error(`Invalid runtime config: ${issues.join('; ')}`);
    }

    return {
        NODE_ENV: nodeEnvironment,
        production,
        TRUST_PROXY: production ? trustProxy : false,
        ALLOWED_ORIGINS: allowedOrigins,
        ARTIFACTS_ROOT: artifactsRoot,
        PROJECTS_ROOT: projectsRoot,
        DB_PATH: dbPath,
        EXECUTION_WORKER_URL: workerUrl,
        EXECUTION_WORKER_TOKEN: workerToken,
    };
}

