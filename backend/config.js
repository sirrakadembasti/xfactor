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
    const issues = [];

    if (production) {
        if (trustProxy !== 'loopback') {
            issues.push('TRUST_PROXY must be loopback in production');
        }
        if (allowedOrigins.length === 0 || allowedOrigins.some(origin => !isHttpsOrigin(origin))) {
            issues.push('ALLOWED_ORIGINS must contain only HTTPS origins in production');
        }
    }

    if (issues.length > 0) {
        throw new Error(`Invalid runtime config: ${issues.join('; ')}`);
    }

    return {
        NODE_ENV: nodeEnvironment,
        production,
        TRUST_PROXY: production ? trustProxy : false,
        ALLOWED_ORIGINS: allowedOrigins
    };
}
