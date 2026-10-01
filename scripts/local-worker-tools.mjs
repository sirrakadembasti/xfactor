import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { devNull } from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const PINNED = Object.freeze({ node: '22.23.2', npm: '10.9.8', playwright: '1.62.1' });
export function localChromiumLaunchOptions(executablePath, env = process.env) {
  return { executablePath, headless: true, chromiumSandbox: true, args: ['--enable-logging=stderr', `--log-file=${devNull}`], env: { ...env, CHROME_LOG_FILE: devNull } };
}
export async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function createRuntimeBrowser(bundleRoot, stateRoot, { manifest: validatedManifest } = {}) {
  const source = path.resolve(bundleRoot), state = path.resolve(stateRoot);
  if ((await fs.lstat(source)).isSymbolicLink() || await fs.realpath(source) !== source) throw new Error('Browser bundle root cannot contain a symlink.');
  const relative = path.relative(source, state);
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) throw new Error('Browser runtime state must be outside the bundle.');
  for (let current = state; ; current = path.dirname(current)) {
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('Browser runtime state cannot contain a symlink.');
    if (path.dirname(current) === current) break;
  }
  const manifest = validatedManifest || await validateManifest(source);
  const executable = manifest.toolPaths?.XFACTOR_LOCAL_CHROMIUM;
  if (!executable || !manifest.files[executable] || !executable.startsWith('tools/browsers/')) throw new Error('Missing owned browser executable in manifest.');
  const revision = executable.split('/')[2], prefix = `tools/browsers/${revision}/`;
  if (!revision || revision === '.' || revision === '..') throw new Error('Invalid owned browser revision.');
  await fs.mkdir(state, { recursive: true, mode: 0o700 });
  const root = await fs.mkdtemp(path.join(state, 'browser-runtime-'));
  const cleanup = async () => {
    const stat = await fs.lstat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error});
    if (!stat) return;
    if (path.dirname(root) !== state || stat.isSymbolicLink() || await fs.realpath(root) !== root) throw new Error('Unsafe browser runtime cleanup path.');
    await fs.rm(root, { recursive: true, force: true });
  };
  try {
    for (const [file, expected] of Object.entries(manifest.files).filter(([file]) => file.startsWith(prefix))) {
      if (file.includes('\\') || file.includes(':') || file.split('/').some(part=>!part||part==='.'||part==='..')) throw new Error('Invalid runtime browser source path.');
      const sourceFile = path.join(source,file), sourceStat = await fs.lstat(sourceFile);
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || await fs.realpath(sourceFile) !== sourceFile) throw new Error('Runtime browser source must be a regular file without symlinks.');
      if (await hashFile(sourceFile) !== expected) throw new Error(`Runtime browser source integrity hash mismatch: ${file}`);
      const target = path.join(root,file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(sourceFile, target);
      if (await hashFile(target) !== expected) throw new Error(`Runtime browser integrity hash mismatch: ${file}`);
    }
    await prepareWindowsBrowserPermissions(root,path.join(root,'tools/browsers',revision));
    return { root, chromium: path.join(root,executable), cleanup };
  } catch (error) { await cleanup(); throw error; }
}
export function windowsBrowserAclCommand(bundleRoot, browserDirectory) {
  const root = path.resolve(bundleRoot), target = path.resolve(browserDirectory);
  const relative = path.relative(path.join(root, 'tools/browsers'), target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('ACL target must be an owned browser directory inside the bundle.');
  return { program: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/icacls.exe'), args: [target, '/grant', '*S-1-15-2-1:(OI)(CI)RX', '*S-1-15-2-2:(OI)(CI)RX', '/T'] };
}
export async function prepareWindowsBrowserPermissions(bundleRoot, browserDirectory) {
  if (process.platform !== 'win32') return;
  windowsBrowserAclCommand(bundleRoot, browserDirectory);
  const root = await fs.realpath(bundleRoot), directory = await fs.realpath(browserDirectory);
  const { program, args } = windowsBrowserAclCommand(root, directory);
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const checkScript = `$ErrorActionPreference='Stop'; $rules=[System.IO.Directory]::GetAccessControl($env:XFACTOR_LOCAL_BROWSER_ACL_ROOT).GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]); $required=[System.Security.AccessControl.FileSystemRights]::ReadAndExecute; foreach($sid in @('S-1-15-2-1','S-1-15-2-2')) { $found=$false; foreach($rule in $rules) { if($rule.IdentityReference.Value -eq $sid -and $rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $required) -eq $required) { $found=$true } }; if(-not $found) { exit 3 } }; exit 0`;
  const check = () => spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', checkScript], { windowsHide: true, encoding: 'utf8', timeout: 30000, env: { ...process.env, XFACTOR_LOCAL_BROWSER_ACL_ROOT: directory } });
  const initial = check();
  if (!initial.error && initial.status === 0) return;
  if (initial.error || initial.status !== 3) throw new Error(`Cannot read Windows Chromium sandbox permissions: ${initial.error?.message || initial.stderr?.trim() || initial.status}`);
  const result = spawnSync(program, args, { windowsHide: true, shell: false, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0 || check().status !== 0) throw new Error(`Cannot prepare Windows Chromium sandbox read/execute permissions in the owned browser directory. Run package setup as its owner with permission to modify this directory's ACL: ${result.error?.message || result.stderr?.trim() || result.status}`);
}
export async function chooseChromiumPath(candidate, { browserMetadata, platform = process.platform, arch = process.arch } = {}) {
  const isFile = async file => {
    try { return (await fs.stat(file)).isFile(); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
  };
  const fullExists = await isFile(candidate);
  const chromium = browserMetadata?.browsers?.find(browser => browser.name === 'chromium');
  const shell = browserMetadata?.browsers?.find(browser => browser.name === 'chromium-headless-shell');
  if (!shell || !/^\d+$/.test(String(shell.revision)) || shell.browserVersion !== chromium?.browserVersion) {
    if (fullExists) return candidate;
    throw new Error('Missing compatible pinned Chromium browser metadata.');
  }
  let ancestor = path.dirname(candidate);
  while (!/^chromium-\d+$/.test(path.basename(ancestor)) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  if (!/^chromium-\d+$/.test(path.basename(ancestor))) {
    if (fullExists) return candidate;
    throw new Error('Missing Chromium; default cache path is unrecognized.');
  }
  const folder = platform === 'win32' ? 'chrome-headless-shell-win64' : platform === 'linux' ? 'chrome-headless-shell-linux64' : platform === 'darwin' ? `chrome-headless-shell-mac-${arch === 'arm64' ? 'arm64' : 'x64'}` : null;
  if (!folder) { if (fullExists) return candidate; throw new Error('Missing Chromium for this platform.'); }
  const executable = path.join(path.dirname(ancestor), `chromium_headless_shell-${shell.revision}`, folder, platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
  if (!(await isFile(executable))) {
    if (fullExists) return candidate;
    throw new Error(`Missing pinned Chromium: ${candidate}; headless shell: ${executable}`);
  }
  return executable;
}
export function command(node, args, options = {}) {
  const result = spawnSync(node, args, { encoding: 'utf8', windowsHide: true, timeout: 30_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`Tool command failed: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout?.trim() || '';
}
export async function resolveTools(env = process.env) {
  const node = path.resolve(env.XFACTOR_LOCAL_NODE || process.execPath);
  let npm = env.XFACTOR_LOCAL_NPM_CLI;
  if (!npm) {
    for (const candidate of [path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(node), '../lib/node_modules/npm/bin/npm-cli.js')]) {
      if (await fs.stat(candidate).catch(() => null)) { npm = candidate; break; }
    }
  }
  if (!npm) throw new Error('Missing npm CLI; set XFACTOR_LOCAL_NPM_CLI.');
  npm = path.resolve(npm);
  const playwright = path.resolve(env.XFACTOR_LOCAL_PLAYWRIGHT || fileURLToPath(new URL('../execution/node_modules/playwright-core/index.mjs', import.meta.url)));
  const pw = await import(pathToFileURL(playwright).href);
  const chromium = env.XFACTOR_LOCAL_CHROMIUM ? path.resolve(env.XFACTOR_LOCAL_CHROMIUM) : await chooseChromiumPath(pw.chromium.executablePath(), { browserMetadata: JSON.parse(await fs.readFile(path.join(path.dirname(playwright), 'browsers.json'), 'utf8')) });
  for (const file of [node, npm, playwright, chromium]) {
    if (!(await fs.stat(file).catch(() => null))?.isFile()) throw new Error(`Missing local tool: ${file}`);
  }
  const metadata = JSON.parse(await fs.readFile(path.join(path.dirname(playwright), 'package.json'), 'utf8'));
  const versions = { node: command(node, ['--version']).replace(/^v/, ''), npm: command(node, [npm, '--version']), playwright: metadata.version };
  for (const [key, value] of Object.entries(PINNED)) if (versions[key] !== value) throw new Error(`Unsupported ${key} version: expected ${value}, got ${versions[key]}`);
  let browser;
  try {
    browser = await pw.chromium.launch({ ...localChromiumLaunchOptions(chromium, env), timeout: 30000 });
    versions.chromium = browser.version();
  } finally { if (browser) await browser.close(); }
  return { node, npm, playwright, chromium, versions };
}
export async function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Bundle symlink is unsupported: ${relative}`);
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile() && relative !== 'manifest.json') files.push(relative);
  }
  return files.sort();
}
export async function writeManifest(root, versions, toolPaths = {}) {
  const files = {};
  for (const file of await listFiles(root)) files[file] = await hashFile(path.join(root, file));
  const manifest = { format: 1, profile: 'local-trusted', osIsolation: false, platform: process.platform, arch: process.arch, versions, toolPaths, files };
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
export async function validateManifest(root) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.platform !== process.platform || manifest.arch !== process.arch || manifest.profile !== 'local-trusted' || manifest.osIsolation !== false) throw new Error('Unsupported bundle platform, architecture or profile.');
  for (const [key, version] of Object.entries(PINNED)) if (manifest.versions?.[key] !== version) throw new Error(`Unsupported bundle ${key} version.`);
  if (!manifest.files || !Object.keys(manifest.files).length) throw new Error('Empty manifest.');
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (file.includes('\\') || path.posix.isAbsolute(file) || file.split('/').some(p => !p || p === '.' || p === '..') || file.includes(':')) throw new Error(`Invalid manifest path: ${file}`);
    const absolute = path.join(root, file);
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid manifest file: ${file}`);
    const actual = await hashFile(absolute);
    if (actual !== hash) throw new Error(`Bundle integrity hash mismatch: ${file}`);
  }
  const actual = await listFiles(root);
  if (actual.length !== Object.keys(manifest.files).length || actual.some(file => !manifest.files[file])) throw new Error('Bundle includes unmanifested files.');
  return manifest;
}
