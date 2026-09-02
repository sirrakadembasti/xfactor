import { spawn, spawnSync } from 'child_process';
import os from 'os';
import { scrubEnvironmentVariables } from './sandboxRunner.js';

function requireAvailableSandbox(adapter) {
    if (!adapter || typeof adapter.execute !== 'function') {
        const error = new Error('Sandbox adapter is unavailable.');
        error.code = 'SANDBOX_UNAVAILABLE';
        throw error;
    }
    if (typeof adapter.getCapabilities === 'function') {
        const capabilities = adapter.getCapabilities();
        if (!capabilities?.available) {
            const error = new Error(capabilities?.reason || 'Sandbox adapter is unavailable.');
            error.code = 'SANDBOX_UNAVAILABLE';
            throw error;
        }
    } else {
        const error = new Error(`Sandbox adapter "${adapter.id || 'unknown'}" has no proven capabilities.`);
        error.code = 'SANDBOX_UNAVAILABLE';
        throw error;
    }
    return adapter;
}

export function killProcessTree(pid) {
    if (!pid || typeof pid !== 'number') return;

    if (os.platform() === 'win32') {
        try {
            spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
        } catch {
            try { process.kill(pid, 'SIGKILL'); } catch {}
        }
    } else {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {
            try { process.kill(pid, 'SIGKILL'); } catch {}
        }
    }
}

export async function killService(processTreeHandle) {
    if (!processTreeHandle) return;
    const pid = typeof processTreeHandle === 'number' ? processTreeHandle : processTreeHandle.pid;
    killProcessTree(pid);
    if (processTreeHandle.child && typeof processTreeHandle.child.kill === 'function') {
        try {
            processTreeHandle.child.kill('SIGKILL');
        } catch {}
    }
}

export async function spawnService(serviceId, config = {}, env = {}, options = {}) {
    const {
        command = process.execPath,
        args = [],
        cwd = process.cwd()
    } = config;

    const baseEnv = {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: 'production',
        ...env
    };
    const hostMode = options.allowHostExecution === true && process.env.XFACTOR_BUILD_SANDBOX === 'host';
    const adapter = options.adapter;
    if (!hostMode) {
        requireAvailableSandbox(adapter);
        if (typeof adapter.spawn !== 'function') {
            const error = new Error('Sandbox adapter does not provide a long-running process boundary.');
            error.code = 'SANDBOX_UNAVAILABLE';
            throw error;
        }
    }

    const cleanEnv = scrubEnvironmentVariables(baseEnv);

    let child;
    let stdout = '';
    let stderr = '';

    const exitCodePromise = new Promise((resolve) => {
        try {
            child = hostMode
                ? spawn(command, args, {
                    cwd,
                    env: cleanEnv,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                })
                : adapter.spawn({
                    command,
                    args,
                    cwd,
                    env: cleanEnv,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
        } catch (err) {
            return resolve({ exitCode: -1, stdout: '', stderr: err.message, timedOut: false });
        }

        child.stdout?.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', (err) => {
            resolve({ exitCode: -1, stdout, stderr: stderr || err.message, timedOut: false });
        });

        child.on('close', (code) => {
            resolve({ exitCode: code ?? 0, stdout, stderr, timedOut: false });
        });
    });

    if (!child || !child.pid) {
        throw new Error(`Failed to spawn service "${serviceId}".`);
    }

    return {
        serviceId,
        pid: child.pid,
        port: config.port,
        child,
        processTreeHandle: {
            pid: child.pid,
            serviceId,
            child
        },
        exitCodePromise
    };
}
