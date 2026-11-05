import { COMMAND_PHASES } from '../backend/verification/commandProgressProtocol.js';
import { redactSensitiveText } from '../backend/observability.js';
export { COMMAND_PHASES } from '../backend/verification/commandProgressProtocol.js';
const EXECUTABLES = new Set(['node', 'npm', 'npx']);
const CHECK_PHASES = new Set(['dependencies', 'build', 'readme', 'assertions', 'runtime']);
// Private operator diagnostics only. These summaries never become result.checks
// and cannot satisfy a delivery gate, even if an earlier phase succeeded.
export function sanitizePhaseDiagnostic(event) {
  if (!CHECK_PHASES.has(event?.phase) || !Array.isArray(event.checks)) return null;
  const text = (value, limit) => Buffer.from(redactSensitiveText(String(value ?? ''))).subarray(0, limit).toString('utf8');
  const ordered = [...event.checks].sort((a, b) => Number(['failed', 'blocked'].includes(b?.status)) - Number(['failed', 'blocked'].includes(a?.status)));
  const checks = ordered.slice(0, 32).flatMap(check => {
    if (!/^[a-zA-Z0-9_:.-]{1,100}$/.test(check?.name || '') || !['passed', 'failed', 'blocked', 'skipped'].includes(check.status)) return [];
    const row = { name: check.name, status: check.status, exitCode: Number.isInteger(check.exitCode) ? check.exitCode : null,
      reason: text(check.reason, 1024), stdout: text(check.stdout, 4096), stderr: text(check.stderr, 4096),
      stdoutTruncated: check.stdoutTruncated === true || Buffer.byteLength(String(check.stdout || '')) > 4096,
      stderrTruncated: check.stderrTruncated === true || Buffer.byteLength(String(check.stderr || '')) > 4096,
      timedOut: check.timedOut === true };
    for (const stream of ['stdout', 'stderr']) {
      const hash = check[`${stream}Digest`] || check[`${stream}Sha256`];
      if (/^[a-f0-9]{64}$/.test(hash || '')) row[`${stream}Digest`] = hash;
    }
    for (const key of ['startedAt', 'endedAt']) if (typeof check[key] === 'string' && Number.isFinite(Date.parse(check[key]))) row[key] = check[key];
    return [row];
  });
  return { phase: event.phase, completedAt: Date.now(), advisoryOnly: true, totalChecks: event.checks.length,
    truncated: checks.length < event.checks.length, checks };
}
export function createCommandReporter(onProgress) {
  let sequence = 0;
  const emit = event => {
    const safe = sanitizeCommandEvent(event);
    if (!safe) return;
    try {
      const result = onProgress?.({ state: event.state, ...safe });
      if (result && typeof result.then === 'function') result.catch(() => {});
    } catch {}
  };
  return (command, args = []) => {
    const commandId = ++sequence;
    emit({ state: 'started', commandId, ...describeCommand(command, args), startedAt: Date.now() });
    let finished = false;
    return { finish(result = {}) {
      if (finished) return;
      finished = true;
      emit({ state: 'finished', commandId, endedAt: Date.now(),
        exitCode: Number.isInteger(result.exitCode) ? result.exitCode : Number.isInteger(result.code) ? result.code : null,
        timedOut: result.timedOut, stdoutTruncated: result.stdoutTruncated, stderrTruncated: result.stderrTruncated,
        stdoutSha256: result.stdoutSha256, stderrSha256: result.stderrSha256 });
    } };
  };
}
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
