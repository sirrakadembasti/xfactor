import { spawn, execSync } from 'child_process';
import os from 'os';
import { scrubEnvironmentVariables } from './sandboxRunner.js';

export function killProcessTree(pid) {
    if (!pid || typeof pid !== 'number') return;

    if (os.platform() === 'win32') {
        try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        } catch {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {}
        }
    } else {
        try {
            process.kill(-pid, 'SIGKILL');
        } catch {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {}
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

    const cleanEnv = scrubEnvironmentVariables(baseEnv);

    let child;
    let stdout = '';
    let stderr = '';

    const exitCodePromise = new Promise((resolve) => {
        try {
            child = spawn(command, args, {
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
