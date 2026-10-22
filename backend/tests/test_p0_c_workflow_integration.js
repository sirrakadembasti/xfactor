import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p0-c-workflow');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { checkTodoItem, uncheckTodoItem, reconcileTaskCache, readDurum, isTaskCheckpointValid, setupRootProtocol } = await import('../engine/fileProtocol.js');
const { saveCheckpoint } = await import('../engine/checkpointRepository.js');
const { computeTaskSpecHash, computeInputHash, computeOutputHash } = await import('../engine/checkpointHelper.js');

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-wf-cp-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('0. resuming root protocol preserves manager progress', async () => {
        const workspace = await createTempWorkspace();
        await setupRootProtocol(workspace, '# Plan', [{ name: 'backend', prefix: 'backend' }]);
        const managerDir = path.join(workspace, 'manager');
        const todoPath = path.join(managerDir, 'TODO.md');
        const durumPath = path.join(managerDir, 'DURUM.md');
        const completedTodo = (await fs.readFile(todoPath, 'utf8')).replace('- [ ] 1. backend', '- [x] 1. backend');
        await fs.writeFile(todoPath, completedTodo);
        await fs.writeFile(durumPath, '# DURUM\n- **Durum:** DEVAM_EDIYOR\n');

        await setupRootProtocol(workspace, '# Plan', [{ name: 'backend', prefix: 'backend' }]);

        assert.strictEqual(await fs.readFile(todoPath, 'utf8'), completedTodo);
        assert.strictEqual(await fs.readFile(durumPath, 'utf8'), '# DURUM\n- **Durum:** DEVAM_EDIYOR\n');
    });

    await runAsyncTest('1. uncheckTodoItem should uncheck completed todo checkbox in TODO.md', async () => {
        const workspace = await createTempWorkspace();
        const todoPath = path.join(workspace, 'TODO.md');
        const initialContent = `# Proje Görevleri\n\n- [x] Task 1: Initialize Database (task-1)\n- [x] Task 2: Build REST API (task-2)\n- [ ] Task 3: Frontend UI (task-3)\n`;
        await fs.writeFile(todoPath, initialContent, 'utf8');

        await uncheckTodoItem(todoPath, 'task-1');

        const updated = await fs.readFile(todoPath, 'utf8');
        assert.ok(updated.includes('- [ ] Task 1: Initialize Database (task-1)'));
        assert.ok(updated.includes('- [x] Task 2: Build REST API (task-2)'));
        assert.ok(updated.includes('- [ ] Task 3: Frontend UI (task-3)'));
    });

    await runAsyncTest('2. reconcileTaskCache should reset DURUM.md and uncheck TODO.md item', async () => {
        const workspace = await createTempWorkspace();
        const coderDir = path.join(workspace, 'backend', 'coder_task_1');
        await fs.mkdir(coderDir, { recursive: true });
        await fs.writeFile(path.join(coderDir, 'DURUM.md'), 'DURUM: TAMAMLANDI\nÖzet: Başarılı');

        const todoPath = path.join(workspace, 'TODO.md');
        await fs.writeFile(todoPath, '# Görevler\n\n- [x] task_1: Initial Setup\n');

        const task = {
            id: 'task_1',
            name: 'Initial Setup',
            domain: 'backend',
            targetFiles: ['server.js']
        };

        await reconcileTaskCache(workspace, 'task_1', task);

        const durum = await readDurum(coderDir);
        assert.ok(durum.includes('YENIDEN_BASLATILDI'));

        const todoContent = await fs.readFile(todoPath, 'utf8');
        assert.ok(todoContent.includes('- [ ] task_1: Initial Setup'));
    });

    await runAsyncTest('3. Checkpoint integration: valid checkpoint allows task skip and invalid checkpoint triggers re-run', async () => {
        const workspace = await createTempWorkspace();
        const projectDir = workspace;
        const srcFile = path.join(projectDir, 'src', 'App.jsx');
        await fs.mkdir(path.dirname(srcFile), { recursive: true });
        await fs.writeFile(srcFile, 'export default function App() { return <div>OK</div>; }');

        // Create DB project and contract
        db.prepare("INSERT INTO projects (id, title, status) VALUES ('proj-cp-test', 'CP Test', 'implementing')").run();
        db.prepare(`
            INSERT INTO project_contracts (
                id, project_id, revision, status, contract_json, contract_hash
            ) VALUES ('contract-cp-test', 'proj-cp-test', 1, 'approved', '{}', 'hash-1')
        `).run();

        const task = {
            id: 'task-ui',
            name: 'Create UI Component',
            targetFiles: ['src/App.jsx'],
            dependencies: [],
            domain: 'frontend'
        };

        const planHash = 'plan-hash-123';
        const specHash = computeTaskSpecHash(task);
        const inputHash = await computeInputHash(projectDir, []);
        const outputHash = await computeOutputHash(projectDir, task.targetFiles);
        const gateVersion = '1.0.0';

        // Save a valid checkpoint
        saveCheckpoint({
            projectId: 'proj-cp-test',
            taskId: 'task-ui',
            contractId: 'contract-cp-test',
            planHash,
            taskSpecHash: specHash,
            inputHash,
            outputHash,
            gateVersion,
            status: 'completed'
        });

        const valid = await isTaskCheckpointValid(projectDir, 'proj-cp-test', task, { planHash, gateVersion });
        assert.strictEqual(valid, true);

        // Edit target file -> checkpoint becomes invalid
        await fs.writeFile(srcFile, 'export default function App() { return <div>MODIFIED</div>; }');
        const invalidAfterEdit = await isTaskCheckpointValid(projectDir, 'proj-cp-test', task, { planHash, gateVersion });
        assert.strictEqual(invalidAfterEdit, false);

        db.prepare("DELETE FROM projects WHERE id = 'proj-cp-test'").run();
    });

    await runAsyncTest('4. acceptance retry may reuse unchanged legacy checkpoint without reviving manual invalidation', async () => {
        const workspace = await createTempWorkspace();
        const target = path.join(workspace, 'src', 'App.jsx');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, 'export default function App() { return null; }');
        db.prepare("INSERT INTO projects (id, title, status) VALUES ('proj-acceptance-retry', 'Retry', 'implementing')").run();
        db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash) VALUES ('contract-acceptance-retry', 'proj-acceptance-retry', 1, 'approved', '{}', 'hash-retry')").run();
        const task = { id: 'task-ui-retry', targetFiles: ['src/App.jsx'], dependencies: [] };
        saveCheckpoint({
            projectId: 'proj-acceptance-retry', taskId: task.id,
            contractId: 'contract-acceptance-retry', planHash: 'hash-retry',
            taskSpecHash: computeTaskSpecHash(task),
            inputHash: await computeInputHash(workspace, []),
            outputHash: await computeOutputHash(workspace, task.targetFiles)
        });
        db.prepare("UPDATE task_checkpoints SET invalidated_at = '2026-09-21T00:00:00.000Z' WHERE project_id = 'proj-acceptance-retry'").run();

        assert.strictEqual(await isTaskCheckpointValid(workspace, 'proj-acceptance-retry', task, { planHash: 'hash-retry' }), false);
        assert.strictEqual(await isTaskCheckpointValid(workspace, 'proj-acceptance-retry', task, { planHash: 'hash-retry', allowAcceptanceRetry: true }), true);
        assert.strictEqual(await isTaskCheckpointValid(workspace, 'proj-acceptance-retry', task, { planHash: 'hash-retry', contractId: 'different-contract', allowAcceptanceRetry: true }), false);
        db.prepare("UPDATE task_checkpoints SET invalidation_reason = 'manual rejection' WHERE project_id = 'proj-acceptance-retry'").run();
        assert.strictEqual(await isTaskCheckpointValid(workspace, 'proj-acceptance-retry', task, { planHash: 'hash-retry', allowAcceptanceRetry: true }), false);
        db.prepare("DELETE FROM projects WHERE id = 'proj-acceptance-retry'").run();
    });

    await runAsyncTest('5. parallel task completions preserve all TODO checkboxes', async () => {
        const workspace = await createTempWorkspace();
        const todoPath = path.join(workspace, 'TODO.md');
        const taskIds = Array.from({ length: 12 }, (_, index) => `task-${String(index).padStart(3, '0')}`);
        await fs.writeFile(todoPath, taskIds.map(id => `- [ ] ${id}`).join('\n'));
        await Promise.all(taskIds.map(id => checkTodoItem(todoPath, id)));
        const completed = await fs.readFile(todoPath, 'utf8');
        for (const id of taskIds) assert.ok(completed.includes(`- [x] ${id}`), `Lost completion for ${id}`);
        await Promise.all(taskIds.map(id => uncheckTodoItem(todoPath, id)));
        const reset = await fs.readFile(todoPath, 'utf8');
        for (const id of taskIds) assert.ok(reset.includes(`- [ ] ${id}`), `Lost reset for ${id}`);
    });

    await runAsyncTest('6. queued check and uncheck keep invocation order and recover after a read failure', async () => {
        const workspace = await createTempWorkspace();
        const todoPath = path.join(workspace, 'TODO.md');
        await fs.writeFile(todoPath, '- [ ] alpha\n- [ ] beta\n');
        const originalReadFile = fs.readFile;
        let failNextRead = true;
        fs.readFile = async (file, ...args) => {
            if (path.resolve(String(file)) === todoPath && failNextRead) {
                failNextRead = false;
                throw Object.assign(new Error('Injected TODO read failure'), { code: 'EIO' });
            }
            return originalReadFile(file, ...args);
        };
        try {
            // The protocol logs this best-effort failure; it must not poison later writes.
            await Promise.all([
                checkTodoItem(todoPath, 'alpha'),
                checkTodoItem(todoPath, 'alpha'),
                uncheckTodoItem(todoPath, 'alpha'),
                checkTodoItem(todoPath, 'beta')
            ]);
        } finally { fs.readFile = originalReadFile; }
        assert.strictEqual(await fs.readFile(todoPath, 'utf8'), '- [ ] alpha\n- [x] beta\n');
        await checkTodoItem(todoPath, 'alpha');
        assert.strictEqual(await fs.readFile(todoPath, 'utf8'), '- [x] alpha\n- [x] beta\n');
    });

    finish();
} finally {
    await isolated.cleanup();
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
