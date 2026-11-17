import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateJob } from '../protocol.js';
import { runTypecheckProbe } from '../../backend/verification/runChecks.js';
const hash = value => createHash('sha256').update(value).digest('hex');
function job(operation = 'typecheck_artifact') {
    const input = Buffer.from('isolated archive fixture');
    return { version: 1, jobId: 'job', operation, projectId: 'p', contractId: 'c', contractHash: 'a'.repeat(64), revision: 3,
        artifactId: 'typecheck-probe-job', archiveBase64: input.toString('base64'), deadline: Date.now() + 30000,
        nonce: 'b'.repeat(64), inputSha256: hash(input), runId: 'typecheck-probe-job', contract: {} };
}
test('the typecheck probe is an archive job with the same identity and no verification plan', () => {
    const accepted = validateJob(job());
    assert.equal(accepted.valid, true, accepted.reason);
    assert.equal(accepted.job.operation, 'typecheck_artifact');
    const planned = job(); planned.verificationPlan = { version: 1, contractId: 'c', runId: planned.runId, artifactHash: planned.inputSha256,
        sourceHash: 'c'.repeat(64), planHash: 'd'.repeat(64) };
    assert.equal(validateJob(planned).valid, false);
    const manifestOnly = job(); delete manifestOnly.archiveBase64; manifestOnly.packageJsonBase64 = Buffer.from('{}').toString('base64');
    assert.equal(validateJob(manifestOnly).valid, false);
    assert.equal(validateJob(job('run_anything')).valid, false);
});
function adapter(results = {}) {
    const commands = [];
    return { commands, id: 'docker-worker', getCapabilities: () => ({ available: true, isolation: true, adapterId: 'docker-worker', execute: true }),
        execute: async (command, args = []) => {
            if (command && typeof command === 'object') ({ command, args = [] } = command);
            const line = [command, ...args].join(' ');
            commands.push(line);
            const key = Object.keys(results).find(prefix => line.startsWith(prefix));
            return { exitCode: 0, stdout: '', stderr: '', passed: true, ...(key ? results[key] : {}) };
        } };
}
const files = extra => [{ path: 'package.json', content: JSON.stringify({ name: 'p', scripts: { build: 'next build', test: 'node --test' } }) },
    { path: 'package-lock.json', content: JSON.stringify({ lockfileVersion: 3, packages: {} }) }, ...extra];
test('the probe runs only install, Prisma client generation and tsc, and returns the compiler output', async () => {
    const fake = adapter({ 'npx tsc --noEmit': { exitCode: 2, passed: false, stdout: "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'." } });
    const result = await runTypecheckProbe({ adapter: fake, runId: 'r', files: files([{ path: 'tsconfig.json', content: '{}' },
        { path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }, { path: 'src/a.ts', content: 'const a: number = "x";' }]) });
    assert.equal(result.probe, 'typecheck'); assert.equal(result.status, 'failed'); assert.equal(result.stage, 'typecheck');
    assert.match(result.output, /src\/a\.ts\(1,7\): error TS2322/);
    assert.ok(fake.commands.some(line => /^npm (ci|install)\b/.test(line)), fake.commands.join('\n'));
    assert.ok(fake.commands.some(line => line.startsWith('npx prisma generate')));
    assert.ok(fake.commands.some(line => line.startsWith('npx tsc --noEmit')));
    assert.ok(!fake.commands.some(line => /\b(next build|npm run build|npm test|node --test|prisma db push|db seed)\b/.test(line)), fake.commands.join('\n'));
});
test('a project without tsconfig is skipped before any command', async () => {
    const fake = adapter();
    const result = await runTypecheckProbe({ adapter: fake, runId: 'r', files: files([{ path: 'src/a.js', content: 'export {}' }]) });
    assert.deepEqual([result.status, result.passed, fake.commands.length], ['skipped', true, 0]);
});
