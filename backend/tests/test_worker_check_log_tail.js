import assert from 'node:assert/strict';
import { createTestHarness } from './testHarness.js';
import { normalizeWorkerCheckLog, redactObservedEvidence } from '../verification/workerFailures.js';

const { runAsyncTest, finish } = createTestHarness();
const failureBlock = "not ok 19 - stok azaltma\n  error: 'Promise resolution is still pending'\n";
const tap = `TAP version 13\n${'ok 1 - passes the middle of a long run\n'.repeat(1100)}${failureBlock}1..19\n# fail 1\n`;

await runAsyncTest('long TAP output keeps the trailing failure block in retained evidence', () => {
    assert.ok(Buffer.byteLength(tap) > 40000);
    const log = normalizeWorkerCheckLog({ stdout: tap, stderr: '', reason: 'x' });
    assert.ok(Buffer.byteLength(log.stdout) <= 16384, `retained ${Buffer.byteLength(log.stdout)} bytes`);
    assert.equal(log.stdoutTruncated, true);
    assert.equal(log.stderrTruncated, false);
    assert.match(log.stdout, /^TAP version 13\n/);
    assert.ok(log.stdout.includes(failureBlock), 'the trailing not ok block must survive');
    assert.match(log.stdout, /# fail 1\n$/);
    assert.match(log.stdout, /…\[kesildi: \d+ bayt\]…/);
});

await runAsyncTest('output within the limit is kept verbatim', () => {
    const log = normalizeWorkerCheckLog({ stdout: 'ok 1\nnot ok 2\n', stderr: 'warn', reason: 'short' });
    assert.equal(log.stdout, 'ok 1\nnot ok 2\n');
    assert.equal(log.stdoutTruncated, false);
    assert.equal(log.reason, 'short');
});

await runAsyncTest('worker-reported truncation is preserved and secrets are redacted before the cut', () => {
    const noisy = `${'a'.repeat(30000)}\npassword=sentinel-private-value\n${failureBlock}`;
    const log = normalizeWorkerCheckLog({ stdout: noisy, stderr: '', stdoutTruncated: true });
    assert.equal(log.stdoutTruncated, true);
    assert.ok(!log.stdout.includes('sentinel-private-value'));
    assert.ok(log.stdout.includes(failureBlock));
    assert.equal(normalizeWorkerCheckLog({ stdout: 'tiny', stdoutTruncated: true }).stdoutTruncated, true);
});

await runAsyncTest('evidence strings and reasons are bounded with head and tail too', () => {
    const evidence = redactObservedEvidence({ output: tap });
    assert.ok(Buffer.byteLength(evidence.output) <= 16384);
    assert.ok(evidence.output.includes(failureBlock));
    const reason = normalizeWorkerCheckLog({ reason: `start ${'r'.repeat(5000)} end-of-reason` }).reason;
    assert.ok(Buffer.byteLength(reason) <= 2048);
    assert.match(reason, /^start /);
    assert.match(reason, /end-of-reason$/);
});

finish();
