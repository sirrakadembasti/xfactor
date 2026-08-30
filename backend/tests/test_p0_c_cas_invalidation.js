import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import {
    computeTaskSpecHash,
    computeInputHash,
    computeOutputHash,
    verifyTaskCheckpoint
} from '../engine/checkpointHelper.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-cas-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. computeTaskSpecHash should generate stable 64-char SHA-256 hash', async () => {
        const taskA = { id: 'task-1', name: 'Task One', targetFiles: ['src/App.jsx'], dependencies: [] };
        const taskB = { id: 'task-1', name: 'Task One', targetFiles: ['src/App.jsx'], dependencies: [] };
        const taskC = { id: 'task-1', name: 'Task One Modified', targetFiles: ['src/App.jsx'], dependencies: [] };

        const hashA = computeTaskSpecHash(taskA);
        const hashB = computeTaskSpecHash(taskB);
        const hashC = computeTaskSpecHash(taskC);

        assert.strictEqual(hashA.length, 64);
        assert.strictEqual(hashA, hashB);
        assert.notStrictEqual(hashA, hashC);
    });

    await runAsyncTest('2. computeInputHash and computeOutputHash should detect file tampering on disk', async () => {
        const workspace = await createTempWorkspace();
        const srcDir = path.join(workspace, 'src');
        await fs.mkdir(srcDir, { recursive: true });

        const fileA = path.join(srcDir, 'dep.js');
        const fileB = path.join(srcDir, 'output.js');

        await fs.writeFile(fileA, 'const x = 1;');
        await fs.writeFile(fileB, 'export const y = 2;');

        const inHash1 = await computeInputHash(workspace, ['src/dep.js']);
        const outHash1 = await computeOutputHash(workspace, ['src/output.js']);

        assert.strictEqual(inHash1.length, 64);
        assert.strictEqual(outHash1.length, 64);

        // Edit dependency file -> input hash shifts
        await fs.writeFile(fileA, 'const x = 999;');
        const inHash2 = await computeInputHash(workspace, ['src/dep.js']);
        assert.notStrictEqual(inHash1, inHash2);

        // Edit target output file -> output hash shifts
        await fs.writeFile(fileB, 'export const y = 999;');
        const outHash2 = await computeOutputHash(workspace, ['src/output.js']);
        assert.notStrictEqual(outHash1, outHash2);

        // Delete target file -> output hash shifts to missing indicator
        await fs.unlink(fileB);
        const outHash3 = await computeOutputHash(workspace, ['src/output.js']);
        assert.notStrictEqual(outHash1, outHash3);
    });

    await runAsyncTest('3. verifyTaskCheckpoint should enforce strict CAS validation across hashes and gate version', async () => {
        const workspace = await createTempWorkspace();
        const srcDir = path.join(workspace, 'src');
        await fs.mkdir(srcDir, { recursive: true });

        const depFile = path.join(srcDir, 'dep.js');
        const outFile = path.join(srcDir, 'out.js');
        await fs.writeFile(depFile, 'const a = 1;');
        await fs.writeFile(outFile, 'const b = 2;');

        const task = { id: 'task-1', name: 'Task 1', targetFiles: ['src/out.js'], dependencies: ['dep-task'] };
        const dependencyTargetFiles = ['src/dep.js'];

        const specHash = computeTaskSpecHash(task);
        const inHash = await computeInputHash(workspace, dependencyTargetFiles);
        const outHash = await computeOutputHash(workspace, task.targetFiles);
        const gateVersion = '1.0.0';

        const validCheckpoint = {
            project_id: 'proj-1',
            task_id: 'task-1',
            contract_id: 'contract-1',
            plan_hash: 'plan-hash-1',
            task_spec_hash: specHash,
            input_hash: inHash,
            output_hash: outHash,
            gate_version: gateVersion,
            status: 'completed',
            invalidated_at: null
        };

        // 1. Valid match -> CAS success
        const isValid = await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint: validCheckpoint,
            task,
            planHash: 'plan-hash-1',
            dependencyTargetFiles,
            gateVersion
        });
        assert.strictEqual(isValid, true);

        // 2. Mismatched spec -> CAS invalidation
        const modifiedTask = { ...task, name: 'Task 1 Renamed' };
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint: validCheckpoint,
            task: modifiedTask,
            planHash: 'plan-hash-1',
            dependencyTargetFiles,
            gateVersion
        }), false);

        // 3. Mismatched plan hash -> CAS invalidation
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint: validCheckpoint,
            task,
            planHash: 'plan-hash-2',
            dependencyTargetFiles,
            gateVersion
        }), false);

        // 4. Mismatched gate version -> CAS invalidation
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint: validCheckpoint,
            task,
            planHash: 'plan-hash-1',
            dependencyTargetFiles,
            gateVersion: '1.1.0'
        }), false);

        // 5. Already invalidated checkpoint -> CAS invalidation
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint: { ...validCheckpoint, status: 'invalidated', invalidated_at: new Date().toISOString() },
            task,
            planHash: 'plan-hash-1',
            dependencyTargetFiles,
            gateVersion
        }), false);
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
