import cp from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';

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

export async function validateOwnedPath(value, root) {
  const relative = validateWorkspacePath(value);
  const base = await realpath(root);
  const target = resolve(base, ...relative.split('/'));
  if (target !== base && !target.startsWith(base + '\\') && !target.startsWith(base + '/')) throw new Error('Workspace path escapes owned workspace');
  let current = base;
  for (const part of relative.split('/')) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlinks are not permitted in workspace paths');
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return relative;
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
function streamResult(out, err, ob, eb, oh, eh) { return { stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), stdoutBytes: ob, stderrBytes: eb, stdoutTruncated: ob > OUTPUT_CEILING, stderrTruncated: eb > OUTPUT_CEILING, stdoutSha256: oh.digest('hex'), stderrSha256: eh.digest('hex') }; }

async function validateJobPaths(job) {
  if (job.workspaceRoot !== undefined) throw new Error('Operator-owned workspace root cannot be supplied by a job');
  const fields = ['archivePath', 'inputPath', 'inputPaths', 'filePath', 'filePaths', 'resultPath', 'resultPaths', 'outputPath', 'outputPaths'];
  for (const field of fields) {
    if (job[field] === undefined) continue;
    const values = Array.isArray(job[field]) ? job[field] : [job[field]];
    for (const value of values) {
      if (typeof value !== 'string') throw new Error(`Invalid workspace path in ${field}`);
      validateWorkspacePath(value);
    }
  }
}
export async function executeJob(job, { signal, onResource } = {}) {
  const names = resourceNames(job.jobId); const started = Date.now(); const deadline = Math.min(Number(job.deadline) || started + MAX_JOB_MS, started + MAX_JOB_MS); const install = job.operation === 'prepare_dependencies'; let installPhase = install; let proxy;
  try { await validateJobPaths(job); } catch (e) { return { status: 'failed', error: e.message }; }
  if (install) {
    try { validateDependencySources(job); } catch (e) { return { status: 'failed', error: e.message }; }
  }
  const opts = () => ({ signal, deadline });
  try {
    await docker(['info'], opts());
    await cleanupOwned('rm', names.job, opts());
    await cleanupOwned('network', names.job, opts()).catch(e => { if (!/No such network|not found/i.test(e.message)) throw e; });
    const net = install ? names.install : names.build;
    await docker(['network', 'create', '--internal', '--label', 'xfactor.owner=execution', '--label', `xfactor.job=${names.job}`, net], opts()); onResource?.({ type: 'network', name: net, internal: true, phase: install ? 'install' : 'build' });
    let proxyAddress;
    if (install) {
      proxy = names.proxy;
      await docker(['run','-d','--rm','--entrypoint','node','--network',names.install,'--name',proxy,'--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,IMAGE_NAME,'-e',"import('/opt/proxy/registryProxy.js').then(async ({createProxy})=>{await createProxy({host:'0.0.0.0',port:3128})})"], opts());
      await docker(['network','connect','bridge',proxy], opts()); const inspected = await docker(['inspect','--format',`{{(index .NetworkSettings.Networks "${names.install}").IPAddress}}`,proxy], opts()); proxyAddress = inspected.stdout.trim(); if (!proxyAddress) throw new Error('Registry proxy did not receive an install-network address'); onResource?.({ type:'proxy', name:proxy, network:names.install });
    }
    const runArgs = ['run','-d','--rm','--name',names.container,'--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,'--cpus','2.0','--memory','1g','--memory-swap','1g','--pids-limit','100','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges=true','--network',net,'--tmpfs','/tmp:rw,size=64m,exec,mode=1777','--tmpfs','/workspace:rw,size=1g,exec,mode=1777',IMAGE_NAME,'serve'];
    await docker(runArgs, opts()); onResource?.({ type:'container', name:names.container, phase:install?'install':'build' }); await waitForReadiness(names.container, deadline, signal);
    const adapter = {
      execute: (command, args = [], options = {}) => new Promise((resolve, reject) => {
        if (!/^[a-zA-Z0-9_.-]+$/.test(command) || command.startsWith('.')) return reject(new Error('Unsafe executable path'));
        const cwd = options.cwd === undefined ? undefined : `/workspace/${validateWorkspacePath(options.cwd)}`;
        const env = {};
        for (const [k, v] of Object.entries(options.env || {})) if (SAFE_ENV.test(k)) env[k] = String(v);
        if (installPhase && proxyAddress) Object.assign(env, { NPM_CONFIG_REGISTRY: `http://${proxyAddress}:3128`, NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_CACHE: '/tmp/npm-cache' });
        const da = ['exec', '-i']; if (cwd) da.push('--workdir', cwd); for (const [k, v] of Object.entries(env)) da.push('--env', `${k}=${v}`);
        da.push(names.container, 'node', '/opt/worker/entrypoint.js', command, ...(Array.isArray(args) ? args : []));
        const p = cp.spawn('docker', da, { stdio: ['ignore', 'pipe', 'pipe'] }); const out = [], err = [], oh = createHash('sha256'), eh = createHash('sha256');
        let ob = 0, eb = 0, done = false; const finish = (fn, x) => { if (done) return; done = true; fn(x); };
        p.stdout.on('data', c => { ob += c.length; oh.update(c); if (Buffer.concat(out).length < OUTPUT_CEILING) out.push(c.subarray(0, OUTPUT_CEILING - Buffer.concat(out).length)); });
        p.stderr.on('data', c => { eb += c.length; eh.update(c); if (Buffer.concat(err).length < OUTPUT_CEILING) err.push(c.subarray(0, OUTPUT_CEILING - Buffer.concat(err).length)); });
        const ms = Math.max(1, Math.min(options.timeout || 120000, deadline - Date.now())); const timer = setTimeout(() => { finish(reject, new Error('Command timed out')); try { p.kill('SIGKILL'); } catch {} }, ms);
        const abort = () => { finish(reject, new Error('Cancelled by user')); try { p.kill('SIGKILL'); } catch {} }; signal?.addEventListener('abort', abort, { once: true });
        p.once('close', (code, sig) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); const r = streamResult(out, err, ob, eb, oh, eh); if (code === 0 && !r.stdoutTruncated && !r.stderrTruncated) finish(resolve, r); else { const e = new Error(r.stdoutTruncated || r.stderrTruncated ? 'Output exceeded fixed ceiling' : `Command failed with code ${code}${sig ? ` (signal ${sig})` : ''}`); e.result = r; finish(reject, e); } });
      }),
      spawn: (command, args = [], options = {}) => {
        if (!/^[a-zA-Z0-9_.-]+$/.test(command) || command.startsWith('.')) throw new Error('Unsafe executable path');
        const cwd = options.cwd === undefined ? undefined : `/workspace/${validateWorkspacePath(options.cwd)}`; const env = {};
        for (const [k, v] of Object.entries(options.env || {})) if (SAFE_ENV.test(k)) env[k] = String(v);
        if (installPhase && proxyAddress) Object.assign(env, { NPM_CONFIG_REGISTRY: `http://${proxyAddress}:3128`, NPM_CONFIG_IGNORE_SCRIPTS: 'true', NPM_CONFIG_CACHE: '/tmp/npm-cache' });
        const da = ['exec', '-i']; if (cwd) da.push('--workdir', cwd); for (const [k, v] of Object.entries(env)) da.push('--env', `${k}=${v}`);
        da.push(names.container, 'node', '/opt/worker/entrypoint.js', command, ...args);
        const p = cp.spawn('docker', da, { stdio: options.stdio || 'pipe', windowsHide: true });
        const timeoutMs = Math.max(1, Math.min(options.timeout || 120000, deadline - Date.now())); const timeout = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
        const abort = () => p.kill('SIGKILL');
        p.once('close', () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); options.signal?.removeEventListener('abort', abort); });
        signal?.addEventListener('abort', abort, { once: true }); options.signal?.addEventListener('abort', abort, { once: true }); return p;
      },
    };
    let result;
    const phaseCode = install ? (job.installCode || job.code) : job.code;
    if (phaseCode) result = await adapter.execute('node', ['-e', phaseCode], { timeout: Math.min(120000, deadline - Date.now()), env: job.env });
    if (install) {
      await docker(['network','create','--internal','--label','xfactor.owner=execution','--label',`xfactor.job=${names.job}`,names.build],opts());
      await docker(['network','connect',names.build,names.container],opts());
      await docker(['network','disconnect',names.install,names.container],opts());
      if (proxy) await docker(['rm','-f',proxy],opts());
      proxyAddress = undefined;
      installPhase = false;
      await docker(['network','rm',names.install],opts());
      onResource?.({type:'network',name:names.build,internal:true,phase:'build'});
      if (job.buildCode) result = await adapter.execute('node', ['-e', job.buildCode], { timeout: Math.min(120000, deadline - Date.now()), env: job.buildEnv });
    }
    return { status:'success', result:result || 'Completed', adapter };
  } catch (e) { return { status:'failed', error:signal?.aborted?'Cancelled by user':e.message, ...(e.result?{result:e.result}:{}) }; }
  finally { const cleanOpts={signal:undefined,deadline:Date.now()+30000}; try{await cleanupOwned('rm',names.job,cleanOpts)}catch{} try{await cleanupOwned('network',names.job,cleanOpts)}catch{} }
}
