import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { db, dbEvents, formatDBDate } from './db.js';
import { validateProjectTitle } from './security.js';
import { isValidProjectStatus } from './auth.js';
import { canTransitionProject, PROJECT_STATUS } from './engine/stateMachine.js';

export * from './projectPaths.js';
import { getProjectDir, getProjectsRoot, isValidProjectId } from './projectPaths.js';


export async function createProject({ title, ownerUserId = null, env = process.env } = {}) {
    if (!validateProjectTitle(title || '')) {
        throw new Error('Geçerli bir proje başlığı (title) gerekli.');
    }
    const cleanTitle = title.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s-_]/g, '').trim() || 'İsimsiz Proje';
    const id = `project-${crypto.randomUUID()}`;
    const projectDir = getProjectDir(id, env);

    const initialWelcomeMessage = `Merhaba Boss! "${cleanTitle}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.`;
    const nowIso = new Date().toISOString();

    // 1. Önce dizin oluşturulur (SQLite transaction içinde await fs tutulmaz)
    await fs.mkdir(projectDir, { recursive: true });

    const insertProject = db.prepare('INSERT INTO projects (id, title, status, plan, is_pinned, created_at) VALUES (?, ?, ?, NULL, 0, ?)');
    const insertOwner = db.prepare('INSERT INTO project_owners (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)');
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    // 2. Senkron SQLite transaction
    db.exec('BEGIN IMMEDIATE;');
    try {
        insertProject.run(id, cleanTitle, 'planning', nowIso);
        if (ownerUserId) {
            insertOwner.run(id, ownerUserId, 'owner', nowIso);
        }
        insertChat.run(id, 'model', initialWelcomeMessage, nowIso);
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }

    return {
        id,
        title: cleanTitle,
        status: 'planning',
        isPinned: false,
        createdAt: nowIso,
        chatHistory: [
            { role: 'model', parts: [{ text: initialWelcomeMessage }], created_at: nowIso }
        ],
        plan: null,
        workflow: null
    };
}

export function getProject(projectId) {
    if (!isValidProjectId(projectId)) return null;

    const project = db.prepare(
        'SELECT id, title, status, is_pinned, workflow_state, revision, created_at FROM projects WHERE id = ?'
    ).get(projectId);
    if (!project) return null;

    const contractRow = db.prepare(`
        SELECT contract_json FROM project_contracts
        WHERE project_id = ?
        ORDER BY
            CASE WHEN status = 'approved' THEN 1 ELSE 0 END DESC,
            revision DESC
        LIMIT 1
    `).get(projectId);

    const chats = db.prepare('SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(projectId);
    const chatHistory = chats.map(c => {
        const timestamp = formatDBDate(c.created_at);
        return {
            id: c.id,
            role: c.role,
            parts: [{ text: c.text_content }],
            timestamp,
            created_at: c.created_at
        };
    });

    let plan = null;
    if (contractRow?.contract_json) {
        try { plan = JSON.parse(contractRow.contract_json); } catch {}
    }

    let workflow = null;
    if (project.workflow_state) {
        try { workflow = JSON.parse(project.workflow_state); } catch {}
    }

    return {
        id: project.id,
        title: project.title,
        status: project.status,
        isPinned: Boolean(project.is_pinned),
        createdAt: project.created_at,
        revision: project.revision || 1,
        plan,
        workflow,
        chatHistory
    };
}

export function projectStateTransitionInTransaction({
    projectId,
    expectedRevision,
    statuses
}) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID: "${projectId}"`);
    }
    if (!Array.isArray(statuses) || statuses.length === 0) {
        throw new Error('At least one project status transition is required.');
    }

    const persisted = db.prepare(
        'SELECT status, revision FROM projects WHERE id = ?'
    ).get(projectId);
    if (!persisted) {
        throw new Error(`Project ${projectId} does not exist`);
    }
    if (persisted.revision !== expectedRevision) {
        throw new Error(`CAS Revision conflict on project ${projectId}`);
    }

    let currentStatus = persisted.status;
    for (const nextStatus of statuses) {
        if (!isValidProjectStatus(nextStatus)) {
            throw new Error(`Unknown project status: ${nextStatus}`);
        }
        if (nextStatus === PROJECT_STATUS.COMPLETED) {
            throw new Error(
                'Cannot transition project to completed: required verified lifecycle evidence is missing'
            );
        }
        if (!canTransitionProject(currentStatus, nextStatus)) {
            throw new Error(`Illegal project transition: ${currentStatus} -> ${nextStatus}`);
        }
        currentStatus = nextStatus;
    }

    const nextRevision = expectedRevision + statuses.length;
    const result = db.prepare(`
        UPDATE projects
        SET status = ?, revision = ?
        WHERE id = ? AND revision = ? AND status = ?
    `).run(
        currentStatus,
        nextRevision,
        projectId,
        expectedRevision,
        persisted.status
    );
    if (result.changes !== 1) {
        throw new Error(`CAS Revision conflict on project ${projectId}`);
    }

    return { status: currentStatus, revision: nextRevision };
}

/**
 * Atomik tekil sohbet mesajı ekleme (Bütün state dizisini ezmeden güvenli append)
 */
export function appendProjectChatMessage(projectId, role, textContent, createdAt = new Date().toISOString()) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID: "${projectId}"`);
    }
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');
    const result = insertChat.run(projectId, role, textContent, createdAt);
    return {
        id: Number(result.lastInsertRowid),
        role,
        parts: [{ text: textContent }],
        created_at: createdAt
    };
}

export async function saveProjectState(stateOrId, stateOrEnv = process.env, maybeEnv = process.env) {
    const state = (typeof stateOrId === 'object' && stateOrId !== null) ? stateOrId : stateOrEnv;

    if (!state || !isValidProjectId(state.id)) {
        throw new Error(`Invalid project state or project ID: ${state?.id}`);
    }

    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;
    const expectedRevision = Number(state.revision || 1);
    const nextRevision = expectedRevision + 1;
    const insertChat = db.prepare(
        'INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)'
    );

    db.exec('BEGIN IMMEDIATE;');
    try {
        const persisted = db.prepare(
            'SELECT status, revision FROM projects WHERE id = ?'
        ).get(state.id);
        if (!persisted) {
            throw new Error(`Project ${state.id} does not exist`);
        }
        if (persisted.revision !== expectedRevision) {
            throw new Error(`CAS Revision conflict on project ${state.id}`);
        }
        if (!isValidProjectStatus(state.status)) {
            throw new Error(`Unknown project status: ${state.status}`);
        }
        if (state.status === PROJECT_STATUS.COMPLETED) {
            throw new Error(
                'Cannot transition project to completed: required verified lifecycle evidence is missing'
            );
        }
        if (!canTransitionProject(persisted.status, state.status)) {
            throw new Error(`Illegal project transition: ${persisted.status} -> ${state.status}`);
        }

        const result = db.prepare(`
            UPDATE projects
            SET title = ?, status = ?, plan = NULL, workflow_state = ?, revision = ?
            WHERE id = ? AND revision = ? AND status = ?
        `).run(
            state.title,
            state.status,
            workflowStr,
            nextRevision,
            state.id,
            expectedRevision,
            persisted.status
        );
        if (result.changes !== 1) {
            throw new Error(`CAS Revision conflict on project ${state.id}`);
        }
        state.revision = nextRevision;

        const existingCount = db.prepare(
            'SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?'
        ).get(state.id).count;
        const chatsToSave = state.chatHistory || [];
        for (let i = existingCount; i < chatsToSave.length; i++) {
            const chat = chatsToSave[i];
            const text = chat?.parts?.[0]?.text || '';
            const createdAt = chat.created_at || new Date().toISOString();
            insertChat.run(state.id, chat.role, text, createdAt);
        }
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
    dbEvents.emit(`stateChange:${state.id}`, state.status);
}

export async function deleteProject(projectId, env = process.env) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID format: "${projectId}"`);
    }
    const { abortProjectExecution } = await import('./engine/cancellation.js');
    // 1. Aktif in-flight workflow varsa derhal durdur
    abortProjectExecution(projectId, 'DELETED');

    const projectDir = getProjectDir(projectId, env);
    const root = getProjectsRoot(env);
    const trashDir = path.join(root, `.trash-${projectId}-${Date.now()}`);

    // 2. DB durumunu 'deleting' olarak işaretle
    db.prepare("UPDATE projects SET status = 'deleting' WHERE id = ?").run(projectId);

    // 3. Atomik directory rename (varsa trash'e taşı)
    let movedToTrash = false;
    if (fsSync.existsSync(projectDir)) {
        try {
            await fs.rename(projectDir, trashDir);
            movedToTrash = true;
        } catch (renameErr) {
            // rename başarısız olursa doğrudan silmeyi dene
        }
    }

    // 4. DB kayıtlarını temizle
    db.exec('BEGIN IMMEDIATE;');
    try {
        db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM workflow_attempts WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }

    // 5. Disk temizliğini tamamla
    const dirToRemove = movedToTrash ? trashDir : projectDir;
    await fs.rm(dirToRemove, { recursive: true, force: true }).catch(() => {});
    return true;
}

export function syncProjectsWithDisk(env = process.env) {
    const root = getProjectsRoot(env);
    // Eksik root durumunda veri kaybını önlemek için güvenli koruma
    if (!fsSync.existsSync(root)) {
        return {
            success: false,
            error: `Projects root directory "${root}" does not exist. No DB records modified.`,
            syncedCount: 0,
            orphansRemoved: 0,
            quarantined: []
        };
    }

    const diskEntries = fsSync.readdirSync(root, { withFileTypes: true });
    const validDiskDirs = [];
    const quarantined = [];

    for (const d of diskEntries) {
        if (!d.isDirectory()) continue;
        if (d.name.startsWith('.')) continue; // .trash, .git veya geçici dotfile'ları yoksay
        if (isValidProjectId(d.name)) {
            validDiskDirs.push(d.name);
        } else {
            quarantined.push(d.name);
        }
    }

    const dbProjects = db.prepare('SELECT id FROM projects').all().map(p => p.id);
    const dbProjectSet = new Set(dbProjects);

    let syncedCount = 0;
    let orphansRemoved = 0;

    db.exec('BEGIN IMMEDIATE;');
    try {
        for (const diskId of validDiskDirs) {
            if (!dbProjectSet.has(diskId)) {
                db.prepare('INSERT INTO projects (id, title, status, plan, workflow_state) VALUES (?, ?, ?, NULL, NULL)')
                    .run(diskId, diskId, 'completed');
                syncedCount++;
            }
        }

        for (const dbId of dbProjects) {
            const expectedDir = path.join(root, dbId);
            if (!fsSync.existsSync(expectedDir)) {
                db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(dbId);
                db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(dbId);
                db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(dbId);
                db.prepare('DELETE FROM projects WHERE id = ?').run(dbId);
                orphansRemoved++;
            }
        }
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }

    return {
        success: true,
        syncedCount,
        orphansRemoved,
        quarantined
    };
}
