import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import { TaskDAG } from '../engine/dag.js';
import {
    computeTaskSpecHash,
    computeInputHash,
    computeOutputHash,
    verifyTaskCheckpoint
} from '../engine/checkpointHelper.js';
import { isTaskCompleted, writeDurum, writeRapor } from '../engine/fileProtocol.js';
import { normalizeTeamleaderTasks, validateTaskDependencies } from '../agents/schemas.js';

const { runAsyncTest, finish } = createTestHarness();
const tempDirs = [];

async function createWorkspace() {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-p9-dag-'));
    tempDirs.push(workspace);
    await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'src', 'upstream.js'), 'export const upstream = 1;');
    await fs.writeFile(path.join(workspace, 'src', 'output.js'), 'export const output = 1;');
    await fs.writeFile(path.join(workspace, 'src', 'unrelated.js'), 'export const unrelated = 1;');
    return workspace;
}

function checkpointFor(task, inputHash, outputHash) {
    return {
        plan_hash: 'plan-1',
        task_spec_hash: computeTaskSpecHash(task),
        input_hash: inputHash,
        output_hash: outputHash,
        gate_version: '1.0.0',
        status: 'completed',
        invalidated_at: null
    };
}

try {
    await runAsyncTest('Set dependency identities must not collide in task spec hashes', async () => {
        const task = { id: 'consumer', name: 'Consumer', targetFiles: ['src/output.js'] };
        const first = computeTaskSpecHash({ ...task, dependencies: new Set(['upstream-a']) });
        const second = computeTaskSpecHash({ ...task, dependencies: new Set(['upstream-b']) });
        assert.notStrictEqual(first, second);

        const reordered = computeTaskSpecHash({ ...task, dependencies: new Set(['upstream-b', 'upstream-a']) });
        const sorted = computeTaskSpecHash({ ...task, dependencies: ['upstream-a', 'upstream-b'] });
        assert.strictEqual(reordered, sorted, 'dependency identity hashing must be deterministic');
    });

    await runAsyncTest('Set dependencies remain iterable and unknown IDs fail explicitly', async () => {
        const dag = new TaskDAG();
        dag.addTask({ id: 'consumer', dependencies: new Set(['missing-upstream']) });
        assert.deepStrictEqual([...dag.getTask('consumer').dependencies], ['missing-upstream']);
        assert.throws(
            () => dag.detectCycles(),
            /tanımsız bağımlılığa sahip.*missing-upstream/i,
            'unknown dependency IDs must not be silently remapped'
        );
    });

    await runAsyncTest('workflow task normalization preserves Set and generator dependencies', async () => {
        function* dependencyIds() {
            yield 'upstream';
        }

        const normalized = normalizeTeamleaderTasks({
            tasks: [
                {
                    id: 'consumer',
                    title: 'Consumer',
                    dependencies: dependencyIds(),
                    targetFiles: ['src/output.js'],
                    requirementIds: ['REQ-1']
                },
                {
                    id: 'upstream',
                    title: 'Upstream',
                    dependencies: new Set(),
                    targetFiles: ['src/upstream.js'],
                    requirementIds: ['REQ-1']
                }
            ]
        });

        assert.deepStrictEqual(normalized.tasks[0].dependencies, ['upstream']);
        assert.strictEqual(validateTaskDependencies(normalized.tasks).valid, true);
    });

    await runAsyncTest('unchanged dependency graph reuses checkpoint while changed dependency set does not', async () => {
        const workspace = await createWorkspace();
        const task = {
            id: 'consumer',
            name: 'Consumer',
            targetFiles: ['src/output.js'],
            dependencies: new Set(['upstream-a'])
        };
        const dependencyTargetFiles = new Set(['src/upstream.js']);
        const inputHash = await computeInputHash(workspace, dependencyTargetFiles);
        const outputHash = await computeOutputHash(workspace, task.targetFiles);
        const checkpoint = checkpointFor(task, inputHash, outputHash);

        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint,
            task,
            dependencyTargetFiles,
            planHash: 'plan-1'
        }), true, 'unchanged graph should reuse checkpoint');

        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint,
            task: { ...task, dependencies: new Set(['upstream-b']) },
            dependencyTargetFiles,
            planHash: 'plan-1'
        }), false, 'changed dependency identity set must invalidate checkpoint');
    });

    await runAsyncTest('upstream bytes invalidate checkpoint but unrelated bytes do not', async () => {
        const workspace = await createWorkspace();
        const task = {
            id: 'consumer',
            name: 'Consumer',
            targetFiles: ['src/output.js'],
            dependencies: new Set(['upstream-a'])
        };
        const dependencyTargetFiles = new Set(['src/upstream.js']);
        const checkpoint = checkpointFor(
            task,
            await computeInputHash(workspace, dependencyTargetFiles),
            await computeOutputHash(workspace, task.targetFiles)
        );

        await fs.writeFile(path.join(workspace, 'src', 'unrelated.js'), 'export const unrelated = 2;');
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint,
            task,
            dependencyTargetFiles,
            planHash: 'plan-1'
        }), true, 'unrelated file changes must not invalidate checkpoint');

        await fs.writeFile(path.join(workspace, 'src', 'upstream.js'), 'export const upstream = 2;');
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint,
            task,
            dependencyTargetFiles,
            planHash: 'plan-1'
        }), false, 'upstream byte changes must invalidate checkpoint');
    });

    await runAsyncTest('invalidated checkpoint and missing target output cannot resume', async () => {
        const workspace = await createWorkspace();
        const task = {
            id: 'consumer',
            name: 'Consumer',
            targetFiles: ['src/output.js'],
            dependencies: new Set(['upstream-a'])
        };
        const dependencyTargetFiles = new Set(['src/upstream.js']);
        const checkpoint = checkpointFor(
            task,
            await computeInputHash(workspace, dependencyTargetFiles),
            await computeOutputHash(workspace, task.targetFiles)
        );

        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint: { ...checkpoint, status: 'invalidated', invalidated_at: new Date().toISOString() },
            task,
            dependencyTargetFiles,
            planHash: 'plan-1'
        }), false);

        await fs.unlink(path.join(workspace, 'src', 'output.js'));
        assert.strictEqual(await verifyTaskCheckpoint({
            projectDir: workspace,
            checkpoint,
            task,
            dependencyTargetFiles,
            planHash: 'plan-1'
        }), false, 'missing target output must invalidate checkpoint');
    });

    await runAsyncTest('zero or incomplete target writes cannot report a task complete', async () => {
        const workspace = await createWorkspace();
        const coderDir = path.join(workspace, 'coder');
        await fs.mkdir(coderDir, { recursive: true });
        await writeDurum(coderDir, 'TAMAMLANDI', 'accepted output claimed');
        await writeRapor(coderDir, '# Rapor');

        assert.strictEqual(
            await isTaskCompleted(coderDir, workspace, ['src/missing-output.js']),
            false,
            'zero accepted target writes must not be completed'
        );

        await fs.writeFile(path.join(workspace, 'src', 'empty-output.js'), '');
        assert.strictEqual(
            await isTaskCompleted(coderDir, workspace, ['src/empty-output.js']),
            false,
            'zero-byte accepted target writes must not be completed'
        );

        await fs.writeFile(path.join(workspace, 'src', 'first-output.js'), 'first');
        assert.strictEqual(
            await isTaskCompleted(coderDir, workspace, ['src/first-output.js', 'src/second-output.js']),
            false,
            'incomplete accepted target writes must not be completed'
        );
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
