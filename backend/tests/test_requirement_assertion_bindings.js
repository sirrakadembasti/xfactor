import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as contract from '../contracts/requirementAssertionBindings.js';

const sha = text => createHash('sha256').update(text).digest('hex');
const source = `import test from 'node:test';
import assert from 'node:assert/strict';
import { double } from './subject.js';
test('doubles supplied data', () => {
  const result = double(3);
  assert.equal(result, 6);
});
`;
function fixture(content = source) {
  const files = [{ path: 'subject.js', content: 'export const double = n => n * 2;' }, { path: 'subject.test.js', content }];
  const bindings = [{ requirementId: 'R-1', testFile: 'subject.test.js', testName: 'doubles supplied data', assertionLine: 6, expectation: 'The result is twice the supplied input.' }];
  const sourceHash = contract.computeAssertionSourceHash(files);
  const planHash = sha('approved plan');
  const bindingHash = contract.computeAssertionBindingHash(bindings);
  return {
    requirements: [{ id: 'R-1', statement: 'Double supplied numeric input.', statementHash: sha('Double supplied numeric input.'), mandatory: true }],
    files, bindings, sourceHash, planHash,
    reservations: ['reviewer', 'tester'].map(role => ({ role, reservationId: `${role}-reservation`, actorId: role, sourceHash, planHash, bindingHash, approved: true })),
  };
}
const trusted = { authenticateReservation: () => true, authenticateReceipt: () => true, now: Date.parse('2026-11-02T10:01:00Z'), maxAgeMs: 120000 };
function executionFixture() {
  const input = fixture();
  input.expectedExecution = { jobId: 'job-1', checkId: 'check-1', runId: 'run-1', artifactId: 'artifact-1', sourceHash: input.sourceHash, artifactHash: sha('artifact'), contractId: 'contract-1' };
  const stdout = 'TAP version 13\n# Subtest: doubles supplied data\nok 1 - doubles supplied data\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  const command = ['node', '--test', '--test-reporter=tap', 'subject.test.js'];
  input.execution = { ...input.expectedExecution, kind: 'test_suite_execution', planHash: input.planHash,
    bindingHash: contract.computeAssertionBindingHash(input.bindings), command, commandHash: sha(JSON.stringify(command)),
    exitCode: 0, startedAt: '2026-11-02T10:00:00Z', completedAt: '2026-11-02T10:00:01Z', stdout, stderr: '', stdoutHash: sha(stdout), stderrHash: sha('') };
  input.execution.sourceFence = {version:1,sourceHash:input.sourceHash,
    before:{version:1,matched:true,sourceHash:input.sourceHash,nonce:sha('before'),observedAt:input.execution.startedAt},
    after:{version:1,matched:true,sourceHash:input.sourceHash,nonce:sha('after'),observedAt:input.execution.completedAt}};
  return input;
}

test('review accepts actual source-bound assertions with independently authenticated reviewers', () => {
  const result = contract.reviewRequirementAssertionBindings(fixture(), trusted);
  assert.equal(result.status, 'ready');
  assert.equal(result.reviewedBindings.length, 1);
});

test('self-submitted approval, actor reuse, stale source, changed statements and missing requirements block review', () => {
  assert.equal(contract.reviewRequirementAssertionBindings(fixture()).status, 'blocked');
  for (const mutate of [
    x => { x.reservations[1].actorId = 'reviewer'; },
    x => { x.sourceHash = sha('stale'); },
    x => { x.requirements[0].statement += ' changed'; },
    x => { x.bindings = []; },
    x => { x.bindings[0].requirementId = 'foreign'; },
    x => { x.bindings.push({ ...x.bindings[0] }); },
    x => { x.reservations[0].approved = false; },
    x => { x.reservations[0].bindingHash = sha('another binding'); },
  ]) {
    const input = fixture(); mutate(input);
    assert.equal(contract.reviewRequirementAssertionBindings(input, trusted).status, 'blocked');
  }
});

test('constant, text-only, conditional, shadowed, skipped, dynamic and ambiguous tests cannot bind', () => {
  const variants = [
    source.replace('assert.equal(result, 6)', 'assert(true)'),
    source.replace('assert.equal(result, 6)', 'assert.equal(1, 1)'),
    source.replace('assert.equal(result, 6)', "assert.match('subject source text', /double/)"),
    source.replace('assert.equal(result, 6)', 'if (false) assert.equal(result, 6)'),
    source.replace('assert.equal(result, 6)', '(() => { assert.equal(result, 6); })'),
    source.replace('const result = double(3);', 'const result = 6;'),
    source.replace('const result = double(3);', 'const double = () => 6; const result = double(3);'),
    source.replace("test('doubles supplied data'", "test.skip('doubles supplied data'"),
    source.replace("test('doubles supplied data'", "test.only('doubles supplied data'"),
    source.replace("test('doubles supplied data'", "test(`doubles supplied data`"),
    source + source.slice(source.indexOf("test('")),
    source.replace('assert.equal(result, 6)', 'assert.equal(result, result)'),
  ];
  for (const variant of variants) assert.equal(contract.reviewRequirementAssertionBindings(fixture(variant), trusted).status, 'blocked', variant);
});

test('runtime requires authenticated matching fresh execution and successful named TAP', () => {
  const input = executionFixture();
  const result = contract.evaluateRequirementAssertionExecution(input, trusted);
  assert.equal(result.status, 'passed', result.issues.join('; '));
  assert.equal(contract.evaluateRequirementAssertionExecution(input, { ...trusted, authenticateReceipt: undefined }).status, 'blocked');
  for (const mutate of [
    x => { x.execution.jobId = 'foreign'; },
    x => { x.execution.checkId = 'old'; },
    x => { x.execution.artifactId = 'old'; },
    x => { x.execution.runId = 'old'; },
    x => { x.execution.sourceHash = sha('old'); },
    x => { x.execution.stdoutHash = sha('other'); },
    x => { x.execution.exitCode = 1; },
    x => { x.execution.completedAt = '2026-11-01T10:00:01Z'; },
    x => { x.execution.command = ['node', '--test']; },
  ]) {
    const changed = executionFixture(); mutate(changed);
    assert.equal(contract.evaluateRequirementAssertionExecution(changed, trusted).status, 'blocked');
  }
});

test('failed, skipped, todo, duplicate, empty and forged TAP output blocks even with exit zero', () => {
  for (const transform of [
    s => s.replace('ok 1 -', 'not ok 1 -'),
    s => s.replace('ok 1 - doubles supplied data', 'ok 1 - doubles supplied data # SKIP'),
    s => s.replace('ok 1 - doubles supplied data', 'ok 1 - doubles supplied data # TODO'),
    s => s.replace('1..1', 'ok 2 - doubles supplied data\n1..2'),
    () => 'TAP version 13\n1..0\n',
    s => s.replace('doubles supplied data', 'other case').replace('ok 1 - doubles supplied data', 'ok 1 - other case'),
    s => s.replace('# cancelled 0', '# cancelled 1'),
    s => s + 'Bail out! cancelled\n',
  ]) {
    const input = executionFixture(); input.execution.stdout = transform(input.execution.stdout); input.execution.stdoutHash = sha(input.execution.stdout);
    assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'blocked');
  }
});

test('authentication hooks must affirm canonical records synchronously and failures fail closed', () => {
  for (const authenticateReservation of [() => false, () => ({ approved: true }), () => Promise.resolve(true), () => { throw new Error('record missing'); }]) {
    assert.equal(contract.reviewRequirementAssertionBindings(fixture(), { authenticateReservation }).status, 'blocked');
  }
  for (const authenticateReceipt of [() => false, () => Promise.resolve(true), () => { throw new Error('receipt missing'); }]) {
    assert.equal(contract.evaluateRequirementAssertionExecution(executionFixture(), { ...trusted, authenticateReceipt }).status, 'blocked');
  }
  let seen;
  const result = contract.reviewRequirementAssertionBindings(fixture(), { authenticateReservation: (reservation, context) => { seen = context; return reservation.reservationId.endsWith('-reservation'); } });
  assert.equal(result.status, 'ready');
  assert.equal(seen.sourceHash, result.sourceHash);
  assert.equal(seen.bindingHash, result.bindingHash);
});

test('supported aliases and async subject data retain exact assertion line provenance', () => {
  const variants = [
    source.replace("import test from 'node:test'", "import { it as example } from 'node:test'").replace("test('doubles", "example('doubles"),
    source.replace("import assert from 'node:assert/strict'", "import { equal as compare } from 'node:assert/strict'").replace('assert.equal(result, 6)', 'compare(result, 6)'),
    source.replace("import assert from 'node:assert/strict'", "import { strict as assert } from 'node:assert'"),
    source.replace("() => {", "async () => {").replace('double(3)', 'await double(3)'),
  ];
  for (const content of variants) {
    const result = contract.reviewRequirementAssertionBindings(fixture(content), trusted);
    assert.equal(result.status, 'ready', result.issues.join('; '));
    assert.equal(result.reviewedBindings[0].line, 6);
    assert.equal(result.reviewedBindings[0].testLine, 4);
  }
});

test('unknown import contexts, named callback shadowing and same-line assertions fail closed', () => {
  for (const content of [
    source.replace("() => {", 'function assert() {'),
    source.replace("import { double } from './subject.js';", "import './subject.js'; import { double } from './subject.js';"),
    source.replace('assert.equal(result, 6);', 'assert.equal(result, 6); assert.equal(result, 6);'),
    source.replace('double(3)', 'double(...[3])'),
    source.replace('assert.equal(result, 6)', 'assert["equal"](result, 6)'),
    source.replace("test('doubles supplied data', () =>", "test('doubles supplied data', { skip: false }, () =>"),
  ]) assert.equal(contract.reviewRequirementAssertionBindings(fixture(content), trusted).status, 'blocked', content);
});

test('changed requirements, duplicate source aliases, missing imports and source digests fail closed', () => {
  for (const mutate of [
    x => { x.requirements.push({ ...x.requirements[0] }); },
    x => { x.requirements.push({ id: 'R-2', statement: 'More behavior.', statementHash: sha('More behavior.'), mandatory: true }); },
    x => { x.files[0].sha256 = sha('changed'); },
    x => { x.files[0].path = '../subject.js'; },
    x => { x.files.push({ ...x.files[0], path: 'SUBJECT.js' }); },
    x => { x.reservations[1].reservationId = x.reservations[0].reservationId; },
  ]) {
    const input = fixture(); mutate(input);
    try { input.sourceHash = contract.computeAssertionSourceHash(input.files); }
    catch (error) { assert.match(error.message, /source|inventory/i); }
    input.reservations.forEach(reservation => { reservation.sourceHash = input.sourceHash; });
    assert.equal(contract.reviewRequirementAssertionBindings(input, trusted).status, 'blocked');
  }
});

test('runtime rejects forged artifact identity, future receipt and malformed TAP summaries', () => {
  for (const mutate of [
    x => { x.execution.artifactHash = sha('other artifact'); },
    x => { x.execution.contractId = 'other contract'; },
    x => { x.execution.kind = 'model_review'; },
    x => { x.execution.planHash = sha('other plan'); },
    x => { x.execution.bindingHash = sha('other bindings'); },
    x => { x.execution.commandHash = sha('other command'); },
    x => { x.execution.stderrHash = sha('other stderr'); },
    x => { x.execution.startedAt = '2026-11-02T10:01:01Z'; x.execution.completedAt = '2026-11-02T10:01:02Z'; },
    x => { delete x.expectedExecution.jobId; },
    x => { x.execution.stdout = x.execution.stdout.replace('# pass 1', '# pass 0'); },
    x => { x.execution.stdout += '# tests 1\n'; },
    x => { x.execution.stdout = x.execution.stdout.replace('1..1', '1..2'); },
    x => { x.execution.stdout = x.execution.stdout.replace('ok 1 -', 'ok 2 -'); },
    x => { x.execution.stdout = x.execution.stdout.replace('ok 1 -', '    ok 1 -'); },
  ]) {
    const input = executionFixture(); mutate(input);
    input.execution.stdoutHash = sha(input.execution.stdout);
    assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'blocked');
  }
});

function typedFixture({ declared = true, explicit = false, typedTest = false } = {}) {
  const input = fixture();
  input.files[0] = { path: 'subject.ts', content: 'export const double = (n: number): number => n * 2;' };
  if (explicit) input.files[1].content = input.files[1].content.replace('./subject.js', './subject.ts');
  if (typedTest) {
    input.files[1].path = 'subject.test.ts';
    input.files[1].content = input.files[1].content.replace('const result =', 'const result: number =');
    input.bindings[0].testFile = 'subject.test.ts';
  }
  input.files.push({ path: 'package.json', content: JSON.stringify({ type: 'module', ...(declared ? { devDependencies: { tsx: '^4.20.0' } } : {}) }) });
    try { input.sourceHash = contract.computeAssertionSourceHash(input.files); }
    catch (error) { assert.match(error.message, /source|inventory/i); }
  input.reservations.forEach(reservation => { reservation.sourceHash = input.sourceHash; reservation.bindingHash = contract.computeAssertionBindingHash(input.bindings); });
  return input;
}

test('command builder keeps direct Node default and derives only declared tsx for actual TS subjects', () => {
  assert.deepEqual(contract.buildRequirementAssertionCommand(fixture()), ['node', '--test', '--test-reporter=tap', 'subject.test.js']);
  const unusedLoader = fixture(); unusedLoader.files.push({ path: 'package.json', content: '{"devDependencies":{"tsx":"4"}}' });
  assert.deepEqual(contract.buildRequirementAssertionCommand(unusedLoader), ['node', '--test', '--test-reporter=tap', 'subject.test.js']);
  for (const options of [{}, { explicit: true }, { typedTest: true }]) {
    const input = typedFixture(options), result = contract.reviewRequirementAssertionBindings(input, trusted);
    assert.equal(result.status, 'ready', result.issues.join('; '));
    assert.deepEqual(contract.buildRequirementAssertionCommand(input, result.testFiles), ['node', '--import', 'tsx', '--test', '--test-reporter=tap', options.typedTest ? 'subject.test.ts' : 'subject.test.js']);
  }
});

test('TypeScript command derivation rejects undeclared loaders, ambiguous subjects and arbitrary injected args', () => {
  assert.throws(() => contract.buildRequirementAssertionCommand(typedFixture({ declared: false })), /tsx/i);
  const ambiguous = typedFixture(); ambiguous.files.push({ path: 'subject.tsx', content: 'export const double = (n: number) => n * 2;' });
  assert.equal(contract.reviewRequirementAssertionBindings(ambiguous, trusted).status, 'blocked');
  assert.throws(() => contract.buildRequirementAssertionCommand(typedFixture(), ['--eval=evil()']));
  const input = typedFixture();
  input.nodeArgs = ['--eval', 'evil()']; input.loader = 'untrusted';
  assert.deepEqual(contract.buildRequirementAssertionCommand(input), ['node', '--import', 'tsx', '--test', '--test-reporter=tap', 'subject.test.js']);
});

test('runtime TypeScript proof must use exactly the shared derived tsx command', () => {
  const input = { ...executionFixture(), ...typedFixture() };
  input.expectedExecution = { ...input.expectedExecution, sourceHash: input.sourceHash };
  input.execution = { ...input.execution, sourceHash: input.sourceHash, bindingHash: contract.computeAssertionBindingHash(input.bindings) };
  input.execution.sourceFence.sourceHash = input.sourceHash;
  input.execution.sourceFence.before.sourceHash = input.sourceHash;
  input.execution.sourceFence.after.sourceHash = input.sourceHash;
  input.execution.command = ['node', '--import', 'tsx', '--test', '--test-reporter=tap', 'subject.test.js'];
  input.execution.commandHash = sha(JSON.stringify(input.execution.command));
  assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'passed');
  input.execution.command = ['node', '--import', 'other-loader', '--test', '--test-reporter=tap', 'subject.test.js'];
  input.execution.commandHash = sha(JSON.stringify(input.execution.command));
  assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'blocked');
});

test('candidate listing exposes exact parsed assertion locations and inventory provenance without requirement inference', () => {
  const input = typedFixture();
  const result = contract.listRequirementAssertionCandidates(input.files);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.testFile, 'subject.test.js');
  assert.equal(candidate.testName, 'doubles supplied data');
  assert.equal(candidate.assertionLine, 6);
  assert.equal(candidate.testFileHash, sha(input.files[1].content));
  assert.deepEqual(candidate.importedSubjects, [{ path: 'subject.ts', sha256: sha(input.files[0].content) }]);
  assert.equal(Object.hasOwn(candidate, 'requirementId'), false);
  assert.equal(Object.hasOwn(candidate, 'expectation'), false);
});

test('candidate listing omits unsupported sources and reports bounded truncation', () => {
  const invalid = fixture(source.replace('assert.equal(result, 6)', 'assert.equal(1, 1)'));
  const result = contract.listRequirementAssertionCandidates(invalid.files);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].testFile, 'subject.test.js');
  const large = fixture(); large.files[1].content += '\n'.repeat(262145);
  assert.equal(contract.listRequirementAssertionCandidates(large.files).truncated, true);
  const duplicate = fixture(); duplicate.files.push({ ...duplicate.files[0] });
  assert.equal(contract.listRequirementAssertionCandidates(duplicate.files).candidates.length, 0);
});

test('opaque binary assets retain exact manifest hashes while executable scripts require valid UTF8', () => {
  const input = fixture(), bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
  const asset = { path: 'asset.png', content: null, contentBase64: bytes.toString('base64'), sha256: sha(bytes) };
  input.files.push(asset);
  const expected = sha(JSON.stringify(input.files.map(file => ({ path: file.path, sha256: file.sha256 || sha(file.content) })).sort((a, b) => a.path < b.path ? -1 : 1)));
  assert.equal(contract.computeAssertionSourceHash(input.files), expected);
  assert.deepEqual(contract.normalizeAssertionInventoryFile(asset), asset);
  input.sourceHash = expected; input.reservations.forEach(reservation => { reservation.sourceHash = expected; });
  assert.equal(contract.reviewRequirementAssertionBindings(input, trusted).status, 'ready');
  const invalidScript = fixture(); invalidScript.files[1] = { path: 'subject.test.js', content: null, contentBase64: bytes.toString('base64'), sha256: sha(bytes) };
  assert.equal(contract.listRequirementAssertionCandidates(invalidScript.files).candidates.length, 0);
  assert.throws(() => contract.normalizeAssertionInventoryFile({ ...asset, sha256: sha('forged') }));
  assert.throws(() => contract.normalizeAssertionInventoryFile({ ...asset, content: 'conflicting text' }));
  assert.throws(() => contract.normalizeAssertionInventoryFile({ ...asset, contentBase64: asset.contentBase64 + '=' }));
  const bufferFile = { path: 'asset.png', content: bytes };
  assert.equal(contract.computeAssertionSourceHash([bufferFile]), sha(JSON.stringify([{ path: 'asset.png', sha256: sha(bytes) }])));
});

test('caller-authoritative execution window supports a long current job but rejects out-of-window proof', () => {
  const input = executionFixture();
  input.execution.startedAt = '2026-11-02T09:50:00Z'; input.execution.completedAt = '2026-11-02T09:50:01Z';
  input.execution.sourceFence.before.observedAt = input.execution.startedAt;
  input.execution.sourceFence.after.observedAt = input.execution.completedAt;
  input.expectedExecution.authorizedWindow = { startedAt: '2026-11-02T09:45:00Z', deadline: '2026-11-02T10:10:00Z' };
  assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'passed');
  input.expectedExecution.authorizedWindow.startedAt = '2026-11-02T09:51:00Z';
  assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'blocked');
  input.expectedExecution.authorizedWindow = { startedAt: '2026-11-02T09:45:00Z', deadline: '2026-11-02T09:50:00Z' };
  assert.equal(contract.evaluateRequirementAssertionExecution(input, trusted).status, 'blocked');
});

test('missing, replayed or mismatched worker source measurements cannot authorize assertion evidence',()=>{
  for(const mutate of [x=>delete x.execution.sourceFence,x=>x.execution.sourceFence.after.matched=false,
    x=>x.execution.sourceFence.after.sourceHash=sha('foreign'),x=>x.execution.sourceFence.after.nonce=x.execution.sourceFence.before.nonce,
    x=>x.execution.sourceFence.before.observedAt='2026-11-02T10:00:02Z',
    x=>x.execution.sourceFence.after.observedAt='2026-11-02T09:59:59Z']) {
      const input=executionFixture();mutate(input);assert.equal(contract.evaluateRequirementAssertionExecution(input,trusted).status,'blocked');
  }
});
