import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';
import { executeJob } from '../runtime.js';
import { createExecutionClient } from '../../backend/executionClient.js';

// This is deliberately opt-in: CI environments without Docker must report the unavailable
// runtime rather than silently replacing it with an in-process fake.
test('Task4 authenticated HTTP prepare/verify roundtrip', { skip: !process.env.EXECUTION_WORKER_INTEGRATION }, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-task4-http-'));
  const token = crypto.randomBytes(32).toString('hex');
  const testId = crypto.randomUUID();
  const store = new JobStore(path.join(tmp, 'jobs.json'));
  const server = createWorkerServer({ config: { EXECUTION_WORKER_TOKEN: token }, store, executeJob });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { EXECUTION_WORKER_TOKEN: token, EXECUTION_WORKER_URL: `http://127.0.0.1:${server.address().port}` };
  t.after(() => { server.close(); store.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const client = createExecutionClient(config);
  const contract = {};
  const contractHash = crypto.createHash('sha256').update('{}').digest('hex');
  const nonce = crypto.randomBytes(32).toString('hex');
  const base = { version: 1, projectId: 'task4-http', contractId: 'contract-task4', contractHash, revision: 1, artifactId: 'artifact-task4', contract, nonce, deadline: Date.now() + 300000 };
  const packageBytes = Buffer.from(JSON.stringify({ name: 'task4-fixture', version: '1.0.0', scripts: { build: "node -e \"process.stdout.write('build-ok')\"", test: 'node --test tests/server.test.cjs' } }));
  const prepared = await client.prepareDependencies({ ...base, jobId: `prepare-${testId}`, runId: 'run-prepare-task4', packageJsonBytes: packageBytes });
  assert.equal(prepared.status, 'completed', JSON.stringify(prepared));
  assert.equal(prepared.result?.runId, 'run-prepare-task4', JSON.stringify(prepared));
  assert.match(prepared.result.packageLockSha256, /^[a-f0-9]{64}$/);
  assert.ok(Buffer.from(prepared.result.packageLockBase64, 'base64').length);

  // A ZIP fixture is produced by the same worker boundary in the real integration run.
  const { default: JSZip } = await import('../../backend/node_modules/jszip/lib/index.js');
  const zip = new JSZip();
  zip.file('package.json', packageBytes);
  zip.file('package-lock.json', Buffer.from(prepared.result.packageLockBase64, 'base64'));
  zip.file('index.js', "export const task4 = true;\n");
  zip.file('README.md', '# Task4 fixture\n');
  zip.file('service-manifest.json', JSON.stringify({ services: { web: { command: 'node', args: ['server.cjs'], port: 3000, healthEndpoint: '/' } } }));
  zip.file('server.cjs', "require('node:http').createServer((req,res)=>res.end('OK')).listen(3000,'127.0.0.1');\n");
  zip.file('tests/server.test.cjs', "const test=require('node:test'); const assert=require('node:assert/strict'); test('declared service responds',async()=>{const response=await fetch('http://127.0.0.1:3000');assert.equal(response.status,200);assert.equal(await response.text(),'OK');});\n");
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const archiveHash = crypto.createHash('sha256').update(archive).digest('hex');
  const verified = await client.verifyArtifact({ ...base, jobId: `verify-${testId}`, runId: 'run-verify-task4', archiveBase64: archive.toString('base64'), inputSha256: archiveHash });
  if (verified.status !== 'completed') {
    const checks = (verified.result?.checks || []).map(check => `${check.name || check.gateName}:${check.status}:${check.reason || ''}`).join(', ');
    assert.fail(`verify failed: ${verified.result?.error || verified.error || 'unknown'}; checks=${checks}; failed=${JSON.stringify(verified.result?.checks?.filter(check => check.status === 'failed'))}`);
  }
  assert.equal(verified.result?.runId, 'run-verify-task4', JSON.stringify(verified));
  assert.equal(verified.result.contractHash, contractHash);
  assert.equal(verified.result.revision, 1);
  assert.equal(verified.result.artifactId, 'artifact-task4');
  assert.equal(verified.result.inputSha256, archiveHash);

  await assert.rejects(client.verifyArtifact({ ...base, jobId: 'tampered-task4', runId: 'run-tampered-task4', archiveBase64: archive.toString('base64'), inputSha256: crypto.createHash('sha256').update('tampered').digest('hex') }), /Worker error \(400\)/);
  await assert.rejects(client.verifyArtifact({ ...base, jobId: 'expired-task4', runId: 'run-expired-task4', deadline: Date.now() - 1, archiveBase64: archive.toString('base64'), inputSha256: archiveHash }), /Worker error \(400\)/);
});
