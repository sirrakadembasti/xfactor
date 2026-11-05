import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyReviewedRequirementAssertions } from '../verification/requirementAssertionVerifier.js';
import { computeAssertionBindingHash, computeAssertionSourceHash } from '../contracts/requirementAssertionBindings.js';
import { authorizeLocalExecutionAdapter } from '../verification/sandboxRunner.js';

const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const stdout = 'TAP version 13\n# Subtest: doubles supplied input\nok 1 - doubles supplied input\n  ---\n  duration_ms: 0.8\n  type: \'test\'\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1.2\n';
function fixture(resultOverrides = {}) {
  const files = [{ path: 'subject.mjs', content: 'export const double = n => n * 2;' }, { path: 'subject.test.mjs', content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { double } from './subject.mjs';
test('doubles supplied input', () => {
  const actual = double(4);
  assert.equal(actual, 8);
});\n` }];
  const bindings = [{ requirementId: 'R-1', testFile: 'subject.test.mjs', testName: 'doubles supplied input', assertionLine: 6, expectation: 'Double the supplied numeric input.' }];
  const sourceHash = computeAssertionSourceHash(files), planHash = sha('plan'), bindingHash = computeAssertionBindingHash(bindings);
  const diskHashes = new Map(files.map(file => [file.path, sha(file.content)]));
  const calls = [];
  const adapter = { id: 'test-isolated-adapter', getCapabilities: () => ({ available: true, isolation: true }),
    async execute(request) { calls.push(request);
      if (request.args[0] === '-e' && request.args[1].includes('xfactor-source-fence-v1')) {
        const probe = JSON.parse(request.input);
        const matched = probe.files.every(file => diskHashes.get(file.path) === file.sha256);
        return { passed: matched, exitCode: matched ? 0 : 1, stdout: JSON.stringify({version:1,nonce:probe.nonce,sourceHash:probe.sourceHash,matched}),stderr:'',stdoutTruncated:false,stderrTruncated:false };
      }
      return { status: 'PASS', passed: true, exitCode: 0, stdout, stderr: '', timedOut: false, aborted: false, stdoutTruncated: false, stderrTruncated: false, ...resultOverrides }; } };
  return { files, review: { requirements: [{ id: 'R-1', statement: 'Double numeric input.', statementHash: sha('Double numeric input.'), mandatory: true }], bindings, sourceHash, planHash,
    reservations: ['reviewer', 'tester'].map(role => ({ role, reservationId: `${role}-reservation`, sourceHash, planHash, bindingHash, approved: true })) },
    job: { jobId: 'job-1', runId: 'run-1', artifactId: 'artifact-1', inputSha256: sha('exact artifact bytes'), contractId: 'contract-1' },
    adapter, calls, diskHashes, workspace: '/isolated-fixture', authenticateReservation: async reservation => reservation.reservationId.endsWith('-reservation') };
}

test('executes exact reviewed node:test command and binds authentic local execution to its own requirement evidence', async () => {
  const input = fixture();
  const result = await verifyReviewedRequirementAssertions(input);
  assert.equal(result.passed, true, result.issues.join('; '));
  assert.equal(input.calls.length, 3);
  const commandCall = input.calls.find(call => call.args.includes('--test'));
  assert.equal(commandCall.command, 'node');
  assert.deepEqual(commandCall.args, ['--test', '--test-reporter=tap', 'subject.test.mjs']);
  assert.equal(commandCall.workspace, '/isolated-fixture');
  assert.deepEqual(commandCall.env, {});
  const check = result.checks[0];
  assert.equal(check.name, 'requirement_assertions');
  assert.equal(check.applicability, 'MANDATORY');
  assert.equal(check.status, 'passed');
  assert.deepEqual(check.requirementIds, ['R-1']);
  assert.equal(check.evidence.producer, 'requirement-assertion-verifier');
  assert.equal(check.evidence.scope, 'reviewed-assertions');
  const receipt = check.evidence.assertionExecution;
  assert.equal(receipt.stdout, stdout);
  assert.equal(receipt.stdoutHash, sha(stdout));
  assert.equal(receipt.commandHash, sha(['node', '--test', '--test-reporter=tap', 'subject.test.mjs']));
  assert.equal(receipt.jobId, 'job-1');
  assert.equal(receipt.artifactHash, input.job.inputSha256);
  assert.equal(receipt.checkId, check.id);
  assert.equal(receipt.sourceHash, input.review.sourceHash);
  assert.equal(receipt.bindingHash, computeAssertionBindingHash(input.review.bindings));
  assert.ok(Date.parse(receipt.startedAt) <= Date.parse(receipt.completedAt));
  for (const forbidden of ['derived', 'aggregate', 'sourceCheckIds']) assert.equal(Object.hasOwn(check.evidence, forbidden), false);
});

test('worker remeasures reviewed source immediately before and after named assertions', async () => {
  const before = fixture(); before.diskHashes.set('subject.mjs', sha('changed after build'));
  assert.equal((await verifyReviewedRequirementAssertions(before)).passed, false);
  assert.equal(before.calls.some(call => call.args.includes('--test')), false);
  const after = fixture(), execute = after.adapter.execute;
  after.adapter.execute = async request => {
    const result = await execute(request);
    if (request.args.includes('--test')) after.diskHashes.set('subject.mjs', sha('changed during test'));
    return result;
  };
  assert.equal((await verifyReviewedRequirementAssertions(after)).passed, false);
});

test('missing or untrusted review, job identity, adapter and workspace block before execution', async () => {
  for (const mutate of [
    x => { delete x.authenticateReservation; },
    x => { x.authenticateReservation = () => false; },
    x => { x.authenticateReservation = () => ({ approved: true }); },
    x => { x.review.sourceHash = sha('other source'); },
    x => { x.review.bindings = []; },
    x => { delete x.job.inputSha256; },
    x => { delete x.job.jobId; },
    x => { delete x.workspace; },
    x => { delete x.adapter; },
  ]) {
    const input = fixture(); mutate(input);
    const result = await verifyReviewedRequirementAssertions(input);
    assert.equal(result.passed, false);
    assert.equal(result.checks[0].status, 'blocked');
    assert.deepEqual(result.checks[0].requirementIds, []);
    assert.equal(input.calls.length, 0);
  }
});

test('exit failure, cancellation, truncation and invalid runner observations never satisfy requirements', async () => {
  for (const overrides of [
    { exitCode: 1, passed: false, status: 'FAIL' },
    { exitCode: null },
    { timedOut: true },
    { aborted: true },
    { cancelled: true },
    { stdoutTruncated: true },
    { stderrTruncated: true },
    { stdout: stdout + 'x'.repeat(131073) },
    { stderr: 'x'.repeat(131073) },
    { passed: false },
    { status: 'BLOCKED' },
    { stdout: undefined },
  ]) {
    const input = fixture(overrides);
    const result = await verifyReviewedRequirementAssertions(input);
    assert.equal(result.passed, false, JSON.stringify(Object.keys(overrides)));
    assert.deepEqual(result.checks[0].requirementIds, []);
    assert.equal(input.calls.filter(call => call.args.includes('--test')).length, 1);
  }
});

test('exit zero with failed, missing, duplicate, skipped or unrelated TAP stays blocked', async () => {
  for (const output of [
    '',
    stdout.replace('ok 1 -', 'not ok 1 -'),
    stdout.replace('ok 1 - doubles supplied input', 'ok 1 - doubles supplied input # SKIP'),
    stdout.replace('ok 1 - doubles supplied input', 'ok 1 - unrelated case'),
    stdout.replace('1..1', 'ok 2 - doubles supplied input\n1..2'),
  ]) {
    const result = await verifyReviewedRequirementAssertions(fixture({ stdout: output }));
    assert.equal(result.passed, false);
    assert.equal(result.checks[0].status, 'blocked');
    assert.deepEqual(result.checks[0].requirementIds, []);
  }
});

test('adapter exceptions and pre-aborted signal fail closed without dummy fallback execution', async () => {
  const throwing = fixture(); throwing.adapter.execute = async () => { throw new Error('fixture adapter unavailable'); };
  const result = await verifyReviewedRequirementAssertions(throwing);
  assert.equal(result.passed, false);
  assert.equal(result.checks[0].status, 'blocked');
  const cancelled = fixture(); const controller = new AbortController(); controller.abort(); cancelled.signal = controller.signal;
  assert.equal((await verifyReviewedRequirementAssertions(cancelled)).passed, false);
  assert.equal(cancelled.calls.length, 0);
});

test('known secret output is not emitted or accepted with inconsistent redacted digests', async () => {
  const input = fixture({ stderr: 'known-test-secret' }); input.redactSecrets = ['known-test-secret'];
  const result = await verifyReviewedRequirementAssertions(input);
  assert.equal(result.passed, false);
  assert.equal(JSON.stringify(result).includes('known-test-secret'), false);
});

test('review payload cannot override authoritative worker source files', async () => {
  const input = fixture();
  input.review.files = structuredClone(input.files);
  input.files[0].content = 'export const double = () => 999;';
  const result = await verifyReviewedRequirementAssertions(input);
  assert.equal(result.passed, false);
  assert.equal(input.calls.length, 0);
});

test('adapter rejection with a claimed successful result cannot fabricate a pass', async () => {
  const input = fixture();
  input.adapter.execute = async () => { throw Object.assign(new Error('transport failed after claimed success'), { result: { passed: true, exitCode: 0, stdout, stderr: '', stdoutTruncated: false, stderrTruncated: false } }); };
  const result = await verifyReviewedRequirementAssertions(input);
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks[0].requirementIds, []);
});

test('adapter digest mismatch, absent truncation metadata and cancellation after execution block', async () => {
  for (const overrides of [
    { stdoutSha256: sha('different stream') },
    { stderrSha256: sha('different stream') },
    { stdoutBytes: 1 },
    { stdoutTruncated: undefined },
    { stderrTruncated: undefined },
    { signal: 'SIGTERM' },
    { executionObservation: { cancelled: true } },
  ]) assert.equal((await verifyReviewedRequirementAssertions(fixture(overrides))).passed, false);
  const input = fixture();
  const controller = new AbortController(); input.signal = controller.signal;
  const execute = input.adapter.execute;
  input.adapter.execute = async request => { const result = await execute(request); controller.abort(); return result; };
  assert.equal((await verifyReviewedRequirementAssertions(input)).passed, false);
});

test('reservation authentication cannot silently mutate its approval record', async () => {
  const input = fixture();
  input.authenticateReservation = reservation => { reservation.approved = false; return true; };
  assert.equal((await verifyReviewedRequirementAssertions(input)).passed, false);
  assert.equal(input.calls.length, 0);
});

test('fixed temporary ESM fixture produces actual Node TAP accepted by the verifier', async () => {
  // Explicit consent here covers only the fixed test fixture below. This adapter is
  // truthfully local-trusted, never advertised as OS-isolated or used for user code.
  const input = fixture();
  const directory = await mkdtemp(path.join(tmpdir(), 'xfactor-reviewed-assertions-fixture-'));
  const written = [];
  try {
    for (const file of input.files) {
      const destination = path.resolve(directory, file.path);
      assert.equal(path.dirname(destination), path.resolve(directory));
      await writeFile(destination, file.content); written.push(destination);
    }
    const capabilities = Object.freeze({ available: true, executionProfile: 'local-trusted', isolation: false, osIsolation: false });
    input.adapter = authorizeLocalExecutionAdapter({ id: 'fixed-local-node-fixture', getCapabilities: () => capabilities,
      async execute(request) {
        assert.equal(request.command, 'node');
        if (request.args[0] === '-e') assert.ok(request.args[1].includes('xfactor-source-fence-v1'));
        else assert.deepEqual(request.args, ['--test', '--test-reporter=tap', 'subject.test.mjs']);
        return new Promise((resolve, reject) => {
          const child = spawn(process.execPath, request.args, { cwd: directory, windowsHide: true, shell: false,
            env: Object.fromEntries(Object.entries({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...request.env }).filter(([, value]) => value !== undefined)),
            stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
          child.stdin.on('error', () => {});
          child.stdin.end(request.input || '');
          let out = '', err = '';
          child.stdout.on('data', data => { out += data.toString(); });
          child.stderr.on('data', data => { err += data.toString(); });
          child.on('error', reject);
          child.on('close', (exitCode, signal) => resolve({ passed: exitCode === 0 && !signal, exitCode, signal, stdout: out, stderr: err, stdoutTruncated: false, stderrTruncated: false }));
        });
      }
    }, { trustLocalCode: true });
    input.workspace = directory;
    const result = await verifyReviewedRequirementAssertions(input);
    assert.equal(result.passed, true, result.issues.join('; '));
    assert.deepEqual(result.checks[0].requirementIds, ['R-1']);
    assert.equal(result.checks[0].evidence.assertionExecution.stdout.includes('# tests 1'), true);
  } finally {
    for (const file of written) await unlink(file);
    await rmdir(directory);
  }
});

test('worker uses only the shared declared tsx command for reviewed TypeScript subjects', async () => {
  const input = fixture();
  input.files[0] = { path: 'subject.ts', content: 'export const double = (n: number): number => n * 2;' };
  input.files[1].content = input.files[1].content.replace('./subject.mjs', './subject.js');
  input.files.push({ path: 'package.json', content: '{"type":"module","dependencies":{"tsx":"4.20.0"}}' });
  input.review.sourceHash = computeAssertionSourceHash(input.files);
  input.diskHashes = new Map(input.files.map(file => [file.path, sha(file.content)]));
  const originalExecute = input.adapter.execute;
  input.adapter.execute = async request => {
    if (request.args[0] === '-e') {
      const probe = JSON.parse(request.input), matched = probe.files.every(file => input.diskHashes.get(file.path) === file.sha256);
      input.calls.push(request);
      return {passed:matched,exitCode:matched?0:1,stdout:JSON.stringify({version:1,nonce:probe.nonce,sourceHash:probe.sourceHash,matched}),stderr:'',stdoutTruncated:false,stderrTruncated:false};
    }
    return originalExecute(request);
  };
  input.review.reservations.forEach(reservation => { reservation.sourceHash = input.review.sourceHash; });
  const result = await verifyReviewedRequirementAssertions(input);
  assert.equal(result.passed, true, result.issues.join('; '));
  assert.deepEqual(input.calls.find(call => call.args.includes('--test')).args, ['--import', 'tsx', '--test', '--test-reporter=tap', 'subject.test.mjs']);
  assert.deepEqual(result.checks[0].evidence.assertionExecution.command, ['node', '--import', 'tsx', '--test', '--test-reporter=tap', 'subject.test.mjs']);
  assert.equal(result.checks[0].evidence.assertionExecution.commandHash, sha(['node', '--import', 'tsx', '--test', '--test-reporter=tap', 'subject.test.mjs']));
});
