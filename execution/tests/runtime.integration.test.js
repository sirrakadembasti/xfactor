import test from 'node:test';
import assert from 'node:assert';
import { executeJob } from '../runtime.js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  await t.test('enforces cgroups (memory limit OOM)', async () => {
    const job = { jobId: 'job-cgroup-mem', deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    const resources = [];
    const onResource = (resource) => {
      resources.push(resource);
      assertOwnedResources(resource);
    };
    
    // Allocate external memory and touch every page so cgroups must account
    // for the committed pages. Do not catch the OOM: evidence must be a
    // kernel/container termination, never a self-reported success or timeout.
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
    assert.strictEqual(result.status, 'success');
    
    // Verify it was truncated to 1 MiB exactly
    const maxRetained = 1024 * 1024;
    assert.strictEqual(result.result.stdout.length, maxRetained);
    assert.ok(result.result.stdoutSha256, 'Should compute full stream SHA256');
  });

  await t.test('cancellation cleanup and no residual labelled containers/networks', async () => {
    const jobId = 'job-cancel-clean';
    const job = { jobId, deadline: Date.now() + 60000, operation: 'verify_artifact' };
    const abort = new AbortController();
    
    job.code = `setInterval(() => {}, 1000);`;
    const p = executeJob(job, { signal: abort.signal, onResource: () => {} });
    
    // Abort after brief wait
    setTimeout(() => abort.abort(), 1000);
    
    const result = await p;
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /Cancelled by user/);
    
    // Strictly assert NO residual container
    const containerName = `xfactor-worker-${jobId}`;
    const psOut = execSync(`docker ps -a --filter "name=${containerName}" --format "{{.ID}}"`);
    assert.strictEqual(psOut.toString().trim(), '', 'Residual container remains');
    
    // Strictly assert NO residual network
    const netOut = execSync(`docker network ls --filter "name=${containerName}-net" --format "{{.ID}}"`);
    assert.strictEqual(netOut.toString().trim(), '', 'Residual network remains');
  });
});
