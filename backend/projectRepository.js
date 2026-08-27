import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { db, dbEvents, formatDBDate } from './db.js';
import { validateProjectTitle } from './security.js';

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

    const project = db.prepare('SELECT id, title, status, plan, is_pinned, workflow_state, revision, created_at FROM projects WHERE id = ?').get(projectId);
    if (!project) return null;

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
    if (project.plan) {
        try { plan = JSON.parse(project.plan); } catch {}
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
    const env = (typeof stateOrId === 'object' && stateOrId !== null) ? stateOrEnv : maybeEnv;

    if (!state || !isValidProjectId(state.id)) {
        throw new Error(`Invalid project state or project ID: ${state?.id}`);
    }

    const planStr = state.plan ? JSON.stringify(state.plan) : null;
    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;
    const currentRevision = Number(state.revision || 1);
    const nextRevision = currentRevision + 1;

    const upsertProjectStmt = db.prepare(`
        INSERT INTO projects (id, title, status, plan, workflow_state, revision)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            status = excluded.status,
            plan = excluded.plan,
            workflow_state = excluded.workflow_state,
            revision = excluded.revision
    `);
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    db.exec('BEGIN IMMEDIATE;');
    try {
        upsertProjectStmt.run(state.id, state.title, state.status, planStr, workflowStr, nextRevision);
        state.revision = nextRevision;

        const existingCount = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?').get(state.id).count;
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
