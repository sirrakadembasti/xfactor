import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, lstat, link, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

export const isWindows = process.platform === 'win32';
const nativeRoot = fileURLToPath(new URL('./native/', import.meta.url));
const pending = new Map();

export async function ensureWindowsProcessHost({ cacheRoot, signal, deadline, allowBuild = true } = {}) {
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
  const receiptPath = `${output}.receipt.json`;
  const hostError = (code, message) => Object.assign(new Error(message), { code });
  const integrityError = () => hostError('LOCAL_HOST_INTEGRITY', 'Windows process host integrity check failed. Review the local-worker installation; no replacement was built.');
  const unavailableError = () => hostError('LOCAL_HOST_UNAVAILABLE', 'Previously prepared Windows process host is unavailable. Automatic rebuilding is blocked; review operating-system protection events and the local-worker installation.');
  async function recordHost(sha256) {
    const temporaryRecord = path.join(cacheRoot, `.windows-process-host-record-${randomUUID()}.json`);
    try {
      await writeFile(temporaryRecord, JSON.stringify({ version: 1, sourceHash: hash, sha256 }), { flag: 'wx', mode: 0o600 });
      try { await link(temporaryRecord, receiptPath); return true; }
      catch (error) { if (error.code === 'EEXIST') return false; throw error; }
    } finally { await rm(temporaryRecord, { force: true }); }
  }
  async function cachedHost() {
    let receipt, hasReceipt = false;
    try {
      const info = await lstat(receiptPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) throw integrityError();
      receipt = JSON.parse(await readFile(receiptPath, 'utf8')); hasReceipt = true;
      if (receipt?.version !== 1 || receipt.sourceHash !== hash || !/^[a-f0-9]{64}$/.test(receipt.sha256 || '')) throw integrityError();
    } catch (error) {
      if (error.code !== 'ENOENT') throw integrityError();
    }
    let info;
    try { info = await lstat(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!info) {
      if (hasReceipt) throw unavailableError();
      return null;
    }
    if (!info.isFile() || info.isSymbolicLink()) throw integrityError();
    let bytes;
    try { bytes = await readFile(output); }
    catch (error) { if (error.code === 'ENOENT') throw unavailableError(); throw error; }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (hasReceipt) {
      if (receipt.sha256 !== sha256) throw integrityError();
    } else {
      // Record an existing cache without claiming its signature or malware status.
      await recordHost(sha256);
      return cachedHost();
    }
    return output;
  }
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
    const lockPath = `${output}.lock`;
    const waitUntil = Math.min(Date.now() + 120000, deadline ?? Infinity);
    let ownsLock = false;
    try {
      while (!ownsLock) {
        check();
        try { await mkdir(lockPath); ownsLock = true; }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if (Date.now() >= waitUntil) throw hostError('LOCAL_HOST_BUSY', 'Windows process host preparation is locked. Review any interrupted local-worker installation; no lock was taken over.');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
      check();
      return await prepareHost();
    } finally {
      if (ownsLock) {
        try { await rmdir(lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }

  async function prepareHost() {
    check();
    const cached = await cachedHost();
    if (cached) return cached;
    if (!allowBuild) throw hostError('LOCAL_HOST_UNAVAILABLE', 'Windows process host is not prepared. Validation-only checking does not build an executable.');
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
      // A legacy or independent installer may have published while compilation ran.
      const preparedByOther = await cachedHost();
      if (preparedByOther) return preparedByOther;
      // Retain the preparation record if protection subsequently removes the EXE.
      const recorded = await recordHost(createHash('sha256').update(await readFile(temporary)).digest('hex'));
      if (!recorded) return cachedHost();
      try { await rename(temporary, output); }
      catch (error) { if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error; if (!(await stat(output)).isFile()) throw error; }
      return cachedHost();
    } finally {
      await rm(temporary, { force: true });
      await rm(temporary.replace(/\.exe$/, '.pdb'), { force: true });
    }
  }
}
