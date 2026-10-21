import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDevWorker } from '../../scripts/dev-worker-profile.mjs';
import { verificationJobTimeoutMs } from '../../backend/verification/verificationBudget.js';

test('local development budgets full verification at 25 minutes; Docker retains 15 minute default', () => {
  const local = {}; configureDevWorker(local, []);
  assert.equal(verificationJobTimeoutMs(local), 1500000);
  const docker = {}; configureDevWorker(docker, ['--docker-worker']);
  assert.equal(verificationJobTimeoutMs(docker), 900000);
  for (const flags of [[], ['--docker-worker']]) {
    const env = { VERIFICATION_JOB_TIMEOUT_MS: '120000' };
    configureDevWorker(env, flags);
    assert.equal(env.VERIFICATION_JOB_TIMEOUT_MS, '120000');
    assert.throws(() => configureDevWorker({ VERIFICATION_JOB_TIMEOUT_MS: '1500001' }, flags), /VERIFICATION_JOB_TIMEOUT_MS/);
  }
});

test('normal development launches native quality jobs even with a stale Docker environment', () => {
  const env = { EXECUTION_WORKER_RUNTIME: 'docker', WORKER_TOKEN: 'operator-secret' };
  configureDevWorker(env, []);
  assert.equal(env.EXECUTION_WORKER_RUNTIME, 'local');
  assert.equal(env.EXECUTION_WORKER_TRUST_LOCAL_CODE, '1');
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.EXECUTION_WORKER_TOKEN, 'operator-secret');
});

test('explicit Docker launch overrides a stale local profile', () => {
  const env = { EXECUTION_WORKER_RUNTIME: 'local', EXECUTION_WORKER_TRUST_LOCAL_CODE: '1' };
  configureDevWorker(env, ['--docker-worker']);
  assert.equal(env.EXECUTION_WORKER_RUNTIME, 'docker');
  assert.equal(env.EXECUTION_WORKER_TRUST_LOCAL_CODE, undefined);
});

test('local alias generates a shared token without replacing an operator token', () => {
  const generated = {};
  configureDevWorker(generated, ['--local-worker']);
  assert.match(generated.EXECUTION_WORKER_TOKEN, /^[a-f0-9]{64}$/);
  const configured = { EXECUTION_WORKER_TOKEN: 'configured-secret' };
  configureDevWorker(configured, []);
  assert.equal(configured.EXECUTION_WORKER_TOKEN, 'configured-secret');
});

test('conflicting runtime flags fail before launch', () => {
  const env = {};
  assert.throws(() => configureDevWorker(env, ['--local-worker', '--docker-worker']), /Conflicting/);
  assert.deepEqual(env, {});
});

test('local development readiness deadline allows the bounded Chromium renderer probe to finish', () => {
  for (const args of [[], ['--local-worker']]) {
    const env = {};
    configureDevWorker(env, args);
    assert.equal(env.READINESS_WORKER_TIMEOUT_MS, '35000');
    assert.ok(Number(env.READINESS_WORKER_TIMEOUT_MS) > 30000, 'Outer HTTP deadline must exceed the worker renderer deadline');
  }
});

test('explicit readiness deadlines are preserved and Docker development keeps its backend default', () => {
  const configured = { READINESS_WORKER_TIMEOUT_MS: '12345' };
  configureDevWorker(configured, []);
  assert.equal(configured.READINESS_WORKER_TIMEOUT_MS, '12345');
  const docker = {};
  configureDevWorker(docker, ['--docker-worker']);
  assert.equal(docker.READINESS_WORKER_TIMEOUT_MS, undefined);
  const configuredDocker = { READINESS_WORKER_TIMEOUT_MS: '4567' };
  configureDevWorker(configuredDocker, ['--docker-worker']);
  assert.equal(configuredDocker.READINESS_WORKER_TIMEOUT_MS, '4567');
});
