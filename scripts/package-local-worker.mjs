import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveTools, writeManifest, validateManifest, createRuntimeBrowser } from './local-worker-tools.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.js', '.cjs', '.mjs', '.json', '.cs', '.ps1']);
const omitted = new Set(['data', 'tests', 'scripts', 'workspaces', '.git', '.bin']);
export async function copyBrowserTools(source, target) {
  await fs.cp(source, target, { recursive: true, dereference: true, filter: file => !/\.(?:log|dmp)$/i.test(path.basename(file)) && !/^(?:Crashpad|Crash Reports|crash-dumps)$/i.test(path.basename(file)) });
}
export async function copyWorkerSource(source, target, { includeDependencies = true } = {}) {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || omitted.has(entry.name)) continue;
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsupported source symlink: ${from}`);
    if (entry.name === 'node_modules' && entry.isDirectory()) {
      if (includeDependencies) await fs.cp(from, to, { recursive: true, dereference: true, filter: file => path.basename(file) !== '.bin' });
    } else if (entry.isDirectory()) await copyWorkerSource(from, to, { includeDependencies });
    else if (sourceExtensions.has(path.extname(entry.name)) && !/admin.*key|private.*key|credentials/i.test(entry.name)) await fs.copyFile(from, to);
  }
}
export async function writeLaunchers(target) {
  await fs.writeFile(path.join(target, 'start-worker.cmd'), '@echo off\r\n"%~dp0tools\\node\\node.exe" "%~dp0scripts\\start-local-worker.mjs" --bundle "%~dp0." %*\r\n');
  await fs.writeFile(path.join(target, 'start-worker.sh'), '#!/bin/sh\nset -eu\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$ROOT/tools/node/node" "$ROOT/scripts/start-local-worker.mjs" --bundle "$ROOT" "$@"\n', { mode: 0o755 });
}
function browserRoot(executable) {
  let current = path.dirname(executable);
  while (path.dirname(current) !== current) {
    if (/^(chromium|chrome-headless-shell|chromium_headless_shell)-\d+$/.test(path.basename(current))) return current;
    current = path.dirname(current);
  }
  // Operator-supplied Chromium installations are copied as a complete executable directory.
  return path.dirname(executable);
}
export async function packageLocalWorker({ destination, sourceRoot = repo, env = process.env } = {}) {
  if (!destination) throw new Error('Specify an empty destination: --output <directory>');
  const target = path.resolve(destination);
  const sourceRelative = path.relative(sourceRoot, target);
  if (!sourceRelative || ['execution', 'backend', 'frontend', 'scripts', 'docs', 'x-agents', 'llm-yonetimi', '.git'].some(dir => sourceRelative === dir || sourceRelative.startsWith(`${dir}${path.sep}`))) throw new Error('Output cannot overwrite application source.');
  const existing = await fs.stat(target).catch(() => null);
  if (existing) throw new Error('Output directory already exists; choose a new destination.');
  const tools = await resolveTools(env);
  for (const file of ['execution/server.js', 'execution/localRuntime.js', 'execution/package-lock.json', 'backend/verification/runChecks.js', 'backend/package-lock.json', 'backend/node_modules/jszip/package.json']) {
    if (!(await fs.stat(path.join(sourceRoot, file)).catch(() => null))?.isFile()) throw new Error(`Missing required worker source/dependency: ${file}`);
  }
  await fs.mkdir(target, { recursive: true });
  const nodeRelative = `tools/node/${process.platform === 'win32' ? 'node.exe' : 'node'}`;
  await fs.mkdir(path.dirname(path.join(target, nodeRelative)), { recursive: true });
  await fs.copyFile(tools.node, path.join(target, nodeRelative));
  if (process.platform !== 'win32') await fs.chmod(path.join(target, nodeRelative), 0o755);
  const npmRoot = path.resolve(path.dirname(tools.npm), '..');
  await fs.cp(npmRoot, path.join(target, 'tools/npm'), { recursive: true, dereference: true });
  await fs.cp(path.dirname(tools.playwright), path.join(target, 'tools/playwright-core'), { recursive: true, dereference: true });
  const browser = browserRoot(tools.chromium);
  const browserDestination = path.join(target, 'tools/browsers', path.basename(browser));
  await copyBrowserTools(browser, browserDestination);
  for (const directory of ['execution', 'backend']) await copyWorkerSource(path.join(sourceRoot, directory), path.join(target, 'app', directory));
  await fs.mkdir(path.join(target, 'scripts'), { recursive: true });
  for (const name of ['local-worker-tools.mjs', 'start-local-worker.mjs']) await fs.copyFile(path.join(repo, 'scripts', name), path.join(target, 'scripts', name));
  await fs.mkdir(path.join(target, 'app/scripts'), { recursive: true });
  await fs.copyFile(path.join(repo, 'scripts/local-worker-tools.mjs'), path.join(target, 'app/scripts/local-worker-tools.mjs'));
  await fs.copyFile(path.join(repo, 'docs/LOCAL-WORKER-PACKAGE.md'), path.join(target, 'README.md'));
  await writeLaunchers(target);
  const toolPaths = {
    XFACTOR_LOCAL_NODE: nodeRelative,
    XFACTOR_LOCAL_NPM_CLI: 'tools/npm/bin/npm-cli.js',
    XFACTOR_LOCAL_PLAYWRIGHT: 'tools/playwright-core/index.mjs',
    XFACTOR_LOCAL_CHROMIUM: path.relative(target, path.join(browserDestination, path.relative(browser, tools.chromium))).split(path.sep).join('/')
  };
  await writeManifest(target, tools.versions, toolPaths);
  const manifest = await validateManifest(target);
  const bundledEnv = { ...env };
  for (const [key, value] of Object.entries(toolPaths)) bundledEnv[key] = path.join(target, value);
  const probeState = await fs.mkdtemp(path.join(os.tmpdir(),'xfactor-browser-probe-'));
  let runtimeBrowser;
  try {
    runtimeBrowser = await createRuntimeBrowser(target,probeState,{manifest});
    bundledEnv.XFACTOR_LOCAL_CHROMIUM = runtimeBrowser.chromium;
    const bundledTools = await resolveTools(bundledEnv);
    for (const [key, version] of Object.entries(tools.versions)) if (bundledTools.versions[key] !== version) throw new Error(`Bundled ${key} version does not match its source installation.`);
    await validateManifest(target);
  } finally { if (runtimeBrowser) await runtimeBrowser.cleanup(); await fs.rmdir(probeState); }
  return target;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const index = process.argv.indexOf('--output');
  packageLocalWorker({ destination: index < 0 ? undefined : process.argv[index + 1] }).then(target => console.log(`Packaged local-trusted worker (OS isolation=false): ${target}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
