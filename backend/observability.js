import crypto from 'crypto';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
    'authorization',
    'cookie',
    'setcookie',
    'password',
    'passwd',
    'pwd',
    'token',
    'accesstoken',
    'refreshtoken',
    'jwt',
    'secret',
    'apikey',
    'clientsecret',
    'privatekey',
    'accesskey',
    'credential',
    'databaseurl',
    'connectionstring'
]);

function isSensitiveKey(key) {
    const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (SENSITIVE_KEYS.has(normalized)) return true;
    return ['password', 'token', 'secret', 'apikey', 'privatekey', 'accesskey', 'credential'].some(suffix => normalized.endsWith(suffix));
}

export function redactSensitiveText(value) {
    if (typeof value !== 'string' || !value) return value;

    return value
        .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
        .replace(
            /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|jwt|authorization|cookie|password|passwd|secret|client[_-]?secret|private[_-]?key|access[_-]?key|credential|database[_-]?url|connection[_-]?string)\b\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
            '$1[REDACTED]'
        )
        .replace(/(https?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
        .replace(/\bAIza[A-Za-z0-9_-]{10,}\b/g, REDACTED)
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
}

function sanitizeLogValue(value, seen) {
    if (typeof value === 'string') return redactSensitiveText(value);
    if (typeof value === 'bigint') return value.toString();
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Error) return serializeError(value);
    if (value instanceof Date) return value.toISOString();
    if (seen.has(value)) return '[Circular]';

    seen.add(value);
    if (Array.isArray(value)) {
        return value.map(item => sanitizeLogValue(item, seen));
    }

    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
        sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeLogValue(item, seen);
    }
    return sanitized;
}

export function generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

export function buildStructuredLog(event, details = {}) {
    const sanitizedDetails = sanitizeLogValue(details, new WeakSet());
    const requestId = sanitizedDetails.requestId || generateRequestId();
    return {
        timestamp: new Date().toISOString(),
        event,
        requestId,
        ...sanitizedDetails
    };
}

export function serializeError(error) {
    if (!error) {
        return { name: 'Error', message: 'Unknown error', code: undefined, stack: undefined };
    }

    const safeMessage = typeof error.message === 'string' && error.message.trim()
        ? redactSensitiveText(error.message)
        : 'Unknown error';

    return {
        name: error.name || 'Error',
        message: safeMessage,
        code: typeof error.code === 'string' ? redactSensitiveText(error.code) : undefined,
        stack: undefined
    };
}

export function writeStructuredLog(level, event, details = {}, sink = null) {
    const entry = buildStructuredLog(event, details);
    const writer = sink || (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log);
    writer(JSON.stringify(entry));
    return entry;
}

export function logError(event, error, details = {}, sink = null) {
    return writeStructuredLog('error', event, { ...details, error: serializeError(error) }, sink);
}

export function logWarning(event, error, details = {}, sink = null) {
    return writeStructuredLog('warn', event, { ...details, error: serializeError(error) }, sink);
}

export function buildErrorResponse(error, fallbackMessage = 'İşlem başarısız oldu.', requestId = null, code = 'INTERNAL_ERROR') {
    const resolvedRequestId = typeof requestId === 'string' && requestId.trim()
        ? requestId
        : (typeof error?.requestId === 'string' && error.requestId ? error.requestId : generateRequestId());
    const finalMessage = typeof fallbackMessage === 'string' && fallbackMessage.trim()
        ? fallbackMessage
        : 'İşlem başarısız oldu.';
    const finalCode = typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)
        ? code
        : 'INTERNAL_ERROR';

    return {
        error: finalMessage,
        code: finalCode,
        requestId: resolvedRequestId
    };
}

export function createCorrelatedContext({ attemptId = null, projectId = null, requestId = null } = {}) {
    return {
        requestId: requestId || generateRequestId(),
        projectId,
        attemptId
    };
}

export function cleanupStaleLogs(db, retentionDays = 30) {
    if (!db || typeof db.prepare !== 'function') return 0;
    const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    try {
        const result = db.prepare('DELETE FROM project_logs WHERE timestamp < ?').run(cutoffIso);
        return result.changes;
    } catch {
        return 0;
    }
}
