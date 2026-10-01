import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createWorkerServer } from '../server.js';
import { JobStore } from '../jobStore.js';
import { createExecutionClient } from '../../backend/executionClient.js';
import { localAppFixture } from './fixtures/localAppFixture.js';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identityFields = ['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'];
async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
async function assertServiceStopped(port) {
  const listener = net.createServer();
  try {
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolve); });
  } finally {
    if (listener.listening) await new Promise(resolve => listener.close(resolve));
  }
}

test('native trusted worker authenticates HTTP prepare/verify and proves real SQLite and Chromium role journeys', {
  skip: process.env.EXECUTION_WORKER_LOCAL_INTEGRATION !== '1', timeout: 600000
}, async t => {
  // Dynamic import lets ordinary test runs explicitly skip a missing native runtime.
  const { executeLocalJob, probeLocalReadiness } = await import('../localRuntime.js');
  const owned = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-native-roundtrip-'));
  const workspaces = path.join(owned, 'workspaces'); fs.mkdirSync(workspaces);
  const store = new JobStore(path.join(owned, 'jobs.json'));
  const resources = [];
  const oldPath = process.env.PATH;
  const sentinel = path.join(owned, 'sentinel'); fs.mkdirSync(sentinel);
  const dockerMarker = path.join(owned, 'docker-called');
  fs.writeFileSync(path.join(sentinel, 'docker.cmd'), `@echo off\r\necho called>"${dockerMarker}"\r\nexit /b 97\r\n`);
  fs.writeFileSync(path.join(sentinel, 'docker'), `#!/bin/sh\nprintf called > '${dockerMarker.replaceAll("'", "'\\''")}'\nexit 97\n`, { mode: 0o755 });
  process.env.PATH = sentinel + path.delimiter + oldPath;
  const token = crypto.randomBytes(32).toString('hex');
  const server = createWorkerServer({ config: { EXECUTION_WORKER_TOKEN: token }, store,
    executeJob: (job, options) => executeLocalJob(job, { ...options, trustLocalCode: true, baseDirectory: workspaces, onResource: resource => resources.push(resource) }),
    probeRuntime: () => probeLocalReadiness({ trustLocalCode: true }) });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const client = createExecutionClient({ EXECUTION_WORKER_TOKEN: token, EXECUTION_WORKER_URL: url });
    assert.equal((await fetch(`${url}/readyz`)).status, 401);
    const ready = await probeLocalReadiness({ trustLocalCode: true });
    assert.equal(ready.executionProfile, 'local-trusted'); assert.equal(ready.osIsolation, false);
    assert.equal((await client.getCapabilities()).executionCapacity, true);
    const applicationPort = await availablePort();
    const fixture = localAppFixture(applicationPort);
    const id = crypto.randomUUID();
    const base = { version: 1, projectId: `native-${id}`, contractId: 'native-contract', contractHash: digest(JSON.stringify(fixture.contract)), revision: 1, artifactId: 'native-artifact', contract: fixture.contract };
    const job = (name, operation, bytes) => ({ ...base, jobId: `${name}-${id}`, operation, runId: `run-${name}-${id}`, nonce: crypto.randomBytes(32).toString('hex'), deadline: Date.now() + 300000, inputSha256: digest(bytes) });
    const assertIdentity = (result, expected) => { for (const field of identityFields) { assert.equal(result[field], expected[field], field); assert.equal(result.result[field], expected[field], `result.${field}`); } };
    const prepareJob = job('prepare', 'prepare_dependencies', fixture.packageJsonBytes);
    const prepared = await client.prepareDependencies({ ...prepareJob, packageJsonBytes: fixture.packageJsonBytes }, { signal: t.signal });
    assert.equal(prepared.status, 'completed', JSON.stringify(prepared)); assertIdentity(prepared, prepareJob);
    const lockBytes = Buffer.from(prepared.result.packageLockBase64, 'base64');
    assert.equal(digest(lockBytes), prepared.result.packageLockSha256);
    assert.equal(JSON.parse(lockBytes).name, 'xfactor-native-role-fixture');
    assert.equal(prepared.result.evidence.exitCode, 0);
    assert.match(prepared.result.evidence.command, /^npm install --package-lock-only --ignore-scripts/);
    const archive = await fixture.archive(lockBytes);
    const verifyJob = job('verify', 'verify_artifact', archive);
    const verified = await client.verifyArtifact({ ...verifyJob, archiveBase64: archive.toString('base64') }, { signal: t.signal });
    const detail = JSON.stringify(verified);
    assert.equal(verified.status, 'completed', detail); assertIdentity(verified, verifyJob);
    assert.equal(verified.result.passed, true, detail);
    assert.equal(verified.result.archiveSha256, digest(archive));
    assert.equal(verified.result.runtime.executionProfile, 'local-trusted'); assert.equal(verified.result.runtime.osIsolation, false);
    const checks = verified.result.checks;
    const required = ['package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'framework_build', 'readme_build', 'readme_check', 'manifest_presence', 'service_definitions', 'port_uniqueness', 'management_demo_seed', 'service_spawn', 'smoke_liveness_probe', 'management_role_login', 'prisma_schema_presence', 'database_connectivity', 'database_write_capability', 'api_role_create_allowed', 'api_role_create_denied', 'api_anonymous_read_policy', 'api_role_read_allowed', 'database_mutation_assertion', 'browser_page_load', 'browser_journey_steps', 'browser_management_interaction', 'test_script_presence', 'test_suite_execution', 'smoke_gate'];
    for (const name of required) assert.ok(checks.some(check => check.name === name && check.status === 'passed'), `Missing PASS ${name}: ${detail}`);
    for (const check of checks) {
      assert.equal(check.runId, verifyJob.runId);
      assert.ok(check.status === 'passed' || (check.name === 'typecheck' && check.status === 'skipped' && /no typescript|tsconfig|not.*typescript/i.test(check.reason)), `Unexpected check ${JSON.stringify(check)}`);
    }
    assert.equal(checks.filter(check => check.name === 'management_role_login').length, 2);
    const browser = checks.find(check => check.name === 'browser_management_interaction');
    assert.equal(browser.evidence.journeyCount, 4);
    assert.deepEqual(browser.evidence.journeys.map(j => `${j.role}:${j.kind}:${j.passed}`).sort(), ['manager:negative:true', 'manager:positive:true', 'viewer:negative:true', 'viewer:positive:true']);
    const testProof = checks.find(check => check.name === 'test_suite_execution');
    assert.match(testProof.stdout, /# tests 2/); assert.match(testProof.stdout, /# fail 0/);
    await assertServiceStopped(applicationPort);
    await assert.rejects(client.verifyArtifact({ ...job('tampered', 'verify_artifact', archive), inputSha256: digest('tampered'), archiveBase64: archive.toString('base64') }), /Worker error \(400\).*Digest mismatch/);
    await assert.rejects(client.verifyArtifact({ ...job('expired', 'verify_artifact', archive), deadline: Date.now() - 1, archiveBase64: archive.toString('base64') }), /Worker error \(400\).*deadline/);
    for (const testMode of ['failing', 'zero']) {
      await t.test(`${testMode} real test suite cannot produce completed`, async () => {
        const badPort = await availablePort();
        const bad = localAppFixture(badPort, { testMode });
        const badArchive = await bad.archive(lockBytes);
        const badJob = { ...job(testMode, 'verify_artifact', badArchive), contract: bad.contract, contractHash: digest(JSON.stringify(bad.contract)) };
        const failed = await client.verifyArtifact({ ...badJob, archiveBase64: badArchive.toString('base64') }, { signal: t.signal });
        assert.equal(failed.status, 'failed', JSON.stringify(failed)); assertIdentity(failed, badJob);
        assert.equal(failed.result.passed, false);
        assert.equal(failed.result.checks.find(check => check.name === 'test_suite_execution')?.status, 'failed', JSON.stringify(failed));
        await assertServiceStopped(badPort);
      });
    }
    assert.ok(resources.length > 0, 'Native execution must report owned resources');
    assert.ok(resources.every(resource => resource.type !== 'container' && resource.type !== 'network'), JSON.stringify(resources));
    assert.deepEqual(fs.readdirSync(workspaces), [], 'No owned job workspace remains');
    assert.equal(fs.existsSync(dockerMarker), false, 'Docker sentinel was called');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    store.close(); process.env.PATH = oldPath;
    fs.rmSync(owned, { recursive: true, force: true });
  }
});
