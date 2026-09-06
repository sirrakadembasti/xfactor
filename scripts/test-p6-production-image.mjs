import assert from 'node:assert/strict';
import { request as httpsRequest } from 'node:https';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROXY_IMAGE = 'caddy:2.8.4-alpine';
const runId = randomUUID();
const imageTag = process.env.P6_IMAGE_TAG || `xfactor-p6-smoke-${runId}`;
const appName = `xfactor-p6-app-${runId}`;
const proxyName = `xfactor-p6-proxy-${runId}`;
const playwrightCli = join(repositoryRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const fixtureRoot = mkdtempSync(join(tmpdir(), `xfactor-p6-${runId}-`));
const dataRoot = join(fixtureRoot, 'data');
const projectsRoot = join(fixtureRoot, 'projects');
const seedScript = join(repositoryRoot, 'scripts', 'p6-container-seed.mjs');
let httpsPort;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, encoding: 'utf8', ...options });
  if (result.error) throw new Error(`${command} ${args.join(' ')} failed to start: ${result.error.message}`);
  return result;
}
function success(label, result) {
  assert.equal(result.status, 0, `${label} failed with exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  return result;
}
function cleanup() {
  for (const name of [proxyName, appName]) {
    try { run('docker', ['rm', '--force', name], { stdio: 'ignore' }); } catch {}
  }
  try { run('docker', ['image', 'rm', '--force', imageTag], { stdio: 'ignore' }); } catch {}
  try { rmSync(fixtureRoot, { recursive: true, force: true }); } catch {}
}
async function reservePort() {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePort);
  });
  const { port } = server.address();
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}
function startApplication() {
  success('application start', run('docker', [
    'run', '--detach', '--name', appName, '--publish', `${httpsPort}:${httpsPort}`,
    '--mount', `type=bind,source=${dataRoot},target=/app/backend/data`,
    '--mount', `type=bind,source=${projectsRoot},target=/app/projects`,
    '--env', 'NODE_ENV=production', '--env', 'TRUST_PROXY=loopback',
    '--env', 'MFA_ENCRYPTION_KEY=cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
    '--env', `ALLOWED_ORIGINS=https://localhost:${httpsPort}`,
    '--env', 'DB_PATH=/app/backend/data/projects.db', '--env', 'ARTIFACTS_ROOT=/app/backend/data/artifacts',
    '--env', 'PROJECTS_ROOT=/app/projects', imageTag
  ]));
}
function startProxy() {
  success('TLS proxy start', run('docker', [
    'run', '--detach', '--name', proxyName, '--network', `container:${appName}`,
    '--mount', `type=bind,readonly,source=${join(fixtureRoot, 'Caddyfile')},target=/etc/caddy/Caddyfile`,
    PROXY_IMAGE, 'caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'
  ]));
}
function waitForHealth() {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const inspected = run('docker', ['inspect', '--format', '{{.State.Health.Status}}', appName]);
    if (inspected.status === 0 && inspected.stdout.trim() === 'healthy') return;
    if (inspected.status === 0 && inspected.stdout.trim() === 'unhealthy') throw new Error(`application became unhealthy\n${run('docker', ['logs', appName]).stdout}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('timed out waiting for Docker health');
}
function seed() {
  const seeded = success('in-container seed', run('docker', [
    'run', '--rm', '--network', `container:${appName}`, '--volumes-from', appName,
    '--mount', `type=bind,readonly,source=${seedScript},target=/tmp/p6-container-seed.mjs`,
    imageTag, 'node', '/tmp/p6-container-seed.mjs'
  ]));
  const lines = seeded.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `seed must print exactly one JSON line, got: ${seeded.stdout}`);
  const fixture = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(fixture).sort(), ['artifactId', 'contractId', 'password', 'projectId', 'sha256', 'username']);
  return fixture;
}
async function waitForHttps() {
  let lastError;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      await new Promise((resolveRequest, reject) => {
        const request = httpsRequest({ host: '127.0.0.1', port: httpsPort, path: '/healthz', servername: 'localhost', rejectUnauthorized: false }, response => {
          response.resume();
          response.statusCode === 200 ? resolveRequest() : reject(new Error(`HTTPS health status ${response.statusCode}`));
        });
        request.once('error', reject);
        request.end();
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
    }
  }
  const caddyLogs = run('docker', ['logs', proxyName]);
  throw new Error(`timed out waiting for HTTPS proxy: ${lastError?.message}\n${caddyLogs.stdout}\n${caddyLogs.stderr}`);
}
function runJourney(fixture) {
  const result = run(process.execPath, [playwrightCli, 'test', 'e2e/production-operability.spec.js', '--project=chromium'], {
    env: { ...process.env, P6_BASE_URL: `https://localhost:${httpsPort}`, P6_USERNAME: fixture.username,
      P6_PASSWORD: fixture.password, P6_PROJECT_ID: fixture.projectId, P6_CONTRACT_ID: fixture.contractId,
      P6_ARTIFACT_ID: fixture.artifactId, P6_SHA256: fixture.sha256 }
  });
  const caddyLogs = run('docker', ['logs', proxyName]);
  assert.equal(result.status, 0, `Playwright production journey failed\n${result.stdout}\n${result.stderr}\nCaddy:\n${caddyLogs.stdout}\n${caddyLogs.stderr}`);
}
function assertRuntimeBoundaries() {
  assert.notEqual(success('non-root runtime', run('docker', ['exec', appName, 'id', '-u'])).stdout.trim(), '0');
  const mounts = JSON.parse(success('mounted storage inspection', run('docker', ['inspect', appName])).stdout)[0].Mounts;
  assert.deepEqual(mounts.map(mount => mount.Destination).sort(), ['/app/backend/data', '/app/projects']);
  success('mounted data writable and application paths immutable', run('docker', ['exec', appName, 'sh', '-c',
    'test -w /app/backend/data && test -w /app/projects && test ! -w /app && test ! -w /app/backend && test ! -w /app/frontend && test ! -w /app/docs && test ! -w /app/backend/node_modules'
  ]));
}

try {
  httpsPort = await reservePort();
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(projectsRoot, { recursive: true });
  // Native Linux enforces bind-mount UID ownership (unlike Docker Desktop, which
  // silently permits writes). The image runs as non-root `xfactor`, so the host
  // fixture dirs must be world-writable or SQLite/artifact writes fail with EACCES.
  chmodSync(dataRoot, 0o777);
  chmodSync(projectsRoot, 0o777);
  writeFileSync(join(fixtureRoot, 'Caddyfile'), `{\n  skip_install_trust\n}\n\nhttps://localhost:${httpsPort} {\n  bind 0.0.0.0\n  tls internal\n  reverse_proxy 127.0.0.1:8000 {\n    header_up X-Forwarded-Proto https\n  }\n}\n`);
  success('production image build', run('docker', ['build', '--tag', imageTag, '.']));
  startApplication();
  startProxy();
  waitForHealth();
  await waitForHttps();
  const fixture = seed();
  console.log('OBSERVED health/readiness, backend ZIP create/extract, and isolated seed.');
  runJourney(fixture);
  console.log('OBSERVED same-origin HTTPS SPA/API/WebSocket, unverified denial, and verified ZIP digest.');
  assertRuntimeBoundaries();
  success('proxy removal for replacement', run('docker', ['rm', '--force', proxyName]));
  success('application removal for replacement', run('docker', ['rm', '--force', appName]));
  startApplication();
  startProxy();
  waitForHealth();
  await waitForHttps();
  runJourney(fixture);
  console.log('OBSERVED non-root mount boundaries and persistence across container replacement.');
} finally {
  cleanup();
}
