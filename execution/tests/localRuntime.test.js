import test from 'node:test';
import assert from 'node:assert/strict';
import { executeLocalJob, probeLocalReadiness } from '../localRuntime.js';
import { selectedRuntime } from '../runtimeSelector.js';
test('native execution fails closed without operator consent or for forbidden host paths', async () => {
  let resource = false;
  const options = { trustLocalCode: false, onResource: () => { resource = true; } };
  assert.equal((await executeLocalJob({}, options)).status, 'failed');
  await assert.rejects(probeLocalReadiness(options), /consent/);
  assert.match((await executeLocalJob({ operation: 'verify_artifact', runId: 'test', workspace: 'C:/user/data' }, { ...options, trustLocalCode: true })).error, /Host workspace/);
  assert.match((await executeLocalJob({ operation: 'prepare_dependencies', runId: 'test', deadline: 1 }, { ...options, trustLocalCode: true })).error, /deadline/);
  assert.equal(resource, false);
});
test('runtime selection defaults to Docker and rejects unknown modes instead of fallback', () => {
  const old = process.env.EXECUTION_WORKER_RUNTIME;
  try { delete process.env.EXECUTION_WORKER_RUNTIME; assert.equal(selectedRuntime(), 'docker'); process.env.EXECUTION_WORKER_RUNTIME = 'unknown'; assert.throws(selectedRuntime, /Unsupported/); }
  finally { if (old === undefined) delete process.env.EXECUTION_WORKER_RUNTIME; else process.env.EXECUTION_WORKER_RUNTIME = old; }
});
