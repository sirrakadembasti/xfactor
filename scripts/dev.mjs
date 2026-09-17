import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import fs from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(repoRoot, 'backend');
const frontendDir = path.join(repoRoot, 'frontend');
const executionDir = path.join(repoRoot, 'execution');

console.log('\x1b[36m%s\x1b[0m', '=== XFactor Development Server Başlatılıyor ===');
console.log(`Backend dizini:   ${backendDir}`);
console.log(`Frontend dizini:  ${frontendDir}`);
console.log(`Execution dizini: ${executionDir}\n`);

let backendProcess = null;
let frontendProcess = null;
let workerProcess = null;
let isExiting = false;

function pipeLogs(proc, prefix, prefixColor) {
    const formatLine = (line) => `${prefixColor}${prefix}\x1b[0m ${line}`;

    if (proc.stdout) {
        const rlOut = readline.createInterface({ input: proc.stdout });
        rlOut.on('line', (line) => console.log(formatLine(line)));
    }
    if (proc.stderr) {
        const rlErr = readline.createInterface({ input: proc.stderr });
        rlErr.on('line', (line) => console.error(formatLine(line)));
    }
}

function startBackend() {
    backendProcess = spawn(process.execPath, ['--watch', 'server.js'], {
        cwd: backendDir,
        env: {
            ...process.env,
            FORCE_COLOR: '1',
            EXECUTION_WORKER_TOKEN: process.env.EXECUTION_WORKER_TOKEN || 'dev-worker-token-internal',
            EXECUTION_WORKER_URL: process.env.EXECUTION_WORKER_URL || 'http://127.0.0.1:8099'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    pipeLogs(backendProcess, '[backend]', '\x1b[34m');

    backendProcess.on('exit', (code, signal) => {
        if (!isExiting) {
            console.log(`\x1b[31m[backend] kapandı (kod: ${code ?? 'yok'}, sinyal: ${signal ?? 'yok'})\x1b[0m`);
            cleanup(code || 1);
        }
    });
}

function startFrontend() {
    const viteLocalBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
    const useLocalBin = fs.existsSync(viteLocalBin);

    const cmd = useLocalBin ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const args = useLocalBin ? [viteLocalBin] : ['run', 'dev'];

    frontendProcess = spawn(cmd, args, {
        cwd: frontendDir,
        env: { ...process.env, FORCE_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    pipeLogs(frontendProcess, '[frontend]', '\x1b[32m');

    frontendProcess.on('exit', (code, signal) => {
        if (!isExiting) {
            console.log(`\x1b[31m[frontend] kapandı (kod: ${code ?? 'yok'}, sinyal: ${signal ?? 'yok'})\x1b[0m`);
            cleanup(code || 1);
        }
    });
}
function startWorker() {
    const serverJs = path.join(executionDir, 'server.js');
    const entrypointJs = path.join(executionDir, 'entrypoint.js');
    const scriptToRun = fs.existsSync(serverJs) ? serverJs : (fs.existsSync(entrypointJs) ? entrypointJs : null);

    if (!scriptToRun) {
        console.log('\x1b[33m[worker] execution worker betiği bulunamadı, atlanıyor.\x1b[0m');
        return;
    }

    workerProcess = spawn(process.execPath, [scriptToRun], {
        cwd: executionDir,
        env: {
            ...process.env,
            FORCE_COLOR: '1',
            EXECUTION_WORKER_TOKEN: process.env.EXECUTION_WORKER_TOKEN || 'dev-worker-token-internal',
            PORT: process.env.PORT || '8099'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    pipeLogs(workerProcess, '[worker]', '\x1b[35m');

    workerProcess.on('exit', (code, signal) => {
        if (!isExiting) {
            console.log(`\x1b[31m[worker] kapandı (kod: ${code ?? 'yok'}, sinyal: ${signal ?? 'yok'})\x1b[0m`);
            cleanup(code || 1);
        }
    });
}

function cleanup(exitCode = 0) {
    if (isExiting) return;
    isExiting = true;
    console.log('\n\x1b[33mServisler kapatılıyor...\x1b[0m');

    const killProcess = (p) => {
        if (!p || p.killed) return;
        try {
            if (process.platform === 'win32' && p.pid) {
                spawn('taskkill', ['/pid', String(p.pid), '/f', '/t'], { stdio: 'ignore' });
            } else {
                p.kill('SIGTERM');
            }
        } catch {
            try { p.kill(); } catch {}
        }
    };

    killProcess(backendProcess);
    killProcess(frontendProcess);
    killProcess(workerProcess);

    setTimeout(() => {
        process.exit(exitCode);
    }, 500);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

if (process.stdin.isTTY) {
    process.stdin.resume();
}

startWorker();
startBackend();
startFrontend();
