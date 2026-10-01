import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('production worker refuses to start without an operator token', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production', EXECUTION_WORKER_TOKEN: '', WORKER_TOKEN: '' },
    timeout: 60000, encoding: 'utf8', windowsHide: true
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr || 'Worker unexpectedly started');
  assert.match(result.stderr, /EXECUTION_WORKER_TOKEN/);
});
