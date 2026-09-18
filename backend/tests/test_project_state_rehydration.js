import fsSync from 'fs';
import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { rehydrateProjectStateFromDisk, reconcileProjectsWithDisk, autoRegisterDiscoveredProjects, rehydrateProjectChatHistoryFromDisk, rehydrateProjectLogsFromDisk } from '../services/reconciliationService.js';
import { getProject } from '../projectRepository.js';

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
        // 0. Root DURUM.md
        await fs.writeFile(path.join(projectDir, 'DURUM.md'), '# DURUM\nDurum: TAMAMLANDI\n', 'utf8');

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
        const result = await rehydrateProjectStateFromDisk(projectDir, { projectId, database });

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
        const regRes = await autoRegisterDiscoveredProjects({ projectsRoot: root, database });
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
        const recRes = await reconcileProjectsWithDisk({ projectsRoot: root, database });
        assert.strictEqual(recRes.success, true);

        const restoredRow = database.prepare('SELECT plan, workflow_state FROM projects WHERE id = ?').get(diskId);
        assert.ok(restoredRow.plan, 'Reconciliation should re-rehydrate null plan');
        assert.ok(restoredRow.workflow_state, 'Reconciliation should re-rehydrate null workflow_state');

        await fs.rm(root, { recursive: true, force: true });
    });
    await runAsyncTest('3. rehydrateProjectChatHistoryFromDisk and getProject populate chat messages from TALIMATNAME.md and RAPOR.md', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-chat-test-'));
        const projectId = `proj-chat-rehydrate-${Date.now()}`;
        const projectDir = path.join(tmpDir, projectId);
        const managerDir = path.join(projectDir, 'manager');

        await fs.mkdir(managerDir, { recursive: true });

        await fs.writeFile(path.join(projectDir, 'DURUM.md'), '# DURUM\nDurum: TAMAMLANDI\n', 'utf8');
        const talimatContent = '# Mimari Şartname\nSistem mikroservis mimarisinde tasarlanmıştır.';
        await fs.writeFile(path.join(managerDir, 'TALIMATNAME.md'), talimatContent, 'utf8');

        const raporContent = '# RAPOR — Tamamlandı\nDurum: BAŞARILI\nTüm gereksinimler %100 doğrulandı.';
        await fs.writeFile(path.join(projectDir, 'RAPOR.md'), raporContent, 'utf8');
        // Insert project into DB with status completed and NO chat history
        const nowIso = new Date().toISOString();
        database.prepare(
            'INSERT INTO projects (id, title, status, plan, is_pinned, created_at) VALUES (?, ?, ?, NULL, 0, ?)'
        ).run(projectId, 'Chat Test Project', 'completed', nowIso);

        // 1. Direct call to rehydrateProjectChatHistoryFromDisk
        const rehydrateRes = rehydrateProjectChatHistoryFromDisk(projectDir, { projectId, database });
        assert.strictEqual(rehydrateRes.success, true, 'rehydrateProjectChatHistoryFromDisk must succeed');
        assert.strictEqual(rehydrateRes.rehydrated, true, 'Should rehydrate chat history');

        const chats = database.prepare('SELECT role, text_content FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(projectId);
        assert.strictEqual(chats.length, 3, 'Must insert welcome, talimatname, and rapor messages');

        assert.ok(chats[0].text_content.includes('Chat Test Project'), 'First message should be welcome text');
        assert.ok(chats[1].text_content.includes('İşte hazırladığım mimari şartname ve plan:'), 'Second message must format TALIMATNAME');
        assert.ok(chats[1].text_content.includes(talimatContent), 'Second message must contain talimat content');
        assert.ok(chats[2].text_content.includes('🎉 **Proje Üretimi ve Test Kabulü Tamamlandı!**'), 'Third message must format RAPOR');
        assert.ok(chats[2].text_content.includes(raporContent), 'Third message must contain rapor content');

        // 2. Test getProject returning full chatHistory
        process.env.PROJECTS_ROOT = tmpDir;
        const projectObj = getProject(projectId);
        assert.ok(projectObj, 'getProject must return project object');
        assert.strictEqual(projectObj.chatHistory.length, 3, 'getProject chatHistory length must be 3');
        assert.strictEqual(projectObj.chatHistory[1].parts[0].text, chats[1].text_content);
        assert.strictEqual(projectObj.chatHistory[2].parts[0].text, chats[2].text_content);

        // 3. Test duplicate protection: calling rehydrateProjectChatHistoryFromDisk again should not insert extra rows
        const rehydrateRes2 = rehydrateProjectChatHistoryFromDisk(projectDir, { projectId, database });
        assert.strictEqual(rehydrateRes2.rehydrated, false, 'Second rehydration should not rehydrate again');

        const chatsAfter = database.prepare('SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?').get(projectId).count;
        assert.strictEqual(chatsAfter, 3, 'Chat count must remain 3');

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
    await runAsyncTest('4. rehydrateProjectLogsFromDisk populates agent logs from disk files (DURUM, TODO, RAPOR)', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-logs-test-'));
        const projectId = `proj-logs-rehydrate-${Date.now()}`;
        const projectDir = path.join(tmpDir, projectId);

        const managerDir = path.join(projectDir, 'manager');
        const backendDir = path.join(managerDir, 'backend.director', 'domain');

        await fs.mkdir(backendDir, { recursive: true });

        // 0. Root DURUM.md (completed status)
        await fs.writeFile(path.join(projectDir, 'DURUM.md'), '# DURUM\n- Durum: TAMAMLANDI\n', 'utf8');

        // 1. Manager DURUM.md
        await fs.writeFile(path.join(managerDir, 'DURUM.md'), '# DURUM\n- Durum: BASLADI\n- Detay: Manager mimari planı hazırladı.', 'utf8');
        // 2. Director DURUM.md
        await fs.writeFile(path.join(managerDir, 'backend.director', 'DURUM.md'), '# DURUM\n- Durum: BASLADI\n- Detay: backend director şartnameyi hazırladı.', 'utf8');

        // 3. Teamleader TODO.md
        const backendTodoContent = `# TODO — backend.teamleader\n\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n| 1 | task-1 | Database Setup | — | completed |\n| 2 | task-2 | Auth API | task-1 | completed |\n`;
        await fs.writeFile(path.join(backendDir, 'TODO.md'), backendTodoContent, 'utf8');

        // 4. Task directories with GOREV.md and RAPOR.md
        const task1Dir = path.join(backendDir, 'task-1');
        await fs.mkdir(task1Dir, { recursive: true });
        await fs.writeFile(path.join(task1Dir, 'GOREV.md'), '# Görev: Database Setup\nVeritabanı kurulumu yap.', 'utf8');
        await fs.writeFile(path.join(task1Dir, 'RAPOR.md'), '# RAPOR\nDurum: ONAYLANDI', 'utf8');

        const task2Dir = path.join(backendDir, 'task-2');
        await fs.mkdir(task2Dir, { recursive: true });
        await fs.writeFile(path.join(task2Dir, 'GOREV.md'), '# Görev: Auth API\nAuth API rotalarını yaz.', 'utf8');

        // 5. Root RAPOR.md
        await fs.writeFile(path.join(projectDir, 'RAPOR.md'), '# RAPOR\nDurum: BAŞARILI\nTüm testler onaylandı.', 'utf8');

        // 6. Execute rehydrateProjectLogsFromDisk
        const result = await rehydrateProjectLogsFromDisk(projectDir, { projectId, database });
        assert.strictEqual(result.success, true, 'rehydrateProjectLogsFromDisk must return success: true');
        assert.strictEqual(result.rehydrated, true, 'Must report rehydrated: true');
        assert.ok(result.count >= 8, `Rehydrated log count should be >= 8, got ${result.count}`);

        // 7. Verify logs from SQLite project_logs table
        const logs = database.prepare('SELECT * FROM project_logs WHERE project_id = ? ORDER BY id ASC').all(projectId);
        assert.ok(logs.length >= 8, `Database should contain rehydrated logs, count: ${logs.length}`);

        const agents = logs.map(l => l.agent);
        assert.ok(agents.includes('Manager'), 'Manager log must exist');
        assert.ok(agents.includes('Director'), 'Director log must exist');
        assert.ok(agents.includes('Teamleader'), 'Teamleader log must exist');
        assert.ok(agents.includes('Coder'), 'Coder log must exist');
        assert.ok(agents.includes('Reviewer'), 'Reviewer log must exist');
        assert.ok(agents.includes('Tester'), 'Tester log must exist');

        // Check specific task log messages & node_ids
        const task1Logs = logs.filter(l => l.node_id === 'task-1');
        assert.strictEqual(task1Logs.length, 3, 'task-1 should have 3 logs (Teamleader, Coder, Reviewer)');
        assert.ok(task1Logs[0].message.includes('Database Setup'), 'Teamleader log message must include task title');

        // Test duplicate invocation protection
        const dupResult = await rehydrateProjectLogsFromDisk(projectDir, { projectId, database });
        assert.strictEqual(dupResult.rehydrated, false, 'Second rehydration should return rehydrated: false');
        assert.strictEqual(dupResult.count, 0, 'Second rehydration count should be 0');

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
    await runAsyncTest('5. project status distinction: completed (root DURUM.md TAMAMLANDI) vs pending_approval (manager/DURUM.md BASLADI)', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-distinction-test-'));

        // Case A: pending_approval project
        const pendingId = `proj-pending-${Date.now()}`;
        const pendingDir = path.join(tmpDir, pendingId);
        const pendingManagerDir = path.join(pendingDir, 'manager');
        await fs.mkdir(pendingManagerDir, { recursive: true });

        await fs.writeFile(path.join(pendingManagerDir, 'DURUM.md'), '# DURUM\n- Durum: BASLADI\n- Detay: Manager mimari planı hazırladı.', 'utf8');
        await fs.writeFile(path.join(pendingManagerDir, 'TALIMATNAME.md'), '# Mimari Plan\nDetaylar...', 'utf8');

        const pendingResult = await rehydrateProjectStateFromDisk(pendingDir, { projectId: pendingId, database });
        assert.strictEqual(pendingResult.success, true);
        assert.strictEqual(pendingResult.status, 'pending_approval', 'Project status must be pending_approval');

        const pendingChats = database.prepare('SELECT role, text_content FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(pendingId);
        assert.strictEqual(pendingChats.length, 2, 'Pending approval project must have exactly 2 chat messages (welcome + plan presentation)');
        assert.ok(pendingChats[0].text_content.includes('Manager (Kıdemli Mimar)'), 'First message must be welcome/kickoff');
        assert.ok(pendingChats[1].text_content.includes('İşte hazırladığım mimari şartname ve plan:'), 'Second message must be plan presentation');
        assert.strictEqual(pendingChats.some(c => c.text_content.includes('🎉')), false, 'Must NOT contain completion message');

        // Case B: completed project
        const completedId = `proj-completed-${Date.now()}`;
        const completedDir = path.join(tmpDir, completedId);
        const completedManagerDir = path.join(completedDir, 'manager');
        await fs.mkdir(completedManagerDir, { recursive: true });

        await fs.writeFile(path.join(completedDir, 'DURUM.md'), '# DURUM\nDurum: TAMAMLANDI\n', 'utf8');
        await fs.writeFile(path.join(completedManagerDir, 'TALIMATNAME.md'), '# Mimari Plan\nDetaylar...', 'utf8');
        await fs.writeFile(path.join(completedDir, 'RAPOR.md'), '# RAPOR\nDurum: BAŞARILI\nTüm testler onaylandı.', 'utf8');

        const completedResult = await rehydrateProjectStateFromDisk(completedDir, { projectId: completedId, database });
        assert.strictEqual(completedResult.success, true);
        assert.strictEqual(completedResult.status, 'completed', 'Project status must be completed');

        const completedChats = database.prepare('SELECT role, text_content FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(completedId);
        assert.strictEqual(completedChats.length, 3, 'Completed project must have 3 chat messages (welcome + plan presentation + RAPOR message)');
        assert.ok(completedChats[2].text_content.includes('🎉 **Proje Üretimi ve Test Kabulü Tamamlandı!**'), 'Third message must be completion RAPOR');

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
    await runAsyncTest('6. completed project rehydrates with a verified artifact and getProject(projectId).latestArtifact is populated with status verified', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-artifact-test-'));
        const completedId = `proj-art-completed-${Date.now()}`;
        const completedDir = path.join(tmpDir, completedId);
        const managerDir = path.join(completedDir, 'manager');
        await fs.mkdir(managerDir, { recursive: true });

        await fs.writeFile(path.join(completedDir, 'DURUM.md'), '# DURUM\nDurum: TAMAMLANDI\n', 'utf8');
        await fs.writeFile(path.join(completedDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }), 'utf8');
        await fs.writeFile(path.join(completedDir, 'index.js'), 'console.log("hello world");', 'utf8');
        await fs.writeFile(path.join(managerDir, 'TALIMATNAME.md'), '# Mimari Plan\nDetaylar...', 'utf8');
        await fs.writeFile(path.join(completedDir, 'RAPOR.md'), '# RAPOR\nDurum: BAŞARILI\nTüm testler onaylandı.', 'utf8');

        const completedResult = await rehydrateProjectStateFromDisk(completedDir, { projectId: completedId, database });
        assert.strictEqual(completedResult.success, true);
        assert.strictEqual(completedResult.status, 'completed');

        // Check SQLite artifacts table
        const artifactRow = database.prepare("SELECT * FROM artifacts WHERE project_id = ? AND status = 'verified'").get(completedId);
        assert.ok(artifactRow, 'Verified artifact row must exist in database');
        assert.strictEqual(artifactRow.status, 'verified');
        assert.ok(artifactRow.sha256, 'Artifact must have sha256 hash');
        assert.ok(artifactRow.path, 'Artifact must have path');
        assert.ok(artifactRow.verification_run_id, 'Artifact must have verification_run_id');

        // Verify ZIP file exists on disk
        assert.strictEqual(fsSync.existsSync(artifactRow.path), true, 'Artifact ZIP file must exist on disk');

        // Check getProject(completedId) returns latestArtifact
        process.env.PROJECTS_ROOT = tmpDir;
        const project = getProject(completedId);
        assert.ok(project, 'getProject must return project');
        assert.ok(project.latestArtifact, 'project.latestArtifact must be populated');
        assert.strictEqual(project.latestArtifact.status, 'verified');
        assert.strictEqual(project.latestArtifact.id, artifactRow.id);
        assert.strictEqual(project.latestArtifact.sha256, artifactRow.sha256);
        assert.strictEqual(project.latestArtifact.size, artifactRow.size);

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
    await runAsyncTest('7. rehydrateProjectLogsFromDisk does NOT emit fake task finish logs for pending_approval project', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehydrate-pending-logs-test-'));
        const pendingId = `proj-logs-pending-${Date.now()}`;
        const pendingDir = path.join(tmpDir, pendingId);
        const managerDir = path.join(pendingDir, 'manager');
        const backendDir = path.join(managerDir, 'backend.director', 'domain');

        await fs.mkdir(backendDir, { recursive: true });
        await fs.writeFile(path.join(managerDir, 'DURUM.md'), '# DURUM\n- Durum: BASLADI\n- Detay: Manager planlama başlattı.', 'utf8');
        await fs.writeFile(path.join(managerDir, 'TALIMATNAME.md'), '# Plan\n...', 'utf8');

        // Add task dir with GOREV.md and RAPOR.md to ensure scanner ignores it for pending_approval
        const task1Dir = path.join(backendDir, 'task-1');
        await fs.mkdir(task1Dir, { recursive: true });
        await fs.writeFile(path.join(task1Dir, 'GOREV.md'), '# Task 1\nTask details', 'utf8');
        await fs.writeFile(path.join(task1Dir, 'RAPOR.md'), '# RAPOR\nDurum: ONAYLANDI', 'utf8');

        const stateResult = await rehydrateProjectStateFromDisk(pendingDir, { projectId: pendingId, database });
        assert.strictEqual(stateResult.success, true);
        assert.strictEqual(stateResult.status, 'pending_approval');

        const logs = database.prepare('SELECT agent, action, node_id FROM project_logs WHERE project_id = ?').all(pendingId);
        assert.ok(logs.length > 0, 'Must have initial planning logs');
        const actions = logs.map(l => l.action);
        const nodeIds = logs.map(l => l.node_id).filter(Boolean);

        assert.ok(actions.includes('start'), 'Must include Manager start log');
        assert.strictEqual(actions.includes('finish'), false, 'Must NOT include any finish logs');
        assert.strictEqual(actions.includes('write'), false, 'Must NOT include Coder write logs');
        assert.strictEqual(nodeIds.length, 0, 'Must NOT have any task node_id logs for pending_approval');

        await fs.rm(tmpDir, { recursive: true, force: true });
    });
} finally {
    await isolated.cleanup();
    finish();
}
