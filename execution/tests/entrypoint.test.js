import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../entrypoint.js', import.meta.url), 'utf8');

// Evaluate the actual container entrypoint without launching any child process,
// touching a workspace, or asking Docker to execute application code.
function executeEntrypoint(env) {
  const launches = [], logs = [], exits = [];
  const context = {
    require(name) {
      if (name === 'node:child_process') return { spawnSync(executable, args, options) {
        launches.push({ executable, args: [...args], options });
        return { status: 0, error: null };
      } };
      if (name === 'node:fs') return Object.freeze({});
      if (name === 'node:path') return path.posix;
      throw new Error('Unexpected entrypoint dependency: ' + name);
    },
    process: { argv: ['node', '/opt/worker/entrypoint.js', 'node', 'server.js'], env: { ...env },
      exit(code) { exits.push(code); } },
    console: { log(...values) { logs.push(values.join(' ')); }, error(...values) { logs.push(values.join(' ')); } },
    setInterval() { throw new Error('Service keepalive must not run in this fixture.'); }
  };
  vm.runInNewContext(source, context, { filename: 'execution/entrypoint.js', timeout: 1000 });
  assert.equal(launches.length, 1);
  assert.deepEqual(exits, [0]);
  return { launch: launches[0], logs };
}

test('actual container entrypoint preserves validated service PORT and ephemeral JWT secret through spawnSync', () => {
  const secret = 'ab'.repeat(32);
  const { launch } = executeEntrypoint({ PORT: '3001', JWT_SECRET: secret, NODE_ENV: 'test' });
  assert.equal(launch.executable, 'node');
  assert.deepEqual(launch.args, ['server.js']);
  assert.equal(launch.options.stdio, 'inherit');
  assert.deepEqual({ PORT: launch.options.env.PORT, JWT_SECRET: launch.options.env.JWT_SECRET },
    { PORT: '3001', JWT_SECRET: secret });
  assert.equal(launch.options.env.NODE_ENV, 'test');
});

test('actual container entrypoint drops platform credentials and does not print environment secrets', () => {
  const credentials = {
    EXECUTION_WORKER_TOKEN: 'fixture-platform-worker-token',
    GOOGLE_API_KEY: 'fixture-google-key',
    OPENAI_API_KEY: 'fixture-openai-key',
    DATABASE_PASSWORD: 'fixture-database-password'
  };
  const { launch, logs } = executeEntrypoint({ NODE_ENV: 'test', ...credentials });
  assert.equal(launch.options.env.NODE_ENV, 'test');
  for (const [key, value] of Object.entries(credentials)) {
    assert.equal(launch.options.env[key], undefined, key + ' must not reach the application process');
    assert.ok(!logs.join('\n').includes(value), key + ' must not appear in entrypoint diagnostics');
  }
});

test('actual container entrypoint rejects invalid service port and non-ephemeral JWT values without logging them', () => {
  for (const port of ['1023', '65536', '3001;echo fixture', 'not-a-port', '3001\n']) {
    for (const secret of ['fixture-private-secret', 'g'.repeat(64), 'AB'.repeat(32)]) {
      const { launch, logs } = executeEntrypoint({ PORT: port, JWT_SECRET: secret });
      assert.equal(launch.options.env.PORT, undefined);
      assert.equal(launch.options.env.JWT_SECRET, undefined);
      assert.ok(!logs.join('\n').includes(secret));
    }
  }
});
