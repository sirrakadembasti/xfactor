import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeLocalExecutionAdapter, requireSandboxCapabilities } from '../../backend/verification/sandboxRunner.js';
test('local profile requires operator consent and cannot be forged by serialized capabilities', () => {
  const capabilities = Object.freeze({ available: true, isolation: false, osIsolation: false, executionProfile: 'local-trusted' });
  const adapter = { getCapabilities: () => capabilities };
  assert.throws(() => requireSandboxCapabilities(adapter), /unavailable/);
  assert.throws(() => authorizeLocalExecutionAdapter(adapter, { trustLocalCode: false }), /consent/);
  authorizeLocalExecutionAdapter(adapter, { trustLocalCode: true });
  assert.equal(requireSandboxCapabilities({ ...adapter }).osIsolation, false);
  assert.throws(() => requireSandboxCapabilities({ getCapabilities: () => ({ ...capabilities }) }), /unavailable/);
});
