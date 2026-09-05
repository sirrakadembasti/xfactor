import path from 'node:path';

function normalize(value) {
    return String(value ?? '').trim();
}

function parseAllowedOrigins(value) {
    return normalize(value)
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
}

function isHttpsOrigin(origin) {
    try {
        return new URL(origin).protocol === 'https:';
    } catch {
        return false;
    }
}

export function validateRuntimeConfig(env = process.env) {
    const nodeEnvironment = normalize(env.NODE_ENV).toLowerCase() || 'development';
    const production = nodeEnvironment === 'production';
    const trustProxy = normalize(env.TRUST_PROXY).toLowerCase();
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const artifactsRoot = normalize(env.ARTIFACTS_ROOT);
    const projectsRoot = normalize(env.PROJECTS_ROOT);
    const dbPath = normalize(env.DB_PATH);
    const issues = [];

    if (production) {
        if (trustProxy !== 'loopback') {
            issues.push('TRUST_PROXY must be loopback in production');
        }
        if (allowedOrigins.length === 0 || allowedOrigins.some(origin => !isHttpsOrigin(origin))) {
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
    };
}
