import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { validateJob } from '../protocol.js';

const now = Date.now();
const bytes = Buffer.from('deadline fixture');
const base = {
    version: 1,
    jobId: 'deadline-fixture',
    operation: 'verify_artifact',
    projectId: 'project',
    contractId: 'contract',
    contractHash: 'a'.repeat(64),
    revision: 1,
    artifactId: 'artifact',
    contract: {},
    nonce: 'b'.repeat(64),
    inputSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    archiveBase64: bytes.toString('base64'),
    runId: 'run'
};

test('bounded clean-room job accepts 20 minutes but rejects beyond 25 minutes', () => {
    assert.strictEqual(validateJob({ ...base, deadline: now + 20 * 60 * 1000 }, now).valid, true);
    assert.strictEqual(validateJob({ ...base, deadline: now + 26 * 60 * 1000 }, now).valid, false);
});
