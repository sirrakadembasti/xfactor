import test from 'node:test';
import assert from 'node:assert/strict';
import { hasExecutedTests } from '../../backend/verification/testInfrastructureVerifier.js';
test('Node TAP file fallback does not prove a test declaration executed', () => {
  const options = { testScript: 'node --test tests/app.test.js', files: [{ path: 'tests/app.test.js', content: '// empty' }] };
  assert.equal(hasExecutedTests('TAP version 13\n# Subtest: tests\\app.test.js\nok 1 - tests\\app.test.js\n# tests 1\n# pass 1\n# fail 0', options), false);
  assert.equal(hasExecutedTests('TAP version 13\n# Subtest: real database assertion\nok 1 - real database assertion\n# tests 1\n# pass 1\n# fail 0', options), true);
  assert.equal(hasExecutedTests('TAP version 13\n# tests 0\n# pass 0', options), false);
  assert.equal(hasExecutedTests('TAP version 13\n# Subtest: phantom\n# Subtest: tests/empty.test.js\nok 1 - tests/empty.test.js\n# tests 1\n# pass 1\n# fail 0', { ...options, files: [{ path: 'tests/empty.test.js' }] }), false);
});
