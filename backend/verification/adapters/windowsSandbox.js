import { spawn, execSync } from 'child_process';
import os from 'os';
import path from 'path';

export class WindowsSandboxAdapter {
    constructor(options = {}) {
        this.id = 'windows';
        this.options = options;
    }

    isAvailable() {
        return os.platform() === 'win32';
    }

    killProcessTree(pid) {
        if (!pid) return;
        try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
        } catch {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {}
        }
    }

    async execute({ command, args = [], workspace, timeoutMs = 60000, env = {} }) {
        if (!this.isAvailable()) {
            return {
                status: 'BLOCKED',
                passed: false,
                exitCode: -1,
                stdout: '',
                stderr: 'Windows sandbox adapter is not available on this platform',
                timedOut: false,
                aborted: false
            };
        }

        return new Promise((resolve) => {
            const cleanEnv = {
                PATH: process.env.PATH,
                SYSTEMROOT: process.env.SYSTEMROOT,
                TEMP: process.env.TEMP,
                TMP: process.env.TMP,
                NODE_ENV: 'production',
                ...env
            };

            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let timer = null;

            let child;
            try {
                child = spawn(command, args, {
                    cwd: workspace || process.cwd(),
                    env: cleanEnv,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } catch (err) {
                return resolve({
                    status: 'FAIL',
                    passed: false,
                    exitCode: -1,
                    stdout: '',
                    stderr: `Failed to spawn process: ${err.message}`,
                    timedOut: false,
                    aborted: false
                });
            }

            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    this.killProcessTree(child.pid);
                }, timeoutMs);
            }

            child.stdout?.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', (err) => {
                clearTimeout(timer);
                resolve({
                    status: 'FAIL',
                    passed: false,
                    exitCode: -1,
                    stdout,
                    stderr: stderr || err.message,
                    timedOut,
                    aborted: false
                });
            });

            child.on('close', (code) => {
                clearTimeout(timer);
                const passed = code === 0 && !timedOut;
                resolve({
                    status: timedOut ? 'BLOCKED' : (passed ? 'PASS' : 'FAIL'),
                    passed,
                    exitCode: code ?? (timedOut ? -1 : 0),
                    stdout,
                    stderr,
                    timedOut,
                    aborted: false
                });
            });
        });
    }
}
