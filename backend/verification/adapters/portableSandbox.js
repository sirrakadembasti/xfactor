import { spawn, execSync } from 'child_process';
import os from 'os';

export class PortableSandboxAdapter {
    constructor(type = 'bubblewrap', options = {}) {
        this.id = type;
        this.type = type;
        this.options = options;
    }

    isAvailable() {
        const platform = os.platform();
        if (platform !== 'linux' && platform !== 'darwin') {
            return false;
        }

        try {
            const checkCmd = this.type === 'docker' ? 'docker --version' : 'bwrap --version';
            execSync(checkCmd, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    killProcessTree(pid) {
        if (!pid) return;
        try {
            process.kill(-pid, 'SIGKILL');
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
                stderr: `${this.type} sandbox runtime is not available on this host. Fail-closed without host fallback.`,
                timedOut: false,
                aborted: false
            };
        }

        return new Promise((resolve) => {
            const cleanEnv = {
                PATH: process.env.PATH,
                TEMP: '/tmp',
                TMP: '/tmp',
                NODE_ENV: 'production',
                ...env
            };

            let spawnCmd = command;
            let spawnArgs = args;

            if (this.type === 'bubblewrap') {
                spawnCmd = 'bwrap';
                spawnArgs = [
                    '--ro-bind', '/usr', '/usr',
                    '--ro-bind', '/lib', '/lib',
                    '--ro-bind', '/lib64', '/lib64',
                    '--proc', '/proc',
                    '--dev', '/dev',
                    '--bind', workspace || process.cwd(), '/workspace',
                    '--chdir', '/workspace',
                    '--unshare-all',
                    '--',
                    command,
                    ...args
                ];
            } else if (this.type === 'docker') {
                spawnCmd = 'docker';
                spawnArgs = [
                    'run', '--rm',
                    '-v', `${workspace || process.cwd()}:/workspace`,
                    '-w', '/workspace',
                    '--network', 'none',
                    'node:20-alpine',
                    command,
                    ...args
                ];
            }

            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let timer = null;

            let child;
            try {
                child = spawn(spawnCmd, spawnArgs, {
                    cwd: workspace || process.cwd(),
                    env: cleanEnv,
                    detached: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } catch (err) {
                return resolve({
                    status: 'FAIL',
                    passed: false,
                    exitCode: -1,
                    stdout: '',
                    stderr: `Failed to spawn sandbox process: ${err.message}`,
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
