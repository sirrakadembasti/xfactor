import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomUUID();
const imageTag = process.env.P6_IMAGE_TAG || `xfactor-p6-contract-${runId}`;
const lockMismatchTag = `xfactor-p6-lock-mismatch-${runId}`;
const cleanContext = mkdtempSync(join(tmpdir(), `xfactor-p6-clean-${runId}-`));
const lockMismatchContext = mkdtempSync(join(tmpdir(), `xfactor-p6-lock-mismatch-${runId}-`));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed to start: ${result.error.message}`);
  }

  return result;
}

function requireSuccess(label, result) {
  assert.strictEqual(
    result.status,
    0,
    `${label} failed with exit ${result.status}\n${result.stdout}${result.stderr}`,
  );
}

function copyTrackedContext(destination) {
  const tracked = run('git', ['ls-files', '-z']);
  requireSuccess('git ls-files', tracked);

  for (const relativePath of tracked.stdout.split('\0').filter(Boolean)) {
    const source = join(repositoryRoot, relativePath);
    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { force: true });
  }
}

function inspectEnvironment(environment) {
  return Object.fromEntries(environment.map((entry) => {
    const separator = entry.indexOf('=');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

try {
  copyTrackedContext(cleanContext);
  const cleanBuild = run('docker', ['build', '--no-cache', '--tag', imageTag, cleanContext]);
  requireSuccess('clean production image build', cleanBuild);

  const inspection = run('docker', ['image', 'inspect', imageTag]);
  requireSuccess('image inspection', inspection);
  const inspect = JSON.parse(inspection.stdout)[0];
  const environment = inspectEnvironment(inspect.Config.Env);

  assert.notStrictEqual(inspect.Config.User, '');
  assert.notStrictEqual(inspect.Config.User, '0');
  assert.ok(inspect.Config.ExposedPorts['8000/tcp']);
  assert.ok(inspect.Config.Healthcheck);
  assert.ok(inspect.Config.Volumes['/app/backend/data']);
  assert.ok(inspect.Config.Volumes['/app/projects']);
  assert.strictEqual(environment.PORT, '8000');
  assert.strictEqual(environment.HOST, '0.0.0.0');
  assert.strictEqual(environment.DB_PATH, '/app/backend/data/projects.db');
  assert.strictEqual(environment.PROJECTS_ROOT, '/app/projects');
  assert.strictEqual(environment.ARTIFACTS_ROOT, '/app/backend/data/artifacts');

  const jszip = run('docker', [
    'run', '--rm', imageTag, 'node', '--input-type=module', '-e', "await import('jszip')",
  ]);
  requireSuccess('backend JSZip import', jszip);

  const layout = run('docker', [
    'run', '--rm', '--entrypoint', 'sh', imageTag, '-c',
    'test -f /app/frontend/dist/index.html && test ! -e /app/frontend/node_modules',
  ]);
  requireSuccess('frontend runtime layout', layout);

  copyTrackedContext(lockMismatchContext);
  const lockPackagePath = join(lockMismatchContext, 'backend', 'package.json');
  const lockPackage = JSON.parse(readFileSync(lockPackagePath, 'utf8'));
  lockPackage.dependencies[`p6-lock-mismatch-${runId}`] = '1.0.0';
  writeFileSync(lockPackagePath, `${JSON.stringify(lockPackage, null, 2)}\n`);

  const lockMismatch = run('docker', [
    'build', '--no-cache', '--tag', lockMismatchTag, lockMismatchContext,
  ]);
  assert.notStrictEqual(lockMismatch.status, 0);

  console.log('P6 image contract passed: clean build, non-root runtime, JSZip, frontend layout, volumes, healthcheck, and lock mismatch rejection.');
} finally {
  run('docker', ['image', 'rm', '--force', imageTag], { stdio: 'ignore' });
  run('docker', ['image', 'rm', '--force', lockMismatchTag], { stdio: 'ignore' });
  rmSync(cleanContext, { recursive: true, force: true });
  rmSync(lockMismatchContext, { recursive: true, force: true });
}
