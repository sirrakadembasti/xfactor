import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { createTestHarness } from './testHarness.js';

const isolated = await setupIsolatedTestDb('reconciliation-boundary');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const recovery = await import('../services/reconciliationService.js');
const { MAX_PROTOCOL_BYTES } = await import('../engine/protocolIO.js');
const { runAsyncTest, finish } = createTestHarness();
const marker = 'SENTINEL_OUTSIDE_PROJECT_76a2';
let sequence = 0;
async function fixture(work) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'recovery-boundary-'));
    const project = path.join(root, 'project');
    const outside = path.join(root, 'outside');
    await fs.mkdir(project); await fs.mkdir(outside);
    const id = `boundary-${++sequence}`;
    db.prepare("INSERT INTO projects(id,title,status,revision) VALUES(?, 'safe', 'paused', 1)").run(id);
    try { await work({ root, project, outside, id, options: { projectId: id, database: db } }); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
}
async function write(root, file, text) {
    const destination = path.join(root, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, text);
}
function persisted(id) {
    return JSON.stringify({
        project: db.prepare('SELECT * FROM projects WHERE id=?').get(id),
        chats: db.prepare('SELECT * FROM chat_history WHERE project_id=?').all(id),
        logs: db.prepare('SELECT * FROM project_logs WHERE project_id=?').all(id),
        contracts: db.prepare('SELECT * FROM project_contracts WHERE project_id=?').all(id)
    });
}
const todo = (id = 'task-1', title = 'safe') => `| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n| 1 | ${id} | ${title} | — | tamamlandi |\n`;
try {
    await runAsyncTest('root and ancestor junctions reject every public recovery entry without DB changes', async () => {
        for (const mode of ['root', 'ancestor']) await fixture(async ({ root, project, outside, id, options }) => {
            await write(outside, 'TALIMATNAME.md', marker);
            await write(outside, 'manager/TALIMATNAME.md', marker);
            const link = path.join(root, 'linked');
            await fs.symlink(outside, link, 'junction');
            if (mode === 'ancestor') await fs.mkdir(path.join(outside, 'child'));
            const unsafe = mode === 'root' ? link : path.join(link, 'child');
            const before = persisted(id);
            assert.equal((await recovery.rehydrateProjectStateFromDisk(unsafe, options)).success, false);
            assert.equal(recovery.rehydrateProjectChatHistoryFromDisk(unsafe, options).success, false);
            assert.equal((await recovery.rehydrateProjectLogsFromDisk(unsafe, options)).success, false);
            assert.equal((await recovery.autoRegisterDiscoveredProjects({ projectsRoot: unsafe, database: db })).success, false);
            assert.equal((await recovery.reconcileProjectsWithDisk({ projectsRoot: unsafe, database: db })).success, false);
            assert.equal(persisted(id), before);
        });
    });
    await runAsyncTest('linked manager and task directories cannot inject chat, plan, description or logs', async () => fixture(async ({ project, outside, id, options }) => {
        await write(outside, 'TALIMATNAME.md', marker);
        await write(outside, 'TODO.md', todo('task-1', marker));
        await write(outside, 'GOREV.md', `Açıklama: ${marker}\nHedef Dosyalar: ["src/index.ts"]\n`);
        await fs.symlink(outside, path.join(project, 'manager'), 'junction');
        await fs.symlink(outside, path.join(project, 'task-a'), 'junction');
        recovery.rehydrateProjectChatHistoryFromDisk(project, options);
        const tasks = recovery.restoreTaskTargetsFromProtocol(project, [{ id: 'task-a', targetFiles: [] }]);
        assert.equal(JSON.stringify(tasks).includes(marker), false);
        await recovery.rehydrateProjectStateFromDisk(project, options);
        await recovery.rehydrateProjectLogsFromDisk(project, options);
        assert.equal(persisted(id).includes(marker), false);
    }));
    await runAsyncTest('all metadata leaf types reject oversized content and directory junctions', async () => {
        const paths = ['package.json', 'state.json', 'TALIMATNAME.md', 'DURUM.md', 'RAPOR.md',
            'manager/TALIMATNAME.md', 'manager/TODO.md', 'manager/DURUM.md',
            'manager/backend.director/ALT-TALIMATNAME.md', 'manager/backend.director/team/TODO.md',
            'manager/backend.director/team/task-1/GOREV.md', 'manager/backend.director/team/task-1/DURUM.md',
            'manager/backend.director/team/task-1/RAPOR.md'];
        for (const mode of ['oversize', 'junction']) await fixture(async ({ project, outside, id, options }) => {
            for (const file of paths) {
                const payload = file.endsWith('.json') ? JSON.stringify({ title: marker, padding: 'x'.repeat(MAX_PROTOCOL_BYTES) })
                    : `# ${marker}\nAçıklama: ${marker}\nHedef Dosyalar: ["src/index.ts"]\n${todo('task-1', marker)}${'x'.repeat(MAX_PROTOCOL_BYTES)}`;
                if (mode === 'oversize') await write(project, file, payload);
                else {
                    await fs.mkdir(path.dirname(path.join(project, file)), { recursive: true });
                    await fs.symlink(outside, path.join(project, file), 'junction');
                }
            }
            const result = await recovery.rehydrateProjectStateFromDisk(project, options);
            assert.equal(JSON.stringify(result).includes(marker), false);
            assert.equal(result.tasksCount, 0);
            assert.equal(result.plan.title, id);
            assert.equal(persisted(id).includes(marker), false);
            assert.deepEqual(recovery.restoreTaskTargetsFromProtocol(path.join(project, 'manager/backend.director/team'), [{ id: 'task-1', targetFiles: [] }]), [{ id: 'task-1', targetFiles: [] }]);
        });
    });
    await runAsyncTest('TODO traversal identifiers never create recovered tasks or read outside metadata', async () => fixture(async ({ project, outside, id, options }) => {
        await write(project, 'manager/team/TODO.md', todo('../../../outside', 'escape'));
        await write(outside, 'GOREV.md', `Görev: ${marker}\n`);
        await write(outside, 'DURUM.md', 'TAMAMLANDI');
        const result = await recovery.rehydrateProjectStateFromDisk(project, options);
        assert.equal(result.tasksCount, 0);
        await recovery.rehydrateProjectLogsFromDisk(project, options);
        assert.equal(persisted(id).includes(marker), false);
        assert.equal(db.prepare("SELECT COUNT(*) n FROM project_logs WHERE project_id=? AND agent='Reviewer'").get(id).n, 0);
    }));
    await runAsyncTest('unsafe report existence cannot fabricate a Tester completion event', async () => fixture(async ({ project, outside, id, options }) => {
        db.prepare("UPDATE projects SET status='completed' WHERE id=?").run(id);
        await fs.symlink(outside, path.join(project, 'RAPOR.md'), 'junction');
        await recovery.rehydrateProjectLogsFromDisk(project, options);
        assert.equal(db.prepare("SELECT COUNT(*) n FROM project_logs WHERE project_id=? AND agent='Tester' AND action='finish'").get(id).n, 0);
    }));
    for (const withTodo of [true, false]) await runAsyncTest(`qualified duplicate local IDs survive ${withTodo ? 'TODO' : 'directory'} recovery with idempotence and real events`, async () => fixture(async ({ project, id, options }) => {
        for (const team of ['alpha', 'beta']) {
            const dir = `manager/backend.director/${team}`;
            if (withTodo) await write(project, `${dir}/TODO.md`, todo());
            await write(project, `${dir}/task-1/DURUM.md`, 'TAMAMLANDI');
        }
        db.prepare("INSERT INTO project_logs(project_id,agent,action,message,node_id) VALUES(?, 'Reviewer','finish','real event','backend.alpha.task-1')").run(id);
        await recovery.rehydrateProjectLogsFromDisk(project, options);
        const query = () => db.prepare("SELECT node_id,message FROM project_logs WHERE project_id=? AND agent='Reviewer' AND action='finish' ORDER BY node_id").all(id);
        assert.deepEqual(query().map(row => row.node_id), ['backend.alpha.task-1', 'backend.beta.task-1']);
        assert.equal(query()[0].message, 'real event');
        const before = persisted(id);
        await recovery.rehydrateProjectLogsFromDisk(project, options);
        assert.equal(persisted(id), before);
    }));
    finish();
} finally { await isolated.cleanup(); }
