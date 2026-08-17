function normalize(value) {
    return String(value ?? '').trim();
}

export function validateRuntimeConfig(env = process.env) {
    const adminUser = normalize(env.ADMIN_USER);
    const adminPass = normalize(env.ADMIN_PASS);
    const jwtSecret = normalize(env.JWT_SECRET);
    const issues = [];

    if (!adminUser) {
        issues.push('ADMIN_USER is required');
    }

    if (!adminPass) {
        issues.push('ADMIN_PASS is required');
    } else if (adminPass.length < 12) {
        issues.push('ADMIN_PASS must be at least 12 characters long');
    } else if (/^(admin123|admin|password|pass|secret|change-me|replace-with|example|demo)$/i.test(adminPass) ||
        (/password/i.test(adminPass) && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(adminPass))) {
        issues.push('ADMIN_PASS must be a strong password and not a placeholder');
    }

    if (!jwtSecret) {
        issues.push('JWT_SECRET is required');
    } else if (jwtSecret.length < 32 || /gizli|secret|replace-with|change-me|example|demo/i.test(jwtSecret)) {
        issues.push('JWT_SECRET must be at least 32 chars and not a placeholder or default secret');
    }

    if (issues.length > 0) {
        throw new Error(`Invalid runtime config: ${issues.join('; ')}`);
    }

    return {
        ADMIN_USER: adminUser,
        ADMIN_PASS: adminPass,
        JWT_SECRET: jwtSecret
    };
}
