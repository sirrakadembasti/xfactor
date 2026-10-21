export const COMMAND_PHASES = new Set(['dependency_lockfile', 'dependency_install', 'prisma_validate',
  'prisma_generate', 'database_push', 'database_seed', 'typecheck', 'framework_build', 'test_setup',
  'test_execution', 'service_start', 'service_preview', 'browser_journey', 'inventory', 'http_request',
  'node_command', 'npm_command', 'npx_command']);
const EXECUTABLES = new Set(['node', 'npm', 'npx']);
export function describeCommand(command, args = []) {
  const executable = String(command).toLowerCase().replace(/\.(?:cmd|exe)$/, '');
  let phase = `${executable}_command`;
  if (executable === 'npm') {
    if (args[0] === 'ci' || args[0] === 'install') phase = args.includes('--package-lock-only') ? 'dependency_lockfile' : 'dependency_install';
    if (args[0] === 'run') phase = ({ build: 'framework_build', test: 'test_execution', 'xfactor:test:setup': 'test_setup',
      preview: 'service_preview', 'start:api': 'service_start', start: 'service_start' })[args[1]] || phase;
    if (args[0] === 'test') phase = 'test_execution';
  }
  if (executable === 'npx') {
    const words = args.filter(value => !String(value).startsWith('-'));
    if (words[0] === 'tsc') phase = 'typecheck';
    if (words[0] === 'prisma') phase = ({ validate: 'prisma_validate', generate: 'prisma_generate' })[words[1]]
      || (words[1] === 'db' ? ({ push: 'database_push', seed: 'database_seed' })[words[2]] : null) || phase;
  }
  if (executable === 'node') {
    if (args.some(value => /(?:^|[\\/])localBrowserRunner\.cjs$/.test(value))) phase = 'browser_journey';
    else if (args[0] === '-e' && String(args[1]).includes('fetch(')) phase = 'http_request';
    else if (args[0] === '-e' && String(args[1]).includes('Inventory ')) phase = 'inventory';
  }
  return { executable: EXECUTABLES.has(executable) ? executable : 'node', phase: COMMAND_PHASES.has(phase) ? phase : 'node_command' };
}

// No argument, path, environment, source or output strings cross this reducer.
export function sanitizeCommandEvent(event) {
  if (!event || !Number.isSafeInteger(event.commandId) || event.commandId < 1) return null;
  if (event.state === 'started') {
    if (!COMMAND_PHASES.has(event.phase) || !EXECUTABLES.has(event.executable) || !Number.isFinite(event.startedAt)) return null;
    return { commandId: event.commandId, phase: event.phase, executable: event.executable, startedAt: event.startedAt };
  }
  if (event.state !== 'finished' || !Number.isFinite(event.endedAt)) return null;
  const result = { commandId: event.commandId, endedAt: event.endedAt,
    exitCode: Number.isInteger(event.exitCode) ? event.exitCode : null,
    timedOut: event.timedOut === true, stdoutTruncated: event.stdoutTruncated === true, stderrTruncated: event.stderrTruncated === true };
  for (const name of ['stdoutSha256', 'stderrSha256']) if (/^[a-f0-9]{64}$/.test(event[name] || '')) result[name] = event[name];
  return result;
}
