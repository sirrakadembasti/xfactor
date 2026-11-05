import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateJob } from '../protocol.js';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
    const input = Buffer.from('isolated archive fixture');
    const job = { version: 1, jobId: 'job', operation: 'verify_artifact', projectId: 'p', contractId: 'c', contractHash: 'a'.repeat(64),
        revision: 3, artifactId: 'artifact', archiveBase64: input.toString('base64'), deadline: Date.now() + 30000,
        nonce: 'b'.repeat(64), inputSha256: hash(input), runId: 'run', contract: {} };
    job.verificationPlan = { version: 1, contractId: 'c', runId: 'run', artifactHash: job.inputSha256, sourceHash: 'c'.repeat(64), planHash: 'd'.repeat(64) };
    return job;
}
test('verification plan is a bounded separate same-job input, never an approved contract rewrite', () => {
    const job = fixture(), before = structuredClone(job);
    const result = validateJob(job);
    assert.equal(result.valid, true, result.reason);
    assert.deepEqual(result.job.verificationPlan, job.verificationPlan);
    assert.notEqual(result.job.verificationPlan, job.verificationPlan);
    assert.deepEqual(job, before); assert.deepEqual(result.job.contract, {});
});
test('foreign identities, hidden host options and unbounded verification plans are rejected', () => {
    for (const delta of [{ runId: 'old' }, { contractId: 'other' }, { artifactHash: 'f'.repeat(64) }, { hostPath: 'C:/private' }, { sourceHash: 'bad' }, { uiLanguageReview: { x: 'x'.repeat(300000) } }]) {
        const job = fixture(); Object.assign(job.verificationPlan, delta);
        assert.equal(validateJob(job).valid, false);
    }
});
