import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, stat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

export const isWindows = process.platform === 'win32';
const nativeRoot = fileURLToPath(new URL('./native/', import.meta.url));
const pending = new Map();

export async function ensureWindowsProcessHost({ cacheRoot, signal, deadline } = {}) {
  if (!isWindows) return null;
  const check = () => {
    if (signal?.aborted) throw new Error('Cancelled by user');
    if (deadline !== undefined && (!Number.isFinite(deadline) || Date.now() >= deadline)) throw new Error('Job deadline exceeded');
  };
  check();
  if (typeof cacheRoot !== 'string' || !path.isAbsolute(cacheRoot)) throw new Error('Windows process host requires an absolute owned cacheRoot');
  const sourcePath = path.join(nativeRoot, 'windowsProcessHost.cs');
  const scriptPath = path.join(nativeRoot, 'build-windows-process-host.ps1');
  const [source, script] = await Promise.all([readFile(sourcePath), readFile(scriptPath)]);
  check();
  const hash = createHash('sha256').update(source).update(script).digest('hex');
  const output = path.join(cacheRoot, `windows-process-host-${hash}.exe`);
  const ownsBuild = !pending.has(output);
  if (ownsBuild) pending.set(output, build().finally(() => pending.delete(output)));
  if (ownsBuild) {
    // execFile aborts the compiler; its close event completes cleanup before rejection.
    const executable = await pending.get(output);
    check();
    return executable;
  }
  // Each waiter honors its own cancellation/deadline, even if another caller started the build.
  return new Promise((resolve, reject) => {
    let timer;
    const abort = () => finish(reject, new Error('Cancelled by user'));
    const finish = (fn, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
    signal?.addEventListener('abort', abort, { once: true });
    if (deadline !== undefined) timer = setTimeout(() => finish(reject, new Error('Job deadline exceeded')), Math.max(1, deadline - Date.now()));
    pending.get(output).then(value => { try { check(); finish(resolve, value); } catch (error) { finish(reject, error); } }, error => finish(reject, error));
    if (signal?.aborted) abort();
  });

  async function build() {
    await mkdir(cacheRoot, { recursive: true });
    check();
    try { if ((await stat(output)).isFile()) return output; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = path.join(cacheRoot, `.windows-process-host-${randomUUID()}.exe`);
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    try {
      check();
      await new Promise((resolve, reject) => {
        let completionError; let diagnostic = '';
        const compiler = execFile(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-SourcePath', sourcePath, '-OutputPath', temporary],
          { windowsHide: true, signal, timeout: Math.max(1, Math.min(120000, deadline === undefined ? 120000 : deadline - Date.now())), maxBuffer: 256 * 1024 }, (error, stdout, stderr) => { completionError = error; diagnostic = stderr || ''; });
        // Abort emits error before close. Keep the output cleanup behind actual close.
        compiler.once('close', () => {
          if (completionError && signal?.aborted) reject(new Error('Cancelled by user', { cause: completionError }));
          else if (completionError && deadline !== undefined && Date.now() >= deadline) reject(new Error('Job deadline exceeded', { cause: completionError }));
          else if (completionError) reject(new Error(`Windows process host build failed: ${diagnostic.trim() || completionError.message}`, { cause: completionError }));
          else resolve();
        });
      });
      check();
      if (!(await stat(temporary)).isFile()) throw new Error('Windows process host compiler produced no executable');
      try { await rename(temporary, output); }
      catch (error) { if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error; if (!(await stat(output)).isFile()) throw error; }
      return output;
    } finally {
      await rm(temporary, { force: true });
      await rm(temporary.replace(/\.exe$/, '.pdb'), { force: true });
    }
  }
}
