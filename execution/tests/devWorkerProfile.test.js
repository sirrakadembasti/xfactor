import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDevWorker } from '../../scripts/dev-worker-profile.mjs';

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
