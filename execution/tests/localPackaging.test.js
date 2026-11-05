import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const toolsUrl = new URL('../../scripts/local-worker-tools.mjs', import.meta.url);
test('worker packaging cannot write into platform agent instructions', async () => {
  const { packageLocalWorker } = await import('../../scripts/package-local-worker.mjs');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await assert.rejects(packageLocalWorker({
    destination: path.join(root, 'x-agents/generated-worker'),
    sourceRoot: root,
    env: { XFACTOR_LOCAL_NODE: path.join(root, 'missing-node') }
  }), /overwrite application source/);
});
test('native Chromium logging uses stderr and a protected device target without weakening sandbox', async () => {
  const { localChromiumLaunchOptions } = await import(toolsUrl);
  const options = localChromiumLaunchOptions('/operator/browser', { CHROME_LOG_FILE: '/bundle/debug.log', SECRET: 'operator' });
  assert.equal(options.chromiumSandbox, true);
  assert.equal(options.executablePath, '/operator/browser');
  assert.deepEqual(options.args, ['--enable-logging=stderr', `--log-file=${os.devNull}`]);
  assert.equal(options.env.CHROME_LOG_FILE, os.devNull);
  assert.equal(options.env.SECRET, 'operator');
});
test('browser packaging excludes mutable log and crash artifacts while preserving browser assets', async t => {
  const { copyBrowserTools } = await import('../../scripts/package-local-worker.mjs');
  const root = await fixture(t), source = path.join(root, 'source-browser'), target = path.join(root, 'copied-browser');
  await fs.mkdir(path.join(source, 'resources'), { recursive: true });
  await fs.mkdir(path.join(source, 'Crashpad/reports'), { recursive: true });
  for (const file of ['browser.exe','browser.dll','debug.log','chrome_debug.log','crash.dmp','resources/data.pak','Crashpad/reports/state']) await fs.writeFile(path.join(source, file), file);
  await copyBrowserTools(source, target);
  for (const file of ['browser.exe','browser.dll','resources/data.pak']) assert.equal(await fs.readFile(path.join(target, file),'utf8'), file);
  for (const file of ['debug.log','chrome_debug.log','crash.dmp','Crashpad']) await assert.rejects(fs.stat(path.join(target,file)), /ENOENT/);
});
test('runtime browser clone verifies immutable source and runs outside the bundle', async t => {
  const { writeManifest, validateManifest, createRuntimeBrowser } = await import(toolsUrl);
  const root = await fixture(t), state = await fixture(t);
  const executable = 'tools/browsers/fixture/browser.exe';
  await fs.mkdir(path.dirname(path.join(root, executable)), { recursive: true });
  await fs.writeFile(path.join(root, executable), 'pinned browser');
  await writeManifest(root, {node:'22.23.2',npm:'10.9.8',playwright:'1.62.1'}, { XFACTOR_LOCAL_CHROMIUM: executable });
  const clone = await createRuntimeBrowser(root,state);
  assert.ok(clone.chromium.startsWith(state + path.sep));
  assert.equal(await fs.readFile(clone.chromium,'utf8'),'pinned browser');
  await fs.writeFile(path.join(path.dirname(clone.chromium),'debug.log'),'runtime warning');
  await validateManifest(root);
  await clone.cleanup();
  await assert.rejects(fs.stat(clone.root), /ENOENT/);
  await assert.rejects(createRuntimeBrowser(root,path.join(root,'data')), /outside.*bundle/i);
  const manifest = await validateManifest(root);
  await fs.writeFile(path.join(root,executable),'tampered browser');
  await assert.rejects(createRuntimeBrowser(root,state), /integrity hash mismatch/i);
  await assert.rejects(createRuntimeBrowser(root,state,{manifest}), /integrity hash mismatch/i);
  assert.equal((await fs.readdir(state)).filter(name=>name.startsWith('browser-runtime-')).length,0);
});
test('runtime browser copy rejects linked state and linked source directories', async t => {
  const { writeManifest, validateManifest, createRuntimeBrowser } = await import(toolsUrl);
  const root=await fixture(t), state=await fixture(t), outside=await fixture(t);
  const executable='tools/browsers/fixture/browser.exe';
  await fs.mkdir(path.dirname(path.join(root,executable)),{recursive:true});
  await fs.writeFile(path.join(root,executable),'pinned browser');
  await writeManifest(root,{node:'22.23.2',npm:'10.9.8',playwright:'1.62.1'},{XFACTOR_LOCAL_CHROMIUM:executable});
  const manifest=await validateManifest(root);
  await fs.symlink(outside,path.join(state,'linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(createRuntimeBrowser(root,path.join(state,'linked')),/symlink/i);
  const revision=path.dirname(path.join(root,executable));
  await fs.rm(revision,{recursive:true});
  await fs.writeFile(path.join(outside,'browser.exe'),'pinned browser');
  await fs.symlink(outside,revision,process.platform==='win32'?'junction':'dir');
  await assert.rejects(createRuntimeBrowser(root,state,{manifest}),/symlink/i);
  assert.equal((await fs.readdir(state)).filter(name=>name.startsWith('browser-runtime-')).length,0);
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor package test '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'tools'), { recursive: true });
  await fs.writeFile(path.join(root, 'tools/node'), 'binary fixture');
  await fs.writeFile(path.join(root, 'worker.js'), 'worker fixture');
  return root;
}
test('manifest detects file tampering before startup', async t => {
  const { writeManifest, validateManifest } = await import(toolsUrl);
  const root = await fixture(t);
  await writeManifest(root, { node: '22.23.2', npm: '10.9.8', playwright: '1.62.1' });
  await validateManifest(root);
  await fs.writeFile(path.join(root, 'worker.js'), 'altered');
  await assert.rejects(validateManifest(root), /hash|integrity/i);
});
test('manifest rejects missing files and unsupported versions', async t => {
  const { writeManifest, validateManifest } = await import(toolsUrl);
  const root = await fixture(t);
  await writeManifest(root, { node: '22.23.2', npm: '10.9.8', playwright: '1.62.1' });
  await fs.unlink(path.join(root, 'tools/node'));
  await assert.rejects(validateManifest(root), /missing|ENOENT/i);
  await fs.writeFile(path.join(root, 'tools/node'), 'binary fixture');
  await writeManifest(root, { node: '22.23.2', npm: '9.0.0', playwright: '1.62.1' });
  await assert.rejects(validateManifest(root), /version/i);
});
test('manifest rejects paths escaping package root', async t => {
  const { writeManifest, validateManifest } = await import(toolsUrl);
  const root = await fixture(t);
  await writeManifest(root, { node: '22.23.2', npm: '10.9.8', playwright: '1.62.1' });
  const file = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  manifest.files['../outside'] = '0'.repeat(64);
  await fs.writeFile(file, JSON.stringify(manifest));
  await assert.rejects(validateManifest(root), /path/i);
});
test('startup fails closed when bundle is incomplete, from paths containing spaces', async t => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/start-local-worker.mjs', import.meta.url)), '--bundle', root], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest|bundle/i);
});
test('source packaging excludes secrets and state but preserves required module dependencies', async t => {
  const { copyWorkerSource } = await import('../../scripts/package-local-worker.mjs');
  const root = await fixture(t);
  const source = path.join(root, 'source'), target = path.join(root, 'output');
  await fs.mkdir(path.join(source, 'data'), { recursive: true });
  await fs.mkdir(path.join(source, 'node_modules/jszip'), { recursive: true });
  await fs.writeFile(path.join(source, 'server.js'), 'export const server = true;');
  await fs.writeFile(path.join(source, '.env'), 'SECRET=secret');
  await fs.writeFile(path.join(source, 'data/admin-key.json'), 'secret');
  await fs.writeFile(path.join(source, 'credentials.json'), 'secret');
  await fs.writeFile(path.join(source, 'node_modules/jszip/package.json'), '{"name":"jszip"}');
  await copyWorkerSource(source, target);
  assert.equal(await fs.readFile(path.join(target, 'server.js'), 'utf8'), 'export const server = true;');
  assert.equal(await fs.readFile(path.join(target, 'node_modules/jszip/package.json'), 'utf8'), '{"name":"jszip"}');
  for (const omitted of ['.env', 'data', 'credentials.json']) await assert.rejects(fs.stat(path.join(target, omitted)), { code: 'ENOENT' });
});
test('platform launcher uses bundled Node from a directory with spaces without host PATH', async t => {
  const { writeLaunchers } = await import('../../scripts/package-local-worker.mjs');
  const root = await fixture(t);
  const nodeRelative = process.platform === 'win32' ? 'tools/node/node.exe' : 'tools/node/node';
  await fs.unlink(path.join(root, 'tools/node'));
  await fs.mkdir(path.join(root, 'tools/node'), { recursive: true });
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.copyFile(process.execPath, path.join(root, nodeRelative));
  await fs.writeFile(path.join(root, 'scripts/start-local-worker.mjs'), 'console.log(JSON.stringify({ executable: process.execPath, args: process.argv.slice(2) }));');
  await writeLaunchers(root);
  const shell = process.platform === 'win32' ? process.env.ComSpec : '/bin/sh';
  // Explicit relative path: hardened Windows hosts set NoDefaultCurrentDirectoryInExePath.
  const args = process.platform === 'win32' ? ['/d', '/c', '.\\start-worker.cmd'] : [path.join(root, 'start-worker.sh')];
  const result = spawnSync(shell, args, { cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.executable, path.join(root, nodeRelative));
  assert.equal(output.args[0], '--bundle');
  assert.equal(path.resolve(output.args[1]), root);
});
test('source refresh leaves packaged dependencies intact', async t => {
  const { copyWorkerSource } = await import('../../scripts/package-local-worker.mjs');
  const root = await fixture(t);
  const source = path.join(root, 'source'), target = path.join(root, 'output');
  for (const directory of [source, target]) await fs.mkdir(path.join(directory, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(source, 'node_modules/package.json'), 'source dependency');
  await fs.writeFile(path.join(target, 'node_modules/package.json'), 'bundled dependency');
  await fs.writeFile(path.join(source, 'server.js'), 'updated source');
  await copyWorkerSource(source, target, { includeDependencies: false });
  assert.equal(await fs.readFile(path.join(target, 'node_modules/package.json'), 'utf8'), 'bundled dependency');
  assert.equal(await fs.readFile(path.join(target, 'server.js'), 'utf8'), 'updated source');
});
test('standalone roundtrip harness refuses incomplete bundle before starting worker', async t => {
  const root = await fixture(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/test-local-worker-package.mjs', import.meta.url)), '--bundle', root, '--readiness-only'], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest|bundle/i);
});
test('launcher cooperatively stops the actual worker over IPC before resolving shutdown', { timeout: 180000 }, async t => {
  const { writeManifest } = await import(toolsUrl);
  const { startLocalWorker } = await import('../../scripts/start-local-worker.mjs');
  const root = await fixture(t), state = await fixture(t);
  const executable = process.platform === 'win32' ? 'tools/browsers/fixture/node.exe' : 'tools/browsers/fixture/node';
  await fs.mkdir(path.join(root, 'app/execution'), { recursive: true });
  await fs.mkdir(path.dirname(path.join(root, executable)), { recursive: true });
  await fs.copyFile(process.execPath, path.join(root, executable));
  await fs.writeFile(path.join(root, 'tools/npm-cli.js'), "console.log('10.9.8');");
  await fs.mkdir(path.join(root, 'tools/playwright'), { recursive: true });
  await fs.writeFile(path.join(root, 'tools/playwright/index.mjs'), 'export const chromium={executablePath(){throw new Error("Explicit tool path required")},async launch(){return{version(){return"151.0.7922.34"},async close(){}}}};');
  await fs.writeFile(path.join(root, 'tools/playwright/package.json'), '{"version":"1.62.1"}');
  await fs.writeFile(path.join(root, 'app/execution/server.js'), "import fs from 'node:fs';import path from 'node:path';process.on('message',message=>{if(message?.type==='xfactor-worker-shutdown'){fs.writeFileSync(path.join(process.env.XFACTOR_LOCAL_WORKER_DATA,'shutdown-proof'),'cooperative');process.exit(0);}});process.send({type:'fixture-ready'});");
  await fs.writeFile(path.join(root, 'app/execution/package.json'), '{"type":"module"}');
  await writeManifest(root, { node: '22.23.2', npm: '10.9.8', playwright: '1.62.1' }, { XFACTOR_LOCAL_NODE: executable, XFACTOR_LOCAL_NPM_CLI: 'tools/npm-cli.js', XFACTOR_LOCAL_PLAYWRIGHT: 'tools/playwright/index.mjs', XFACTOR_LOCAL_CHROMIUM: executable });
  const child = await startLocalWorker({ bundle: root, env: { ...process.env, XFACTOR_LOCAL_WORKER_DATA: state, EXECUTION_WORKER_TOKEN: 'fixture-token-01234567890123456789' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  assert.equal(typeof child.send, 'function', 'Launcher must establish an IPC channel');
  await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
  assert.equal(typeof child.stopLocalWorker, 'function');
  await child.stopLocalWorker();
  assert.equal(child.exitCode, 0);
  assert.equal(await fs.readFile(path.join(state, 'shutdown-proof'), 'utf8'), 'cooperative');
  assert.equal((await fs.readdir(state)).filter(name=>name.startsWith('browser-runtime-')).length,0);
  assert.equal(child.connected, false);
});
test('default Playwright path resolves from a checkout containing spaces and Unicode', async t => {
  const root = await fixture(t);
  const checkout = path.join(root, 'Türkçe proje');
  const playwright = path.join(checkout, 'execution/node_modules/playwright-core');
  await fs.mkdir(path.join(checkout, 'scripts'), { recursive: true });
  await fs.mkdir(playwright, { recursive: true });
  await fs.copyFile(fileURLToPath(toolsUrl), path.join(checkout, 'scripts/local-worker-tools.mjs'));
  await fs.writeFile(path.join(checkout, 'scripts/npm-cli.js'), "console.log('10.9.8');");
  await fs.writeFile(path.join(playwright, 'index.mjs'), 'export const chromium={executablePath(){throw new Error("Explicit browser required")},async launch(options){if(!options.headless||!options.chromiumSandbox||!options.executablePath)throw new Error("Trusted headless options required");return{version(){return"151.0.7922.34"},async close(){}}}};');
  await fs.writeFile(path.join(playwright, 'package.json'), '{"version":"1.62.1"}');
  const { resolveTools } = await import(pathToFileURL(path.join(checkout, 'scripts/local-worker-tools.mjs')));
  const resolved = await resolveTools({ XFACTOR_LOCAL_NODE: process.execPath, XFACTOR_LOCAL_NPM_CLI: path.join(checkout, 'scripts/npm-cli.js'), XFACTOR_LOCAL_CHROMIUM: process.execPath });
  assert.equal(resolved.playwright, path.join(playwright, 'index.mjs'));
  assert.equal(resolved.versions.chromium, '151.0.7922.34', 'Actual headless browser version is recorded');
});
test('default Chromium selection uses only the pinned installed headless revision across platform paths', async t => {
  const { chooseChromiumPath } = await import(toolsUrl);
  const root = await fixture(t);
  const browserMetadata = { browsers: [{ name: 'chromium', revision: '1234', browserVersion: '151.0.7922.34' }, { name: 'chromium-headless-shell', revision: '1234', browserVersion: '151.0.7922.34' }] };
  for (const [platform, arch, folder, executable] of [['win32', 'x64', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'], ['linux', 'x64', 'chrome-headless-shell-linux64', 'chrome-headless-shell'], ['darwin', 'arm64', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell']]) {
    const cache = path.join(root, platform);
    const full = path.join(cache, 'chromium-1234', 'absent-chrome');
    const headless = path.join(cache, 'chromium_headless_shell-1234', folder, executable);
    await fs.mkdir(path.dirname(headless), { recursive: true });
    await fs.writeFile(headless, 'installed pinned browser');
    assert.equal(await chooseChromiumPath(full, { browserMetadata, platform, arch }), headless);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, 'installed full browser');
    assert.equal(await chooseChromiumPath(full, { browserMetadata, platform, arch }), headless);
    await fs.unlink(headless);
    assert.equal(await chooseChromiumPath(full, { browserMetadata, platform, arch }), full);
    await fs.unlink(full);
    await assert.rejects(chooseChromiumPath(full, { browserMetadata, platform, arch }), /missing|Chromium/i);
  }
});
test('Windows sandbox ACL command grants only fixed read/execute SIDs inside the owned browser directory', async t => {
  const { windowsBrowserAclCommand } = await import(toolsUrl);
  const root = await fixture(t), browser = path.join(root, 'tools/browsers/chromium-1234');
  const command = windowsBrowserAclCommand(root, browser);
  assert.equal(command.program, path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/icacls.exe'));
  assert.deepEqual(command.args, [browser, '/grant', '*S-1-15-2-1:(OI)(CI)RX', '*S-1-15-2-2:(OI)(CI)RX', '/T']);
  for (const outside of [root, path.join(root, 'app'), path.join(root, 'tools/browsers'), path.join(root, 'tools/browsers/../npm')]) assert.throws(() => windowsBrowserAclCommand(root, outside), /owned.*browser|browser.*directory/i);
});
test('launcher checks byte integrity before Windows browser permissions or tool launch', async t => {
  const { writeManifest } = await import(toolsUrl);
  const { startLocalWorker } = await import('../../scripts/start-local-worker.mjs');
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'tools/browsers/chromium'), { recursive: true });
  await fs.writeFile(path.join(root, 'tools/browsers/chromium/browser.exe'), 'trusted browser');
  await writeManifest(root, { node: '22.23.2', npm: '10.9.8', playwright: '1.62.1' }, { XFACTOR_LOCAL_CHROMIUM: 'tools/browsers/chromium/browser.exe' });
  await fs.writeFile(path.join(root, 'tools/browsers/chromium/browser.exe'), 'tampered browser');
  await assert.rejects(startLocalWorker({ bundle: root }), /integrity hash mismatch/i);
});
test('Windows browser permission check works without PowerShell module autoload', { skip: process.platform !== 'win32' }, async t => {
  const { prepareWindowsBrowserPermissions } = await import(toolsUrl);
  const root = await fixture(t), browser = path.join(root, 'tools/browsers/fixture');
  await fs.mkdir(browser, { recursive: true });
  const previous = process.env.PSModulePath;
  process.env.PSModulePath = path.join(root, 'absent-modules');
  try { await prepareWindowsBrowserPermissions(root, browser); }
  finally { if (previous === undefined) delete process.env.PSModulePath; else process.env.PSModulePath = previous; }
});
