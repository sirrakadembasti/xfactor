import test from 'node:test';
import assert from 'node:assert';
import { executeJob } from '../runtime.js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

function assertOwnedResources(resource) {
  if (resource.type === 'network') {
    const network = JSON.parse(execSync(`docker network inspect ${resource.name}`))[0];
    assert.strictEqual(network.Internal, true);
    return;
  }
  const host = JSON.parse(execSync(`docker inspect ${resource.name}`))[0].HostConfig;
  assert.strictEqual(host.NanoCpus, 2e9);
  assert.strictEqual(host.Memory, 1073741824);
  assert.strictEqual(host.MemorySwap, 1073741824);
  assert.strictEqual(host.PidsLimit, 100);
  assert.strictEqual(host.ReadonlyRootfs, true);
  assert.deepStrictEqual(host.CapDrop, ['ALL']);
  assert.ok(host.SecurityOpt.includes('no-new-privileges=true'));
  assert.match(host.Tmpfs['/tmp'], /size=64m/);
  assert.match(host.Tmpfs['/workspace'], /size=1g/);
}

test('Isolated worker integration tests (requires Docker daemon)', async (t) => {
  // 1. Build the image as test setup deterministically
  try {
    const dockerfileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    
    // Check daemon
    execSync('docker info', { stdio: 'ignore' });
    
    execSync(`docker build -t xfactor-worker-runtime -f ${dockerfileDir}/Dockerfile ${dockerfileDir}`, {
      stdio: 'ignore'
    });
  } catch (e) {
    if (e.message && e.message.includes('docker info')) {
       // Just fail explicitly if daemon is absent during setup
       assert.fail('Integration test explicitly BLOCKED because Docker daemon is unavailable');
    } else {
       assert.fail(`Test setup failed to build image: ${e.message}`);
    }
  }

  await t.test('rejects forbidden dependency sources before starting Docker', async () => {
    const resources = [];
    const result = await executeJob({
      jobId: 'job-forbidden-dep',
      operation: 'prepare_dependencies',
      deadline: Date.now() + 60000,
      manifest: { dependencies: { escaped: 'https://evil.example/pkg.tgz' } },
    }, { signal: new AbortController().signal, onResource: resource => resources.push(resource) });
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /Forbidden dependency source/);
    assert.deepStrictEqual(resources, []);
  });

  await t.test('container path adapter rejects symlinked workspace segments', async () => {
    const resources = [];
    const result = await executeJob({
      jobId: 'job-container-symlink',
      operation: 'prepare_dependencies',
      deadline: Date.now() + 60000,
      manifest: { dependencies: {} },
      inputPaths: ['owned/link/secret'],
      installCode: "require('fs').mkdirSync('/workspace/owned', { recursive: true }); require('fs').symlinkSync('/tmp', '/workspace/owned/link');",
      buildCode: 'process.exit(0);',
    }, { signal: new AbortController().signal, onResource: resource => resources.push(resource) });
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /Symlinks|workspace path/i);
  });

  await t.test('startup deadline leaves no owned labelled resources after resource creation', async () => {
    const jobId = 'job-startup-deadline';
    const resources = [];
    const deadline = Date.now() + 10000;
    const waitForDeadline = new Int32Array(new SharedArrayBuffer(4));
    const result = await executeJob({ jobId, deadline, operation: 'verify_artifact' }, {
      signal: new AbortController().signal,
      onResource: (resource) => {
        resources.push(resource);
        if (resources.length === 1) {
          const remaining = Math.max(1, deadline - Date.now() + 100);
          Atomics.wait(waitForDeadline, 0, 0, remaining);
        }
      },
    });
    assert.ok(resources.length >= 1, 'deadline must occur after an owned resource is created');
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /deadline|timed[- ]out/i);
    const label = createHash('sha256').update(jobId).digest('hex');
    assert.strictEqual(execSync(`docker ps -a --filter "label=xfactor.owner=execution" --filter "label=xfactor.job=${label}" --format "{{.ID}}"`).toString().trim(), '');
    assert.strictEqual(execSync(`docker network ls --filter "label=xfactor.owner=execution" --filter "label=xfactor.job=${label}" --format "{{.ID}}"`).toString().trim(), '');
  });

  await t.test('install uses proxy network then transitions to fresh build network', async () => {
    const resources = [];
    const result = await executeJob({
      jobId: 'job-install-proxy',
      operation: 'prepare_dependencies',
      deadline: Date.now() + 120000,
      manifest: { dependencies: { 'is-number': '^7.0.0' } },
      installCode: "require('child_process').execFileSync('npm', ['view', 'is-number', 'version'], { stdio: 'inherit' })",
      buildCode: `
        const http = require('http');
        const service = http.createServer((req, res) => res.end('healthy'));
        service.listen(18080, '0.0.0.0', () => {
          http.get('http://127.0.0.1:18080/health', response => {
            let body = ''; response.on('data', chunk => body += chunk);
            response.on('end', () => { if (response.statusCode !== 200 || body !== 'healthy') process.exit(1); service.close(); });
          }).on('error', () => process.exit(1));
        });
        const { execFileSync } = require('child_process');
        for (const target of ['http://1.1.1.1', 'http://169.254.169.254', 'http://172.18.0.2:3128']) {
          try { execFileSync('curl', ['--max-time', '2', '-sS', target]); process.exit(1); } catch {}
        }
      `,
    }, { signal: new AbortController().signal, onResource: (resource) => resources.push(resource) });
    assert.strictEqual(result.status, 'success');
    assert.ok(resources.some((resource) => resource.type === 'proxy'));
  });

  await t.test('enforces cgroups (memory limit OOM)', async () => {
    const job = { jobId: 'job-cgroup-mem', deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    const resources = [];
    const onResource = (resource) => {
      resources.push(resource);
      assertOwnedResources(resource);
    };
    job.code = `
      const pages = [];
      const chunkSize = 64 * 1024 * 1024;
      while (true) {
        const chunk = Buffer.allocUnsafe(chunkSize);
        chunk.fill(0xA5);
        pages.push(chunk);
      }
    `;
    const result = await executeJob(job, { signal: abort.signal, onResource });
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /(?:137|OOM|out of memory|SIGKILL|code 1)/i);
    assert.doesNotMatch(result.error, /timeout/i);
    assert.ok(resources.some(({ type }) => type === 'container'));
  });

  await t.test('enforces no network/LAN/host/metadata reachability', async () => {
    const job = { jobId: 'job-net-deny', deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    
    // Try reaching cloud metadata or public internet
    job.code = `
      const { execSync } = require('child_process');
      try {
        execSync('curl --max-time 2 -s 169.254.169.254 || curl --max-time 2 -s 1.1.1.1');
        process.exit(1); // BAD: curl succeeded
      } catch {
        process.exit(0); // GOOD: curl failed
      }
    `;
    const result = await executeJob(job, { signal: abort.signal, onResource: () => {} });
    assert.strictEqual(result.status, 'success');
  });

  await t.test('enforces tmpfs/disk ceilings (1GB workspace)', async () => {
    const job = { jobId: 'job-disk-limit', deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    job.code = `
      const fs = require('fs');
      const { execFileSync } = require('child_process');
      const rows = execFileSync('df', ['-kP', '/workspace'], { encoding: 'utf8' })
        .trim().split(/\\r?\\n/).filter(Boolean);
      const columns = rows[rows.length - 1].trim().split(/\\s+/);
      if (Number(columns[1]) !== 1048576) process.exit(2);
      const fd = fs.openSync('/workspace/capacity-write', 'w');
      const block = Buffer.alloc(1024 * 1024, 0x5A);
      fs.writeSync(fd, block);
      fs.closeSync(fd);
    `;
    const result = await executeJob(job, { signal: abort.signal, onResource: assertOwnedResources });
    assert.strictEqual(result.status, 'success');
  });

  await t.test('enforces output ceilings and stream hashing', async () => {
    const job = { jobId: 'job-output-ceil', deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    
    // Output 2 MB of data
    job.code = `
      const buf = Buffer.alloc(1024 * 1024 * 2, 'a');
      process.stdout.write(buf);
    `;
    const result = await executeJob(job, { signal: abort.signal, onResource: () => {} });
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.result.stdout.length, 1024 * 1024);
    assert.strictEqual(result.result.stdoutTruncated, true);
    assert.strictEqual(result.result.stdoutBytes, 2 * 1024 * 1024);
    assert.strictEqual(result.result.stdoutSha256,
      createHash('sha256').update(Buffer.alloc(2 * 1024 * 1024, 'a')).digest('hex'));
  });

  await t.test('cancellation cleanup after resource creation and no residual labelled resources', async () => {
    const jobId = 'job-cancel-clean';
    const job = { jobId, deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    const resources = [];
    job.code = `setInterval(() => {}, 1000);`;
    const p = executeJob(job, {
      signal: abort.signal,
      onResource: (resource) => {
        resources.push(resource);
        if (resources.length === 1) abort.abort();
      },
    });

    const result = await p;
    assert.ok(resources.length >= 1, 'cancellation must occur after an owned resource is created');
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /Cancelled by user/);

    const jobLabel = createHash('sha256').update(jobId).digest('hex');
    const psOut = execSync(`docker ps -a --filter "label=xfactor.owner=execution" --filter "label=xfactor.job=${jobLabel}" --format "{{.ID}}"`);
    assert.strictEqual(psOut.toString().trim(), '', 'Residual owned container remains');

    const netOut = execSync(`docker network ls --filter "label=xfactor.owner=execution" --filter "label=xfactor.job=${jobLabel}" --format "{{.ID}}"`);
    assert.strictEqual(netOut.toString().trim(), '', 'Residual owned network remains');
  });
});
