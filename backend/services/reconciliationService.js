import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db, initializeDatabase } from '../db.js';
import { getProjectsRoot, isValidProjectId } from '../projectPaths.js';
import { collectArtifactFiles } from '../artifactInventory.js';
import { createProjectZip } from '../utils/archive.js';

function resolveDb(database) {
    return database || db || initializeDatabase();
}

export function restoreTaskTargetsFromProtocol(teamleaderDir, tasks = []) {
    return tasks.map(task => {
        if (Array.isArray(task.targetFiles) && task.targetFiles.length === 1 && task.description) return task;
        if (!/^[a-zA-Z0-9_-]+$/.test(task.id || '')) return task;
        const gorevPath = path.join(teamleaderDir, task.id, 'GOREV.md');
        try {
            const content = fsSync.readFileSync(gorevPath, 'utf8');
            const description = content.match(/^Açıklama:\s*(.+)$/m)?.[1]?.trim();
            const match = content.match(/^Hedef Dosyalar:\s*(\[[^\r\n]*\])/m);
            if (!match) return task;
            const targets = JSON.parse(match[1]);
            if (!Array.isArray(targets) || targets.length !== 1 || typeof targets[0] !== 'string') return task;
            const target = targets[0].trim().replace(/\\/g, '/');
            if (!target || path.posix.isAbsolute(target) || path.win32.isAbsolute(target) || target.split('/').some(part => !part || part === '..' || part === '.') || target.includes('\0')) return task;
            return { ...task, ...(description ? { description } : {}), targetFiles: [target] };
        } catch {
            return task;
        }
    });
}

function makeArtifactDeps(database) {
    const resolved = resolveDb(database);
    if (!resolved || resolved === db) return {};
    return {
        db: resolved,
        createArtifact: ({ id, projectId, contractId, kind, path, sha256, size, manifestJson = '[]', status = 'draft' }) => {
            return database.prepare(`
                INSERT INTO artifacts (
                    id, project_id, contract_id, kind, path, sha256, size, manifest_json, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, projectId, contractId, kind, path, sha256, size, manifestJson, status);
        },
        addArtifactFile: ({ contractId, artifactId, path, sha256, size }) => {
            return database.prepare(`
                INSERT INTO artifact_files (
                    contract_id, artifact_id, path, sha256, size
                ) VALUES (?, ?, ?, ?, ?)
            `).run(contractId, artifactId, path, sha256, size);
        },
        withArtifactTransaction: async (work) => {
            database.exec('BEGIN IMMEDIATE;');
            try {
                const res = await work();
                database.exec('COMMIT;');
                return res;
            } catch (err) {
                try { database.exec('ROLLBACK;'); } catch {}
                throw err;
            }
        }
    };
}
function readProjectTitleFromDisk(dirPath, defaultTitle) {
    try {
        const pkgPath = path.join(dirPath, 'package.json');
        if (fsSync.existsSync(pkgPath)) {
            const pkgData = JSON.parse(fsSync.readFileSync(pkgPath, 'utf8'));
            if (pkgData && typeof pkgData === 'object') {
                const title = pkgData.title || pkgData.name || pkgData.description;
                if (title && typeof title === 'string' && title.trim().length > 0) {
                    return title.trim();
                }
            }
        }
    } catch {}

    try {
        const managerTalimat = path.join(dirPath, 'manager', 'TALIMATNAME.md');
        const rootTalimat = path.join(dirPath, 'TALIMATNAME.md');
        const talimatPath = fsSync.existsSync(managerTalimat) ? managerTalimat : rootTalimat;
        if (fsSync.existsSync(talimatPath)) {
            const content = fsSync.readFileSync(talimatPath, 'utf8');
            const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (line.startsWith('#')) {
                    const heading = line.replace(/^#+\s*/, '').trim();
                    if (heading.length > 0) return heading;
                }
            }
            if (lines.length > 0 && lines[0].length > 0) {
                return lines[0].slice(0, 100);
            }
        }
    } catch {}

    try {
        const statePath = path.join(dirPath, 'state.json');
        if (fsSync.existsSync(statePath)) {
            const stateData = JSON.parse(fsSync.readFileSync(statePath, 'utf8'));
            if (stateData && typeof stateData === 'object') {
                const title = stateData.title || stateData.name;
                if (title && typeof title === 'string' && title.trim().length > 0) {
                    return title.trim();
                }
            }
        }
    } catch {}

    return defaultTitle;
}
function detectProjectStatusFromDisk(dirPath) {
    try {
        const rootDurumPath = path.join(dirPath, 'DURUM.md');
        if (fsSync.existsSync(rootDurumPath)) {
            const rootDurum = fsSync.readFileSync(rootDurumPath, 'utf8');
            if (rootDurum && rootDurum.includes('TAMAMLANDI')) {
                return 'completed';
            }
        }

        const statePath = path.join(dirPath, 'state.json');
        if (fsSync.existsSync(statePath)) {
            const state = JSON.parse(fsSync.readFileSync(statePath, 'utf8'));
            if (state && typeof state.status === 'string' && state.status.trim() === 'completed') {
                return 'completed';
            }
        }

        const managerDir = path.join(dirPath, 'manager');
        const managerDurumPath = path.join(managerDir, 'DURUM.md');
        const managerTalimatPath = path.join(managerDir, 'TALIMATNAME.md');

        let managerBasladi = false;
        if (fsSync.existsSync(managerDurumPath)) {
            const mDurum = fsSync.readFileSync(managerDurumPath, 'utf8');
            if (mDurum && mDurum.includes('BASLADI')) {
                managerBasladi = true;
            }
        }

        if (managerBasladi || fsSync.existsSync(managerTalimatPath)) {
            return 'pending_approval';
        }
    } catch {}
    return 'planning';
}

/**
 * Rehydrates full project plan, workflow_state, and status from disk protocol files.
 */
export async function rehydrateProjectStateFromDisk(projectDir, { projectId = null, database = null } = {}) {
    if (!projectDir || !fsSync.existsSync(projectDir)) {
        return { success: false, error: 'Directory does not exist' };
    }

    database = resolveDb(database);
    const pId = projectId || path.basename(projectDir);

    // 1. TALIMATNAME.md & Summary & Title
    const managerDir = path.join(projectDir, 'manager');
    const talimatPath = path.join(managerDir, 'TALIMATNAME.md');
    let talimatname = '';
    let summary = '';
    if (fsSync.existsSync(talimatPath)) {
        try {
            talimatname = fsSync.readFileSync(talimatPath, 'utf8');
            const lines = talimatname.split('\n').map(l => l.trim()).filter(Boolean);
            summary = lines.slice(0, 3).join(' ');
        } catch {}
    }

    const title = readProjectTitleFromDisk(projectDir, pId);

    // 2. Domains from manager/TODO.md or manager subdirectories
    let domains = [];
    const managerTodoPath = path.join(managerDir, 'TODO.md');
    if (fsSync.existsSync(managerTodoPath)) {
        try {
            const content = fsSync.readFileSync(managerTodoPath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('|') && !trimmed.includes('---|---') && !trimmed.toLowerCase().includes('domain')) {
                    const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
                    if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                        const dName = parts[1].replace(/\.director\/?$/, '').trim();
                        if (dName && !domains.includes(dName)) {
                            domains.push(dName);
                        }
                    }
                }
            }
            if (domains.length === 0) {
                for (const line of lines) {
                    const match = line.match(/^-\s*\[[ xX]\]\s*(?:\d+\.\s*)?([a-zA-Z0-9_-]+)/);
                    if (match) {
                        const dName = match[1].replace(/\.director$/, '').trim();
                        if (dName && !['TODO', 'Durum', 'Manager'].includes(dName) && !domains.includes(dName)) {
                            domains.push(dName);
                        }
                    }
                }
            }
        } catch {}
    }

    if (domains.length === 0 && fsSync.existsSync(managerDir)) {
        try {
            const entries = fsSync.readdirSync(managerDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name.endsWith('.director')) {
                    const dName = entry.name.slice(0, -9);
                    if (dName && !domains.includes(dName)) {
                        domains.push(dName);
                    }
                }
            }
        } catch {}
    }

    if (domains.length === 0) {
        domains = ['backend', 'frontend'];
    }

    // 3. Scan sub TODO.md files under manager/
    function findAllTodoFiles(dir) {
        let results = [];
        if (!fsSync.existsSync(dir)) return results;
        try {
            const entries = fsSync.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    results = results.concat(findAllTodoFiles(fullPath));
                } else if (entry.isFile() && entry.name.toLowerCase() === 'todo.md') {
                    if (path.resolve(fullPath) !== path.resolve(managerTodoPath)) {
                        results.push(fullPath);
                    }
                }
            }
        } catch {}
        return results;
    }

    const todoFiles = findAllTodoFiles(managerDir);
    const teamleaderPlans = {};
    const allTasksMap = new Map();

    for (const todoFile of todoFiles) {
        const fileDir = path.dirname(todoFile);
        const relDir = path.relative(managerDir, fileDir);
        const relParts = relDir.split(/[/\\]/).filter(Boolean).map(p => p.endsWith('.director') ? p.slice(0, -9) : p);
        const tlId = relParts.join('.') || 'default';

        const fileTasks = [];
        const fileTasksMap = new Map();
        try {
            const content = fsSync.readFileSync(todoFile, 'utf8');
            const lines = content.split('\n');

            // Pass 1: table rows
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('|') && !trimmed.includes('---|---') && !trimmed.toLowerCase().includes('görev id')) {
                    const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
                    if (parts.length >= 3) {
                        const idxNum = parseInt(parts[0], 10);
                        if (!isNaN(idxNum)) {
                            const taskId = parts[1];
                            const taskTitle = parts[2] || taskId;
                            const depsRaw = parts[3] || '—';
                            const statusRaw = (parts[4] || '').toLowerCase();

                            let dependencies = [];
                            if (depsRaw && depsRaw !== '—' && depsRaw !== '-' && depsRaw !== 'none') {
                                dependencies = depsRaw.split(',').map(d => d.trim()).filter(Boolean);
                            }

                            const isCompleted = statusRaw.includes('completed') ||
                                               statusRaw.includes('tamamlandı') ||
                                               statusRaw.includes('onaylandı') ||
                                               statusRaw.includes('[x]');

                            const tObj = {
                                id: taskId,
                                title: taskTitle,
                                dependencies,
                                status: isCompleted ? 'completed' : 'pending'
                            };
                            fileTasks.push(tObj);
                            fileTasksMap.set(taskId, tObj);
                            fileTasksMap.set(taskTitle, tObj);
                        }
                    }
                }
            }

            // Pass 2: checkbox lines
            for (const line of lines) {
                const trimmed = line.trim();
                const cbMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
                if (cbMatch) {
                    const isChecked = cbMatch[1].toLowerCase() === 'x';
                    const rest = cbMatch[2].trim();

                    let tId = null;
                    let tTitle = null;

                    const arrowMatch = rest.match(/^(?:\d+\.\s*)?(.*?)\s*→\s*`([^`/]+)\/?`/);
                    if (arrowMatch) {
                        tTitle = arrowMatch[1].trim();
                        tId = arrowMatch[2].trim();
                    } else {
                        const numMatch = rest.match(/^\d+\.\s*(.*)$/);
                        if (numMatch) {
                            tTitle = numMatch[1].trim();
                        } else {
                            tTitle = rest;
                        }
                    }

                    let existing = (tId && fileTasksMap.get(tId)) || (tTitle && fileTasksMap.get(tTitle));
                    if (existing) {
                        if (isChecked) existing.status = 'completed';
                    } else {
                        const newId = tId || tTitle;
                        if (newId) {
                            const tObj = {
                                id: newId,
                                title: tTitle || newId,
                                dependencies: [],
                                status: isChecked ? 'completed' : 'pending'
                            };
                            fileTasks.push(tObj);
                            fileTasksMap.set(newId, tObj);
                        }
                    }
                }
            }

            // Pass 3: Check coder directory completion
            for (const task of fileTasks) {
                if (task.status !== 'completed') {
                    const coderDir = path.join(fileDir, task.id);
                    if (fsSync.existsSync(coderDir)) {
                        const raporExists = fsSync.existsSync(path.join(coderDir, 'RAPOR.md'));
                        let durumCompleted = false;
                        const durumFile = path.join(coderDir, 'DURUM.md');
                        if (fsSync.existsSync(durumFile)) {
                            try {
                                const durumContent = fsSync.readFileSync(durumFile, 'utf8');
                                durumCompleted = durumContent.includes('TAMAMLANDI') || durumContent.includes('BASARILI');
                            } catch {}
                        }
                        if (raporExists || durumCompleted) {
                            task.status = 'completed';
                        }
                    }
                }
            }
        } catch {}

        const recoveredTasks = restoreTaskTargetsFromProtocol(fileDir, fileTasks);
        teamleaderPlans[tlId] = { tasks: recoveredTasks };
        for (const t of recoveredTasks) {
            allTasksMap.set(t.id, t);
        }
    }

    const tasks = Array.from(allTasksMap.values());

    // 4. Status determination
    const diskStatus = detectProjectStatusFromDisk(projectDir);
    let status = diskStatus;
    if (diskStatus !== 'completed') {
        if (tasks.length > 0) {
            status = 'in_progress';
        } else if (diskStatus === 'pending_approval') {
            status = 'pending_approval';
        } else {
            status = 'planning';
        }
    }
    const plan = {
        title,
        talimatname,
        summary,
        domains,
        tasks
    };

    // 5. Update SQLite projects table
    const existingProj = database.prepare('SELECT id, status, revision, workflow_state FROM projects WHERE id = ?').get(pId);
    let existingWorkflow = {};
    try {
        const parsed = JSON.parse(existingProj?.workflow_state || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existingWorkflow = parsed;
    } catch {}
    if (!existingWorkflow.last_error && ['paused', 'verification_failed', 'artifact_verified'].includes(existingProj?.status)) {
        const latestAttempt = database.prepare(`
            SELECT status, error FROM workflow_attempts
            WHERE project_id = ?
            ORDER BY started_epoch DESC, started_at DESC LIMIT 1
        `).get(pId);
        if (latestAttempt?.status === 'failed' && latestAttempt.error) {
            existingWorkflow.last_error = latestAttempt.error;
        }
    }
    const workflow = {
        ...existingWorkflow,
        teamleaderPlans: { ...(existingWorkflow.teamleaderPlans || {}), ...teamleaderPlans }
    };
    const planJson = JSON.stringify(plan);
    const workflowJson = JSON.stringify(workflow);
    const nowIso = new Date().toISOString();

    let approvedContract = null;
    let pendingContract = null;
    try {
        approvedContract = database.prepare(
            'SELECT id, revision FROM project_contracts WHERE project_id = ? AND status = \'approved\' ORDER BY revision DESC LIMIT 1'
        ).get(pId);
        pendingContract = database.prepare(
            'SELECT id, revision FROM project_contracts WHERE project_id = ? AND status = \'pending_approval\' ORDER BY revision DESC LIMIT 1'
        ).get(pId);
    } catch {}

    // Determine safe reconciled status
    let finalStatus = status;
    if (pendingContract) {
        // The database owns a new plan awaiting approval. Disk protocol files
        // still describe the previous generation and must not override it.
        finalStatus = 'pending_approval';
    } else if (status !== 'completed') {
        if (approvedContract && !pendingContract) {
            // Sözleşme zaten onaylanmış ve onay bekleyen yeni bir revizyon yok.
            // Proje ASLA tekrar pending_approval durumuna düşürülmemelidir.
            if (existingProj?.status && !['planning', 'pending_approval'].includes(existingProj.status)) {
                finalStatus = existingProj.status;
            } else if (tasks.length > 0) {
                finalStatus = 'paused';
            } else {
                finalStatus = 'contract_approved';
            }
        } else if (existingProj?.status && !['planning', 'pending_approval'].includes(existingProj.status) && !pendingContract) {
            finalStatus = existingProj.status;
        }
    }

    if (!existingProj) {
        database.prepare(`
            INSERT INTO projects (id, title, status, plan, workflow_state, is_pinned, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
        `).run(pId, title, finalStatus, planJson, workflowJson, nowIso);
    } else if (pendingContract) {
        database.prepare('UPDATE projects SET status = ? WHERE id = ?').run(finalStatus, pId);
    } else {
        database.prepare(`
            UPDATE projects
            SET plan = ?, workflow_state = ?, status = ?
            WHERE id = ?
        `).run(planJson, workflowJson, finalStatus, pId);
    }

    // 6. project_contracts table entry
    let contractRow = approvedContract || pendingContract;

    if (!contractRow) {
        const contractId = `contract-${crypto.randomUUID()}`;
        const contractHash = crypto.createHash('sha256').update(planJson).digest('hex');
        const contractStatus = (finalStatus === 'pending_approval') ? 'pending_approval' : 'approved';
        const approvedAtVal = (contractStatus === 'approved') ? nowIso : null;

        database.prepare(`
            INSERT INTO project_contracts (
                id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at
            ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
        `).run(contractId, pId, contractStatus, planJson, contractHash, approvedAtVal, nowIso);
        contractRow = { id: contractId, status: contractStatus };
    }

    // 7. Unverified ZIP artifact recovery for completed projects
    if (finalStatus === 'completed') {
        const existingArtifact = database.prepare(
            'SELECT id, sha256 FROM artifacts WHERE project_id = ? AND status IN (\'built\', \'verified\') LIMIT 1'
        ).get(pId);

        if (!existingArtifact) {
            try {
                const files = await collectArtifactFiles(projectDir);
                if (files && files.length > 0) {
                    const deps = makeArtifactDeps(database);
                    const zipResult = await createProjectZip(pId, contractRow.id, files, undefined, deps);
                    database.prepare(`
                        UPDATE artifacts
                        SET status = 'built'
                        WHERE id = ? AND project_id = ? AND contract_id = ? AND status = 'draft'
                    `).run(zipResult.id, pId, contractRow.id);
                }
            } catch (err) {
                console.error(`Artifact creation failed during rehydration for ${pId}:`, err);
            }
        }
    }

    rehydrateProjectChatHistoryFromDisk(projectDir, { projectId: pId, database });
    await rehydrateProjectLogsFromDisk(projectDir, { projectId: pId, database });

    return {
        success: true,
        plan,
        workflow,
        status: finalStatus,
        tasksCount: tasks.length
    };
}

/**
 * Rehydrates chat_history from disk protocol files (TALIMATNAME.md and RAPOR.md).
 */
export function rehydrateProjectChatHistoryFromDisk(projectDir, { projectId = null, database = null } = {}) {
    if (!projectDir || !fsSync.existsSync(projectDir)) {
        return { success: false, error: 'Directory does not exist' };
    }

    database = resolveDb(database);
    const pId = projectId || path.basename(projectDir);

    let existingChats = [];
    try {
        existingChats = database.prepare(
            'SELECT id, role, text_content FROM chat_history WHERE project_id = ? ORDER BY id ASC'
        ).all(pId);
    } catch {}

    if (existingChats.length >= 3 || existingChats.some(c => c.role === 'user')) {
        return { success: true, rehydrated: false, count: existingChats.length };
    }

    const existingTexts = existingChats.map(c => c.text_content);
    const insertChatStmt = database.prepare(
        'INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)'
    );

    let insertedCount = 0;
    let baseTime = Date.now();

    let startedTransaction = false;
    try {
        database.exec('BEGIN IMMEDIATE;');
        startedTransaction = true;
    } catch {}

    try {
        // 1. Initial greeting if chat_history is completely empty
        if (existingChats.length === 0) {
            let dbProj = null;
            try {
                dbProj = database.prepare('SELECT title, status FROM projects WHERE id = ?').get(pId);
            } catch {}

            const title = dbProj?.title || readProjectTitleFromDisk(projectDir, pId);
            const status = dbProj?.status || detectProjectStatusFromDisk(projectDir);
            const welcomeText = status === 'completed'
                ? `Merhaba Boss! "${title}" projesi tamamlanmış ve tüm dosyaları hazırdır. Proje üzerinde yeni bir revizyon yapmak, değişiklik istemek veya soru sormak için buradan bana iletebilirsiniz.`
                : `Merhaba Boss! "${title}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.`;

            if (!existingTexts.includes(welcomeText)) {
                insertChatStmt.run(pId, 'model', welcomeText, new Date(baseTime).toISOString());
                existingTexts.push(welcomeText);
                insertedCount++;
                baseTime += 1000;
            }
        }

        // 2. TALIMATNAME.md
        const managerDir = path.join(projectDir, 'manager');
        const talimatPath = path.join(managerDir, 'TALIMATNAME.md');
        if (fsSync.existsSync(talimatPath)) {
            try {
                const talimatContent = fsSync.readFileSync(talimatPath, 'utf8').trim();
                if (talimatContent) {
                    const talimatMsg = `İşte hazırladığım mimari şartname ve plan:\n\n${talimatContent}`;
                    const alreadyHasTalimat = existingTexts.some(t => t.includes(talimatContent));
                    if (!alreadyHasTalimat) {
                        insertChatStmt.run(pId, 'model', talimatMsg, new Date(baseTime).toISOString());
                        existingTexts.push(talimatMsg);
                        insertedCount++;
                        baseTime += 1000;
                    }
                }
            } catch {}
        }

        // 3. RAPOR.md (only add completion report if status === 'completed')
        let currentStatus = null;
        try {
            currentStatus = database.prepare('SELECT status FROM projects WHERE id = ?').get(pId)?.status;
        } catch {}
        if (!currentStatus) {
            currentStatus = detectProjectStatusFromDisk(projectDir);
        }

        if (currentStatus === 'completed') {
            const raporPath = path.join(projectDir, 'RAPOR.md');
            if (fsSync.existsSync(raporPath)) {
                try {
                    const raporContent = fsSync.readFileSync(raporPath, 'utf8').trim();
                    if (raporContent && (raporContent.includes('BAŞARILI') || raporContent.includes('TAMAMLANDI') || raporContent.includes('GEÇTİ') || raporContent.includes('STATİK DENETİM'))) {
                        const raporMsg = `🎉 **Proje Üretimi ve Test Kabulü Tamamlandı!**\n\n${raporContent}`;
                        const alreadyHasRapor = existingTexts.some(t => t.includes(raporContent));
                        if (!alreadyHasRapor) {
                            insertChatStmt.run(pId, 'model', raporMsg, new Date(baseTime).toISOString());
                            existingTexts.push(raporMsg);
                            insertedCount++;
                            baseTime += 1000;
                        }
                    }
                } catch {}
            }
        }
        if (startedTransaction) database.exec('COMMIT;');
    } catch (error) {
        if (startedTransaction) {
            try { database.exec('ROLLBACK;'); } catch {}
        }
        throw error;
    }

    return { success: true, rehydrated: insertedCount > 0, insertedCount };
}
/**
 * Rehydrates project_logs from disk protocol files (manager/DURUM.md, director DURUM.md, task GOREV.md/TODO.md/RAPOR.md, root RAPOR.md).
 */
export async function rehydrateProjectLogsFromDisk(projectDir, { projectId = null, database = null, force = false } = {}) {
    if (!projectDir || !fsSync.existsSync(projectDir)) {
        return { success: false, error: 'Directory does not exist' };
    }

    database = resolveDb(database);
    const pId = projectId || path.basename(projectDir);

    const existingProj = database.prepare('SELECT id FROM projects WHERE id = ?').get(pId);
    if (!existingProj) {
        await rehydrateProjectStateFromDisk(projectDir, { projectId: pId, database });
        const checkRow = database.prepare('SELECT COUNT(*) as cnt FROM project_logs WHERE project_id = ?').get(pId);
        if (checkRow && checkRow.cnt > 0) {
            return { success: true, rehydrated: true, count: checkRow.cnt };
        }
    }
    let currentStatus = null;
    try {
        currentStatus = database.prepare('SELECT status FROM projects WHERE id = ?').get(pId)?.status;
    } catch {}
    if (!currentStatus) {
        currentStatus = detectProjectStatusFromDisk(projectDir);
    }

    let existingLogs = [];
    try {
        existingLogs = database.prepare('SELECT id, node_id, action FROM project_logs WHERE project_id = ?').all(pId);
    } catch {}

    const recoverableProgress = currentStatus === 'paused' || currentStatus === 'verification_failed';
    if (existingLogs.length > 0 && !recoverableProgress && !force) {
        return { success: true, rehydrated: false, count: 0 };
    }
    const logsToInsert = [];
    // 1. Manager DURUM.md -> Manager start log
    const managerDir = path.join(projectDir, 'manager');
    if (existingLogs.length === 0 && fsSync.existsSync(managerDir)) {
        logsToInsert.push({
            agent: 'Manager',
            action: 'start',
            message: 'Manager mimari analiz ve proje planlamasını başlattı.'
        });
    }

    // 2. Director DURUM.md / ALT-TALIMATNAME.md -> Director specs log
    const directorDirs = [];
    if (fsSync.existsSync(managerDir)) {
        try {
            const entries = fsSync.readdirSync(managerDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && (entry.name.endsWith('.director') || fsSync.existsSync(path.join(managerDir, entry.name, 'ALT-TALIMATNAME.md')) || fsSync.existsSync(path.join(managerDir, entry.name, 'DURUM.md')))) {
                    directorDirs.push(path.join(managerDir, entry.name));
                }
            }
        } catch {}
    }

    if (existingLogs.length > 0) {
        // Preserve the real event stream; disk recovery only appends missing task evidence.
    } else if (directorDirs.length > 0) {
        for (const dirPath of directorDirs) {
            const dirName = path.basename(dirPath).replace(/\.director$/, '');
            logsToInsert.push({
                agent: 'Director',
                action: 'specs',
                message: `${dirName} director mimari şartname ve domain gereksinimlerini belirledi.`
            });
        }
    } else if (fsSync.existsSync(managerDir)) {
        logsToInsert.push({
            agent: 'Director',
            action: 'specs',
            message: 'Director mimari şartname ve domain gereksinimlerini belirledi.'
        });
    }

    if (currentStatus === 'completed' || recoverableProgress) {
    // 3. Helper functions for scanning tasks
    function extractTitleFromGorev(gorevPath) {
        try {
            if (fsSync.existsSync(gorevPath)) {
                const content = fsSync.readFileSync(gorevPath, 'utf8');
                const lines = content.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('#')) {
                        const titleText = trimmed.replace(/^#+\s*/, '').replace(/^Görev:\s*/i, '').replace(/^Task:\s*/i, '').trim();
                        if (titleText && titleText !== 'Manager (Orkestratör)' && titleText !== 'Manager') {
                            return titleText;
                        }
                    }
                }
            }
        } catch {}
        return null;
    }

    function extractReviewResult(raporPath) {
        try {
            if (fsSync.existsSync(raporPath)) {
                const content = fsSync.readFileSync(raporPath, 'utf8').toUpperCase();
                if (content.includes('REDDEDILDI') || content.includes('BASARISIZ') || content.includes('HATA')) {
                    return 'rejected';
                }
                return 'approved';
            }
        } catch {}
        return null;
    }

    function findAllTodoFiles(dir) {
        let results = [];
        if (!fsSync.existsSync(dir)) return results;
        try {
            const entries = fsSync.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    results = results.concat(findAllTodoFiles(fullPath));
                } else if (entry.isFile() && entry.name.toLowerCase() === 'todo.md') {
                    if (path.resolve(fullPath) !== path.resolve(path.join(managerDir, 'TODO.md'))) {
                        results.push(fullPath);
                    }
                }
            }
        } catch {}
        return results;
    }

    const tasksFound = [];
    const knownTaskIds = new Set();
    const todoFiles = findAllTodoFiles(managerDir);
    const taskNode = (parentDir, taskId) => {
        const parentNodeId = path.relative(managerDir, parentDir).split(/[/\\]/).filter(Boolean)
            .map(part => part.replace(/\.director$/, '')).join('.');
        return { node_id: `${parentNodeId}.${taskId}`, parent_node_id: parentNodeId };
    };

    for (const todoFile of todoFiles) {
        const fileDir = path.dirname(todoFile);
        try {
            const content = fsSync.readFileSync(todoFile, 'utf8');
            const lines = content.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('|') && !trimmed.includes('---|---') && !trimmed.toLowerCase().includes('görev id')) {
                    const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
                    if (parts.length >= 3) {
                        const idxNum = parseInt(parts[0], 10);
                        if (!isNaN(idxNum)) {
                            const taskId = parts[1];
                            const taskTitle = parts[2] || taskId;

                            if (taskId && !knownTaskIds.has(taskId)) {
                                knownTaskIds.add(taskId);

                                const taskDir = path.join(fileDir, taskId);
                                const gorevPath = path.join(taskDir, 'GOREV.md');
                                const raporPath = path.join(taskDir, 'RAPOR.md');

                                const titleFromGorev = extractTitleFromGorev(gorevPath);
                                const finalTitle = titleFromGorev || taskTitle;
                                const reviewRes = extractReviewResult(raporPath);
                                const durumPath = path.join(taskDir, 'DURUM.md');
                                const completedOnDisk = reviewRes !== null || (fsSync.existsSync(durumPath) && /TAMAMLANDI|BASARILI/.test(fsSync.readFileSync(durumPath, 'utf8')));
                                if (recoverableProgress && !completedOnDisk) continue;

                                tasksFound.push({
                                    id: taskId,
                                    title: finalTitle,
                                    reviewResult: reviewRes,
                                    ...taskNode(fileDir, taskId)
                                });
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    function scanForTaskDirs(dir) {
        if (!fsSync.existsSync(dir)) return;
        try {
            const entries = fsSync.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    if (entry.name.startsWith('task-') || entry.name.startsWith('task_') || entry.name.startsWith('gorev-') || entry.name.startsWith('gorev_')) {
                        const taskId = entry.name;
                        if (!knownTaskIds.has(taskId)) {
                            knownTaskIds.add(taskId);
                            const gorevPath = path.join(fullPath, 'GOREV.md');
                            const raporPath = path.join(fullPath, 'RAPOR.md');

                            const titleFromGorev = extractTitleFromGorev(gorevPath);
                            const finalTitle = titleFromGorev || taskId;
                            const reviewRes = extractReviewResult(raporPath);
                            const durumPath = path.join(fullPath, 'DURUM.md');
                            const completedOnDisk = reviewRes !== null || (fsSync.existsSync(durumPath) && /TAMAMLANDI|BASARILI/.test(fsSync.readFileSync(durumPath, 'utf8')));
                            if (recoverableProgress && !completedOnDisk) continue;

                            tasksFound.push({
                                id: taskId,
                                title: finalTitle,
                                reviewResult: reviewRes,
                                ...taskNode(path.dirname(fullPath), taskId)
                            });
                        }
                    }
                    scanForTaskDirs(fullPath);
                }
            }
        } catch {}
    }

    scanForTaskDirs(projectDir);

    const knownNodes = new Set(existingLogs.map(log => log.node_id).filter(Boolean));
    for (const task of tasksFound) {
        const directorId = `${task.parent_node_id.split('.')[0]}.director`;
        if (!knownNodes.has(directorId)) {
            logsToInsert.push({ agent: 'Director', action: 'specs', message: `${directorId} şartnamesi diskten geri yüklendi.`, node_id: directorId, parent_node_id: 'manager' });
            knownNodes.add(directorId);
        }
        if (!knownNodes.has(task.parent_node_id)) {
            logsToInsert.push({ agent: 'Teamleader', action: 'start', message: `${task.parent_node_id} görev planı diskten geri yüklendi.`, node_id: task.parent_node_id, parent_node_id: directorId });
            knownNodes.add(task.parent_node_id);
        }
        if (existingLogs.some(log => log.node_id === task.id || log.node_id === task.node_id)) continue;
        logsToInsert.push({
            agent: 'Teamleader',
            action: 'delegate',
            message: `Görev "${task.title}" Coder'a iletildi.`,
            node_id: task.node_id,
            parent_node_id: task.parent_node_id
        });

        logsToInsert.push({
            agent: 'Coder',
            action: 'write',
            message: `Görev "${task.title}" için kod dosyaları yazıldı.`,
            node_id: task.node_id,
            parent_node_id: task.parent_node_id
        });

        if (task.reviewResult === 'rejected') {
            logsToInsert.push({
                agent: 'Reviewer',
                action: 'reject',
                message: `Görev "${task.title}" denetlendi ve REDDEDİLDİ.`,
                node_id: task.node_id,
                parent_node_id: task.parent_node_id
            });
        } else {
            logsToInsert.push({
                agent: 'Reviewer',
                action: 'finish',
                message: `Görev "${task.title}" denetlendi ve ONAYLANDI.`,
                node_id: task.node_id,
                parent_node_id: task.parent_node_id
            });
        }
    }

    // 4. Root RAPOR.md -> Tester finish log
    const rootRaporPath = path.join(projectDir, 'RAPOR.md');
    if (currentStatus === 'completed' && fsSync.existsSync(rootRaporPath)) {
        logsToInsert.push({
            agent: 'Tester',
            action: 'finish',
            message: 'Proje kabul denetimi ve final rapor (RAPOR.md) onaylandı.'
        });
    }
    }

    if (logsToInsert.length === 0) {
        return { success: true, rehydrated: false, count: 0 };
    }

    const insertLogStmt = database.prepare(`
        INSERT INTO project_logs (project_id, agent, action, message, node_id, parent_node_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;
    let baseTime = Date.now() - (logsToInsert.length * 1000);

    let startedTransaction = false;
    try {
        database.exec('BEGIN IMMEDIATE;');
        startedTransaction = true;
    } catch {}

    try {
        for (const logItem of logsToInsert) {
            const createdAtIso = new Date(baseTime).toISOString();
            insertLogStmt.run(
                pId,
                logItem.agent || null,
                logItem.action || null,
                logItem.message || '',
                logItem.node_id || null,
                logItem.parent_node_id || null,
                createdAtIso
            );
            insertedCount++;
            baseTime += 1000;
        }

        if (startedTransaction) database.exec('COMMIT;');
    } catch (error) {
        if (startedTransaction) {
            try { database.exec('ROLLBACK;'); } catch {}
        }
        throw error;
    }

    return { success: true, rehydrated: insertedCount > 0, count: insertedCount };
}


/**
 * Safely registers valid unimported directories found in projectsRoot into SQLite projects table.
 */
export async function autoRegisterDiscoveredProjects({ env = process.env, projectsRoot = null, database = null } = {}) {
    database = resolveDb(database);
    const root = projectsRoot || getProjectsRoot(env);

    if (!fsSync.existsSync(root)) {
        return {
            success: false,
            error: `Projects root "${root}" does not exist`,
            registered: []
        };
    }

    let entries;
    try {
        entries = fsSync.readdirSync(root, { withFileTypes: true });
    } catch (error) {
        return {
            success: false,
            error: `Projects root "${root}" could not be read: ${error.message}`,
            registered: []
        };
    }

    const validDiskDirs = [];
    for (const d of entries) {
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        if (isValidProjectId(d.name)) {
            validDiskDirs.push(d.name);
        }
    }

    const dbProjects = database.prepare('SELECT id FROM projects').all().map(p => p.id);
    const dbSet = new Set(dbProjects);
    const registered = [];
    const nowIso = new Date().toISOString();
    const insertStmt = database.prepare(
        'INSERT INTO projects (id, title, status, plan, is_pinned, created_at) VALUES (?, ?, ?, NULL, 0, ?)'
    );
    const insertChatStmt = database.prepare(
        'INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)'
    );
    let adminUser = null;
    let insertOwnerStmt = null;
    try {
        adminUser = database.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
        if (adminUser) {
            insertOwnerStmt = database.prepare(
                'INSERT OR IGNORE INTO project_owners (project_id, user_id, role, created_at) VALUES (?, ?, "owner", ?)'
            );
        }
    } catch {}

    database.exec('BEGIN IMMEDIATE;');
    try {
        for (const diskId of validDiskDirs) {
            if (!dbSet.has(diskId)) {
                const dirPath = path.join(root, diskId);
                const title = readProjectTitleFromDisk(dirPath, diskId);
                const status = detectProjectStatusFromDisk(dirPath);
                insertStmt.run(diskId, title, status, nowIso);
                if (insertOwnerStmt && adminUser) {
                    insertOwnerStmt.run(diskId, adminUser.id, nowIso);
                }
                await rehydrateProjectStateFromDisk(dirPath, { projectId: diskId, database });
                const welcomeText = status === 'completed'
                    ? `Merhaba Boss! "${title}" projesi tamamlanmış ve tüm dosyaları hazırdır. Proje üzerinde yeni bir revizyon yapmak, değişiklik istemek veya soru sormak için buradan bana iletebilirsiniz.`
                    : `Merhaba Boss! "${title}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.`;
                insertChatStmt.run(diskId, 'model', welcomeText, nowIso);
                registered.push({ id: diskId, title, status });
            }
        }
        if (adminUser) {
            database.prepare(`
                INSERT OR IGNORE INTO project_owners (project_id, user_id, role, created_at)
                SELECT p.id, ?, 'owner', ?
                FROM projects p
                LEFT JOIN project_owners po ON po.project_id = p.id
                WHERE po.project_id IS NULL
            `).run(adminUser.id, nowIso);
        }
        database.exec('COMMIT;');
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }

    return { success: true, registered };
}

/**
 * Non-destructive reconciliation between SQLite `projects` and on-disk
 * project directories. NEVER deletes database rows: projects missing on
 * disk are collected into `missingOnDisk` for the caller to report.
 */
export async function reconcileProjectsWithDisk({ env = process.env, projectsRoot = null, database = null, autoRegister = false } = {}) {
    database = resolveDb(database);
    const root = projectsRoot || getProjectsRoot(env);

    if (!fsSync.existsSync(root)) {
        return {
            success: false,
            error: `Projects root "${root}" does not exist`,
            syncedCount: 0,
            updatedCount: 0,
            missingOnDisk: [],
            quarantined: [],
            unverified: [],
            cleanedOrphans: 0,
            orphansRemoved: 0
        };
    }

    let entries;
    try {
        entries = fsSync.readdirSync(root, { withFileTypes: true });
    } catch (error) {
        return {
            success: false,
            error: `Projects root "${root}" could not be read: ${error.message}`,
            syncedCount: 0,
            updatedCount: 0,
            missingOnDisk: [],
            quarantined: [],
            unverified: [],
            cleanedOrphans: 0,
            orphansRemoved: 0
        };
    }
    const validDiskDirs = [];
    const quarantined = [];

    for (const d of entries) {
        if (!d.isDirectory() || d.name.startsWith('.')) continue;
        if (isValidProjectId(d.name)) {
            validDiskDirs.push(d.name);
        } else {
            quarantined.push(d.name);
        }
    }

    let autoRegistered = [];
    if (autoRegister) {
        const regRes = await autoRegisterDiscoveredProjects({ env, projectsRoot: root, database });
        if (regRes.success) {
            autoRegistered = regRes.registered || [];
        }
    }

    const dbProjectsWithState = database.prepare('SELECT id, plan, workflow_state FROM projects').all();
    const dbSet = new Set(dbProjectsWithState.map(p => p.id));
    const unverified = [];

    for (const diskId of validDiskDirs) {
        if (!dbSet.has(diskId)) {
            unverified.push({
                id: diskId,
                path: path.join(root, diskId),
                verified: false,
                reason: 'directory_not_registered'
            });
        }
    }
    const syncedCount = autoRegistered.length;
    let updatedCount = 0;
    const missingOnDisk = [];

    database.exec('BEGIN IMMEDIATE;');
    try {
        for (const proj of dbProjectsWithState) {
            const expectedDir = path.join(root, proj.id);
            if (!fsSync.existsSync(expectedDir)) {
                missingOnDisk.push(proj.id);
            } else {
                if (!proj.plan || !proj.workflow_state || proj.plan === 'null' || proj.workflow_state === 'null') {
                    await rehydrateProjectStateFromDisk(expectedDir, { projectId: proj.id, database });
                    updatedCount += 1;
                }
            }
        }
        database.exec('COMMIT;');
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }

    return {
        success: true,
        syncedCount,
        updatedCount,
        missingOnDisk,
        quarantined,
        unverified,
        autoRegistered,
        cleanedOrphans: 0,
        orphansRemoved: 0
    };
}
