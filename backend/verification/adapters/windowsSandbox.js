import { spawn, spawnSync } from 'child_process';

export class WindowsSandboxAdapter {
    constructor(options = {}) {
        this.id = 'windows';
        this.options = options;
    }

    getCapabilities() {
        return {
            available: false,
            adapterId: this.id,
            isolation: false,
            jobObject: false,
            resourceLimits: false,
            workspaceAcl: false,
            networkDenied: false,
            envScrubbed: true,
            reason: 'Windows restricted-token and Job Object isolation is not implemented'
        };
    }

    isAvailable() {
        return this.getCapabilities().available;
    }

    killProcessTree(pid) {
        if (!pid) return;
        try {
            const result = spawnSync(
                'taskkill',
                ['/F', '/T', '/PID', String(pid)],
                { stdio: 'ignore', windowsHide: true }
            );
            if (result.error || result.status !== 0) {
                throw result.error || new Error(`taskkill exited with status ${result.status}`);
            }
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
