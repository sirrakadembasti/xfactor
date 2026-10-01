import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ensureWindowsProcessHost } from '../windowsProcessHost.js';

const windows = process.platform === 'win32';
let sharedCache;
after(async () => { if (sharedCache) await rm(sharedCache, { recursive: true, force: true }); });
async function fixture(t) {
  sharedCache ||= await mkdtemp(path.join(os.tmpdir(), 'xfactor-process-host-'));
  assert.equal(path.dirname(sharedCache), os.tmpdir());
  return ensureWindowsProcessHost({ cacheRoot: sharedCache });
}
function launch(exe, code, args = []) {
  return spawn(exe, [process.execPath, '-e', code, '--', ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
}
async function gone(pid) {
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.fail(`Process ${pid} survived job closure`);
}
test('native host preserves literal argv, stdin, and nonzero root exit', { skip: !windows, timeout: 180000 }, async t => {
  const exe = await fixture(t);
  assert.equal(path.isAbsolute(exe), true);
  const values = ['', 'two words', 'quote"here', 'C:\\space dir\\', '\\\\"', '$() & | ` literal', 'Türkçe'];
  const child = launch(exe, 'let s=""; process.stdin.on("data", d=>s+=d); process.stdin.on("end",()=>{console.log(JSON.stringify({args:process.argv.slice(1),stdin:s}));process.exitCode=37;});', values);
  let out = ''; let err = '';
  child.stdout.on('data', data => out += data); child.stderr.on('data', data => err += data);
  const done = once(child, 'close'); child.stdin.end('stdin literal " \\');
  assert.equal((await done)[0], 37, err);
  assert.deepEqual(JSON.parse(out), { args: values, stdin: 'stdin literal " \\' });
});
test('native host refuses malformed operator limits before starting child', { skip: !windows, timeout: 180000 }, async t => {
  const exe = await fixture(t);
  const child = spawn(exe, [process.execPath, '-e', 'console.log("child started")'], {
    windowsHide: true, env: { ...process.env, XFACTOR_LOCAL_JOB_PIDS: 'invalid' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = ''; let err = '';
  child.stdout.on('data', data => out += data); child.stderr.on('data', data => err += data);
  const [code] = await once(child, 'close');
  assert.equal(code, 125);
  assert.equal(out, '');
  assert.equal(err.trim(), 'Windows process containment failed.');
});
for (const terminate of [false, true]) {
  test(`native host kills descendants on ${terminate ? 'host termination' : 'root exit'}`, { skip: !windows, timeout: 180000 }, async t => {
    const exe = await fixture(t);
    const code = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(JSON.stringify({root:process.pid,grandchild:c.pid}));${terminate ? 'setInterval(()=>{},1000);' : 'setTimeout(()=>process.exit(19),200);'}`;
    const child = launch(exe, code);
    t.after(() => { if (child.exitCode === null) child.kill(); });
    const done = once(child, 'close');
    let text = '';
    const pids = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => { text += data; if (text.includes('\n')) resolve(JSON.parse(text.trim())); });
      child.on('error', reject);
      child.on('exit', () => { if (!text.includes('\n')) reject(new Error('No descendant report')); });
    });
    if (terminate) child.kill();
    const [exitCode] = await done;
    if (!terminate) assert.equal(exitCode, 19);
    await gone(pids.root); await gone(pids.grandchild);
  });
}
test('native parent watchdog kills helper, root, and grandchild after worker crash', { skip: !windows, timeout: 180000 }, async t => {
  const exe = await fixture(t);
  const rootCode = 'const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"}); console.log(JSON.stringify({root:process.pid,grandchild:c.pid}));setInterval(()=>{},1000);';
  const workerCode = `const {spawn}=require('child_process');const host=spawn(${JSON.stringify(exe)},[process.execPath,'-e',${JSON.stringify(rootCode)}],{windowsHide:true,detached:true,stdio:['pipe','pipe','pipe'],env:{...process.env,XFACTOR_LOCAL_PARENT_PID:String(process.pid)}});host.stdout.on('data',data=>console.log(JSON.stringify({host:host.pid,...JSON.parse(data.toString())})));host.stderr.on('data',data=>process.stderr.write(data));setInterval(()=>{},1000);`;
  const worker = spawn(process.execPath, ['-e', workerCode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let pids; let output = '';
  t.after(async () => {
    if (worker.exitCode === null) worker.kill();
    // Only these directly reported test processes may be cleaned up on failure.
    for (const pid of [pids?.host, pids?.root, pids?.grandchild]) if (pid) { try { process.kill(pid); } catch {} }
  });
  pids = await new Promise((resolve, reject) => {
    worker.stdout.on('data', data => { output += data; if (output.includes('\n')) resolve(JSON.parse(output.trim())); });
    worker.on('error', reject); worker.on('exit', () => { if (!output.includes('\n')) reject(new Error('Fake worker produced no process report')); });
  });
  const closed = once(worker, 'close'); worker.kill(); await closed;
  await gone(pids.host); await gone(pids.root); await gone(pids.grandchild);
});
test('compiler refuses pre-aborted and expired build requests', { skip: !windows }, async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(ensureWindowsProcessHost({ cacheRoot: os.tmpdir(), signal: controller.signal }), /Cancelled/);
  await assert.rejects(ensureWindowsProcessHost({ cacheRoot: os.tmpdir(), deadline: Date.now() - 1 }), /deadline/i);
});
test('compiler cancellation closes process and removes owned partial output', { skip: !windows, timeout: 180000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xfactor-cancel-build-'));
  assert.equal(path.dirname(root), os.tmpdir());
  t.after(() => rm(root, { recursive: true, force: true }));
  const controller = new AbortController();
  const build = ensureWindowsProcessHost({ cacheRoot: root, signal: controller.signal, deadline: Date.now() + 120000 });
  const timer = setTimeout(() => controller.abort(), 50);
  try { await assert.rejects(build, /Cancelled/); } finally { clearTimeout(timer); }
  assert.deepEqual(await readdir(root), []);
});
test('atomic job assignment kills suspended child when helper dies immediately after creation', { skip: !windows, timeout: 180000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'xfactor-atomic-host-'));
  assert.equal(path.dirname(root), os.tmpdir());
  const source = await readFile(new URL('../native/windowsProcessHost.cs', import.meta.url), 'utf8');
  // Only this private test copy pauses after CreateProcess. Production has no test hook.
  const instrumented = source.replace(/(Require\(CreateProcessW[^\n]*\);)/,
    '$1\n            File.WriteAllText(Environment.GetEnvironmentVariable("XFACTOR_TEST_CREATION_MARKER"), process.processId.ToString());\n            System.Threading.Thread.Sleep(10000);');
  assert.notEqual(instrumented, source);
  const sourcePath = path.join(root, 'instrumented-host.cs'); const executable = path.join(root, 'instrumented-host.exe');
  const marker = path.join(root, 'root.pid');
  await writeFile(sourcePath, instrumented);
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await promisify(execFile)(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('../native/build-windows-process-host.ps1', import.meta.url)), '-SourcePath', sourcePath, '-OutputPath', executable], { windowsHide: true, timeout: 120000 });
  const helper = spawn(executable, [process.execPath, '-e', 'setInterval(()=>{},1000)'], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, XFACTOR_TEST_CREATION_MARKER: marker },
  });
  let rootPid;
  t.after(async () => {
    if (helper.exitCode === null) helper.kill();
    if (rootPid) { try { process.kill(rootPid); } catch {} }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    try { rootPid = Number(await readFile(marker, 'utf8')); if (rootPid) break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (helper.exitCode !== null) assert.fail('Instrumented helper exited before its creation marker');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(Number.isInteger(rootPid) && rootPid > 0, 'Creation marker must report a real child PID');
  process.kill(rootPid, 0);
  const exited = once(helper, 'exit'); const closed = once(helper, 'close');
  helper.kill(); await exited;
  await gone(rootPid);
  await closed;
});
