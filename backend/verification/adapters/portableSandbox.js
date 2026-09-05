import { spawn, execSync, execFileSync } from 'child_process';
import os from 'os';
import { randomUUID } from 'crypto';

export const DEFAULT_SANDBOX_LIMITS = Object.freeze({
    cpus: '2.0',
    memory: '1g',
    memorySwap: '1g',
    pids: '100',
    tmpfs: '/tmp:rw,noexec,nosuid,size=64m'
});

export function buildDockerIsolationArgs({ port = null, limits = DEFAULT_SANDBOX_LIMITS } = {}) {
    return [
        '--cpus', limits.cpus,
        '--memory', limits.memory,
        '--memory-swap', limits.memorySwap,
        '--pids-limit', limits.pids,
        '--security-opt', 'no-new-privileges:true',
        '--cap-drop', 'ALL',
        '--tmpfs', limits.tmpfs,
        ...(port ? ['-p', `127.0.0.1:${port}:${port}`] : [])
    ];
}

export class PortableSandboxAdapter {
    constructor(type = 'bubblewrap', options = {}) {
        this.id = type;
        this.type = type;
        this.options = options;
        this.platform = typeof options.platform === 'function'
            ? options.platform
            : () => options.platform || os.platform();
        this.dockerProbe = typeof options.dockerProbe === 'function'
            ? options.dockerProbe
            : typeof options.probe === 'function'
                ? options.probe
                : () => {
                    execSync('docker info', { stdio: 'ignore' });
                };
        this.capabilities = {
            serviceSpawn: true,
            networkModes: ['none', 'service']
        };
    }

    getCapabilities() {
        const supported = this.type === 'bubblewrap' || this.type === 'docker';
        const available = supported && this.isAvailable();
        return {
            available,
            adapterId: this.id,
            isolation: available,
            serviceSpawn: available,
            jobObject: available,
            resourceLimits: available && this.type === 'docker',
            workspaceAcl: available,
            networkDenied: available,
            envScrubbed: available,
            reason: available
                ? null
                : supported
                    ? `${this.type} sandbox runtime is not available on this host.`
                    : `Unsupported sandbox runtime: ${this.type}.`
        };
    }


    isAvailable() {
        if (this.type !== 'bubblewrap' && this.type !== 'docker') return false;
        if (this.type === 'bubblewrap' && this.platform() !== 'linux') return false;

        try {
            if (this.type === 'docker') {
                return this.dockerProbe() !== false;
            }
            execSync('bwrap --version', { stdio: 'ignore' });
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

    cleanupDockerContainer(containerName) {
        if (this.type !== 'docker' || !containerName) return;
        try {
            execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
        } catch {}
    }

    buildServiceCommand({ command, args = [], workspace, port, networkMode = 'service', containerName = null }) {
        const workDir = workspace || process.cwd();
        if (this.type === 'bubblewrap') {
            return {
                command: 'bwrap',
                args: ['--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib',
                    '--ro-bind', '/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev',
                    '--bind', workDir, '/workspace', '--chdir', '/workspace', '--unshare-all',
                    ...(networkMode === 'service' ? ['--share-net'] : ['--unshare-net']),
                    '--', command, ...args]
            };
        }
        return {
            command: 'docker',
            args: [
                'run', '--rm',
                ...(containerName ? ['--name', containerName] : []),
                '-v', `${workDir}:/workspace`,
                '-w', '/workspace',
                '--network', networkMode === 'service' ? 'bridge' : 'none',
                ...buildDockerIsolationArgs({ port }),
                'node:22.23.2-alpine',
                command,
                ...args
            ]
        };
    }

    async spawn({ command, args = [], workspace, env = {}, port, networkMode = 'service', containerName = null }) {
        const capabilities = this.getCapabilities();
        if (!capabilities.available || !capabilities.serviceSpawn) {
            throw new Error(capabilities.reason || `${this.type} cannot spawn services.`);
        }
        const wrapped = this.buildServiceCommand({ command, args, workspace, port, networkMode, containerName });
        return spawn(wrapped.command, wrapped.args, {
            cwd: workspace || process.cwd(),
            env: { PATH: process.env.PATH, TEMP: '/tmp', TMP: '/tmp', NODE_ENV: 'production', ...env },
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
    }


    async execute({ command, args = [], workspace, timeoutMs = 60000, env = {}, port = null, networkMode = 'none', containerName = null }) {
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
        const dockerContainerName = this.type === 'docker'
            ? containerName || `xfactor-sandbox-${process.pid}-${randomUUID()}`
            : null;

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
                    ...(dockerContainerName ? ['--name', dockerContainerName] : []),
                    '-v', `${workspace || process.cwd()}:/workspace`,
                    '-w', '/workspace',
                    '--network', networkMode === 'service' ? 'bridge' : 'none',
                    ...buildDockerIsolationArgs({ port }),
                    'node:22.23.2-alpine',
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
                    this.cleanupDockerContainer(dockerContainerName);
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
