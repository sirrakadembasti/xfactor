import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveTools, localChromiumLaunchOptions } from '../scripts/local-worker-tools.mjs';
import { authorizeLocalExecutionAdapter } from '../backend/verification/sandboxRunner.js';
import { executeVerificationJob, prepareDependencies } from './jobExecutor.js';
import { validateDependencySources } from './runtime.js';
import { createLocalProcessManager } from './localProcesses.js';
import { extractLocalArchive } from './localArchive.js';
import { localBrowserFailureDiagnostic } from './browserRunner.cjs';

const profile = Object.freeze({ runtime: 'local', executionProfile: 'local-trusted', osIsolation: false, isolation: false });
const consent = options => options.trustLocalCode ?? (process.env.EXECUTION_WORKER_TRUST_LOCAL_CODE === '1');
const toolResolutions = new Map();
function trustedTools(options) {
  if (options.tools) return Promise.resolve(options.tools);
  const key = JSON.stringify([process.execPath, ...['XFACTOR_LOCAL_NODE', 'XFACTOR_LOCAL_NPM_CLI', 'XFACTOR_LOCAL_PLAYWRIGHT', 'XFACTOR_LOCAL_CHROMIUM', 'PLAYWRIGHT_BROWSERS_PATH'].map(name => process.env[name])]);
  if (!toolResolutions.has(key)) toolResolutions.set(key, resolveTools().catch(error => { toolResolutions.delete(key); throw error; }));
  return toolResolutions.get(key);
}
export async function probeLocalReadiness(options = {}) {
  if (!consent(options)) throw new Error('Local execution requires EXECUTION_WORKER_TRUST_LOCAL_CODE=1 operator consent.');
  let phase = 'tool_resolution';
  const labelError = (error, failedPhase) => {
    // Keep the original error private; consumers may expose only this fixed label.
    if (error && (typeof error === 'object' || typeof error === 'function')) {
      try { Object.defineProperty(error, 'readinessPhase', { value: failedPhase, configurable: true }); } catch {}
    }
    return error;
  };
  const atPhase = async (nextPhase, operation) => {
    phase = nextPhase;
    try { return await operation(); }
    catch (error) { throw labelError(error, nextPhase); }
  };
  const tools = await atPhase('tool_resolution', () => trustedTools(options));
  const { chromium } = await atPhase('tool_resolution', () => import(pathToFileURL(tools.playwright).href));
  let browser, timer, finished = false;
  const timeoutError = new Error('Local browser readiness timed out.');
  const preflight = (async () => {
    browser = await atPhase('browser_launch', () => chromium.launch({ ...localChromiumLaunchOptions(tools.chromium), timeout: 30000 }));
    // A late launch must still be closed after the overall readiness deadline.
    if (finished) { await atPhase('browser_close', () => browser.close()); browser = null; throw timeoutError; }
    const context = await atPhase('renderer_context', () => browser.newContext());
    const page = await atPhase('renderer_page', () => context.newPage());
    await atPhase('renderer_content', () => page.setContent('<!doctype html><html><body><p id="xfactor-readiness"></p><script>globalThis.__xfactorReadiness=6*7;document.getElementById("xfactor-readiness").textContent="renderer-ready";</script></body></html>', { timeout: 30000, waitUntil: 'load' }));
    await atPhase('renderer_evaluate', async () => {
      const rendered = await page.evaluate(() => globalThis.__xfactorReadiness === 42 && document.getElementById('xfactor-readiness')?.textContent === 'renderer-ready');
      if (rendered !== true) throw new Error('Local browser renderer verification produced no proof.');
    });
  })();
  try {
    await Promise.race([preflight, new Promise((_, reject) => { timer = setTimeout(() => reject(timeoutError), 30000); })]);
  } catch (error) { throw labelError(error, phase); }
  finally { finished = true; clearTimeout(timer); if (browser) await atPhase('browser_close', () => browser.close()); }
  return { ...profile, executionCapacity: true, versions: tools.versions };
}
export async function executeLocalJob(job, options = {}) {
  const { signal, onResource } = options;
  let workspace, processes;
  const failed = error => ({ status: 'failed', error: error.message, result: { passed: false, runtime: profile, reason: error.message, runId: job?.runId } });
  try {
    if (!consent(options)) throw new Error('Local execution requires explicit operator consent.');
    if (!job?.runId || !['prepare_dependencies', 'verify_artifact'].includes(job.operation)) throw new Error('Unsupported worker operation or missing runId.');
    if (job.workspace || job.verificationWorkspace) throw new Error('Host workspace paths are not accepted.');
    if (signal?.aborted) throw new Error('Cancelled by user');
    if (!Number.isFinite(job.deadline) || job.deadline <= Date.now()) throw new Error('Job deadline exceeded');
    const tools = await trustedTools(options);
    const base = path.resolve(options.baseDirectory || path.join(process.env.XFACTOR_LOCAL_WORKER_DATA || os.tmpdir(), 'xfactor-local-workspaces'));
    await fs.mkdir(base, { recursive: true });
    if ((await fs.lstat(base)).isSymbolicLink()) throw new Error('Workspace base cannot be a symbolic link.');
    workspace = await fs.mkdtemp(path.join(base, 'job-'));
    onResource?.({ type: 'workspace', path: workspace, executionProfile: 'local-trusted' });
    const fullApp = Array.isArray(job.contract?.domains) && job.contract.domains.length > 0;
    processes = await createLocalProcessManager({ tools, workspace, deadline: job.deadline, signal, onResource, onProgress: options.onProgress,
      cacheRoot: path.join(path.dirname(base), 'xfactor-local-process-host'),
      npmCacheDirectory: path.join(path.dirname(base), 'xfactor-local-cache', 'npm'),
      resourceLimits: { memoryBytes: (fullApp ? 4 : 1) * 1024 ** 3, pids: fullApp ? 250 : 100 } });
    function target(value) {
      const raw = String(value);
      const translated = raw === '/workspace' ? workspace : raw.startsWith('/workspace/') ? path.join(workspace, raw.slice(11)) : path.resolve(raw);
      const relative = path.relative(workspace, translated);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside owned workspace.');
      return translated;
    }
    const capabilities = Object.freeze({ ...profile, available: true, adapterId: 'local-worker', execute: true, spawn: true, writeFile: true });
    const adapter = {
      id: 'local-worker', workspaceRoot: workspace, getCapabilities: () => capabilities,
      execute: processes.execute, spawn: processes.spawn, kill: processes.kill, killProcessTree: processes.kill,
      writeFile: async (value, bytes) => { const output = target(value); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes, { flag: 'wx' }); },
      readFile: value => fs.readFile(target(value)),
      extractArchive: async (value, _output, limits) => {
        await extractLocalArchive(await fs.readFile(target(value)), workspace, limits);
        const manifest = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8'));
        const lockfile = JSON.parse(await fs.readFile(path.join(workspace, 'package-lock.json'), 'utf8'));
        validateDependencySources({ manifest, lockfile });
      },
      interact: async request => {
        const result = await processes.execute('node', [fileURLToPath(new URL('./localBrowserRunner.cjs', import.meta.url))], {
          input: JSON.stringify(request), timeoutMs: 95000,
          env: { XFACTOR_LOCAL_PLAYWRIGHT: tools.playwright, XFACTOR_LOCAL_CHROMIUM: tools.chromium }, signal
        });
        if (result.exitCode !== 0) throw new Error(localBrowserFailureDiagnostic(result.stderr));
        return JSON.parse(result.stdout);
      }
    };
    authorizeLocalExecutionAdapter(adapter, { trustLocalCode: true });
    let result;
    if (job.operation === 'prepare_dependencies') {
      const bytes = Buffer.from(job.packageJsonBytes || Buffer.from(job.packageJsonBase64 || '', 'base64'));
      validateDependencySources({ manifest: JSON.parse(bytes.toString('utf8')) });
      result = await prepareDependencies({ packageJsonBytes: bytes, adapter, signal, runId: job.runId });
    } else {
      // Inventory is independently read from extracted bytes; supplied inventories cannot override it.
      result = await executeVerificationJob({ job: { ...job, files: null }, adapter, signal, onPhaseComplete: options.onPhaseComplete });
    }
    result.runtime = { ...profile, versions: tools.versions };
    for (const check of result.checks || []) check.evidence = { ...check.evidence, ...profile };
    return { status: result.passed === false ? 'failed' : 'success', result, ...(result.passed === false ? { error: result.reason || 'Verification gates failed.' } : {}) };
  } catch (error) { return failed(error); }
  finally {
    await processes?.dispose();
    if (workspace) await fs.rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}
