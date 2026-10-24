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
        const coderDir = path.join(workspace, 'manager', 'backend.director', 'api', 'task_1');
        await fs.mkdir(coderDir, { recursive: true });
        await fs.writeFile(path.join(coderDir, 'DURUM.md'), 'DURUM: TAMAMLANDI\nÖzet: Başarılı');

        const todoPath = path.join(path.dirname(coderDir), 'TODO.md');
        await fs.writeFile(todoPath, '# Görevler\n\n- [x] task_1: Initial Setup\n');

        const task = {
            id: 'task_1',
            name: 'Initial Setup',
            domain: 'backend',
            targetFiles: ['server.js']
        };

        await reconcileTaskCache({ projectDir: workspace, localTaskId: task.id, domainPrefix: 'backend',
            teamleaderPrefix: 'api', teamleaderId: 'backend.api', coderDir, checkpointValid: false });

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
        await fs.writeFile(todoPath, '| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n'
            + taskIds.map((id, index) => `| ${index + 1} | ${id} | Duplicate | — | bekliyor |`).join('\n') + '\n'
            + taskIds.map((id, index) => `- [ ] ${index + 1}. Duplicate → \`${id}/\``).join('\n'));
        await Promise.all(taskIds.map(id => checkTodoItem(todoPath, id)));
        const completed = await fs.readFile(todoPath, 'utf8');
        for (const [index, id] of taskIds.entries()) {
            assert.ok(completed.includes(`- [x] ${index + 1}. Duplicate → \`${id}/\``), `Lost completion for ${id}`);
            assert.ok(completed.includes(`| ${index + 1} | ${id} | Duplicate | — | tamamlandi |`));
        }
        await Promise.all(taskIds.map(id => uncheckTodoItem(todoPath, id)));
        const reset = await fs.readFile(todoPath, 'utf8');
        for (const [index, id] of taskIds.entries()) {
            assert.ok(reset.includes(`- [ ] ${index + 1}. Duplicate → \`${id}/\``), `Lost reset for ${id}`);
            assert.ok(reset.includes(`| ${index + 1} | ${id} | Duplicate | — | bekliyor |`));
        }
    });

    await runAsyncTest('6. queued check and uncheck keep invocation order and recover after a read failure', async () => {
        const workspace = await createTempWorkspace();
        const todoPath = path.join(workspace, 'TODO.md');
        await fs.writeFile(todoPath, '- [ ] alpha\n- [ ] beta\n');
        const originalOpen = fs.open;
        let failNextRead = true;
        fs.open = async (file, ...args) => {
            if (path.resolve(String(file)) === todoPath && failNextRead) {
                failNextRead = false;
                throw Object.assign(new Error('Injected TODO read failure'), { code: 'EIO' });
            }
            return originalOpen(file, ...args);
        };
        try {
            // A failed queued read is surfaced and cannot poison later writes.
            const results = await Promise.allSettled([
                checkTodoItem(todoPath, 'alpha'),
                checkTodoItem(todoPath, 'alpha'),
                uncheckTodoItem(todoPath, 'alpha'),
                checkTodoItem(todoPath, 'beta')
            ]);
            assert.strictEqual(results[0].status, 'rejected');
            assert.ok(results.slice(1).every(result => result.status === 'fulfilled'));
        } finally { fs.open = originalOpen; }
        assert.strictEqual(await fs.readFile(todoPath, 'utf8'), '- [ ] alpha\n- [x] beta\n');
        await checkTodoItem(todoPath, 'alpha');
        assert.strictEqual(await fs.readFile(todoPath, 'utf8'), '- [x] alpha\n- [x] beta\n');
    });

    await runAsyncTest('7. nested reconciliation updates exact table and checkbox; valid skip restores only the task', async () => {
        const workspace = await createTempWorkspace();
        const { setupDirectorProtocol, setupTeamleaderProtocol, setupCoderProtocol, writeDurum } = await import('../engine/fileProtocol.js');
        await setupRootProtocol(workspace, '# Plan', [{ name: 'Backend', prefix: 'backend' }, { name: 'Other', prefix: 'other' }]);
        const managerDir = path.join(workspace, 'manager');
        const directorDir = await setupDirectorProtocol(managerDir, 'backend', '# Task', '# Instructions', [{ name: 'Duplicate', prefix: 'api' }, { name: 'Duplicate', prefix: 'other' }]);
        const tasks = [{ id: 'task-1', title: 'Duplicate', dependencies: [] }, { id: 'task-10', title: 'Duplicate', dependencies: [] }];
        const teamleaderDir = await setupTeamleaderProtocol(directorDir, 'api', '# Task', tasks);
        const otherDir = await setupTeamleaderProtocol(directorDir, 'other', '# Task', tasks);
        const coderDir = await setupCoderProtocol(teamleaderDir, 'task-1', 'Duplicate', '# Task');
        const otherCoder = await setupCoderProtocol(otherDir, 'task-1', 'Duplicate', '# Task');
        for (const dir of [managerDir, directorDir, teamleaderDir, coderDir, otherCoder]) await writeDurum(dir, 'TAMAMLANDI');
        for (const dir of [managerDir, directorDir, teamleaderDir, otherDir]) {
            const todo = path.join(dir, 'TODO.md');
            await fs.writeFile(todo, (await fs.readFile(todo, 'utf8')).replaceAll('[ ]', '[x]').replaceAll('bekliyor', 'tamamlandi'));
        }
        const context = { projectDir: workspace, localTaskId: 'task-1', teamleaderId: 'backend.api', domainPrefix: 'backend', teamleaderPrefix: 'api', coderDir, teamleaderDir, directorDir, managerDir, checkpointValid: false };
        await assert.rejects(() => checkTodoItem(path.join(teamleaderDir, 'TODO.md'), 'Duplicate'), error => error.code === 'PROTOCOL_IDENTITY_AMBIGUOUS');
        await reconcileTaskCache(context);
        const todo = await fs.readFile(path.join(teamleaderDir, 'TODO.md'), 'utf8');
        assert.match(todo, /\| 1 \| task-1 \| Duplicate \| — \| bekliyor \|/);
        assert.match(todo, /- \[ \] 1\. Duplicate → `task-1\/`/);
        assert.match(todo, /- \[x\] 2\. Duplicate → `task-10\/`/);
        assert.match(await readDurum(coderDir), /YENIDEN_BASLATILDI/);
        assert.match(await readDurum(otherCoder), /TAMAMLANDI/);
        assert.match(await fs.readFile(path.join(directorDir, 'TODO.md'), 'utf8'), /- \[x\] 2\. Duplicate/);
        for (const dir of [managerDir, directorDir, teamleaderDir]) assert.doesNotMatch(await readDurum(dir), /TAMAMLANDI/);
        await reconcileTaskCache({ ...context, checkpointValid: true });
        assert.match(await readDurum(coderDir), /TAMAMLANDI/);
        assert.match(await fs.readFile(path.join(teamleaderDir, 'TODO.md'), 'utf8'), /- \[x\] 1\. Duplicate → `task-1\/`/);
        for (const dir of [managerDir, directorDir, teamleaderDir]) assert.doesNotMatch(await readDurum(dir), /TAMAMLANDI/);
    });

    await runAsyncTest('8. protocol IO is bounded, rejects traversal and fences stale metadata commits', async () => {
        const workspace = await createTempWorkspace();
        const { readProtocolFile, writeProtocolFile, MAX_PROTOCOL_BYTES } = await import('../engine/protocolIO.js');
        const file = path.join(workspace, 'DURUM.md');
        await fs.writeFile(file, 'original');
        await assert.rejects(() => writeProtocolFile(file, 'stale', { projectDir: workspace,
            sourceFence: { projectId: 'absent', attemptId: 'absent', leaseOwner: 'stale' } }), error => error.code === 'WORKFLOW_LEASE_FENCED');
        assert.equal(await readProtocolFile(file), 'original');
        await assert.rejects(() => readProtocolFile(path.join(workspace, 'outside.md'), { projectDir: path.join(workspace, 'inner') }), error => error.code === 'PROTOCOL_PATH_UNSAFE');
        await assert.rejects(() => readProtocolFile(`${workspace}${path.sep}..${path.sep}external.md`), error => error.code === 'PROTOCOL_PATH_UNSAFE');
        await fs.writeFile(file, 'x'.repeat(MAX_PROTOCOL_BYTES + 1));
        await assert.rejects(() => readProtocolFile(file), error => error.code === 'PROTOCOL_TOO_LARGE');
    });

    await runAsyncTest('9. valid checkpoint restores missing task metadata without promoting ancestors', async () => {
        const workspace = await createTempWorkspace();
        const context = { projectDir: workspace, domainPrefix: 'backend', teamleaderPrefix: 'api',
            teamleaderId: 'backend.api', localTaskId: 'task-1', task: { title: 'Restored' }, checkpointValid: true };
        await reconcileTaskCache(context);
        const team = path.join(workspace, 'manager', 'backend.director', 'api');
        assert.match(await readDurum(path.join(team, 'task-1')), /TAMAMLANDI/);
        assert.match(await fs.readFile(path.join(team, 'TODO.md'), 'utf8'), /\| 1 \| task-1 \| Restored \| — \| tamamlandi \|/);
        assert.equal(await readDurum(team), null);
        await assert.rejects(() => reconcileTaskCache({ ...context, coderDir: path.join(workspace, 'other') }), error => error.code === 'PROTOCOL_IDENTITY_INVALID');
    });

    await runAsyncTest('10. stale task checkbox ordinals cannot reset a sibling', async () => {
        const workspace = await createTempWorkspace();
        const team = path.join(workspace, 'manager', 'backend.director', 'api');
        await fs.mkdir(team, { recursive: true });
        const todo = path.join(team, 'TODO.md');
        await fs.writeFile(todo, '| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n'
            + '| 1 | task-1 | Duplicate | — | tamamlandi |\n| 2 | task-10 | Duplicate | — | tamamlandi |\n'
            + '- [x] 1. Duplicate → `task-10/`\n- [x] 2. Duplicate → `task-1/`\n');
        await reconcileTaskCache({ projectDir: workspace, domainPrefix: 'backend', teamleaderPrefix: 'api',
            teamleaderId: 'backend.api', localTaskId: 'task-1', checkpointValid: false });
        const result = await fs.readFile(todo, 'utf8');
        assert.match(result, /- \[x\] 1\. Duplicate → `task-10\/`/);
        assert.match(result, /- \[ \] 2\. Duplicate → `task-1\/`/);
        assert.match(result, /\| 1 \| task-1 \| Duplicate \| — \| bekliyor \|/);
        assert.match(result, /\| 2 \| task-10 \| Duplicate \| — \| tamamlandi \|/);
    });

    await runAsyncTest('11. stale ancestor ordinals use folder identity or unique legacy labels', async () => {
        const workspace = await createTempWorkspace();
        const manager = path.join(workspace, 'manager');
        const director = path.join(manager, 'backend.director');
        await fs.mkdir(director, { recursive: true });
        const managerTodo = path.join(manager, 'TODO.md');
        await fs.writeFile(managerTodo, '| # | Domain / Director | Klasör | Durum |\n|---|---|---|---|\n'
            + '| 1 | Backend | backend.director/ | tamamlandi |\n| 2 | Other | other.director/ | tamamlandi |\n'
            + '- [x] 1. Other (other.director/)\n- [x] 2. Backend (backend.director/)\n');
        const directorTodo = path.join(director, 'TODO.md');
        await fs.writeFile(directorTodo, '| # | Teamleader | Klasör | Durum |\n|---|---|---|---|\n'
            + '| 1 | API | api/ | tamamlandi |\n| 2 | Other | other/ | tamamlandi |\n'
            + '- [x] 1. Other\n- [x] 2. API\n');
        await reconcileTaskCache({ projectDir: workspace, domainPrefix: 'backend', teamleaderPrefix: 'api',
            teamleaderId: 'backend.api', teamleaderName: 'API', localTaskId: 'task-1', checkpointValid: false });
        assert.match(await fs.readFile(managerTodo, 'utf8'), /- \[x\] 1\. Other \(other.director\/\)/);
        assert.match(await fs.readFile(managerTodo, 'utf8'), /- \[ \] 2\. Backend \(backend.director\/\)/);
        assert.match(await fs.readFile(directorTodo, 'utf8'), /- \[x\] 1\. Other/);
        assert.match(await fs.readFile(directorTodo, 'utf8'), /- \[ \] 2\. API/);
    });

    for (const missing of ['row', 'checkbox']) {
        await runAsyncTest(`${missing === 'row' ? 12 : 13}. valid nested recovery restores missing ${missing} while preserving siblings`, async () => {
            const workspace = await createTempWorkspace();
            const team = path.join(workspace, 'manager', 'backend.director', 'api');
            await fs.mkdir(team, { recursive: true });
            const todo = path.join(team, 'TODO.md');
            const siblingRow = '| 2 | task-10 | Duplicate | — | tamamlandi |';
            const siblingCheckbox = '- [x] 2. Duplicate → `task-10/`';
            await fs.writeFile(todo, '| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n'
                + (missing === 'row' ? '' : '| 1 | task-1 | Duplicate | — | bekliyor |\n') + `${siblingRow}\n`
                + (missing === 'checkbox' ? '' : '- [ ] 1. Duplicate → `task-1/`\n') + `${siblingCheckbox}\n`);
            await reconcileTaskCache({ projectDir: workspace, domainPrefix: 'backend', teamleaderPrefix: 'api',
                teamleaderId: 'backend.api', localTaskId: 'task-1', task: { title: 'Duplicate' }, checkpointValid: true });
            const result = await fs.readFile(todo, 'utf8');
            assert.match(result, /\| \d+ \| task-1 \| Duplicate \| — \| tamamlandi \|/);
            assert.match(result, /- \[x\] \d+\. Duplicate → `task-1\/`/);
            assert.equal(result.split('\n').filter(line => line.includes('| task-1 |')).length, 1);
            assert.equal(result.split('\n').filter(line => line.includes('→ `task-1/`')).length, 1);
            assert.ok(result.includes(siblingRow));
            assert.ok(result.includes(siblingCheckbox));
            assert.equal(await readDurum(team), null);
        });
    }

    await runAsyncTest('14. duplicate legacy folder labels reject ambiguity without changing a sibling', async () => {
        const workspace = await createTempWorkspace();
        const todo = path.join(workspace, 'TODO.md');
        const before = '| # | Teamleader | Klasör | Durum |\n|---|---|---|---|\n'
            + '| 1 | api | api/ | tamamlandi |\n| 2 | api | other/ | tamamlandi |\n'
            + '- [x] 1. api\n';
        await fs.writeFile(todo, before);
        await assert.rejects(() => uncheckTodoItem(todo, { kind: 'folder', folder: 'api', name: 'api' }),
            error => error.code === 'PROTOCOL_IDENTITY_AMBIGUOUS');
        assert.equal(await fs.readFile(todo, 'utf8'), before);
    });

    await runAsyncTest('15. restoring either TODO half allocates an ordinal unclaimed by siblings', async () => {
        for (const missing of ['row', 'checkbox']) {
            const workspace = await createTempWorkspace();
            const team = path.join(workspace, 'manager', 'backend.director', 'api');
            await fs.mkdir(team, { recursive: true });
            const todo = path.join(team, 'TODO.md');
            const siblingRow = '| 2 | task-10 | Duplicate | — | tamamlandi |';
            const siblingCheckbox = '- [x] 1. Duplicate → `task-10/`';
            await fs.writeFile(todo, '| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n'
                + (missing === 'row' ? '' : '| 1 | task-1 | Duplicate | — | bekliyor |\n') + `${siblingRow}\n`
                + (missing === 'checkbox' ? '' : '- [ ] 2. Duplicate → `task-1/`\n') + `${siblingCheckbox}\n`);
            await reconcileTaskCache({ projectDir: workspace, domainPrefix: 'backend', teamleaderPrefix: 'api',
                teamleaderId: 'backend.api', localTaskId: 'task-1', task: { title: 'Duplicate' }, checkpointValid: true });
            const result = await fs.readFile(todo, 'utf8');
            const rowOrdinal = result.match(/\| (\d+) \| task-1 \|/)?.[1];
            const checkboxOrdinal = result.match(/- \[x\] (\d+)\. Duplicate → `task-1\/`/)?.[1];
            assert.equal(rowOrdinal, '3');
            assert.equal(checkboxOrdinal, rowOrdinal);
            assert.ok(result.includes(siblingRow));
            assert.ok(result.includes(siblingCheckbox));
        }
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
