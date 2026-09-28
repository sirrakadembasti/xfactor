import test from 'node:test';
import assert from 'node:assert';
import JSZip from '../../backend/node_modules/jszip/lib/index.js';
import { executeJob } from '../runtime.js';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const runId = name => `integration-${name}`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function archive(files, options = {}) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'STORE', ...options });
}
async function artifact(name, scripts = {}, extra = {}) {
  const manifest = { name, version: '1.0.0', private: true, scripts, ...extra };
  const packageJson = Buffer.from(JSON.stringify(manifest) + '\n');
  const packageLock = Buffer.from(JSON.stringify({ name, version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name, version: '1.0.0', private: true, scripts } } }) + '\n');
  const zip = await archive({ 'package.json': packageJson, 'package-lock.json': packageLock, 'README.md': '# fixture\n', 'src/index.js': 'export default 1;\n' });
  return { packageJson, zip, archiveBase64: zip.toString('base64'), inputSha256: digest(zip) };
}
function assertOwnedResources(resource) {
  if (resource.type === 'network') return;
  const host = JSON.parse(execFileSync('docker', ['inspect', resource.name], { encoding: 'utf8' }))[0].HostConfig;
  assert.strictEqual(host.NanoCpus, 2e9);
  assert.strictEqual(host.Memory, 1073741824);
  assert.strictEqual(host.MemorySwap, 1073741824);
  assert.strictEqual(host.PidsLimit, 100);
  assert.strictEqual(host.ReadonlyRootfs, true);
  assert.deepStrictEqual(host.CapDrop, ['ALL']);
  assert.ok(host.SecurityOpt.includes('no-new-privileges=true'));
  assert.match(host.Tmpfs['/tmp'], /size=64m/);
  assert.match(host.Tmpfs['/workspace'], /size=1g/);
}

const command = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('Isolated worker protocol integration (requires Docker daemon)', async (t) => {
  const dockerfileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try { command('info'); }
  catch (error) { assert.fail(`Integration test explicitly BLOCKED because Docker daemon is unavailable: ${error.message}`); }
  try { command('build', '-t', 'xfactor-worker-runtime', '-f', path.join(dockerfileDir, 'Dockerfile'), dockerfileDir); }
  catch (error) { assert.fail(`Integration image build failed: ${error.stderr || error.message}`); }

  await t.test('prepare returns exact package bytes, lock digest, and caller runId through registry proxy', async () => {
    const fixture = await artifact('prepare-fixture');
    const result = await executeJob({ jobId: 'job-install-proxy', operation: 'prepare_dependencies', runId: runId('prepare'), deadline: Date.now() + 120000, packageJsonBytes: fixture.packageJson, dependencies: {} }, { signal: new AbortController().signal });
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.result.runId, runId('prepare'));
    assert.match(result.result.packageLockSha256, /^[a-f0-9]{64}$/);
    assert.ok(Buffer.from(result.result.packageLockBase64, 'base64').length > 0);
    assert.strictEqual(result.result.evidence.runId, runId('prepare'));
    assert.match(result.result.evidence.command, /^npm install --package-lock-only --ignore-scripts/);
  });

  await t.test('real worker seeds demo roles and verifies allowed and forbidden API writes', async () => {
    const scripts = {
      build: 'node -e "process.stdout.write(1)"',
      start: 'node server.js',
      test: 'node --test tests/server.test.js',
      'xfactor:test:setup': 'node seed.js'
    };
    const pkg = { name: 'role-worker-fixture', version: '1.0.0', type: 'module', private: true, scripts };
    const lock = { name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
      packages: { '': { name: pkg.name, version: pkg.version, private: true } } };
    const server = `import http from 'node:http';
import fs from 'node:fs';
const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
const records = [];
http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  res.setHeader('content-type', 'application/json');
  if (req.url === '/api/auth/login' && req.method === 'POST') {
    const data = JSON.parse(body || '{}');
    if (users[data.username] !== data.password) { res.writeHead(401).end('{}'); return; }
    res.setHeader('set-cookie', 'session=' + data.username + '; HttpOnly');
    res.writeHead(200).end('{}'); return;
  }
  if (req.url === '/api/assets') {
    const user = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
    if (req.method === 'POST') {
      if (user !== 'manager-fixture') { res.writeHead(user ? 403 : 401).end('{}'); return; }
      const item = { id: String(records.length + 1), name: JSON.parse(body).name };
      records.push(item); res.writeHead(201).end(JSON.stringify(item)); return;
    }
    if (req.method === 'GET' && user) { res.writeHead(200).end(JSON.stringify(records)); return; }
  }
  res.writeHead(200).end('{}');
}).listen(3000, '127.0.0.1');`;
    const seed = `import fs from 'node:fs';
fs.writeFileSync('users.json', JSON.stringify({
  'manager-fixture': process.env.XFACTOR_DEMO_PASSWORD_MANAGER,
  'viewer-fixture': process.env.XFACTOR_DEMO_PASSWORD_VIEWER
}));`;
    const zip = await archive({
      'package.json': JSON.stringify(pkg), 'package-lock.json': JSON.stringify(lock),
      'service-manifest.json': JSON.stringify({ services: { web: { command: 'npm', args: ['run', 'start'], port: 3000, healthEndpoint: '/' } } }),
      'server.js': server, 'seed.js': seed, 'README.md': '# Role fixture\nRun npm start.\n',
      'tests/server.test.js': `import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; test('server source exists', () => assert.match(fs.readFileSync('server.js', 'utf8'), /createServer/));`
    });
    const result = await executeJob({
      jobId: 'job-real-role-verification', operation: 'verify_artifact', runId: runId('roles'),
      deadline: Date.now() + 180000, archiveBase64: zip.toString('base64'), inputSha256: digest(zip),
      contract: {
        api: { baseUrl: 'http://127.0.0.1:3000' },
        browser: { url: 'http://127.0.0.1:3000/' },
        management: {
          needed: true,
          authentication: { apiLogin: { path: '/api/auth/login' } },
          resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read'] }],
          roles: [
            { name: 'manager', demoUser: { username: 'manager-fixture' }, permissions: [{ resource: 'assets', operations: ['create', 'read'] }] },
            { name: 'viewer', demoUser: { username: 'viewer-fixture' }, permissions: [{ resource: 'assets', operations: ['read'] }] }
          ]
        }
      }, requirementIds: []
    }, { signal: new AbortController().signal });
    const checks = result.result?.checks || [];
    for (const name of ['management_demo_seed', 'management_role_login', 'api_role_create_allowed', 'api_role_create_denied', 'database_mutation_assertion']) {
      assert.equal(checks.find(check => check.name === name)?.status, 'passed', `${name}: ${JSON.stringify(result).slice(0, 4000)}`);
    }
  });

  await t.test('rejects forbidden dependency sources before Docker startup', async () => {
    const resources = [];
    const fixture = await artifact('forbidden-fixture', {}, { dependencies: { escaped: 'https://evil.example/pkg.tgz' } });
    const result = await executeJob({ jobId: 'job-forbidden-dep', operation: 'prepare_dependencies', runId: runId('forbidden'), deadline: Date.now() + 60000, packageJsonBytes: fixture.packageJson, dependencies: { escaped: 'https://evil.example/pkg.tgz' } }, { signal: new AbortController().signal, onResource: resource => resources.push(resource) });
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /Forbidden dependency source/);
    assert.deepStrictEqual(resources, []);
  });

  await t.test('rejects symlink archive entries before verification', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('link-out.js', '../target', { unixPermissions: 0o120777 });
    const bytes = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'STORE' });
    const result = await executeJob({ jobId: 'job-archive-symlink', operation: 'verify_artifact', runId: runId('archive-symlink'), deadline: Date.now() + 60000, archiveBase64: bytes.toString('base64'), inputSha256: digest(bytes), contract: {} }, { signal: new AbortController().signal });
    assert.strictEqual(result.status, 'failed', JSON.stringify(result));
    assert.match(result.result?.reason || '', /Archive extraction rejected:.*symlink/i, JSON.stringify(result));
    assert.ok(result.result?.evidence?.stderrSha256, JSON.stringify(result));
  });
  await t.test('real fallback rejects high-ratio ZIP before unzip or materialization', async () => {
    const ratioZip = await archive({
      'materialize-me.txt': 'x'.repeat(1536 * 1024)
    }, { compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const result = await executeJob({
      jobId: 'job-archive-ratio',
      operation: 'verify_artifact',
      runId: runId('archive-ratio'),
      deadline: Date.now() + 60000,
      archiveBase64: ratioZip.toString('base64'),
      inputSha256: digest(ratioZip),
      contract: {},
      requirementIds: []
    }, { signal: new AbortController().signal });
    assert.strictEqual(result.status, 'failed', JSON.stringify(result));
    assert.match(`${result.error || ''} ${result.result?.reason || ''}`, /compression ratio/i, JSON.stringify(result));
    assert.match(result.result?.evidence?.stderr || '', /compression ratio/i, JSON.stringify(result));
    // A pre-extraction rejection has no verification checks or materialized workspace evidence.
    assert.strictEqual(result.result?.checks, undefined, JSON.stringify(result));
  });
  await t.test('real fallback rejects a filename ending CR before unzip or materialization', async () => {
    const controlZip = await archive({
      'materialize-me.txt\r': 'must-not-materialize'
    });
    const result = await executeJob({
      jobId: 'job-archive-control-name',
      operation: 'verify_artifact',
      runId: runId('archive-control-name'),
      deadline: Date.now() + 60000,
      archiveBase64: controlZip.toString('base64'),
      inputSha256: digest(controlZip),
      contract: {},
      requirementIds: []
    }, { signal: new AbortController().signal });
    assert.strictEqual(result.status, 'failed', JSON.stringify(result));
    assert.match(`${result.error || ''} ${result.result?.reason || ''}`, /unsafe archive filename|control character/i, JSON.stringify(result));
    assert.match(result.result?.evidence?.stderr || '', /unsafe archive filename|control character/i, JSON.stringify(result));
    assert.strictEqual(result.result?.checks, undefined, JSON.stringify(result));
  });


  await t.test('startup deadline cleans owned labelled resources', async () => {
    const fixture = await artifact('deadline-fixture');
    const jobId = 'job-startup-deadline';
    const resources = [];
    const deadline = Date.now() + 10000;
    const wait = new Int32Array(new SharedArrayBuffer(4));
    const result = await executeJob({ jobId, operation: 'verify_artifact', runId: runId('deadline'), deadline, archiveBase64: fixture.archiveBase64, inputSha256: fixture.inputSha256, contract: {}, requirementIds: [] }, { signal: new AbortController().signal, onResource: resource => { resources.push(resource); if (resources.length === 1) Atomics.wait(wait, 0, 0, Math.max(1, deadline - Date.now() + 100)); } });
    assert.ok(resources.length >= 1, `resources=${JSON.stringify(resources)} error=${result.error || ''}`);
    assert.strictEqual(result.status, 'failed', JSON.stringify(result));
    assert.match(result.error, /deadline|timed[- ]out/i, JSON.stringify(result));
    const label = createHash('sha256').update(jobId).digest('hex');
    assert.strictEqual(execFileSync('docker', ['ps', '-a', '--filter', 'label=xfactor.owner=execution', '--filter', `label=xfactor.job=${label}`, '--format', '{{.ID}}'], { encoding: 'utf8' }).trim(), '');
  });

  await t.test('verify extracts a real archive and runs finite verification protocol', async () => {
    const fixture = await artifact('verify-fixture', { build: 'node -e "process.stdout.write(\'build-ok\')"' });
    const result = await executeJob({ jobId: 'job-real-verify', operation: 'verify_artifact', runId: runId('verify'), deadline: Date.now() + 120000, archiveBase64: fixture.archiveBase64, inputSha256: fixture.inputSha256, contract: {}, requirementIds: ['REQ-REAL'], files: [{ path: 'package.json', contentBase64: fixture.packageJson.toString('base64') }] }, { signal: new AbortController().signal, onResource: assertOwnedResources });
    assert.ok(result.result, JSON.stringify(result));
    assert.strictEqual(result.result.runId, runId('verify'), JSON.stringify(result));
    assert.strictEqual(result.result.archiveSha256, fixture.inputSha256, JSON.stringify(result));
    assert.ok(Array.isArray(result.result.checks), JSON.stringify(result));
    assert.ok(result.result.checks.every(check => check.runId === runId('verify')), JSON.stringify(result));
  });

  await t.test('oversized archive is rejected before Docker startup', async () => {
    const resources = [];
    const result = await executeJob({ jobId: 'job-oversize', operation: 'verify_artifact', runId: runId('oversize'), deadline: Date.now() + 60000, archiveBase64: Buffer.alloc(24 * 1024 * 1024 + 1).toString('base64'), inputSha256: digest(Buffer.alloc(24 * 1024 * 1024 + 1)), contract: {} }, { signal: new AbortController().signal, onResource: resource => resources.push(resource) });
    assert.strictEqual(result.status, 'failed');
    assert.deepStrictEqual(resources, []);
  });

  await t.test('package build output is bounded and retains full-stream evidence', async () => {
    const fixture = await artifact('output-fixture', { build: `node -e "process.stdout.write(Buffer.alloc(2 * 1024 * 1024, 'a'))"` });
    const result = await executeJob({ jobId: 'job-output-ceil', operation: 'verify_artifact', runId: runId('output'), deadline: Date.now() + 120000, archiveBase64: fixture.archiveBase64, inputSha256: fixture.inputSha256, contract: {} }, { signal: new AbortController().signal });
    assert.strictEqual(result.status, 'failed', JSON.stringify(result));
    const build = result.result?.checks?.find(check => check.name === 'framework_build');
    assert.ok(build, JSON.stringify(result));
    assert.match(`${build.reason} ${build.stderr || ''}`, /ceiling|output|failed/i, JSON.stringify(result));
  });

  await t.test('build network denies metadata egress', async () => {
    const fixture = await artifact('network-fixture', { build: `node -e "require('child_process').execFileSync('curl',['--max-time','2','-sS','http://169.254.169.254'])"` });
    const result = await executeJob({ jobId: 'job-net-deny', operation: 'verify_artifact', runId: runId('network'), deadline: Date.now() + 120000, archiveBase64: fixture.archiveBase64, inputSha256: fixture.inputSha256, contract: {} }, { signal: new AbortController().signal, onResource: assertOwnedResources });
    assert.strictEqual(result.status, 'failed', JSON.stringify(result));
    assert.ok(result.result?.checks?.some(check => check.name === 'framework_build'), JSON.stringify(result));
  });

  await t.test('cancellation cleans resources after protocol startup', async () => {
    const fixture = await artifact('cancel-fixture');
    const abort = new AbortController();
    const resources = [];
    const result = await executeJob({ jobId: 'job-cancel-clean', operation: 'verify_artifact', runId: runId('cancel'), deadline: Date.now() + 60000, archiveBase64: fixture.archiveBase64, inputSha256: fixture.inputSha256, contract: {} }, { signal: abort.signal, onResource: resource => { resources.push(resource); if (resources.length === 1) abort.abort(); } });
    assert.ok(resources.length >= 1);
    assert.strictEqual(result.status, 'failed');
    assert.match(result.error, /Cancelled by user/);
  });
});
