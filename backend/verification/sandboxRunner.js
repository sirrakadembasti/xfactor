import os from 'os';
import { WindowsSandboxAdapter } from './adapters/windowsSandbox.js';
import { PortableSandboxAdapter } from './adapters/portableSandbox.js';

export class SandboxInitializationError extends Error {
    constructor(message = 'No secure OS sandbox adapter is available.') {
        super(message);
        this.name = 'SandboxInitializationError';
        this.code = 'SANDBOX_UNAVAILABLE';
    }
}

const SENSITIVE_KEY_PATTERN = /(?:API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE|AUTH|LLM|GEMINI|OPENAI|ANTHROPIC|DEEPSEEK|MISTRAL|AZURE)/i;

export function scrubEnvironmentVariables(rawEnv = {}) {
    const clean = {};
    for (const [key, value] of Object.entries(rawEnv)) {
        if (!SENSITIVE_KEY_PATTERN.test(key)) {
            clean[key] = value;
        }
    }
    return clean;
}

const adapters = {
    windows: new WindowsSandboxAdapter(),
    bubblewrap: new PortableSandboxAdapter('bubblewrap'),
    docker: new PortableSandboxAdapter('docker')
};

export function getActiveSandboxAdapter(requestedId = null) {
    if (requestedId && adapters[requestedId]) {
        return adapters[requestedId];
    }

    if (requestedId) {
        throw new SandboxInitializationError(`Requested sandbox adapter "${requestedId}" is not recognized.`);
    }

    const platform = os.platform();
    if (platform === 'win32') {
        return adapters.windows;
    } else if (platform === 'linux' || platform === 'darwin') {
        return adapters.bubblewrap;
    }

    throw new SandboxInitializationError(`No compatible sandbox adapter found for platform: ${platform}`);
}

export function requireSandboxCapabilities(adapter) {
    if (typeof adapter.getCapabilities !== 'function') {
        if (typeof adapter.isAvailable === 'function' && adapter.isAvailable()) {
            return null;
        }
        throw new SandboxInitializationError(`Sandbox adapter "${adapter.id || 'unknown'}" is unavailable.`);
    }

    const capabilities = adapter.getCapabilities();
    if (!capabilities?.available) {
        throw new SandboxInitializationError(
            capabilities?.reason || `Sandbox adapter "${adapter.id || 'unknown'}" is unavailable.`
        );
    }
    return capabilities;
}

export async function executeInSandbox(command, args = [], options = {}) {
    let adapter = options.adapter;

    if (adapter === undefined) {
        adapter = getActiveSandboxAdapter();
    }

    if (!adapter || typeof adapter.execute !== 'function') {
        throw new SandboxInitializationError('Invalid or missing sandbox adapter.');
    }

    const capabilities = requireSandboxCapabilities(adapter);
    const scrubbedEnv = scrubEnvironmentVariables(options.env || {});

    const result = await adapter.execute({
        command,
        args,
        workspace: options.workspace,
        timeoutMs: options.timeoutMs ?? 60000,
        env: scrubbedEnv,
        capabilities
    });

    return {
        ...result,
        adapterId: adapter.id || capabilities?.adapterId || 'unknown',
        capabilities
    };
}
