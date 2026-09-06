const { spawnSync } = require('node:child_process');

const mode = process.argv[2];

// Readiness probe / keep-alive mode
if (mode === 'serve') {
  console.log('READY');
  // Keep alive until killed
  setInterval(() => {}, 1000 * 60 * 60);
} else {
  // Portable executable translation inside Linux worker
  let executable = process.argv[2];
  if (executable && executable.endsWith('.cmd')) {
    executable = executable.slice(0, -4);
  }

  const allowlist = ['NODE_ENV', 'PATH', 'CI', 'NPM_CONFIG_REGISTRY', 'NPM_CONFIG_IGNORE_SCRIPTS', 'NPM_CONFIG_CACHE'];
  const safeEnv = {};
  for (const key of allowlist) {
    if (process.env[key] !== undefined) {
      safeEnv[key] = process.env[key];
    }
  }

  const args = process.argv.slice(3);

  const result = spawnSync(executable, args, { 
    stdio: 'inherit',
    env: safeEnv
  });

  if (result.error) {
    console.error(`Execution error: ${result.error.message}`);
    process.exit(127);
  }

  process.exit(result.status === null ? 1 : result.status);
}
