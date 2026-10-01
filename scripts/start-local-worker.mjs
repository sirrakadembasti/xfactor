import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateManifest, resolveTools, createRuntimeBrowser } from './local-worker-tools.mjs';

export async function startLocalWorker({ bundle, env = process.env, stdio = 'inherit' } = {}) {
  const root = path.resolve(bundle || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const manifest = await validateManifest(root);
  for (const key of ['XFACTOR_LOCAL_NODE', 'XFACTOR_LOCAL_NPM_CLI', 'XFACTOR_LOCAL_PLAYWRIGHT', 'XFACTOR_LOCAL_CHROMIUM']) if (!manifest.toolPaths?.[key] || !manifest.files[manifest.toolPaths[key]]) throw new Error(`Missing bundled tool path: ${key}`);
  const toolEnv = { ...env };
  for (const [key, value] of Object.entries(manifest.toolPaths || {})) {
    if (!manifest.files[value]) throw new Error(`Missing bundled tool path: ${key}`);
    toolEnv[key] = path.join(root, value);
  }
  toolEnv.PLAYWRIGHT_BROWSERS_PATH = path.join(root, 'tools/browsers');
  const browserBase = path.join(root, 'tools/browsers');
  const browserRelative = path.relative(browserBase, toolEnv.XFACTOR_LOCAL_CHROMIUM);
  if (!browserRelative || browserRelative === '..' || browserRelative.startsWith(`..${path.sep}`) || path.isAbsolute(browserRelative)) throw new Error('Bundled Chromium must be inside the owned browser directory.');
  const state = path.resolve(env.XFACTOR_LOCAL_WORKER_DATA || path.join(os.homedir(), '.xfactor/local-worker'));
  const relative = path.relative(root, state);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Worker data must be outside the bundle.');
  const runtimeBrowser = await createRuntimeBrowser(root,state,{manifest});
  toolEnv.XFACTOR_LOCAL_CHROMIUM = runtimeBrowser.chromium;
  toolEnv.PLAYWRIGHT_BROWSERS_PATH = path.join(runtimeBrowser.root,'tools/browsers');
  try {
  const tools = await resolveTools(toolEnv);
  const tokenFile = path.join(state, 'worker-token');
  let token = env.EXECUTION_WORKER_TOKEN;
  if (!token) {
    try { token = (await fs.readFile(tokenFile, 'utf8')).trim(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      token = crypto.randomBytes(32).toString('hex');
      try { await fs.writeFile(tokenFile, token, { flag: 'wx', mode: 0o600 }); }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; token = (await fs.readFile(tokenFile, 'utf8')).trim(); }
    }
  }
  if (!token || token.length < 32) throw new Error('Worker token must contain at least 32 characters.');
  console.log('[local-worker] profile=local-trusted; OS isolation=false; trusted code runs with this user’s privileges.');
  console.log(`[local-worker] State directory: ${state}; share EXECUTION_WORKER_TOKEN with the XFactor backend securely.`);
  const channels = Array.isArray(stdio) ? [...stdio] : [stdio, stdio, stdio];
  if (!channels.includes('ipc')) channels.push('ipc');
  const child = spawn(tools.node, [path.join(root, 'app/execution/server.js')], {
    cwd: path.join(root, 'app/execution'), windowsHide: true, stdio: channels,
    env: { ...toolEnv, NODE_OPTIONS: '', NODE_PATH: '', EXECUTION_WORKER_RUNTIME: 'local', EXECUTION_WORKER_TRUST_LOCAL_CODE: '1', EXECUTION_WORKER_TOKEN: token, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: env.EXECUTION_WORKER_PORT || '8099', EXECUTION_WORKER_DB: path.join(state, 'jobs.json'), XFACTOR_LOCAL_WORKER_DATA: state }
  });
  let stopPromise, fallback;
  const closed = new Promise(resolve => child.once('close', () => { runtimeBrowser.cleanup().then(resolve, error => { console.error(error.message); process.exitCode = 1; resolve(); }); }));
  child.stopLocalWorker = () => {
    if (!stopPromise) stopPromise = (async () => {
      if (child.exitCode === null && child.signalCode === null) {
        fallback = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 60000);
        if (child.connected) child.send({ type: 'xfactor-worker-shutdown' }, () => {});
      }
      await closed;
      clearTimeout(fallback);
    })();
    return stopPromise;
  };
  const shutdown = () => { void child.stopLocalWorker(); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
  child.once('error', error => { console.error(error.message); process.exitCode = 1; });
  child.once('exit', code => {
    clearTimeout(fallback);
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, shutdown);
    process.exitCode = code ?? 1;
  });
  return child;
  } catch (error) { await runtimeBrowser.cleanup(); throw error; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const index = process.argv.indexOf('--bundle');
  startLocalWorker({ bundle: index < 0 ? undefined : process.argv[index + 1] }).catch(error => { console.error(`[local-worker] Bundle startup failed: ${error.message}`); process.exitCode = 1; });
}
