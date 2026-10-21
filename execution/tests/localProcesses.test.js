import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createLocalProcessManager } from '../localProcesses.js';
import { runVerificationChecks } from '../../backend/verification/runChecks.js';
import { ARTIFACT_LIMITS } from '../../backend/artifactLimits.js';

async function setup(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xfactor-local-processes-'));
  assert.equal(path.dirname(root), os.tmpdir());
  const workspace = path.join(root, 'workspace'); await mkdir(workspace);
  const npm = path.join(root, 'npm-cli.js');
  await writeFile(npm, 'console.log(JSON.stringify({argv:process.argv.slice(2),cli:process.env.XFACTOR_NPM_CLI}));');
  await writeFile(path.join(root, 'npx-cli.js'), 'console.log(JSON.stringify(process.argv.slice(2)));');
  const manager = await createLocalProcessManager({ tools: { node: process.execPath, npm }, workspace, cacheRoot: path.join(root, 'cache'), deadline: Date.now() + 60000, ...options });
  t.after(async () => { await manager.dispose(); await rm(root, { recursive: true, force: true }); });
  return { manager, workspace, npm };
}
test('real child execution maps cwd, stdin, synthetic env, and nonzero exit', async t => {
  const { manager, workspace } = await setup(t);
  const result = await manager.execute({ command: 'node', args: ['-e', 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{console.log(JSON.stringify({cwd:process.cwd(),input:s,synthetic:process.env.AUTH_SECRET,home:process.env.HOME}));process.exitCode=17;});'], cwd: '/workspace', input: 'literal stdin', env: { AUTH_SECRET: 'synthetic-only' } });
  assert.equal(result.exitCode, 17); assert.equal(result.passed, false);
  const json = JSON.parse(result.stdout);
  assert.equal(json.cwd, workspace); assert.equal(json.input, 'literal stdin'); assert.equal(json.synthetic, 'synthetic-only');
  assert.notEqual(json.home, process.env.HOME || process.env.USERPROFILE);
  assert.equal(json.home, path.join(workspace, '.home'));
});
test('npm uses trusted CLI and rejects shell executables and escaped cwd', async t => {
  const { manager, npm } = await setup(t);
  const result = await manager.execute('npm.cmd', ['--version'], { env: { XFACTOR_NPM_CLI: 'untrusted' } });
  assert.deepEqual(JSON.parse(result.stdout), { argv: ['--version'], cli: npm });
  assert.deepEqual(JSON.parse((await manager.execute('npx', ['--no-install', 'literal argument'])).stdout), ['--no-install', 'literal argument']);
  await assert.rejects(manager.execute('cmd.exe', ['/c', 'echo unsafe']), /Unsupported executable/);
  await assert.rejects(manager.execute('node', [], { cwd: '../' }), /workspace/);
});

test('nested npm scripts resolve the pinned CLI without host npm shims', async t => {
  const { manager } = await setup(t);
  const script = `const cp=require('node:child_process');const r=cp.spawnSync(process.platform==='win32'?process.env.ComSpec:'/bin/sh',process.platform==='win32'?['/d','/s','/c','npm nested-marker']:['-c','npm nested-marker'],{encoding:'utf8',env:process.env});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??1;`;
  const result = await manager.execute('node', ['-e', script]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).argv, ['nested-marker']);
});
test('retained output is bounded while digest covers complete stream', async t => {
  const { manager } = await setup(t);
  const size = 1100000;
  const result = await manager.execute('node', ['-e', `process.stdout.write('a'.repeat(${size}));`]);
  assert.equal(Buffer.byteLength(result.stdout), 1024 * 1024);
  assert.equal(result.stdoutSha256, createHash('sha256').update('a'.repeat(size)).digest('hex'));
  assert.equal(result.stdoutTruncated, true); assert.equal(result.passed, false);
});
test('cancellation waits for actual child close and tracked process cleanup', async t => {
  const controller = new AbortController();
  let pid;
  const { manager } = await setup(t, { signal: controller.signal, onResource: resource => { pid = resource.pid; setTimeout(() => controller.abort(), 150); } });
  await assert.rejects(manager.execute('node', ['-e', 'setInterval(()=>{},1000)']), /Cancelled/);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('dispose closes spawned service and kill ignores untracked caller pid', async t => {
  const { manager } = await setup(t);
  const child = await manager.spawn({ command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] });
  await manager.kill(process.pid);
  await manager.dispose();
  assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  await assert.rejects(manager.execute('node', ['-e', '']), /disposed/);
});
test('host secrets and arbitrary global environment never reach child', async t => {
  const names = ['XFACTOR_MANAGER_HOST_SECRET', 'XFACTOR_MANAGER_HOST_VALUE'];
  const old = names.map(name => process.env[name]);
  for (const name of names) process.env[name] = 'operator-global-value';
  t.after(() => names.forEach((name, i) => { if (old[i] === undefined) delete process.env[name]; else process.env[name] = old[i]; }));
  const { manager } = await setup(t);
  const result = await manager.execute('node', ['-e', 'console.log(JSON.stringify([process.env.XFACTOR_MANAGER_HOST_SECRET,process.env.XFACTOR_MANAGER_HOST_VALUE]));']);
  assert.deepEqual(JSON.parse(result.stdout), [null, null]);
});
test('hard output ceiling kills and closes actual process', async t => {
  let pid;
  const { manager } = await setup(t, { onResource: resource => { pid = resource.pid; } });
  await assert.rejects(manager.execute('node', ['-e', 'setInterval(()=>process.stdout.write(Buffer.alloc(65536,97)),1);']), /hard ceiling/);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('timeout rejects only after actual process termination', async t => {
  let pid;
  const { manager } = await setup(t, { onResource: resource => { pid = resource.pid; } });
  await assert.rejects(manager.execute('node', ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 150 }), /timed out/);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('real command diagnostics emit only fixed metadata and timeout outcome', async t => {
  const events = [];
  const { manager } = await setup(t, { onProgress: event => events.push(event) });
  await manager.execute('npm', ['run', 'build', 'private-argument'], { env: { AUTH_SECRET: 'private-environment' } });
  assert.equal(events.length, 2);
  assert.equal(events[0].phase, 'framework_build');
  assert.equal(events[0].executable, 'npm');
  assert.equal(events[1].exitCode, 0);
  assert.match(events[1].stdoutSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(manager.execute('node', ['-e', "process.stdout.write('private-output');setInterval(()=>{},1000)"], { timeoutMs: 100 }), /timed out/);
  assert.equal(events.at(-1).timedOut, true);
  assert.doesNotMatch(JSON.stringify(events), /private-argument|private-environment|private-output|argv|AUTH_SECRET/);
});

test('two owned jobs retain only operator package cache while homes and private config stay separate', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xfactor-public-npm-cache-'));
  const npmCacheDirectory = path.join(root, 'npm');
  t.after(() => rm(root, { recursive: true, force: true }));
  const oldSecret = process.env.XFACTOR_CACHE_HOST_SECRET;
  process.env.XFACTOR_CACHE_HOST_SECRET = 'private-host-secret';
  t.after(() => { if (oldSecret === undefined) delete process.env.XFACTOR_CACHE_HOST_SECRET; else process.env.XFACTOR_CACHE_HOST_SECRET = oldSecret; });
  const first = await setup(t, { npmCacheDirectory });
  const describe = "console.log(JSON.stringify({cache:process.env.NPM_CONFIG_CACHE,home:process.env.HOME,config:process.env.NPM_CONFIG_USERCONFIG,logs:process.env.NPM_CONFIG_LOGS_DIR,registry:process.env.NPM_CONFIG_REGISTRY,secret:process.env.XFACTOR_CACHE_HOST_SECRET}));";
  const initial = JSON.parse((await first.manager.execute('node', ['-e', describe])).stdout);
  assert.equal(initial.cache, npmCacheDirectory);
  await writeFile(path.join(npmCacheDirectory, 'public-content-sentinel'), 'public package bytes');
  await writeFile(initial.config, 'private-job-config');
  await writeFile(path.join(first.workspace, 'source.ts'), 'source unchanged');
  assert.equal(await readFile(path.join(first.workspace, 'source.ts'), 'utf8'), 'source unchanged');
  await first.manager.dispose();
  await rm(first.workspace, { recursive: true, force: true });
  const second = await setup(t, { npmCacheDirectory });
  const next = JSON.parse((await second.manager.execute('node', ['-e', describe], { env: {
    NPM_CONFIG_CACHE: '/caller/cache', NPM_CONFIG_LOGS_DIR: '/caller/logs', NPM_CONFIG_REGISTRY: 'https://private.example', HOME: '/caller/home'
  } })).stdout);
  assert.equal(next.cache, npmCacheDirectory);
  assert.notEqual(next.home, initial.home);
  assert.equal(next.config.startsWith(next.home), true);
  assert.equal(next.logs.startsWith(second.workspace), true);
  assert.equal(next.registry, 'https://registry.npmjs.org');
  assert.equal(next.secret, undefined);
  await assert.rejects(readFile(next.config), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(npmCacheDirectory, 'public-content-sentinel'), 'utf8'), 'public package bytes');
});

async function inventoryRun(manager, workspace, { direct = true, execute } = {}) {
  let inventory;
  const captured = async (_workspace, _contract, options) => { inventory ||= options.files; return { passed: true, checks: [] }; };
  const adapter = { execute: execute || manager.execute,
    ...(direct ? { readFile: target => readFile(target) } : {}) };
  await runVerificationChecks({ workspace, adapter, verifiers: { dependencies: captured, build: captured,
    readme: async (_contract, files) => { inventory ||= files; return { passed: true }; }, smoke: captured } });
  return inventory;
}

test('real local process inventory transfers every byte above stdout retention without changing file scope', async t => {
  const { manager, workspace } = await setup(t);
  const content = 'legitimate-source-☃\n'.repeat(70000);
  await writeFile(path.join(workspace, 'large.ts'), content);
  await mkdir(path.join(workspace, 'manager'));
  await writeFile(path.join(workspace, 'manager', 'preserved.txt'), 'manager content stays in scope');
  for (const excluded of ['node_modules', '.git', '.npm', '.home', '.tmp']) {
    await mkdir(path.join(workspace, excluded), { recursive: true });
    await writeFile(path.join(workspace, excluded, 'excluded.txt'), 'excluded');
  }
  await writeFile(path.join(workspace, 'artifact.zip'), 'not a real ZIP; excluded sentinel');
  for (const direct of [true, false]) {
    const files = await inventoryRun(manager, workspace, { direct });
    assert.deepEqual(files.map(file => file.path).sort(), ['large.ts', 'manager/preserved.txt']);
    assert.equal(files.find(file => file.path === 'large.ts').content, content);
    assert.equal(files.find(file => file.path === 'manager/preserved.txt').content, 'manager content stays in scope');
  }
});

test('inventory rejects oversized source before dependency execution with a clear bound', async t => {
  const { manager, workspace } = await setup(t);
  await writeFile(path.join(workspace, 'oversized.ts'), Buffer.alloc(ARTIFACT_LIMITS.maxFileBytes + 1, 97));
  await assert.rejects(inventoryRun(manager, workspace), /inventory.*(?:size|limit)/i);
});

test('inventory rejects symlink traversal into an external file', async t => {
  const { manager, workspace } = await setup(t);
  const outside = path.join(path.dirname(workspace), 'outside'); await mkdir(outside);
  await writeFile(path.join(outside, 'secret.txt'), 'external sentinel');
  await symlink(outside, path.join(workspace, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(inventoryRun(manager, workspace), /inventory.*symlink/i);
});

test('inventory rejects truncated metadata even when partial stdout is valid JSON', async t => {
  const { manager, workspace } = await setup(t);
  await assert.rejects(inventoryRun(manager, workspace, { execute: async () => ({ exitCode: 0, stdout: '[]', stdoutTruncated: true }) }), /inventory.*truncat/i);
});

test('inventory transport rejects oversized metadata, corrupted file bytes and truncated chunks', async t => {
  const { manager, workspace } = await setup(t);
  const metadata = { bytes: 2, count: 0, sha256: createHash('sha256').update('[]').digest('hex') };
  const response = value => ({ exitCode: 0, stdout: JSON.stringify(value) });
  for (const invalid of [{ ...metadata, bytes: 2 * ARTIFACT_LIMITS.maxExtractedBytes + 1 },
    { ...metadata, count: ARTIFACT_LIMITS.maxFiles + 1 }, { ...metadata, sha256: 'invalid' }]) {
    await assert.rejects(inventoryRun(manager, workspace, { execute: async () => response(invalid) }), /inventory.*(?:limit|invalid)/i);
  }
  let commands = 0;
  await assert.rejects(inventoryRun(manager, workspace, { direct: false, execute: async () => {
    commands++;
    return commands === 1 ? response(metadata) : { exitCode: 0, stdout: 'W10=', stdoutTruncated: true };
  } }), /inventory.*truncat/i);
  commands = 0;
  await assert.rejects(inventoryRun(manager, workspace, { direct: false, execute: async () => {
    commands++;
    return commands === 1 ? response(metadata) : { exitCode: 0, stdout: Buffer.from('{}').toString('base64') };
  } }), /inventory.*digest/i);
});
