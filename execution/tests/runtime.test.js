import test, { mock } from 'node:test';
import assert from 'node:assert';
import cp from 'node:child_process';
import http from 'node:http';
import EventEmitter from 'node:events';
import { createHash } from 'node:crypto';
import { createProxy, isSafeIP } from '../registryProxy.js';
import { captureChildOutput, cleanupContainer, executeJob, ownedContainerExists, validateDependencySources, validateWorkspacePath, validateOwnedPath } from '../runtime.js';
import * as runtime from '../runtime.js';

function fakeChild() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter(); proc.stdin = new EventEmitter();
  proc.stdin.end = bytes => { proc.stdinBytes = Buffer.from(bytes || ''); proc.stdin.emit('end'); };
  proc.kill = () => proc.emit('close', 9, 'SIGKILL');
  return proc;
}

test('worker runtime finite protocol and security constraints', async (t) => {
  let containerExists = true;
  let readinessEnabled = true;
  let lastExecArgs = [];
  let npmExecArgs = [];
  let written = [];
  let disconnectArgs = [];
  let npmFault = null;
  let inputFault = false;
  const lock = Buffer.from(JSON.stringify({ lockfileVersion: 3, packages: {} }));
  const spawnMock = mock.method(cp, 'spawn', (cmd, args) => {
    const proc = fakeChild();
    if (inputFault && args.some(arg => String(arg).includes("process.stdin.on('data'"))) {
      proc.stdin.end = () => queueMicrotask(() => proc.stdin.emit('error', new Error('Protocol input failed')));
      return proc;
    }
    if (args[0] === 'exec' && args.includes('npm') && args.includes('install') && npmFault) {
      if (npmFault === 'throw') throw Object.assign(new Error('Spawn failed'), { code: 'ENOENT' });
      if (npmFault === 'error') setTimeout(() => { proc.emit('error', new Error('Spawn failed')); proc.emit('close', null); }, 2);
      return proc;
    }
    if (args[0] === 'network' && args[1] === 'disconnect') {
      disconnectArgs.push([...args]);
    }
    if (args[0] === 'exec') {
      lastExecArgs = [...args];
      if (args.includes('npm')) npmExecArgs = [...args];
      if (args.some(arg => String(arg).includes("process.stdin.on('data'"))) {
        proc.once('close', () => { written.push(proc.stdinBytes); });
      }
    }
    setTimeout(() => {
      const command = args.join(' ');
      if (args[0] === 'ps') {
        if (containerExists) proc.stdout.emit('data', Buffer.from('owned-container\n'));
      } else if (command.includes('logs')) {
        if (readinessEnabled) proc.stdout.emit('data', Buffer.from('READY\n'));
      } else if (command.includes('Config.Labels')) proc.stdout.emit('data', Buffer.from('execution\n'));
      else if (command.includes('inspect')) proc.stdout.emit('data', Buffer.from('172.18.0.2\n'));
      else if (args[0] === 'exec' && command.includes('readFileSync')) proc.stdout.emit('data', lock);
      else if (args[0] === 'rm') containerExists = false;
      proc.emit('close', 0);
    }, 2);
    return proc;
  });
  try {
    await t.test('declared escaping paths fail before Docker startup', async () => {
      const before = spawnMock.mock.calls.length;
      const result = await executeJob({ operation: 'verify_artifact', runId: 'run-path', jobId: 'path-boundary', inputPaths: ['../outside'], inputSha256: createHash('sha256').update('x').digest('hex'), archiveBase64: 'eA==' }, { signal: new AbortController().signal });
      assert.equal(result.status, 'failed'); assert.match(result.error, /workspace|path/i); assert.equal(spawnMock.mock.calls.length, before);
    });

    await t.test('prepare_dependencies writes package bytes and runs npm lockfile-only protocol', async () => {
      written = [];
      const progress = [];
      const result = await executeJob({ operation: 'prepare_dependencies', runId: 'run-prepare', jobId: 'job-prepare', packageJsonBytes: Buffer.from('{"name":"fixture","version":"1.0.0"}'), deadline: Date.now() + 10000 }, { signal: new AbortController().signal, onProgress: event => progress.push(event) });
      assert.equal(result.status, 'success', result.error || '');
      assert.equal(result.result.runId, 'run-prepare');
      assert.ok(written.some(bytes => bytes?.toString() === '{"name":"fixture","version":"1.0.0"}'));
      assert.ok(npmExecArgs.includes('npm')); assert.ok(npmExecArgs.includes('install')); assert.ok(npmExecArgs.includes('--package-lock-only'));
      assert.ok(npmExecArgs.includes('--ignore-scripts'));
      const install = progress.find(event => event.state === 'started' && event.phase === 'dependency_lockfile');
      assert.ok(install, 'Docker commands must appear before final verification evidence');
      assert.equal(progress.filter(event => event.state === 'finished' && event.commandId === install.commandId).length, 1);
      assert.ok(!JSON.stringify(progress).includes('package-lock-only'), 'raw arguments are not telemetry');
    });

    await t.test('verify_artifact rejects oversized input before Docker work', async () => {
      const before = spawnMock.mock.calls.length;
      const archive = Buffer.alloc(25 * 1024 * 1024, 7);
      const result = await executeJob({ operation: 'verify_artifact', runId: 'run-overflow', jobId: 'job-overflow', archiveBase64: archive.toString('base64'), inputSha256: createHash('sha256').update(archive).digest('hex'), deadline: Date.now() + 10000 }, { signal: new AbortController().signal });
      assert.equal(result.status, 'failed'); assert.match(result.result?.reason || result.error, /limit|exceed/i); assert.equal(spawnMock.mock.calls.length, before);
    });

    await t.test('protocol input pipe errors fail the job without an uncaught controller exception', async () => {
      inputFault = true;
      try {
        const result = await executeJob({ operation: 'prepare_dependencies', runId: 'input-failure', jobId: 'input-failure',
          packageJsonBytes: Buffer.from('{"name":"fixture","version":"1.0.0"}'), deadline: Date.now() + 1000 });
        assert.equal(result.status, 'failed');
      } finally { inputFault = false; }
    });

    await t.test('Docker command errors, aborts and deadlines produce exactly one safe terminal event', async () => {
      for (const fault of ['throw', 'error', 'abort', 'timeout']) {
        npmFault = fault;
        const controller = new AbortController(), progress = [];
        try {
          const result = await executeJob({ operation: 'prepare_dependencies', runId: `run-${fault}`, jobId: `job-${fault}`,
            packageJsonBytes: Buffer.from('{"name":"fixture","version":"1.0.0"}'), deadline: Date.now() + (fault === 'timeout' ? 1000 : 10000) }, {
            signal: controller.signal, onProgress: event => { progress.push(event); if (fault === 'abort' && event.state === 'started' && event.phase === 'dependency_lockfile') setTimeout(() => controller.abort('user cancellation'), 5); }
          });
          assert.equal(result.status, 'failed');
          const start = progress.find(event => event.state === 'started' && event.phase === 'dependency_lockfile');assert.ok(start);
          const endings = progress.filter(event => event.commandId === start.commandId && event.state === 'finished');assert.equal(endings.length, 1);
          assert.equal(endings[0].timedOut, fault === 'timeout');assert.equal(endings[0].exitCode, null);
        } finally { npmFault = null; }
      }
    });

    await t.test('unsupported operation and pre-abort fail closed', async () => {
      const controller = new AbortController(); controller.abort();
      assert.equal((await executeJob({ operation: 'shell', runId: 'run-invalid', jobId: 'invalid' })).status, 'failed');
      const result = await executeJob({ operation: 'verify_artifact', runId: 'run-abort', jobId: 'aborted', archiveBase64: 'eA==', inputSha256: createHash('sha256').update('x').digest('hex') }, { signal: controller.signal });
      assert.equal(result.status, 'failed'); assert.match(result.error, /Cancel/);
    });

    await t.test('owned cleanup, internal networks, readiness deadline, and safe env remain enforced', async () => {
      const resources = []; const result = await executeJob({ operation: 'prepare_dependencies', runId: 'run-safe', jobId: 'safe', packageJsonBytes: Buffer.from('{"name":"safe","version":"1.0.0"}'), env: { EXECUTION_WORKER_TOKEN: 'secret', PATH: '/evil', NODE_ENV: 'test' }, deadline: Date.now() + 10000 }, { signal: new AbortController().signal, onResource: r => resources.push(r) });
      assert.equal(result.status, 'success', result.error || '');
      assert.ok(npmExecArgs.includes('NODE_ENV=test'));
      assert.ok(!npmExecArgs.some(arg => arg.includes('EXECUTION_WORKER_TOKEN') || arg.includes('/evil')));
      await assert.rejects(() => cleanupContainer('xfactor-worker-../../unowned'), /unowned/i);
      assert.throws(() => validateOwnedPath('../escape'), /Workspace path escapes|Invalid workspace/);
      readinessEnabled = false;
      const deadlineResult = await executeJob({ operation: 'verify_artifact', runId: 'run-deadline', jobId: 'deadline', archiveBase64: 'eA==', inputSha256: createHash('sha256').update('x').digest('hex'), deadline: Date.now() + 20 }, { signal: new AbortController().signal });
      readinessEnabled = true;
      assert.equal(deadlineResult.status, 'failed'); assert.match(deadlineResult.error, /deadline|timed out/i);
    });

    await t.test('disconnectInstallNetworkAfterInstall option executes docker network disconnect', async () => {
      disconnectArgs = [];
      const result = await executeJob({
        operation: 'prepare_dependencies',
        runId: 'run-disconnect',
        jobId: 'job-disconnect',
        packageJsonBytes: Buffer.from('{"name":"fixture","version":"1.0.0"}'),
        disconnectInstallNetworkAfterInstall: true,
        deadline: Date.now() + 10000
      }, { signal: new AbortController().signal });
      assert.equal(result.status, 'success', result.error || '');
      assert.ok(disconnectArgs.length > 0, 'network disconnect must be called');
      const call = disconnectArgs[0];
      assert.equal(call[0], 'network');
      assert.equal(call[1], 'disconnect');
      assert.equal(call[2], '-f');
    });
  } finally { spawnMock.mock.restore(); }
});

test('child output capture retains bounded bytes and full digests', async () => {
  const proc = fakeChild(); const captured = captureChildOutput(proc, { maxBytes: 4 });
  const stdout = Buffer.from('abcdefgh'); const stderr = Buffer.from('xyz');
  proc.stdout.emit('data', stdout); proc.stderr.emit('data', stderr);
  const snapshot=captured.snapshot();assert.equal(snapshot.stdout,'abcd');assert.equal(snapshot.stderr,'xyz');
  assert.equal(snapshot.stdoutSha256,createHash('sha256').update(stdout).digest('hex'));
  proc.emit('close', 0);
  const result = await captured;
  assert.equal(result.stdout, 'abcd'); assert.equal(result.stdoutBytes, 8); assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stdoutSha256, createHash('sha256').update(stdout).digest('hex'));
  assert.equal(result.stderr, 'xyz'); assert.equal(result.stderrTruncated, false);
});

test('failed isolated dependency preparation never invokes host npm', async () => {
  const commands = [];
  const spawnMock = mock.method(cp, 'spawn', (cmd) => {
    commands.push(cmd);
    const proc = fakeChild();
    setTimeout(() => {
      proc.stderr.emit('data', Buffer.from('Docker unavailable'));
      proc.emit('close', 1);
    }, 1);
    return proc;
  });
  try {
    const result = await executeJob({
      operation: 'prepare_dependencies', runId: 'isolated-only', jobId: 'isolated-only',
      packageJsonBytes: Buffer.from('{"name":"isolated-only","version":"1.0.0"}')
    });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /Docker unavailable/);
    assert.deepEqual([...new Set(commands)], ['docker']);
  } finally {
    spawnMock.mock.restore();
  }
});

test('dependency policy rejects non-registry sources and permits registry lock entries', () => {
  assert.throws(() => validateDependencySources({ manifest: { dependencies: { bad: 'git+https://github.com/acme/bad.git' } } }), /Forbidden dependency source/);
  assert.throws(() => validateDependencySources({ manifest: { dependencies: { bad: 'file:../outside' } } }), /Forbidden dependency source/);
  assert.throws(() => validateDependencySources({ lockfile: { packages: { 'node_modules/bad': { resolved: 'https://evil.example/bad.tgz' } } } }), /Non-registry lockfile source/);
  assert.equal(validateDependencySources({ manifest: { dependencies: { good: '^1.2.3' } }, lockfile: { packages: { 'node_modules/good': { resolved: 'https://registry.npmjs.org/good/-/good-1.2.3.tgz' } } } }), true);
});

test('registry proxy rejects normalized private and reserved addresses', () => {
  for (const ip of ['::ffff:127.0.0.1', '::ffff:10.0.0.1', '169.254.1.1', '192.0.2.1', '198.51.100.1', '192.168.1.1', '::1', 'fc00::1', '2001:db8::1', 'ff02::1']) assert.equal(isSafeIP(ip), false, ip);
  assert.equal(isSafeIP('8.8.8.8'), true);
});

test('registry proxy denies unsafe DNS answers before outbound connect', async () => {
  for (const address of ['192.0.2.1', '169.254.169.254', '::ffff:127.0.0.1']) {
    let outbound = 0;
    const proxy = await createProxy({ resolver: { resolve: async () => [address] }, connector: () => { outbound += 1; throw new Error('unexpected outbound connection'); } });
    const port = proxy.address().port;
    const status = await new Promise((resolve, reject) => { const request = http.get({ host: '127.0.0.1', port, path: '/is-number' }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); }); request.once('error', reject); });
    await new Promise(resolve => proxy.close(resolve)); assert.equal(status, 403); assert.equal(outbound, 0);
  }
});

test('container exec arguments preserve node eval source as one argument', () => {
  assert.equal(typeof runtime.buildContainerExecArgs, 'function');
  const source = "console.log('ready');";
  const args = runtime.buildContainerExecArgs({
    containerName: 'owned-container',
    command: 'node',
    args: ['-e', source],
    cwd: '/workspace',
    env: { NODE_ENV: 'test' }
  });
  assert.deepStrictEqual(args, [
    'exec', '-i',
    '--workdir', '/workspace',
    '--env', 'NODE_ENV=test',
    'owned-container',
    'node', '/opt/worker/entrypoint.js',
    'node', '-e', source
  ]);
});

test('container exec carries a validated service port and per-run JWT secret without host credentials', () => {
  const secret = 'f'.repeat(64);
  assert.equal(typeof runtime.filterRuntimeEnvironment, 'function');
  const serviceEnv = runtime.filterRuntimeEnvironment({ PORT: '5000', JWT_SECRET: secret, EXECUTION_WORKER_TOKEN: 'host-secret' });
  assert.deepStrictEqual(serviceEnv, { PORT: '5000', JWT_SECRET: secret });
  const args = runtime.buildContainerExecArgs({ containerName: 'owned-container', command: 'node', env: {
    PORT: '5000', JWT_SECRET: secret, NODE_ENV: 'test', PATH: '/host/evil', EXECUTION_WORKER_TOKEN: 'host-secret'
  } });
  assert.ok(args.includes('PORT=5000')); assert.ok(args.includes(`JWT_SECRET=${secret}`));
  assert.ok(!args.some(arg => arg.includes('/host/evil') || arg.includes('host-secret')));
  const demo = 'D'.repeat(31) + '-';
  assert.deepStrictEqual(runtime.filterRuntimeEnvironment({ XFACTOR_DEMO_PASSWORD_ADMIN: demo, XFACTOR_DEMO_PASSWORD_VIEWER: 'short',
    DB_PASSWORD: 'x'.repeat(32), xfactor_demo_password_admin: demo }), { XFACTOR_DEMO_PASSWORD_ADMIN: demo });
  for (const port of ['0', '80', '65536', '3000;anything', '-1']) {
    const invalid = runtime.buildContainerExecArgs({ containerName: 'owned-container', command: 'node', env: { PORT: port, JWT_SECRET: 'host-secret' } });
    assert.ok(!invalid.some(arg => arg.startsWith('PORT=') || arg.startsWith('JWT_SECRET=')));
  }
});

test('workspace paths reject host and traversal forms', () => {
  assert.equal(validateWorkspacePath('src/index.js'), 'src/index.js');
  for (const value of ['/etc/passwd', '../escape', 'a/../../escape', 'C:\\temp\\x', 'src\\x', 'bad\0name']) assert.throws(() => validateWorkspacePath(value));
});

test('workspace path checks are delegated to the container', () => { assert.equal(validateOwnedPath('owned/file'), '/workspace/owned/file'); });
