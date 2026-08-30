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

const { uncheckTodoItem, reconcileTaskCache, readDurum, isTaskCheckpointValid } = await import('../engine/fileProtocol.js');
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

    finish();
} finally {
    await isolated.cleanup();
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
