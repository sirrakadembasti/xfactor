import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { rehydrateProjectStateFromDisk, reconcileProjectsWithDisk, autoRegisterDiscoveredProjects } from '../services/reconciliationService.js';

const isolated = await setupIsolatedTestDb('rehydration-test');
const database = await isolated.initializeDatabase();
const { runAsyncTest, finish } = createTestHarness();

try {
    await runAsyncTest('1. rehydrateProjectStateFromDisk correctly parses TALIMATNAME, TODO, RAPOR and updates DB + project_contracts', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-test-1-'));
        const projectId = `proj-rehydrate-${Date.now()}`;
        const projectDir = path.join(tmpDir, projectId);

        const managerDir = path.join(projectDir, 'manager');
        const backendDir = path.join(managerDir, 'backend.director', 'domain');
        const frontendDir = path.join(managerDir, 'frontend.director', 'domain');

        await fs.mkdir(backendDir, { recursive: true });
        await fs.mkdir(frontendDir, { recursive: true });

        // 1. TALIMATNAME.md
        const talimatContent = `# E-Commerce Engine\n\nComprehensive architecture specification.\nMulti-domain microservices structure.`;
        await fs.writeFile(path.join(managerDir, 'TALIMATNAME.md'), talimatContent, 'utf8');

        // 2. manager/TODO.md
        const managerTodoContent = `# TODO — Manager\n\n| # | Domain / Director | Klasör | Durum |\n|---|---|---|---|\n| 1 | backend | backend.director/ | completed |\n| 2 | frontend | frontend.director/ | completed |\n`;
        await fs.writeFile(path.join(managerDir, 'TODO.md'), managerTodoContent, 'utf8');

        // 3. backend TODO.md
        const backendTodoContent = `# TODO — backend.teamleader\n\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n| 1 | task-1 | Database Setup | — | completed |\n| 2 | task-2 | Auth API | task-1 | completed |\n\n## Checkbox Görünümü\n- [x] 1. Database Setup → \`task-1/\` \n- [x] 2. Auth API → \`task-2/\` \n`;
        await fs.writeFile(path.join(backendDir, 'TODO.md'), backendTodoContent, 'utf8');

        // 4. frontend TODO.md
        const frontendTodoContent = `# TODO — frontend.teamleader\n\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n| 1 | task-3 | Login Screen | — | completed |\n\n## Checkbox Görünümü\n- [x] 1. Login Screen → \`task-3/\` \n`;
        await fs.writeFile(path.join(frontendDir, 'TODO.md'), frontendTodoContent, 'utf8');

        // 5. RAPOR.md
        const raporContent = `# RAPOR — E-Commerce Engine\n\nDurum: BAŞARILI\nTüm modüller ve testler doğrulandı.`;
        await fs.writeFile(path.join(projectDir, 'RAPOR.md'), raporContent, 'utf8');

        // Execute rehydration
        const result = rehydrateProjectStateFromDisk(projectDir, { projectId, database });

        assert.strictEqual(result.success, true, 'rehydrateProjectStateFromDisk must return success: true');
        assert.strictEqual(result.status, 'completed', 'Project status must be completed');
        assert.strictEqual(result.tasksCount, 3, 'Total tasks count must be 3');
        assert.ok(result.plan.title.includes('E-Commerce Engine'), 'Plan title should match TALIMATNAME heading');
        assert.deepStrictEqual(result.plan.domains, ['backend', 'frontend'], 'Plan domains should be parsed correctly');
        assert.strictEqual(result.plan.tasks.length, 3, 'Plan tasks array length must be 3');

        // Verify DB projects table
        const dbProject = database.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        assert.ok(dbProject, 'Project row must exist in SQLite projects table');
        assert.strictEqual(dbProject.status, 'completed', 'SQLite projects.status must be completed');
        assert.ok(dbProject.plan && dbProject.plan.length > 0, 'SQLite projects.plan must not be empty');
        assert.ok(dbProject.workflow_state && dbProject.workflow_state.length > 0, 'SQLite projects.workflow_state must not be empty');

        const parsedPlan = JSON.parse(dbProject.plan);
        assert.strictEqual(parsedPlan.title, result.plan.title);
        assert.deepStrictEqual(parsedPlan.domains, ['backend', 'frontend']);

        const parsedWorkflow = JSON.parse(dbProject.workflow_state);
        assert.ok(parsedWorkflow.teamleaderPlans['backend.domain'], 'backend.domain teamleaderPlan must exist');
        assert.ok(parsedWorkflow.teamleaderPlans['frontend.domain'], 'frontend.domain teamleaderPlan must exist');

        // Verify DB project_contracts table
        const dbContract = database.prepare('SELECT * FROM project_contracts WHERE project_id = ?').get(projectId);
        assert.ok(dbContract, 'Approved project_contracts row must exist');
        assert.strictEqual(dbContract.status, 'approved', 'Contract status must be approved');
        assert.strictEqual(dbContract.revision, 1, 'Contract revision must be 1');
        assert.ok(dbContract.contract_hash && dbContract.contract_hash.length === 64, 'Contract hash must be a valid 64-char sha256 string');
        assert.strictEqual(dbContract.contract_json, dbProject.plan, 'contract_json must match projects.plan');

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    await runAsyncTest('2. reconcileProjectsWithDisk and autoRegisterDiscoveredProjects automatically trigger rehydration', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-test-2-'));
        const diskId = `proj-auto-${Date.now()}`;
        const dirPath = path.join(root, diskId);

        const managerDir = path.join(dirPath, 'manager');
        const tlDir = path.join(managerDir, 'backend.director', 'domain');
        await fs.mkdir(tlDir, { recursive: true });

        await fs.writeFile(path.join(managerDir, 'TALIMATNAME.md'), '# Auto Proje\nTalimat detayları', 'utf8');
        await fs.writeFile(path.join(tlDir, 'TODO.md'), '| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n| 1 | task-1 | Init DB | — | bekliyor |\n', 'utf8');

        // Run autoRegisterDiscoveredProjects
        const regRes = autoRegisterDiscoveredProjects({ projectsRoot: root, database });
        assert.strictEqual(regRes.success, true);
        assert.ok(regRes.registered.some(p => p.id === diskId), 'Project should be registered');

        const projRow = database.prepare('SELECT plan, workflow_state, status FROM projects WHERE id = ?').get(diskId);
        assert.ok(projRow.plan, 'Plan must be rehydrated on auto-registration');
        assert.ok(projRow.workflow_state, 'Workflow state must be rehydrated on auto-registration');

        const contractRow = database.prepare('SELECT * FROM project_contracts WHERE project_id = ?').get(diskId);
        assert.ok(contractRow, 'Contract row must be auto-created');
        assert.strictEqual(contractRow.status, 'approved');

        // Test reconciliation rehydrating missing plan
        database.prepare('UPDATE projects SET plan = NULL, workflow_state = NULL WHERE id = ?').run(diskId);
        const recRes = reconcileProjectsWithDisk({ projectsRoot: root, database });
        assert.strictEqual(recRes.success, true);

        const restoredRow = database.prepare('SELECT plan, workflow_state FROM projects WHERE id = ?').get(diskId);
        assert.ok(restoredRow.plan, 'Reconciliation should re-rehydrate null plan');
        assert.ok(restoredRow.workflow_state, 'Reconciliation should re-rehydrate null workflow_state');

        await fs.rm(root, { recursive: true, force: true });
    });
} finally {
    await isolated.cleanup();
    finish();
}
