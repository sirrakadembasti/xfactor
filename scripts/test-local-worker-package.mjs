import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { startLocalWorker } from './start-local-worker.mjs';
import { validateManifest } from './local-worker-tools.mjs';
import { createExecutionClient } from '../backend/executionClient.js';
import { localAppFixture } from '../execution/tests/fixtures/localAppFixture.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identityFields = ['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close(); await once(server, 'close');
  return port;
}
function assertIdentity(result, job) {
  for (const key of identityFields) {
    assert.equal(result[key], job[key], key);
    assert.equal(result.result[key], job[key], `result.${key}`);
  }
}
async function assertActiveShutdown({ worker, url, token, appPort, workspaceRoot, root, activeJob, archive, signal }) {
  const submitted = await fetch(`${url}/v1/jobs`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...activeJob, archiveBase64: archive.toString('base64') }), signal });
  assert.equal(submitted.status, 200, 'Active shutdown job accepted');
  await submitted.body?.cancel();
  let live = false;
  const activeDeadline = Date.now() + 240000;
  while (Date.now() < activeDeadline && !signal.aborted) {
    try { live = (await fetch(`http://127.0.0.1:${appPort}/health`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (live) break;
    await pause(500);
  }
  assert.equal(live, true, 'Shutdown job must own an actual live service before shutdown');
  await worker.stopLocalWorker();
  const safeSignal = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGBREAK', 'SIGABRT'].includes(worker.signalCode) ? worker.signalCode : null;
  assert.equal(worker.exitCode, 0, `Cooperative worker shutdown completed: ${JSON.stringify({ exitCode: worker.exitCode, signalCode: safeSignal })}`);
  const stopped = net.createServer();
  stopped.listen(appPort, '127.0.0.1'); await once(stopped, 'listening'); stopped.close(); await once(stopped, 'close');
  assert.deepEqual((await fs.readdir(workspaceRoot)).filter(name => name.startsWith('job-')), [], 'Active shutdown removes owned job workspace');
  await validateManifest(root);
}
export async function testLocalWorkerPackage({ bundle, readinessOnly = false, shutdownOnly = false } = {}) {
  if (!bundle) throw new Error('Specify --bundle <packaged-directory>.');
  if (readinessOnly && shutdownOnly) throw new Error('Choose only one focused acceptance mode.');
  const root = path.resolve(bundle);
  // startLocalWorker performs the full integrity validation before spawning.
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const node = manifest.toolPaths?.XFACTOR_LOCAL_NODE;
  if (!node || !manifest.files[node]) throw new Error('Missing bundled Node tool path.');
  await fs.mkdir(path.join(repo, '.tmp'), { recursive: true });
  const state = await fs.mkdtemp(path.join(repo, '.tmp/local-worker-package-test-'));
  const token = crypto.randomBytes(32).toString('hex');
  const port = await freePort(), appPort = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Standalone package test deadline')), 15 * 60_000);
  let output = '';
  let worker, exit;
  try {
    worker = await startLocalWorker({
      bundle: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, EXECUTION_WORKER_TOKEN: token, EXECUTION_WORKER_PORT: String(port), XFACTOR_LOCAL_WORKER_DATA: state }
    });
    exit = once(worker, 'exit');
    worker.stdout.on('data', bytes => { output = (output + bytes.toString()).slice(-32000); });
    worker.stderr.on('data', bytes => { output = (output + bytes.toString()).slice(-32000); });
    let ready;
    const startupDeadline = Date.now() + 240000;
    while (Date.now() < startupDeadline && !controller.signal.aborted) {
      if (worker.exitCode !== null || worker.signalCode !== null) throw new Error(`Bundled worker exited before readiness: ${output.replaceAll(token, '[redacted]')}`);
      if (!output.includes('Listening on')) { await pause(500); continue; }
      const unauthorized = await fetch(`${url}/readyz`, { signal: AbortSignal.timeout(120000) });
      assert.equal(unauthorized.status, 401, 'Worker endpoint requires token');
      const response = await fetch(`${url}/readyz`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) });
      ready = await response.json();
      assert.equal(response.status, 200, JSON.stringify(ready));
      break;
    }
    assert.equal(ready?.executionCapacity, true, `No standalone readiness: ${output.replaceAll(token, '[redacted]')}`);
    assert.equal(ready.executionProfile, 'local-trusted');
    assert.equal(ready.osIsolation, false);
    assert.equal(ready.isolation, false);
    console.log(JSON.stringify({ stage: 'standalone-readiness', ...ready }));
    if (readinessOnly) return { ready };
    const fixture = localAppFixture(appPort);
    const id = crypto.randomUUID();
    const base = { version: 1, projectId: `package-${id}`, contractId: 'package-contract', contractHash: digest(JSON.stringify(fixture.contract)), revision: 1, artifactId: 'package-artifact', contract: fixture.contract };
    const job = (name, operation, bytes) => ({ ...base, jobId: `${name}-${id}`, operation, runId: `run-${name}-${id}`, nonce: crypto.randomBytes(32).toString('hex'), deadline: Date.now() + 600000, inputSha256: digest(bytes) });
    const client = createExecutionClient({ EXECUTION_WORKER_TOKEN: token, EXECUTION_WORKER_URL: url });
    const prepareJob = job('prepare', 'prepare_dependencies', fixture.packageJsonBytes);
    const prepared = await client.prepareDependencies({ ...prepareJob, packageJsonBytes: fixture.packageJsonBytes }, { signal: controller.signal });
    assert.equal(prepared.status, 'completed', JSON.stringify(prepared)); assertIdentity(prepared, prepareJob);
    const lock = Buffer.from(prepared.result.packageLockBase64, 'base64');
    assert.equal(digest(lock), prepared.result.packageLockSha256);
    assert.equal(prepared.result.evidence.exitCode, 0);
    const archive = await fixture.archive(lock), verifyJob = job('verify', 'verify_artifact', archive);
    const workspaceRoot = path.join(state, 'xfactor-local-workspaces');
    const activeShutdown = () => assertActiveShutdown({ worker, url, token, appPort, workspaceRoot, root,
      activeJob: job('shutdown-active', 'verify_artifact', archive), archive, signal: controller.signal });
    if (shutdownOnly) {
      await activeShutdown();
      const result = { ready, activeShutdown: true, bundleIntegrityAfterJobs: true, prepareStatus: prepared.status,
        packageLockSha256: prepared.result.packageLockSha256, archiveSha256: digest(archive) };
      await fs.writeFile(path.join(repo, '.tmp/local-worker-package-shutdown-result.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ stage: 'standalone-active-shutdown', passed: true, activeShutdown: true, prepareStatus: prepared.status }));
      return result;
    }
    const verified = await client.verifyArtifact({ ...verifyJob, archiveBase64: archive.toString('base64') }, { signal: controller.signal });
    await fs.writeFile(path.join(repo, '.tmp/local-worker-package-verify.json'), JSON.stringify(verified, null, 2));
    assert.equal(verified.status, 'completed', JSON.stringify({ status: verified.status, failedChecks: verified.result?.checks?.filter(check => check.status === 'failed'), error: verified.result?.error })); assertIdentity(verified, verifyJob);
    assert.equal(verified.result.passed, true, JSON.stringify(verified));
    assert.equal(verified.result.archiveSha256, digest(archive));
    assert.equal(verified.result.runtime.executionProfile, 'local-trusted'); assert.equal(verified.result.runtime.osIsolation, false);
    const checks = verified.result.checks;
    for (const name of ['package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'framework_build', 'readme_build', 'readme_check', 'manifest_presence', 'service_definitions', 'port_uniqueness', 'management_demo_seed', 'service_spawn', 'smoke_liveness_probe', 'management_role_login', 'prisma_schema_presence', 'database_connectivity', 'database_write_capability', 'api_role_create_allowed', 'api_role_create_denied', 'api_anonymous_read_policy', 'api_role_read_allowed', 'database_mutation_assertion', 'browser_page_load', 'browser_journey_steps', 'browser_management_interaction', 'test_script_presence', 'test_suite_execution', 'smoke_gate']) assert.ok(checks.some(check => check.name === name && check.status === 'passed'), `Missing PASS ${name}: ${JSON.stringify(verified)}`);
    for (const check of checks) {
      assert.equal(check.runId, verifyJob.runId);
      // Worker protocol carries no requirement scope: traceability is delegated to the backend, never passed.
      const delegatedTrace = check.name === 'requirement_traceability' && check.status === 'skipped'
        && check.evidence?.scope === 'backend-authoritative' && check.evidence.coveredIds?.length === 0
        && check.evidence.issues?.length === 1 && check.evidence.issues[0].code === 'missing-authoritative-scope';
      assert.ok(check.status === 'passed' || delegatedTrace || (check.name === 'typecheck' && check.status === 'skipped'), JSON.stringify(check));
    }
    assert.equal(checks.filter(check => check.name === 'management_role_login').length, 2);
    const browser = checks.find(check => check.name === 'browser_management_interaction');
    assert.equal(browser.evidence.journeyCount, 4);
    assert.deepEqual(browser.evidence.journeys.map(j => `${j.role}:${j.kind}:${j.passed}`).sort(), ['manager:negative:true', 'manager:positive:true', 'viewer:negative:true', 'viewer:positive:true']);
    assert.match(checks.find(check => check.name === 'test_suite_execution').stdout, /# tests 2/);
    await assert.rejects(client.verifyArtifact({ ...job('tampered', 'verify_artifact', archive), inputSha256: digest('tampered'), archiveBase64: archive.toString('base64') }), /Worker error \(400\).*Digest mismatch/);
    assert.deepEqual((await fs.readdir(workspaceRoot)).filter(name => name.startsWith('job-')), [], 'No owned job workspace remains');
    const service = net.createServer();
    service.listen(appPort, '127.0.0.1'); await once(service, 'listening'); service.close(); await once(service, 'close');
    await activeShutdown();
    const result = { ready, activeShutdown: true, bundleIntegrityAfterJobs: true, prepareStatus: prepared.status, verifyStatus: verified.status, checks: checks.map(({ name, status }) => ({ name, status })), browserJourneys: browser.evidence.journeys, packageLockSha256: prepared.result.packageLockSha256, archiveSha256: verified.result.archiveSha256 };
    await fs.writeFile(path.join(repo, '.tmp/local-worker-package-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ stage: 'standalone-roundtrip', passed: true, activeShutdown: true, prepareStatus: prepared.status, verifyStatus: verified.status, checks: checks.length, browserJourneys: browser.evidence.journeyCount }));
    return result;
  } finally {
    clearTimeout(timer); controller.abort();
    if (worker) {
      await worker.stopLocalWorker();
      await exit;
      process.exitCode = 0;
    }
    await fs.rm(state, { recursive: true, force: true });
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const index = process.argv.indexOf('--bundle');
  testLocalWorkerPackage({ bundle: index < 0 ? undefined : process.argv[index + 1], readinessOnly: process.argv.includes('--readiness-only'), shutdownOnly: process.argv.includes('--shutdown-only') }).catch(error => { console.error(`Bundle verification failed: ${error.message}`); process.exitCode = 1; });
}
