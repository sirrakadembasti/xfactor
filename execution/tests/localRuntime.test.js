import test from 'node:test';
import assert from 'node:assert/strict';
import { executeLocalJob, probeLocalReadiness } from '../localRuntime.js';
import { selectedRuntime } from '../runtimeSelector.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('readiness preserves tool resolution error with only a fixed phase label', async () => {
  const failure = new Error('private operator tool path');
  const tools = { get playwright() { throw failure; } };
  await assert.rejects(probeLocalReadiness({ trustLocalCode: true, tools }), error => {
    assert.equal(error, failure);
    assert.equal(error.readinessPhase, 'tool_resolution');
    assert.equal(JSON.stringify(error), '{}');
    return true;
  });
});

test('readiness labels failed browser stages and rejects absent renderer proof', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-readiness-phases-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const phase of ['browser_launch', 'renderer_context', 'renderer_page', 'renderer_content', 'renderer_evaluate', 'browser_close', 'false_proof', 'success']) {
    const modulePath = path.join(root, `${phase}.mjs`);
    await fs.writeFile(modulePath, `export const failure = new Error('sensitive internal detail');
const phase = ${JSON.stringify(phase)};
const fail = name => { if (phase === name) throw failure; };
const page = { setContent: async () => fail('renderer_content'), evaluate: async () => { fail('renderer_evaluate'); return phase !== 'false_proof'; } };
const context = { newPage: async () => { fail('renderer_page'); return page; } };
const browser = { newContext: async () => { fail('renderer_context'); return context; }, close: async () => fail('browser_close') };
export const chromium = { launch: async () => { fail('browser_launch'); return browser; } };`);
    const fixture = await import(pathToFileURL(modulePath).href);
    const readiness = probeLocalReadiness({ trustLocalCode: true, tools: { playwright: modulePath, chromium: 'unused', versions: { playwright: 'fixture' } } });
    if (phase === 'success') {
      assert.deepEqual(await readiness, { runtime: 'local', executionProfile: 'local-trusted', osIsolation: false, isolation: false, executionCapacity: true, versions: { playwright: 'fixture' } });
      continue;
    }
    await assert.rejects(readiness, error => {
      assert.equal(error.readinessPhase, phase === 'false_proof' ? 'renderer_evaluate' : phase);
      if (phase === 'false_proof') assert.match(error.message, /no proof/);
      else assert.equal(error, fixture.failure);
      return true;
    });
  }
});

test('actual owned local jobs persist only operator npm cache and emit progress across scratch cleanup', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-local-runtime-cache-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const npm = path.join(root, 'npm-cli.js');
  await fs.writeFile(npm, `const fs=require('fs'),path=require('path');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
fs.writeFileSync('package-lock.json',JSON.stringify({name:p.name,version:p.version,lockfileVersion:3,packages:{'':{name:p.name,version:p.version}}}));
fs.writeFileSync(path.join(process.env.NPM_CONFIG_CACHE,'public-package-sentinel'),'public-package-bytes');console.log('lock generated');`);
  const workspaces = [], events = [];
  const options = { trustLocalCode: true, baseDirectory: path.join(root, 'workspaces'),
    tools: { node: process.execPath, npm, versions: {} },
    onResource: event => { if (event.type === 'workspace') workspaces.push(event.path); },
    onProgress: event => events.push(event) };
  for (let iteration = 0; iteration < 2; iteration++) {
    const result = await executeLocalJob({ operation: 'prepare_dependencies', runId: `cache-run-${iteration}`,
      deadline: Date.now() + 60000, npmCacheDirectory: path.join(root, 'untrusted-job-cache'),
      packageJsonBytes: Buffer.from(JSON.stringify({ name: 'public-fixture', version: '1.0.0' })) }, options);
    assert.equal(result.status, 'success', result.error);
    assert.equal(result.result.evidence.exitCode, 0);
    await assert.rejects(fs.stat(workspaces.at(-1)), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(root, 'xfactor-local-cache/npm/public-package-sentinel'), 'utf8'), 'public-package-bytes');
  }
  assert.notEqual(workspaces[0], workspaces[1]);
  assert.equal(events.filter(event => event.state === 'started' && event.phase === 'dependency_lockfile').length, 2);
  await assert.rejects(fs.stat(path.join(root, 'untrusted-job-cache')), { code: 'ENOENT' });
});
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
