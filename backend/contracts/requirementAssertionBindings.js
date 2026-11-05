import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { parse } from '@babel/parser';

/**
 * Pure fail-closed evidence contract; does not read files, run tests, or authenticate
 * submitted claims itself. The caller supplies authoritative approved requirements,
 * exact source contents, a plan hash, and synchronous authentication callbacks backed
 * by durable reservation/worker records. Returning true from those callbacks is a
 * caller trust boundary, never a replacement for authenticating those records.
 *
 * Supported source: ESM literal top-level test()/it() imported from node:test,
 * node:assert/strict assertions, local inventory imports, straight-line callbacks.
 * Runtime: flat explicit node:test TAP only; declared tsx may load local TS subjects.
 * These are standalone local subject fixtures; never assume smoke-test services
 * remain alive after their teardown. Structural provenance is NOT universal
 * semantic proof. Independent meaning review remains advisory and must be combined
 * with authenticated machine execution. Do not grant product acceptance from a model
 * PASS or this structural review alone. No hashes omit lockfiles automatically.
 */
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const fail = message => { throw new Error(message); };
const requireThat = (condition, message) => { if (!condition) fail(message); };
const safePath = path => nonempty(path) && !path.includes('\\') && !path.includes('\0') && !path.includes(':') && !path.startsWith('/') && !path.endsWith('/') && posix.normalize(path) === path && !path.split('/').some(part => part === '..' || part === '.');
export function normalizeAssertionInventoryFile(file) {
  requireThat(file && safePath(file.path), 'Invalid source inventory path.');
  let bytes;
  if (file.contentBase64 !== undefined) {
    requireThat(typeof file.contentBase64 === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64), 'Invalid source byte encoding.');
    bytes = Buffer.from(file.contentBase64, 'base64');
    requireThat(bytes.toString('base64') === file.contentBase64, 'Noncanonical source byte encoding.');
  } else if (typeof file.content === 'string' || file.content instanceof Uint8Array) bytes = Buffer.from(file.content);
  else fail('Exact source bytes are required.');
  if (file.content !== undefined && file.content !== null) {
    requireThat(typeof file.content === 'string' || file.content instanceof Uint8Array, 'Invalid source text representation.');
    requireThat(Buffer.from(file.content).equals(bytes), 'Source text and exact bytes disagree.');
  }
  const sha256 = digest(bytes);
  requireThat(file.sha256 === undefined || file.sha256 === sha256, 'Source byte digest changed.');
  const text = bytes.toString('utf8');
  return { path: file.path, content: Buffer.from(text, 'utf8').equals(bytes) ? text : null,
    contentBase64: bytes.toString('base64'), sha256 };
}
export const computeAssertionSourceHash = files => digest(files.map(normalizeAssertionInventoryFile).map(file => ({ path: file.path, sha256: file.sha256 })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
export const computeAssertionBindingHash = bindings => digest(bindings.map(({ requirementId, testFile, testName, assertionLine, expectation }) => ({ requirementId, testFile, testName, assertionLine, expectation })).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0));

const equality = new Set(['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'notEqual', 'notStrictEqual', 'notDeepEqual', 'notDeepStrictEqual']);
const isTypeScript = path => /\.tsx?$/.test(path);
function resolvedSubject(testFile, module, inventory) {
  requireThat(module.startsWith('./') || module.startsWith('../'), 'Subject must be an explicit local source import.');
  const resolved = posix.normalize(posix.join(posix.dirname(testFile), module));
  requireThat(safePath(resolved), 'Imported subject path is unsafe.');
  const candidates = [resolved, ...(/\.js$/.test(resolved) ? [resolved.slice(0, -3) + '.ts', resolved.slice(0, -3) + '.tsx'] : [])].filter(path => inventory.has(path));
  requireThat(candidates.length === 1, 'Imported subject is absent or ambiguous in the exact source inventory.');
  return candidates[0];
}

/** Derives the complete exact argv; callers cannot supply loader names or extra flags. */
export function buildRequirementAssertionCommand(input, reviewedTestFiles) {
  requireThat(input && Array.isArray(input.files) && Array.isArray(input.bindings) && input.bindings.length > 0, 'Exact source inventory and bindings are required for the assertion command.');
  const inventory = new Map();
  for (const file of input.files.map(normalizeAssertionInventoryFile)) {
    requireThat(!inventory.has(file.path), 'Invalid command source inventory.');
    inventory.set(file.path, file);
  }
  const boundFiles = [...new Set(input.bindings.map(binding => binding.testFile))].sort();
  requireThat(boundFiles.every(path => safePath(path) && !path.startsWith('-') && inventory.has(path)), 'Assertion command file is absent, unsafe or resembles a CLI option.');
  requireThat(reviewedTestFiles === undefined || Array.isArray(reviewedTestFiles) && JSON.stringify([...reviewedTestFiles].sort()) === JSON.stringify(boundFiles), 'Assertion command files must match the exact reviewed bindings.');
  let needsTsx = false;
  for (const path of boundFiles) {
    const tests = inspectedTests(inventory.get(path), inventory);
    if (isTypeScript(path) || tests.some(test => test.subjectFiles.some(isTypeScript))) needsTsx = true;
  }
  if (needsTsx) {
    let manifest;
    try { manifest = JSON.parse(inventory.get('package.json')?.content || 'null'); }
    catch { fail('Valid root package.json with an existing tsx dependency is required.'); }
    requireThat(manifest && (nonempty(manifest.dependencies?.tsx) || nonempty(manifest.devDependencies?.tsx)), 'TypeScript assertions require tsx already declared in root package.json dependencies or devDependencies.');
  }
  return ['node', ...(needsTsx ? ['--import', 'tsx'] : []), '--test', '--test-reporter=tap', ...boundFiles];
}

/**
 * Prompt aid only: exact AST candidates, never requirement ownership or acceptance.
 * At most 4096 inventory files/16 MiB, 128 node:test-importing files, 256 KiB per
 * inspected file/2 MiB total, 256 candidates and 32 diagnostics are retained.
 * Unsupported files yield no candidates; invalid inventories yield none at all.
 * importedSubjects names the test module's actual local imports, not a claim that
 * every imported subject participates in every assertion's semantic expectation.
 */
export function listRequirementAssertionCandidates(files) {
  const result = { candidates: [], diagnostics: [], truncated: false };
  const diagnostic = (testFile, reason) => {
    if (result.diagnostics.length < 32) result.diagnostics.push({ testFile, reason: String(reason).slice(0, 512) });
    else result.truncated = true;
  };
  try {
    requireThat(Array.isArray(files) && files.length <= 4096, 'Candidate inventory must contain at most 4096 source files.');
    const inventory = new Map(), names = new Set();
    let inventoryBytes = 0;
    for (const file of files.map(normalizeAssertionInventoryFile)) {
      requireThat(!names.has(file.path.toLowerCase()), 'Invalid or duplicate candidate inventory path.');
      inventoryBytes += Buffer.from(file.contentBase64, 'base64').length;
      requireThat(inventoryBytes <= 16 * 1024 * 1024, 'Candidate inventory exceeds 16 MiB.');
      inventory.set(file.path, file); names.add(file.path.toLowerCase());
    }
    const tests = [...inventory.values()].filter(file => /\.(?:[cm]?js|tsx?)$/.test(file.path) && typeof file.content === 'string' && file.content.includes('node:test')).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    let inspectedBytes = 0;
    for (let index = 0; index < tests.length; index++) {
      const file = tests[index], bytes = Buffer.byteLength(file.content);
      if (index >= 128 || inspectedBytes + bytes > 2 * 1024 * 1024) { result.truncated = true; diagnostic(file.path, 'Candidate inspection budget exceeded.'); break; }
      inspectedBytes += bytes;
      if (bytes > 256 * 1024) { result.truncated = true; diagnostic(file.path, 'Test source exceeds the 256 KiB inspection ceiling.'); continue; }
      try {
        const parsed = inspectedTests(file, inventory);
        for (const test of parsed) for (const assertion of test.assertions) {
          if (test.assertions.filter(other => other.line === assertion.line).length !== 1) { diagnostic(file.path, 'Multiple assertions share a declared line; candidate omitted.'); continue; }
          if (result.candidates.length >= 256) { result.truncated = true; diagnostic(file.path, 'Assertion candidate budget exceeded.'); return result; }
          result.candidates.push({ testFile: file.path, testName: test.testName, testLine: test.testLine,
            assertionLine: assertion.line, assertionColumn: assertion.column, assertionHash: assertion.assertionHash,
            testFileHash: digest(file.content), importedSubjects: test.subjectFiles.map(path => ({ path, sha256: digest(inventory.get(path).content) })) });
        }
      } catch (error) { diagnostic(file.path, error.message); }
    }
  } catch (error) {
    result.candidates = [];
    result.truncated = /(?:at most|exceeds)/.test(error.message);
    diagnostic(null, error.message);
  }
  return result;
}

function inspectedTests(file, inventory) {
  requireThat(typeof file.content === 'string', 'Executable test source must be valid UTF8.');
  const ast = parse(file.content, { sourceType: 'module', errorRecovery: false, plugins: isTypeScript(file.path) ? ['typescript', ...(file.path.endsWith('.tsx') ? ['jsx'] : [])] : [] });
  const testImports = new Set(), assertImports = new Set(), assertionImports = new Map(), subjects = new Map();
  const identifiers = new Set();
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    requireThat(statement.specifiers.length > 0, 'Side-effect import context is unsupported.');
    requireThat(statement.importKind !== 'type', 'Type-only import cannot establish runtime subject provenance.');
    const module = statement.source.value;
    for (const spec of statement.specifiers) {
      requireThat(spec.importKind !== 'type', 'Type-only import cannot establish runtime subject provenance.');
      requireThat(!identifiers.has(spec.local.name), 'Ambiguous imported identifier.');
      identifiers.add(spec.local.name);
      const imported = spec.imported?.name;
      if (module === 'node:test') {
        requireThat(spec.type === 'ImportDefaultSpecifier' || (spec.type === 'ImportSpecifier' && ['test', 'it'].includes(imported)), 'Unsupported node:test import.');
        testImports.add(spec.local.name);
      } else if (module === 'node:assert/strict') {
        if (spec.type === 'ImportDefaultSpecifier') assertImports.add(spec.local.name);
        else {
          requireThat(spec.type === 'ImportSpecifier' && (equality.has(imported) || imported === 'ok'), 'Unsupported strict assertion import.');
          assertionImports.set(spec.local.name, imported);
        }
      } else if (module === 'node:assert' && imported === 'strict') assertImports.add(spec.local.name);
      else {
        subjects.set(spec.local.name, resolvedSubject(file.path, module, inventory));
      }
    }
  }
  const tests = [];
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') continue;
    requireThat(statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression', 'Unsupported test module context.');
    const call = statement.expression;
    requireThat(call.callee.type === 'Identifier' && testImports.has(call.callee.name) && call.arguments.length === 2, 'Test must use a direct imported node:test name without options or modifiers.');
    const [name, callback] = call.arguments;
    requireThat(name.type === 'StringLiteral' && nonempty(name.value) && !/[\x00-\x1f\x7f#\\]/.test(name.value), 'Test name must be an unambiguous string literal.');
    requireThat(['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type) && callback.params.length === 0 && callback.body.type === 'BlockStatement' && !callback.generator, 'Unsupported callback context.');
    requireThat(!callback.id || !identifiers.has(callback.id.name), 'Callback name shadows an imported binding.');
    const locals = new Map();
    const assertions = [];
    function origin(node) {
      if (!node) return null;
      if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(node.type)) return 'data';
      if (node.type === 'Identifier') return locals.get(node.name) || null;
      if (node.type === 'AwaitExpression') return origin(node.argument);
      if (node.type === 'UnaryExpression' && ['-', '+', '!'].includes(node.operator)) return origin(node.argument);
      if (node.type === 'ArrayExpression') return node.elements.every(element => origin(element) === 'data') ? 'data' : null;
      if (node.type === 'ObjectExpression') return node.properties.every(prop => prop.type === 'ObjectProperty' && !prop.computed && !prop.method && origin(prop.value) === 'data') ? 'data' : null;
      if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' && origin(node.object) === 'subject') return 'subject';
      if (node.type === 'CallExpression' && node.arguments.length > 0 && node.arguments.every(arg => origin(arg) === 'data')) {
        if (node.callee.type === 'Identifier' && subjects.has(node.callee.name) && !locals.has(node.callee.name)) return 'subject';
        if (node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.object.type === 'Identifier' && subjects.has(node.callee.object.name) && !locals.has(node.callee.object.name)) return 'subject';
      }
      return null;
    }
    for (const body of callback.body.body) {
      if (body.type === 'VariableDeclaration') {
        requireThat(body.kind === 'const', 'Only immutable local data is supported.');
        for (const declaration of body.declarations) {
          requireThat(declaration.id.type === 'Identifier' && !identifiers.has(declaration.id.name) && !locals.has(declaration.id.name), 'Shadowed or dynamic binding.');
          const valueOrigin = origin(declaration.init);
          requireThat(valueOrigin, 'Unknown local data or subject provenance.');
          locals.set(declaration.id.name, valueOrigin);
        }
        continue;
      }
      requireThat(body.type === 'ExpressionStatement' && body.expression.type === 'CallExpression', 'Assertion must execute directly in a straight-line callback.');
      const assertion = body.expression;
      let method;
      if (assertion.callee.type === 'Identifier') method = assertionImports.get(assertion.callee.name) || (assertImports.has(assertion.callee.name) ? 'ok' : null);
      if (assertion.callee.type === 'MemberExpression' && !assertion.callee.computed && assertion.callee.object.type === 'Identifier' && assertImports.has(assertion.callee.object.name)) method = assertion.callee.property.name;
      requireThat((equality.has(method) || method === 'ok') && origin(assertion.arguments[0]) === 'subject', 'No nontrivial strict subject assertion.');
      requireThat(method === 'ok' ? assertion.arguments.length === 1 : assertion.arguments.length === 2 && origin(assertion.arguments[1]) === 'data', 'Expected assertion value must be independently supplied static data.');
      assertions.push({ line: assertion.loc.start.line, column: assertion.loc.start.column, assertionHash: digest(file.content.slice(assertion.start, assertion.end)) });
    }
    requireThat(assertions.length > 0, 'Test has no supported assertion.');
    requireThat(!tests.some(existing => existing.testName === name.value), 'Duplicate test name.');
    tests.push({ testName: name.value, testLine: call.loc.start.line, assertions, subjectFiles: [...new Set(subjects.values())] });
  }
  requireThat(tests.length > 0, 'No supported node:test cases.');
  return tests;
}

function review(input, trust) {
  requireThat(input && Array.isArray(input.requirements) && input.requirements.length > 0 && Array.isArray(input.files) && input.files.length > 0 && Array.isArray(input.bindings) && input.bindings.length > 0, 'Approved requirements, exact files and explicit bindings are required.');
  requireThat(HASH.test(input.sourceHash) && HASH.test(input.planHash), 'Exact source and approved plan SHA256 are required.');
  const inventory = new Map(), canonicalPaths = new Set();
  for (const file of input.files.map(normalizeAssertionInventoryFile)) {
    requireThat(!canonicalPaths.has(file.path.toLowerCase()), 'Invalid or duplicate inventory path.');
    inventory.set(file.path, file);
    canonicalPaths.add(file.path.toLowerCase());
  }
  requireThat(computeAssertionSourceHash(input.files) === input.sourceHash, 'Exact source hash changed.');
  const requirements = new Map();
  for (const requirement of input.requirements) {
    requireThat(nonempty(requirement.id) && nonempty(requirement.statement) && HASH.test(requirement.statementHash) && digest(requirement.statement) === requirement.statementHash && !requirements.has(requirement.id) && typeof requirement.mandatory === 'boolean', 'Invalid, duplicate or changed authoritative requirement.');
    requirements.set(requirement.id, requirement);
  }
  const bindingHash = computeAssertionBindingHash(input.bindings);
  requireThat(typeof trust?.authenticateReservation === 'function' && Array.isArray(input.reservations) && input.reservations.length === 2, 'Independent reservation authentication is required.');
  const reservations = new Map();
  for (const reservation of input.reservations) {
    requireThat(['reviewer', 'tester'].includes(reservation.role) && !reservations.has(reservation.role) && nonempty(reservation.reservationId) && reservation.approved === true && reservation.sourceHash === input.sourceHash && reservation.planHash === input.planHash && reservation.bindingHash === bindingHash, 'Review reservation does not approve this exact plan, source and bindings.');
    requireThat(trust.authenticateReservation(reservation, { sourceHash: input.sourceHash, planHash: input.planHash, bindingHash }) === true, 'Review reservation was not independently authenticated.');
    reservations.set(reservation.role, reservation);
  }
  const reviewer = reservations.get('reviewer'), tester = reservations.get('tester');
  requireThat(reviewer.reservationId !== tester.reservationId && (!reviewer.actorId || !tester.actorId || reviewer.actorId !== tester.actorId), 'Independent review reservations must be distinct.');
  const parsed = new Map(), seen = new Set(), locations = new Set(), reviewedBindings = [];
  for (const binding of input.bindings) {
    requireThat(requirements.has(binding.requirementId) && safePath(binding.testFile) && inventory.has(binding.testFile) && nonempty(binding.testName) && Number.isSafeInteger(binding.assertionLine) && binding.assertionLine > 0 && nonempty(binding.expectation), 'Invalid or foreign requirement assertion binding.');
    const key = `${binding.requirementId}\0${binding.testFile}\0${binding.testName}\0${binding.assertionLine}`;
    const location = `${binding.testFile}\0${binding.assertionLine}`;
    requireThat(!seen.has(key) && !locations.has(location), 'Duplicate or reused assertion binding.');
    seen.add(key); locations.add(location);
    if (!parsed.has(binding.testFile)) parsed.set(binding.testFile, inspectedTests(inventory.get(binding.testFile), inventory));
    const matches = parsed.get(binding.testFile).filter(item => item.testName === binding.testName);
    requireThat(matches.length === 1, 'Named test is missing or ambiguous.');
    const assertions = matches[0].assertions.filter(item => item.line === binding.assertionLine);
    requireThat(assertions.length === 1, 'Declared assertion line is absent or ambiguous.');
    reviewedBindings.push({ ...binding, statementHash: requirements.get(binding.requirementId).statementHash, testLine: matches[0].testLine, ...assertions[0], testFileHash: digest(inventory.get(binding.testFile).content) });
  }
  requireThat([...requirements.values()].filter(item => item.mandatory).every(item => reviewedBindings.some(binding => binding.requirementId === item.id)), 'Mandatory requirement has no reviewed actual assertion binding.');
  const named = new Set();
  for (const tests of parsed.values()) for (const test of tests) {
    requireThat(!named.has(test.testName), 'Test name is ambiguous across files.');
    named.add(test.testName);
  }
  const testFiles = [...parsed.keys()].sort();
  const testCommand = buildRequirementAssertionCommand(input, testFiles);
  return { status: 'ready', sourceHash: input.sourceHash, planHash: input.planHash, bindingHash, reviewedBindings, expectedTestNames: [...named].sort(), testFiles, testCommand, issues: [] };
}

export function reviewRequirementAssertionBindings(input, trust = {}) {
  try { return review(input, trust); }
  catch (error) { return { status: 'blocked', issues: [error.message] }; }
}

function successfulTap(stdout, names) {
  requireThat(typeof stdout === 'string' && stdout.startsWith('TAP version 13\n'), 'TAP output is absent or unsupported.');
  const lines = stdout.trimEnd().split(/\r?\n/), cases = [], summary = new Map();
  let plan;
  for (const line of lines.slice(1)) {
    let match;
    if ((match = /^ok (\d+) - ([^#]+)$/.exec(line))) cases.push({ number: Number(match[1]), name: match[2] });
    else if ((match = /^1\.\.(\d+)$/.exec(line))) { requireThat(plan === undefined, 'Duplicate TAP plan.'); plan = Number(match[1]); }
    else if ((match = /^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line))) { requireThat(!summary.has(match[1]), 'Duplicate TAP summary.'); summary.set(match[1], Number(match[2])); }
    else requireThat(line === '' || /^# Subtest: [^\r\n]+$/.test(line) || /^# duration_ms \d+(?:\.\d+)?$/.test(line) || /^  (?:---|\.\.\.|duration_ms: \d+(?:\.\d+)?|type: 'test')$/.test(line), 'Unsupported or ambiguous TAP output.');
  }
  requireThat(cases.length > 0 && plan === cases.length && summary.get('tests') === cases.length && summary.get('pass') === cases.length && summary.get('suites') === 0 && ['fail', 'cancelled', 'skipped', 'todo'].every(key => summary.get(key) === 0), 'TAP summary does not prove a successful non-skipped execution.');
  requireThat(cases.every((item, index) => item.number === index + 1) && new Set(cases.map(item => item.name)).size === cases.length, 'Duplicate or ambiguous TAP cases.');
  requireThat(JSON.stringify(cases.map(item => item.name).sort()) === JSON.stringify(names), 'TAP case names do not match reviewed source.');
  return cases;
}

export function evaluateRequirementAssertionExecution(input, trust = {}) {
  try {
    const result = review(input, trust), execution = input.execution, expected = input.expectedExecution;
    requireThat(execution && expected && typeof trust.authenticateReceipt === 'function', 'Caller-authenticated worker execution is required.');
    requireThat(nonempty(expected.workerId) || nonempty(expected.jobId), 'Authoritative worker or job identity is required.');
    for (const field of ['checkId', 'runId', 'artifactId', 'sourceHash', 'artifactHash', 'contractId', ...['workerId', 'jobId'].filter(key => expected[key] !== undefined)]) requireThat(nonempty(expected[field]) && execution[field] === expected[field], `Worker execution ${field} changed or absent.`);
    requireThat(HASH.test(expected.artifactHash) && expected.sourceHash === result.sourceHash && execution.kind === 'test_suite_execution' && execution.planHash === result.planHash && execution.bindingHash === result.bindingHash, 'Worker execution is not bound to the reviewed artifact, source and plan.');
    const command = buildRequirementAssertionCommand(input, result.testFiles);
    requireThat(JSON.stringify(execution.command) === JSON.stringify(command) && execution.commandHash === digest(command), 'Worker test-suite command is not exact.');
    requireThat(execution.exitCode === 0 && typeof execution.stdout === 'string' && typeof execution.stderr === 'string' && execution.stdoutHash === digest(execution.stdout) && execution.stderrHash === digest(execution.stderr), 'Execution exit status or output digests are invalid.');
    const now = trust.now ?? Date.now(), maxAgeMs = trust.maxAgeMs ?? 300000;
    const started = Date.parse(execution.startedAt), completed = Date.parse(execution.completedAt);
    requireThat(Number.isFinite(now) && Number.isFinite(started) && Number.isFinite(completed) && started <= completed && completed <= now, 'Worker execution has invalid timestamps.');
    const fence = execution.sourceFence;
    requireThat(fence?.version === 1 && fence.sourceHash === result.sourceHash
      && [fence.before, fence.after].every(probe => probe?.version === 1 && probe.matched === true
        && probe.sourceHash === result.sourceHash && HASH.test(probe.nonce || ''))
      && fence.before.nonce !== fence.after.nonce
      && Number.isFinite(Date.parse(fence.before.observedAt)) && Number.isFinite(Date.parse(fence.after.observedAt))
      && Date.parse(fence.before.observedAt) <= started && Date.parse(fence.after.observedAt) >= completed
      && Date.parse(fence.after.observedAt) <= now
      && started - Date.parse(fence.before.observedAt) <= 30000
      && Date.parse(fence.after.observedAt) - completed <= 30000,
    'Fresh before/after worker source measurements are required.');
    if (expected.authorizedWindow !== undefined) {
      const windowStart = Date.parse(expected.authorizedWindow?.startedAt), windowEnd = Date.parse(expected.authorizedWindow?.deadline);
      requireThat(Number.isFinite(windowStart) && Number.isFinite(windowEnd) && windowStart <= windowEnd
        && windowEnd - windowStart <= 30 * 60 * 1000 && started >= windowStart && completed <= windowEnd,
      'Worker execution is outside its caller-authoritative job window.');
    } else requireThat(Number.isFinite(maxAgeMs) && maxAgeMs > 0 && now - started <= maxAgeMs, 'Worker execution is stale.');
    requireThat(trust.authenticateReceipt(execution, expected) === true, 'Worker receipt was not independently authenticated.');
    const cases = successfulTap(execution.stdout, result.expectedTestNames);
    return { ...result, status: 'passed', cases, executionIdentity: { ...expected }, issues: [] };
  } catch (error) { return { status: 'blocked', issues: [error.message] }; }
}
