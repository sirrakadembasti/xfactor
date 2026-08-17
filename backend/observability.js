import crypto from 'crypto';

export function generateRequestId() {
    return crypto.randomBytes(8).toString('hex');
}

export function buildStructuredLog(event, details = {}) {
    const requestId = details.requestId || generateRequestId();
    return {
        timestamp: new Date().toISOString(),
        event,
        requestId,
        ...details
    };
}

export function serializeError(error) {
    if (!error) {
        return { name: 'Error', message: 'Unknown error' };
    }

    const safeMessage = typeof error.message === 'string' && error.message.trim()
        ? error.message
        : 'Unknown error';

    return {
        name: error.name || 'Error',
        message: safeMessage,
        code: error.code || undefined,
        stack: undefined
    };
}

export function buildErrorResponse(error, fallbackMessage = 'İşlem başarısız oldu.', requestId = null) {
    const resolvedRequestId = typeof requestId === 'string' && requestId.trim() ? requestId : (typeof error?.requestId === 'string' && error.requestId ? error.requestId : generateRequestId());
    const finalMessage = typeof fallbackMessage === 'string' && fallbackMessage.trim()
        ? fallbackMessage
        : 'İşlem başarısız oldu.';

    return {
        error: finalMessage,
        requestId: resolvedRequestId
    };
}
