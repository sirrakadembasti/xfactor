const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const mode = process.argv[2];

function checkWorkspacePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/workspace/') && value !== '/workspace') {
    throw new Error('Path is outside /workspace');
  }
  const base = '/workspace';
  const relative = value === base ? '' : value.slice(base.length + 1);
  let current = base;
  for (const segment of relative.split('/').filter(Boolean)) {
    if (segment === '.' || segment === '..' || segment.includes('\0')) throw new Error('Invalid workspace path');
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('Symlinks are not permitted in workspace paths');
    const canonical = fs.realpathSync(current);
    if (canonical !== current && !canonical.startsWith(`${base}/`)) throw new Error('Workspace path escapes owned workspace');
  }
}

if (mode === 'check-path') {
  try { checkWorkspacePath(process.argv[3]); process.exit(0); }
  catch (error) { console.error(error.message); process.exit(13); }
}

// Readiness probe / keep-alive mode
if (mode === 'serve') {
  console.log('READY');
  setInterval(() => {}, 1000 * 60 * 60);
} else {
  let executable = process.argv[2];
  if (executable && executable.endsWith('.cmd')) executable = executable.slice(0, -4);
  const allowlist = ['NODE_ENV', 'PATH', 'CI', 'NODE_OPTIONS', 'NPM_CONFIG_REGISTRY', 'NPM_CONFIG_IGNORE_SCRIPTS', 'NPM_CONFIG_CACHE', 'PRISMA_ENGINES_MIRROR', 'DATABASE_URL', 'AUTH_SECRET', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
  const safeEnv = {};
  for (const key of allowlist) if (process.env[key] !== undefined) safeEnv[key] = process.env[key];
  const args = process.argv.slice(3);
  const result = spawnSync(executable, args, { stdio: 'inherit', env: safeEnv });
  if (result.error) { console.error(`Execution error: ${result.error.message}`); process.exit(127); }
  process.exit(result.status === null ? 1 : result.status);
}
