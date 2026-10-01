import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createLocalProcessManager } from '../localProcesses.js';

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
