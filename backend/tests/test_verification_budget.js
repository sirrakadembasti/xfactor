import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationJobTimeoutMs, verificationJobDeadline } from '../verification/verificationBudget.js';
import { MAX_JOB_MS } from '../../execution/limits.js';
import { validateRuntimeConfig } from '../config.js';

test('verification budget defaults to 15 minutes and supports bounded operator overrides', () => {
    assert.equal(verificationJobTimeoutMs({}), 900000);
    assert.equal(verificationJobTimeoutMs({ VERIFICATION_JOB_TIMEOUT_MS: '1500000' }), MAX_JOB_MS);
    assert.equal(verificationJobTimeoutMs({ VERIFICATION_JOB_TIMEOUT_MS: '1000' }), 1000);
    for (const value of ['NaN', '-1', '0', '1.5', '1500001', 'Infinity', '1e6', '900000oops']) {
        assert.throws(() => verificationJobTimeoutMs({ VERIFICATION_JOB_TIMEOUT_MS: value }), /VERIFICATION_JOB_TIMEOUT_MS/);
    }
});

test('new deadlines use the same budget, but supplied current job identity is never extended', () => {
    const now = 1000000;
    assert.equal(verificationJobDeadline({ env: {}, now }), now + 900000);
    assert.equal(verificationJobDeadline({ env: { VERIFICATION_JOB_TIMEOUT_MS: '1500000' }, now }), now + MAX_JOB_MS);
    const job = { jobId: 'current-job', nonce: 'same-nonce', deadline: now + 5000 };
    const before = structuredClone(job);
    assert.equal(verificationJobDeadline({ deadline: job.deadline, env: { VERIFICATION_JOB_TIMEOUT_MS: '1500000' }, now }), job.deadline);
    assert.deepEqual(job, before);
    for (const deadline of [now, now - 1, NaN, Infinity, now + MAX_JOB_MS + 1]) {
        assert.throws(() => verificationJobDeadline({ deadline, now }), /deadline/i);
    }
});

test('runtime config validates the same operator setting before creating jobs', () => {
    const env = { NODE_ENV: 'development', VERIFICATION_JOB_TIMEOUT_MS: '1200000' };
    assert.equal(validateRuntimeConfig(env).VERIFICATION_JOB_TIMEOUT_MS, 1200000);
    assert.equal(validateRuntimeConfig({ NODE_ENV: 'development' }).VERIFICATION_JOB_TIMEOUT_MS, 900000);
    assert.throws(() => validateRuntimeConfig({ ...env, VERIFICATION_JOB_TIMEOUT_MS: '1500001' }), /VERIFICATION_JOB_TIMEOUT_MS/);
});
