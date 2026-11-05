import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandReporter, sanitizePhaseDiagnostic } from '../commandDiagnostics.js';

test('bounded phase snapshots disclose omitted rows and prioritize failure diagnostics', () => {
  const checks = Array.from({length:40}, (_,i)=>({name:`check_${i}`,status:'passed'}));
  checks.push({name:'last_failure',status:'failed',stderr:'last compiler failure'});
  const snapshot=sanitizePhaseDiagnostic({phase:'build',checks});
  assert.equal(snapshot.totalChecks,41); assert.equal(snapshot.truncated,true);
  assert.equal(snapshot.checks.length,32); assert.equal(snapshot.checks[0].name,'last_failure');
});
test('command reporter emits only safe phase metadata and one terminal event', () => {
  const events = [], start = createCommandReporter(event => events.push(event));
  const command = start('npm', ['install', '--package-lock-only', 'password=private']);
  command.finish({ code: 0, stdout: 'private output', env: { SECRET: 'private' } });
  command.finish({ code: 9 });
  assert.equal(events.length, 2);assert.equal(events[0].phase, 'dependency_lockfile');assert.equal(events[1].exitCode, 0);
  assert.ok(!JSON.stringify(events).includes('private'));assert.equal(events[0].commandId, events[1].commandId);
  const next = start('node', ['-e', 'private source']);next.finish({ timedOut: true, exitCode: null });
  assert.equal(events[2].commandId, 2);assert.equal(events[3].timedOut, true);assert.equal(events[3].exitCode, null);
});
test('a telemetry callback failure cannot fail a command', () => {
  const start = createCommandReporter(() => { throw new Error('Observer failed'); });
  assert.doesNotThrow(() => start('node').finish({ code: 0 }));
});
