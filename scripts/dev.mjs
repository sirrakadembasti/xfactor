import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import fs from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(repoRoot, 'backend');
const frontendDir = path.join(repoRoot, 'frontend');

console.log('\x1b[36m%s\x1b[0m', '=== XFactor Development Server Başlatılıyor ===');
console.log(`Backend dizini:  ${backendDir}`);
console.log(`Frontend dizini: ${frontendDir}\n`);

let backendProcess = null;
let frontendProcess = null;
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
        env: { ...process.env, FORCE_COLOR: '1' },
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

    setTimeout(() => {
        process.exit(exitCode);
    }, 500);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

if (process.stdin.isTTY) {
    process.stdin.resume();
}

startBackend();
startFrontend();
