import cp from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, realpath, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { ensureWindowsProcessHost, isWindows } from './windowsProcessHost.js';
import { describeCommand } from './commandDiagnostics.js';

const RETAIN_BYTES = 1024 * 1024;
const HARD_BYTES = 8 * RETAIN_BYTES;
const PROTECTED_ENV = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|TEMP|TMP|TMPDIR|APPDATA|LOCALAPPDATA|NODE_OPTIONS|NODE_PATH|NPM_CONFIG_CACHE|NPM_CONFIG_LOGS_DIR|NPM_CONFIG_USERCONFIG|NPM_CONFIG_GLOBALCONFIG|XFACTOR_NPM_CLI|XFACTOR_LOCAL_PARENT_PID|XFACTOR_LOCAL_JOB_.*)$/i;

function annotateSpawnFailure(error, executable, args, cwd, env) {
  if (!error || typeof error.message !== 'string' || error.launchContext) return error;
  // Fixed labels, booleans and sizes only: never expose paths, arguments or env values.
  const context = { stage: 'spawn',
    code: /^[A-Z0-9_]{1,32}$/.test(error.code || '') ? error.code : 'UNKNOWN',
    errno: Number.isInteger(error.errno) ? error.errno : null,
    launcherPresent: existsSync(executable), cwdPresent: existsSync(cwd),
    argumentCharacters: args.reduce((size, value) => size + value.length, 0),
    environmentCharacters: Object.entries(env).reduce((size, [key, value]) => size + key.length + value.length + 2, 0),
    ipcConnected: process.connected === true, rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2) };
  error.launchContext = context;
  error.message = `${error.message} [launch ${JSON.stringify(context)}]`;
  return error;
}

export async function createLocalProcessManager({ tools, workspace, deadline = Date.now() + 900000, signal, onResource, onProgress, cacheRoot, npmCacheDirectory, resourceLimits = {} } = {}) {
  if (!path.isAbsolute(workspace || '') || !path.isAbsolute(cacheRoot || '') || !path.isAbsolute(tools?.node || '') || !path.isAbsolute(tools?.npm || '')) throw new Error('Local process manager requires absolute owned workspace, cacheRoot, and trusted tools');
  const root = await realpath(workspace);
  const host = await ensureWindowsProcessHost({ cacheRoot, signal, deadline });
  const home = path.join(root, '.home'); const temporary = path.join(root, '.tmp');
  if (npmCacheDirectory !== undefined && !path.isAbsolute(npmCacheDirectory)) throw new Error('Operator npm cache requires an absolute path');
  const npmCache = npmCacheDirectory || path.join(root, '.npm');
  const npmLogs = path.join(root, '.npm', '_logs');
  const commandBin = path.join(home, 'bin');
  await Promise.all([home, temporary, npmCache, npmLogs, commandBin, path.join(home, 'AppData', 'Roaming'), path.join(home, 'AppData', 'Local')].map(directory => mkdir(directory, { recursive: true })));
  if (npmCacheDirectory) {
    const relative = path.relative(root, await realpath(npmCache));
    if ((await lstat(npmCache)).isSymbolicLink() || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Operator npm cache must stay outside the job workspace');
  }
  const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const batchQuote = value => { if (/["\r\n]/.test(value)) throw new Error('Invalid trusted tool path'); return '"' + value.replaceAll('%', '%%') + '"'; };
  for (const name of ['npm', 'npx']) {
    const cli = name === 'npm' ? tools.npm : path.join(path.dirname(tools.npm), 'npx-cli.js');
    const content = isWindows ? `@echo off\r\nsetlocal DisableDelayedExpansion\r\n${batchQuote(tools.node)} ${batchQuote(cli)} %*\r\n` : `#!/bin/sh\nexec ${shellQuote(tools.node)} ${shellQuote(cli)} "$@"\n`;
    await writeFile(path.join(commandBin, name + (isWindows ? '.cmd' : '')), content, { mode: 0o700 });
  }
  const baseEnv = {};
  for (const name of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'SYSTEMROOT', 'COMSPEC', 'LANG', 'LC_ALL']) if (process.env[name]) baseEnv[name] = process.env[name];
  Object.assign(baseEnv, {
    PATH: [commandBin, path.dirname(tools.node), isWindows ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin:/bin'].join(path.delimiter),
    HOME: home, USERPROFILE: home, TEMP: temporary, TMP: temporary, TMPDIR: temporary,
    APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    NPM_CONFIG_CACHE: npmCache, NPM_CONFIG_LOGS_DIR: npmLogs, NPM_CONFIG_USERCONFIG: path.join(home, '.npmrc'), NPM_CONFIG_GLOBALCONFIG: path.join(home, 'global.npmrc'), NODE_ENV: 'test', CI: 'true', XFACTOR_NPM_CLI: tools.npm,
    ...(npmCacheDirectory ? { NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org' } : {}),
    NODE_OPTIONS: '--max-old-space-size=1024', NODE_PATH: '',
    XFACTOR_LOCAL_JOB_MEMORY_BYTES: String(resourceLimits.memoryBytes || 1024 * 1024 * 1024), XFACTOR_LOCAL_JOB_PIDS: String(resourceLimits.pids || 100),
    XFACTOR_LOCAL_PARENT_PID: String(process.pid),
  });
  for (const name of ['XFACTOR_LOCAL_JOB_MEMORY_BYTES', 'XFACTOR_LOCAL_JOB_PIDS']) if (process.env[name]) baseEnv[name] = process.env[name];
  const tracked = new Set(); let disposed = false, commandSequence = 0;
  const progress = event => { try { onProgress?.(event); } catch {} };
  const check = options => {
    if (disposed) throw new Error('Local process manager disposed');
    if (signal?.aborted || options.signal?.aborted) throw new Error('Cancelled by user');
    if (Date.now() >= deadline) throw new Error('Job deadline exceeded');
  };
  function request(command, args = [], options = {}) {
    if (command && typeof command === 'object') { options = { ...command, ...options }; args = command.args || []; command = command.command; }
    if (!Array.isArray(args) || args.some(value => typeof value !== 'string' || value.includes('\0'))) throw new Error('Process arguments must be literal strings');
    const name = typeof command === 'string' ? command.toLowerCase().replace(/\.(?:cmd|exe)$/, '') : '';
    if (!['node', 'npm', 'npx'].includes(name) || /[\\/]/.test(command)) throw new Error('Unsupported executable');
    const cli = name === 'npm' ? tools.npm : path.join(path.dirname(tools.npm), 'npx-cli.js');
    return { args: name === 'node' ? args : [cli, ...args], options };
  }
  async function cwdFor(value) {
    let target;
    if (value === undefined || value === '/workspace') target = root;
    else if (typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid workspace cwd');
    else if (value.startsWith('/workspace/')) target = path.resolve(root, value.slice(11));
    else target = path.resolve(root, value);
    const inside = location => { const relative = path.relative(root, location); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
    if (!inside(target)) throw new Error('cwd escapes owned workspace');
    const actual = await realpath(target);
    if (!inside(actual)) throw new Error('cwd escapes owned workspace through a link');
    return actual;
  }
  function terminate(record) {
    if (record.closedDone) return;
    try { if (isWindows) record.child.kill('SIGKILL'); else if (record.child.pid) process.kill(-record.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') record.failure ||= error; }
  }
  async function start(command, args, options, capture) {
    const description = command && typeof command === 'object' ? describeCommand(command.command, command.args || []) : describeCommand(command, args);
    const spec = request(command, args, options); options = spec.options; check(options);
    const cwd = await cwdFor(options.cwd ?? options.workspace);
    check(options);
    const env = { ...baseEnv };
    for (const [name, value] of Object.entries(options.env || {})) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !PROTECTED_ENV.test(name)
        && !(npmCacheDirectory && /^NPM_CONFIG_REGISTRY$/i.test(name)) && value !== undefined && value !== null) env[name] = String(value);
    }
    const actualArgs = host ? [tools.node, ...spec.args] : spec.args;
    let child;
    try { child = cp.spawn(host || tools.node, actualArgs, { cwd, env, shell: false, windowsHide: true, detached: !isWindows, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw annotateSpawnFailure(error, host || tools.node, actualArgs, cwd, env); }
    const record = { child, closedDone: false, failure: null, commandId: ++commandSequence, timedOut: false }; tracked.add(record);
    progress({ state: 'started', commandId: record.commandId, ...description, startedAt: Date.now() });
    const output = { stdout: [], stderr: [] }; const retained = { stdout: 0, stderr: 0 }; const sizes = { stdout: 0, stderr: 0 };
    const hashes = { stdout: createHash('sha256'), stderr: createHash('sha256') };
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
      const bytes = Buffer.from(chunk); sizes[stream] += bytes.length; hashes[stream].update(bytes);
      if (capture && retained[stream] < RETAIN_BYTES) { const keep = bytes.subarray(0, RETAIN_BYTES - retained[stream]); output[stream].push(keep); retained[stream] += keep.length; }
      if (sizes.stdout + sizes.stderr > HARD_BYTES) { record.failure ||= new Error('Process output exceeded hard ceiling'); terminate(record); }
    });
    let timer;
    const abort = () => { record.failure ||= new Error('Cancelled by user'); terminate(record); };
    const signals = [...new Set([signal, options.signal].filter(Boolean))];
    const timeout = Number(options.timeoutMs ?? options.timeout ?? 600000);
    if (!Number.isFinite(timeout) || timeout <= 0) { record.failure = new Error('Invalid command timeout'); terminate(record); }
    const ms = Math.max(1, Math.min(Number.isFinite(timeout) && timeout > 0 ? timeout : 1, deadline - Date.now()));
    record.closed = new Promise(resolve => {
      child.once('error', error => { record.failure ||= annotateSpawnFailure(error, host || tools.node, actualArgs, cwd, env); });
      // POSIX descendants can hold pipes open after root exit; kill the group before close.
      if (!isWindows) child.once('exit', () => terminate(record));
      child.once('close', (exitCode, exitSignal) => {
        record.closedDone = true; tracked.delete(record); clearTimeout(timer);
        for (const item of signals) item.removeEventListener('abort', abort);
        const result = { exitCode, code: exitCode, signal: exitSignal, stdout: Buffer.concat(output.stdout).toString(), stderr: Buffer.concat(output.stderr).toString(), stdoutBytes: sizes.stdout, stderrBytes: sizes.stderr, stdoutTruncated: sizes.stdout > RETAIN_BYTES, stderrTruncated: sizes.stderr > RETAIN_BYTES, stdoutSha256: hashes.stdout.digest('hex'), stderrSha256: hashes.stderr.digest('hex') };
        result.timedOut = record.timedOut;
        result.cancelled = signals.some(item => item.aborted);
        result.executionFailed = Boolean(record.failure);
        result.passed = exitCode === 0 && !record.failure && !result.stdoutTruncated && !result.stderrTruncated;
        progress({ state: 'finished', commandId: record.commandId, endedAt: Date.now(), exitCode,
          timedOut: record.timedOut, stdoutTruncated: result.stdoutTruncated, stderrTruncated: result.stderrTruncated,
          stdoutSha256: result.stdoutSha256, stderrSha256: result.stderrSha256 });
        resolve(result);
      });
    });
    timer = setTimeout(() => { record.timedOut = true; record.failure ||= new Error(Date.now() >= deadline ? 'Job deadline exceeded' : 'Command timed out'); terminate(record); }, ms);
    for (const item of signals) item.addEventListener('abort', abort, { once: true });
    if (signals.some(item => item.aborted)) abort();
    child.stdin.on('error', error => { if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') { record.failure ||= error; terminate(record); } });
    child.stdin.end(options.input === undefined ? undefined : Buffer.from(options.input));
    try { onResource?.({ type: 'process', pid: child.pid, executionProfile: 'local-trusted' }); }
    catch (error) { record.failure ||= error; terminate(record); }
    return record;
  }
  return {
    execute: async (command, args = [], options = {}) => {
      const record = await start(command, args, options, true);
      const result = await record.closed;
      if (record.failure) { record.failure.result = result; throw record.failure; }
      return result;
    },
    spawn: async (command, args = [], options = {}) => (await start(command, args, options, false)).child,
    kill: async pid => {
      const record = [...tracked].find(item => item.child.pid === Number(pid));
      if (record) { terminate(record); await record.closed; }
    },
    dispose: async () => {
      disposed = true;
      const records = [...tracked]; for (const record of records) terminate(record);
      await Promise.all(records.map(record => record.closed));
    },
  };
}
