import test, { mock } from 'node:test';
import assert from 'node:assert';
import cp from 'node:child_process';
import EventEmitter from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { cleanupContainer, executeJob, ownedContainerExists, validateDependencySources, validateWorkspacePath, validateOwnedPath } from '../runtime.js';
import { isSafeIP } from '../registryProxy.js';

test('Isolated worker runtime constraints and cancellation', async (t) => {
  let containerExists = true;
  let readinessEnabled = true;
  let lastSpawnArgs = [];
  let lastExecArgs = [];
  
  mock.method(cp, 'spawn', (cmd, args, opts) => {
    lastSpawnArgs = [...args];
    if (args[0] === 'exec') lastExecArgs = [...args];
    if (args[0] === 'run') containerExists = true;
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    let closed = false;
    let timer;
    proc.kill = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      proc.emit('close', 9);
    };
    const command = args.join(' ');
    timer = setTimeout(() => {
      if (closed) return;
      if (readinessEnabled && command.includes('logs')) proc.stdout.emit('data', Buffer.from('READY\n'));
      else if (command.includes(' ps ') || args[0] === 'ps') {
        if (containerExists) proc.stdout.emit('data', Buffer.from('owned-container\n'));
      } else if (command.includes('inspect') && command.includes('Config.Labels')) {
        proc.stdout.emit('data', Buffer.from('execution\n'));
      } else if (command.includes('inspect')) {
        proc.stdout.emit('data', Buffer.from('172.18.0.2\n'));
      } else if (args[0] === 'exec' && args.includes('console.log("spew");')) {
        proc.stdout.emit('data', Buffer.alloc(2 * 1024 * 1024, 'a'));
      } else if (args[0] === 'rm') containerExists = false;
      closed = true;
      proc.emit('close', 0);
    }, 5);
    return proc;
  });

  await t.test('declared escaping paths fail before Docker startup', async () => {
    const result = await executeJob({
      jobId: 'path-boundary',
      deadline: Date.now() + 10000,
      inputPaths: ['../outside'],
    }, { signal: new AbortController().signal });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /workspace|path/i);
  });
  await t.test('cancels job, cleans up container, limits output, drops privileges', async () => {
    // 1. Output ceiling enforcement
    const jobExceedingOutput = { 
      jobId: 'job-output-limit', 
      deadline: Date.now() + 10000, 
      type: 'test',
      code: 'console.log("spew");'
    };
    const abort1 = new AbortController();
    const result = await executeJob(jobExceedingOutput, { signal: abort1.signal, onResource: () => {} });
    
    assert.equal(result.status, 'failed');
    assert.equal(result.result.stdoutTruncated, true);
    assert.equal(result.result.stdoutBytes, 2 * 1024 * 1024);
    assert.equal(result.result.stdoutSha256,
      createHash('sha256').update(Buffer.alloc(2 * 1024 * 1024, 'a')).digest('hex'));

    const installJob = {
      jobId: 'job-env-allowlist',
      deadline: Date.now() + 10000,
      operation: 'prepare_dependencies',
      code: 'process.exit(0);',
    };
    containerExists = true;
    const installResult = await executeJob(installJob, {
      signal: new AbortController().signal,
      onResource: () => {},
    });
    assert.equal(installResult.status, 'success', installResult.error || '');
    assert.ok(lastExecArgs.includes('--env'));
    const spawned = installResult.adapter.spawn('node', [], { env: { EXECUTION_WORKER_TOKEN: 'secret' }, cwd: 'src', timeout: 1000 });
    spawned.kill();
    assert.ok(lastExecArgs.includes('NPM_CONFIG_CACHE=/tmp/npm-cache'));
    assert.ok(lastExecArgs.includes('NPM_CONFIG_IGNORE_SCRIPTS=true'));
    assert.ok(lastSpawnArgs.every((arg) =>
      !arg.includes('EXECUTION_WORKER_TOKEN') && !arg.includes('UNRELATED_SECRET')));
    // 2. Cancellation and container cleanup
    const jobCancel = { 
      jobId: 'job-cancel-cleanup', 
      deadline: Date.now() + 10000, 
      type: 'test',
      code: 'console.log("run");'
    };
    const abort2 = new AbortController();
    containerExists = true;
    const p = executeJob(jobCancel, { signal: abort2.signal, onResource: () => {} });
    
    // Cancel immediately after starting
    abort2.abort(); 
    const cancelResult = await p; 
    
    assert.equal(cancelResult.status, 'failed');
    assert.match(cancelResult.error, /Cancel/);
    
    // Verify container no longer exists after cancellation ack
    assert.equal(await ownedContainerExists(jobCancel.jobId), false); // after cancellation ack

  });
  await t.test('owned network resources stay internal and cleanup rejects collisions', async () => {
    const resources = [];
    const result = await executeJob({ jobId: 'same-network-probe', deadline: Date.now() + 10000 }, {
      signal: new AbortController().signal,
      onResource: resource => resources.push(resource),
    });
    assert.equal(result.status, 'success');
    assert.ok(resources.filter(resource => resource.type === 'network').every(resource => resource.internal === true));
    await assert.rejects(() => cleanupContainer('xfactor-worker-../../unowned'), /unowned/i);
    assert.throws(() => result.adapter.spawn('node', [], { cwd: '../escape' }), /Workspace path escapes|Invalid workspace/);
  });
  await t.test('readiness is bounded by deadline', async () => {
    readinessEnabled = false;
    const result = await executeJob({ jobId: 'readiness-deadline', deadline: Date.now() + 30, code: 'true' }, { signal: new AbortController().signal });
    readinessEnabled = true;
    assert.equal(result.status, 'failed');
    assert.match(result.error, /deadline|timed out/i);
  });
});

test('dependency policy rejects non-registry sources and permits registry lock entries', () => {
  assert.throws(() => validateDependencySources({
    manifest: { dependencies: { bad: 'git+https://github.com/acme/bad.git' } },
  }), /Forbidden dependency source/);
  assert.throws(() => validateDependencySources({
    manifest: { dependencies: { bad: 'file:../outside' } },
  }), /Forbidden dependency source/);
  assert.throws(() => validateDependencySources({
    lockfile: { packages: { 'node_modules/bad': { resolved: 'https://evil.example/bad.tgz' } } },
  }), /Non-registry lockfile source/);
  assert.equal(validateDependencySources({
    manifest: { dependencies: { good: '^1.2.3' } },
    lockfile: {
      packages: { 'node_modules/good': { resolved: 'https://registry.npmjs.org/good/-/good-1.2.3.tgz' } },
      dependencies: {
        good: {
          resolved: 'https://registry.npmjs.org/good/-/good-1.2.3.tgz',
          dependencies: { nested: { resolved: 'https://registry.npmjs.org/nested/-/nested-1.0.0.tgz' } },
        },
      },
    },
  }), true);
  assert.throws(() => validateDependencySources({
    lockfile: { dependencies: { good: { dependencies: { nested: { resolved: 'https://evil.example/nested.tgz' } } } } },
  }), /Non-registry lockfile source/);
});

test('registry proxy rejects normalized private and reserved addresses', () => {
  for (const ip of [
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '169.254.1.1', '192.0.2.1',
    '198.51.100.1', '192.168.1.1', '::1', 'fc00::1', '2001:db8::1', 'ff02::1',
  ]) {
    assert.equal(isSafeIP(ip), false, ip);
  }
  assert.equal(isSafeIP('8.8.8.8'), true);
});

test('workspace paths reject host and traversal forms', () => {
  assert.equal(validateWorkspacePath('src/index.js'), 'src/index.js');
  for (const value of ['/etc/passwd', '../escape', 'a/../../escape', 'C:\\temp\\x', 'src\\x', 'bad\0name']) {
    assert.throws(() => validateWorkspacePath(value));
  }
});

test('pre-aborted jobs fail before Docker startup', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await executeJob({ jobId: 'pre-aborted', deadline: Date.now() + 1000 }, { signal: controller.signal });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Cancelled/);
});

test('workspace symlink entries are rejected', async () => {
  const root = await mkdtemp(`${tmpdir()}/xfactor-path-`);
  try {
    await mkdir(`${root}/owned`);
    await symlink('/tmp', `${root}/owned/link`);
    await assert.rejects(() => validateOwnedPath('owned/link/secret', root), /Symlinks/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
