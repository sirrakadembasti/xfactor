import cp from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
import { executeVerificationJob, prepareDependencies } from './jobExecutor.js';
const OUTPUT_CEILING = 1024 * 1024;
const IMAGE_NAME = 'xfactor-worker-runtime';
const MAX_JOB_MS = 15 * 60 * 1000;
const SAFE_ENV = /^(?:NPM_CONFIG_(?:REGISTRY|IGNORE_SCRIPTS|CACHE)|NODE_ENV|CI)$/;

function safeId(jobId) {
  const raw = String(jobId ?? '');
  const stem = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'job';
  return `${stem}-${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}
function resourceNames(jobId) {
  const base = `xfactor-worker-${safeId(jobId)}`;
  return { container: base, proxy: `${base}-registry-proxy`, install: `${base}-install-net`, build: `${base}-build-net`, job: createHash('sha256').update(String(jobId ?? '')).digest('hex') };
}

function abortError(signal, deadline) { return signal?.aborted ? new Error('Cancelled by user') : new Error(deadline && Date.now() >= deadline ? 'Job deadline exceeded' : 'Docker operation failed'); }
function docker(args, { signal, deadline, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted || (deadline && Date.now() >= deadline)) return reject(abortError(signal, deadline));
    const proc = cp.spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [], err = [];
    proc.stdout?.on('data', c => out.push(c)); proc.stderr?.on('data', c => err.push(c));
    const ms = Math.max(1, Math.min(timeout, deadline ? deadline - Date.now() : timeout));
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
    const abort = () => { const error = abortError(signal, deadline); finish(reject, error); try { proc.kill('SIGKILL'); } catch {} };
    const timer = setTimeout(() => { const error = new Error(deadline && Date.now() >= deadline ? 'Job deadline exceeded' : 'Docker operation timed out'); finish(reject, error); try { proc.kill('SIGKILL'); } catch {} }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    proc.once('error', e => finish(reject, e));
    proc.once('close', (code, sig) => { const stdout = Buffer.concat(out).toString(); const stderr = Buffer.concat(err).toString(); if (code === 0) finish(resolve, { stdout, stderr }); else { const e = new Error(stderr || `docker exited ${code}${sig ? ` (${sig})` : ''}`); e.stdout = stdout; e.stderr = stderr; e.code = code; e.signal = sig; finish(reject, e); } });
  });
}

export async function ownedContainerExists(jobId, options = {}) {
  const label = createHash('sha256').update(String(jobId ?? '')).digest('hex');
  const { stdout } = await docker(['ps', '-a', '--filter', 'label=xfactor.owner=execution', '--filter', `label=xfactor.job=${label}`, '--format', '{{.ID}}'], options);
  return stdout.trim().length > 0;
}
export async function cleanupContainer(containerName, options = {}) {
  if (!/^xfactor-worker-[a-zA-Z0-9_-]+(?:-registry-proxy)?$/.test(containerName)) throw new Error('Refusing to clean an unowned container name');
  const inspected = await docker(['inspect', '--format', '{{index .Config.Labels "xfactor.owner"}}', containerName], options);
  if (inspected.stdout.trim() !== 'execution') throw new Error('Refusing to clean an unowned container');
  await docker(['rm', '-f', containerName], options).catch(e => { if (!/No such container|not found/i.test(e.message)) throw e; });
}

function dependencySpecAllowed(spec) {
  if (typeof spec !== 'string' || !spec.trim()) return false;
  const value = spec.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:/.test(value)) return value.startsWith('npm:') && /^npm:[a-z0-9@/_-]+(?:@[^/]+)?$/.test(value);
  return !value.startsWith('/') && !value.startsWith('.') && !value.includes('\\') && !/[#?].*(?:git|file|http)/.test(value);
}
function walkDependencyValues(value, path = 'dependencies', inspectEntry) {
  if (!value || typeof value !== 'object') return;
  for (const [name, spec] of Object.entries(value)) {
    if (typeof spec === 'string') {
      if (!dependencySpecAllowed(spec)) throw new Error(`Forbidden dependency source at ${path}.${name}`);
    } else if (spec && typeof spec === 'object') {
      inspectEntry?.(`${path}.${name}`, spec);
    } else {
      throw new Error(`Invalid dependency metadata at ${path}.${name}`);
    }
  }
}
export function validateDependencySources(job = {}) {
  const manifest = job.manifest || job.packageJson || job.packageJSON; const lockfile = job.lockfile || job.packageLock;
  if (manifest !== undefined) {
    if (!manifest || typeof manifest !== 'object') throw new Error('Invalid package manifest');
    for (const f of ['dependencies','devDependencies','optionalDependencies','peerDependencies']) walkDependencyValues(manifest[f], f);
    if (manifest.workspaces !== undefined) throw new Error('Workspace dependencies are not permitted in isolated installs');
    walkDependencyValues(manifest.overrides, 'overrides');
  }
  if (lockfile !== undefined) {
    if (!lockfile || typeof lockfile !== 'object') throw new Error('Invalid package lockfile');
    const inspect = (p, e) => {
      if (!e || typeof e !== 'object') return;
      if (e.resolved !== undefined) {
        let u; try { u = new URL(e.resolved); } catch { throw new Error(`Invalid lockfile source: ${p}`); }
        if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'registry.npmjs.org' || u.username || u.password || (u.port && u.port !== '443')) throw new Error(`Non-registry lockfile source at ${p}`);
      }
      for (const f of ['dependencies','optionalDependencies','peerDependencies']) walkDependencyValues(e[f], `${p}.${f}`, inspect);
    };
    for (const [p,e] of Object.entries(lockfile.packages || {})) inspect(p,e);
    for (const [p,e] of Object.entries(lockfile.dependencies || {})) inspect(p,e);
  }
  return true;
}

export function validateWorkspacePath(value, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.includes('\0') || value.includes('\\') || /^[A-Za-z]:/.test(value) || posix.isAbsolute(value)) throw new Error('Invalid workspace path');
  const normalized = posix.normalize(value);
  if (!allowEmpty && (!normalized || normalized === '.')) throw new Error('Invalid workspace path');
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('Workspace path escapes owned workspace');
  return normalized;
}

export function validateOwnedPath(value) {
  // Never inspect host paths; validation of existing segments happens inside
  // the owned container via the check-path adapter command.
  return `/workspace/${validateWorkspacePath(value)}`;
}
async function cleanupOwned(kind, label, options) {
  const listArgs = kind === 'rm'
    ? ['ps', '-a', '--filter', 'label=xfactor.owner=execution', '--filter', `label=xfactor.job=${label}`, '--format', '{{.ID}}']
    : ['network', 'ls', '--filter', 'label=xfactor.owner=execution', '--filter', `label=xfactor.job=${label}`, '--format', '{{.ID}}'];
  const { stdout } = await docker(listArgs, options);
  for (const id of stdout.trim().split(/\s+/).filter(Boolean)) await docker(kind === 'rm' ? ['rm', '-f', id] : ['network', 'rm', id], options);
}
export function validateWorkspacePaths(paths) { if (paths == null) return []; if (!Array.isArray(paths)) throw new Error('Paths must be an array'); return paths.map(p => validateWorkspacePath(p)); }

async function waitForReadiness(name, deadline, signal) { while (Date.now() < deadline) { if (signal?.aborted) throw new Error('Cancelled by user'); try { const { stdout, stderr } = await docker(['logs', name], { signal, deadline, timeout: 1000 }); if (`${stdout}${stderr}`.includes('READY')) return; } catch (e) { if (signal?.aborted || Date.now() >= deadline) throw e; } await new Promise((resolve, reject) => { const ms = Math.min(200, Math.max(1, deadline - Date.now())); const timer = setTimeout(resolve, ms); const abort = () => { clearTimeout(timer); reject(new Error('Cancelled by user')); }; signal?.addEventListener('abort', abort, { once: true }); }); } throw new Error('Container readiness probe timed out'); }
export function captureChildOutput(proc, { maxBytes = OUTPUT_CEILING } = {}) {
  const out = [], err = [], oh = createHash('sha256'), eh = createHash('sha256');
  let ob = 0, eb = 0;
  proc.stdout?.on('data', chunk => {
    const bytes = Buffer.from(chunk); ob += bytes.length; oh.update(bytes);
    const kept = Math.max(0, maxBytes - out.reduce((n, item) => n + item.length, 0));
    if (kept) out.push(bytes.subarray(0, kept));
  });
  proc.stderr?.on('data', chunk => {
    const bytes = Buffer.from(chunk); eb += bytes.length; eh.update(bytes);
    const kept = Math.max(0, maxBytes - err.reduce((n, item) => n + item.length, 0));
    if (kept) err.push(bytes.subarray(0, kept));
  });
  return new Promise(resolve => proc.once('close', (code, signal) => resolve({
    stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(),
    stdoutBytes: ob, stderrBytes: eb, stdoutTruncated: ob > maxBytes, stderrTruncated: eb > maxBytes,
    stdoutSha256: oh.digest('hex'), stderrSha256: eh.digest('hex'), code, signal,
  })));
}
function sandboxCwd(value) {
  if (value === undefined || value === '/workspace') return '/workspace';
  if (typeof value === 'string' && value.startsWith('/workspace/')) return `/workspace/${validateWorkspacePath(value.slice('/workspace/'.length))}`;
  return `/workspace/${validateWorkspacePath(value)}`;
}

async function validateJobPaths(job) {
  if (job.workspaceRoot !== undefined) throw new Error('Operator-owned workspace root cannot be supplied by a job');
  const fields = ['archivePath', 'inputPath', 'inputPaths', 'filePath', 'filePaths', 'resultPath', 'resultPaths', 'outputPath', 'outputPaths'];
  const paths = [];
  for (const field of fields) {
    if (job[field] === undefined) continue;
    const values = Array.isArray(job[field]) ? job[field] : [job[field]];
    for (const value of values) {
      if (typeof value !== 'string') throw new Error(`Invalid workspace path in ${field}`);
      paths.push(validateWorkspacePath(value));
    }
  }
  return paths;
}
export async function executeJob(job, { signal, onResource } = {}) {
  if (!job || !['prepare_dependencies', 'verify_artifact'].includes(job.operation)) {
    return { status: 'failed', error: 'Unsupported worker operation' };
  }
  if (job.verificationWorkspace || job.workspace) {
    return { status: 'failed', error: 'Host workspace paths are not accepted; worker workspace is fixed /workspace' };
  }
  if (!job.runId) return { status: 'failed', error: 'caller-supplied runId is required' };
  if (signal?.aborted) return { status: 'failed', error: 'Cancelled by user' };
  if (job.operation === 'prepare_dependencies') {
    try {
      const manifest = JSON.parse(Buffer.from(job.packageJsonBytes || '').toString('utf8'));
      validateDependencySources({ manifest });
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }
  if (job.operation === 'verify_artifact') {
    if (typeof job.archiveBase64 !== 'string' || job.archiveBase64.length > Math.ceil((24 * 1024 * 1024) * 4 / 3) + 4) return { status: 'failed', error: 'Archive exceeds input limit.' };
    const archive = Buffer.from(job.archiveBase64, 'base64');
    if (!archive.length || archive.length > 24 * 1024 * 1024) return { status: 'failed', error: 'Archive exceeds input limit.' };
    if (!/^[a-f0-9]{64}$/i.test(String(job.inputSha256 || '')) || createHash('sha256').update(archive).digest('hex') !== String(job.inputSha256).toLowerCase()) return { status: 'failed', error: 'Archive SHA-256 does not match supplied digest.' };
  }
  const names = resourceNames(job.jobId);
  const started = Date.now();
  const deadline = Math.min(Number(job.deadline) || started + MAX_JOB_MS, started + MAX_JOB_MS);
  const install = job.operation === 'prepare_dependencies';
  let installPhase = install;
  let proxy;
  let declaredPaths;
  try { declaredPaths = await validateJobPaths(job); } catch (e) { return { status: 'failed', error: e.message }; }
  const opts = () => ({ signal, deadline });
  try {
    let proxyAddress;
    if (install) {
      await docker(['network','create','--internal','--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,names.install], opts());
      proxy = names.proxy;
      await docker(['run','-d','--rm','--entrypoint','node','--network',names.install,'--name',proxy,'--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,IMAGE_NAME,'-e',"import('/opt/proxy/registryProxy.js').then(async ({createProxy})=>{await createProxy({host:'0.0.0.0',port:3128})})"], opts());
      await docker(['network','connect','bridge',proxy], opts()); const inspected = await docker(['inspect','--format',`{{(index .NetworkSettings.Networks "${names.install}").IPAddress}}`,proxy], opts()); proxyAddress = inspected.stdout.trim(); if (!proxyAddress) throw new Error('Registry proxy did not receive an install-network address'); onResource?.({ type:'proxy', name:proxy, network:names.install });
    }
    if (!install) {
      await docker(['network','create','--internal','--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,names.build], opts());
      onResource?.({ type: 'network', name: names.build, internal: true, phase: 'build' });
    }
    const net = install ? names.install : names.build;
    const runArgs = ['run','-d','--rm','--name',names.container,'--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,'--cpus','2.0','--memory','1g','--memory-swap','1g','--pids-limit','100','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges=true','--network',net,'--tmpfs','/tmp:rw,size=64m,exec,mode=1777','--tmpfs','/workspace:rw,size=1g,exec,mode=1777',IMAGE_NAME,'serve'];
    await docker(runArgs, opts()); onResource?.({ type:'container', name:names.container, phase:install?'install':'build' }); await waitForReadiness(names.container, deadline, signal);
    const checkPaths = async () => {
      for (const relative of declaredPaths) {
        await docker(['exec', names.container, 'node', '/opt/worker/entrypoint.js', 'check-path', `/workspace/${relative}`], opts());
      }
    };
    const adapter = {
      id: 'docker-worker',
      getCapabilities: () => ({ available: true, isolation: true, adapterId: 'docker-worker', execute: true, spawn: true, writeFile: true }),
      execute: async (command, args = [], options = {}) => {
        if (command && typeof command === 'object') {
          const request = command;
          command = request.command;
          args = request.args || [];
          options = { ...request, ...options };
        }
        await checkPaths();
        return new Promise((resolve, reject) => {
          const cwd = sandboxCwd(options.cwd);
          const env = {};
          for (const [k, v] of Object.entries(options.env || {})) if (SAFE_ENV.test(k)) env[k] = String(v);
          if (installPhase && proxyAddress) Object.assign(env, { NPM_CONFIG_REGISTRY: `http://${proxyAddress}:3128`, NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_CACHE: '/tmp/npm-cache' });
          const da = ['exec', '-i']; if (cwd) da.push('--workdir', cwd); for (const [k, v] of Object.entries(env)) da.push('--env', `${k}=${v}`);
          da.push(names.container, 'node', '/opt/worker/entrypoint.js', command, ...(Array.isArray(args) ? args : []));
          const p = cp.spawn('docker', da, { stdio: ['ignore', 'pipe', 'pipe'] });
          let done = false;
          const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
          const captured = captureChildOutput(p);
          const ms = Math.max(1, Math.min(options.timeout || options.timeoutMs || 120000, deadline - Date.now()));
          const timer = setTimeout(() => { finish(reject, new Error('Command timed out')); try { p.kill('SIGKILL'); } catch {} }, ms);
          const abort = () => { finish(reject, new Error('Cancelled by user')); try { p.kill('SIGKILL'); } catch {} };
          signal?.addEventListener('abort', abort, { once: true });
          captured.then(r => {
            const normalized = { ...r, exitCode: r.code ?? null, passed: r.code === 0 && !r.stdoutTruncated && !r.stderrTruncated };
            if (normalized.passed) finish(resolve, normalized);
            else { const e = new Error(r.stdoutTruncated || r.stderrTruncated ? 'Output exceeded fixed ceiling' : `Command failed with code ${r.code}${r.signal ? ` (signal ${r.signal})` : ''}`); e.result = normalized; finish(reject, e); }
          });
        });
      },
      writeFile: async (target, bytes, options = {}) => {
        await checkPaths();
        if (target !== '/workspace/package.json' && target !== '/workspace/artifact.zip') throw new Error('Refusing to write outside protocol inputs');
        const p = cp.spawn('docker', ['exec','-i',names.container,'node','-e',"const fs=require('fs');const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',()=>{fs.writeFileSync(process.argv[1],Buffer.concat(chunks));})",target], { stdio:['pipe','pipe','pipe'], windowsHide:true });
        const stderr = []; p.stderr.on('data', c => stderr.push(c));
        const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, Math.max(1, Math.min(options.timeout || 120000, deadline - Date.now())));
        const abort = () => { try { p.kill('SIGKILL'); } catch {} };
        signal?.addEventListener('abort', abort, { once:true });
        try {
          await new Promise((resolve, reject) => { p.once('error', reject); p.once('close', code => code === 0 ? resolve() : reject(new Error(Buffer.concat(stderr).toString() || `Write failed with code ${code}`))); p.stdin.end(Buffer.from(bytes)); });
        } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      },
      spawn: (command, args = [], options = {}) => {
        if (command && typeof command === 'object') {
          const request = command;
          command = request.command;
          args = request.args || [];
          options = { ...request, ...options };
        }
        const cwd = sandboxCwd(options.cwd); const env = {};
        if (!/^[a-zA-Z0-9_.-]+$/.test(command) || command.startsWith('.')) throw new Error('Unsafe executable path');
        for (const [k, v] of Object.entries(options.env || {})) if (SAFE_ENV.test(k)) env[k] = String(v);
        if (installPhase && proxyAddress) Object.assign(env, { NPM_CONFIG_REGISTRY: `http://${proxyAddress}:3128`, NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_CACHE: '/tmp/npm-cache' });
        const da = ['exec', '-i']; if (cwd) da.push('--workdir', cwd); for (const [k, v] of Object.entries(env)) da.push('--env', `${k}=${v}`);
        da.push(names.container, 'node', '/opt/worker/entrypoint.js', command, ...args);
        const timeoutMs = Math.max(1, Math.min(options.timeout || options.timeoutMs || 120000, deadline - Date.now()));
        let cleaned = false;
        const cleanup = () => { if (cleaned) return; cleaned = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort); options.signal?.removeEventListener('abort', abort); };
        const abort = () => { try { p.kill('SIGKILL'); } catch {} cleanup(); };
        const timeout = setTimeout(abort, timeoutMs);
        signal?.addEventListener('abort', abort, { once: true }); options.signal?.addEventListener('abort', abort, { once: true });
        p.once('close', cleanup);
        return p;
      },
    };
    if (install) {
      const prepared = await prepareDependencies({ packageJsonBytes: job.packageJsonBytes, workspace: '/workspace', adapter, signal, env: job.env || {}, runId: job.runId });
      return { status: 'success', result: prepared };
    }
    const verification = await executeVerificationJob({ job, workspace: '/workspace', adapter, signal, env: job.env || {} });
    if (!verification.passed) return { status: 'failed', result: verification };
    return { status:'success', result: verification };
  } catch (e) { return { status:'failed', error:signal?.aborted?'Cancelled by user':e.message, ...(e.result?{result:e.result}:{}) }; }
  finally { const cleanOpts={signal:undefined,deadline:Date.now()+30000}; try{await cleanupOwned('rm',names.job,cleanOpts)}catch{} try{await cleanupOwned('network',names.job,cleanOpts)}catch{} }
}
