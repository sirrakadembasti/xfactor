import crypto from 'crypto';
import { db } from './db.js';

const activeLeases = new Map(); // projectId -> { attemptId, leaseOwner }

export function getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds = 30 } = {}) {
    if (!projectId) return null;

    const row = db.prepare(`
        SELECT id, project_id, status, lease_owner, started_at, heartbeat_at, ended_at, error
        FROM workflow_attempts
        WHERE project_id = ? AND status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
    `).get(projectId);

    if (!row) {
        activeLeases.delete(projectId);
        return null;
    }

    const heartbeatMs = new Date(row.heartbeat_at).getTime();
    const isFresh = (Date.now() - heartbeatMs) <= (heartbeatTtlSeconds * 1000);
    if (!isFresh) {
        activeLeases.delete(projectId);
        return null;
    }

    return row;
}

export function acquireWorkflowLease(projectId, leaseOwner, { heartbeatTtlSeconds = 30 } = {}) {
    if (!projectId || !leaseOwner) {
        throw new Error('projectId and leaseOwner are required to acquire workflow lease.');
    }

    const active = getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds });
    if (active) {
        return { acquired: false, attempt: active };
    }

    const attemptId = `attempt-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    try {
        db.prepare(`
            INSERT INTO workflow_attempts (id, project_id, status, lease_owner, started_at, heartbeat_at)
            VALUES (?, ?, 'running', ?, ?, ?)
        `).run(attemptId, projectId, leaseOwner, nowIso, nowIso);

        activeLeases.set(projectId, { attemptId, leaseOwner });
        const newAttempt = db.prepare('SELECT * FROM workflow_attempts WHERE id = ?').get(attemptId);
        return { acquired: true, attempt: newAttempt };
    } catch (err) {
        // Unique constraint ihlali veya paralel yarış durumunda aktif attempt'i dön
        const concurrentActive = getActiveWorkflowAttempt(projectId, { heartbeatTtlSeconds });
        if (concurrentActive) {
            return { acquired: false, attempt: concurrentActive };
        }
        throw err;
    }
}

export function updateAttemptHeartbeat(attemptId, leaseOwner = null) {
    if (!attemptId) return false;
    try {
        let query = `
            UPDATE workflow_attempts
            SET heartbeat_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'running'
        `;
        const params = [attemptId];
        if (leaseOwner) {
            query += ' AND lease_owner = ?';
            params.push(leaseOwner);
        }
        const result = db.prepare(query).run(...params);
        return result.changes > 0;
    } catch (err) {
        // Heartbeat hatası durumunda process crash yerine kontrollü false dön
        return false;
    }
}

export function releaseWorkflowLease(attemptId, terminalStatus = 'completed', { error = null } = {}) {
    if (!attemptId) return false;

    const attempt = db.prepare('SELECT project_id FROM workflow_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
        activeLeases.delete(attempt.project_id);
    }

    const result = db.prepare(`
        UPDATE workflow_attempts
        SET status = ?, ended_at = CURRENT_TIMESTAMP, error = ?
        WHERE id = ?
    `).run(terminalStatus, error ? String(error) : null, attemptId);

    return result.changes > 0;
}

export function reconcileStaleWorkflowAttempts({ staleThresholdSeconds = 30 } = {}) {
    const thresholdDate = new Date(Date.now() - (staleThresholdSeconds * 1000)).toISOString();
    const staleAttempts = db.prepare(`
        SELECT a.id as attempt_id, a.project_id, p.title as project_title
        FROM workflow_attempts a
        JOIN projects p ON p.id = a.project_id
        WHERE a.status = 'running' AND (a.heartbeat_at <= ? OR a.heartbeat_at IS NULL)
    `).all(thresholdDate);

    const recoveredProjectIds = [];
    const nowIso = new Date().toISOString();
    const pauseMessage = "⚠️ Sunucu yeniden başlatıldı; süreç güvenle duraklatıldı. Kaldığı yerden devam ettirmek için 'Devam Et' (Resume) butonuna basabilirsiniz.";

    const updateAttempt = db.prepare(`
        UPDATE workflow_attempts
        SET status = 'stale_terminated', ended_at = ?, error = 'Server restarted while execution was in progress'
        WHERE id = ?
    `);
    const updateProject = db.prepare("UPDATE projects SET status = 'paused' WHERE id = ?");
    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');

    db.exec('BEGIN');
    try {
        for (const row of staleAttempts) {
            updateAttempt.run(nowIso, row.attempt_id);
            updateProject.run(row.project_id);
            insertChat.run(row.project_id, 'model', pauseMessage, nowIso);
            recoveredProjectIds.push(row.project_id);
        }

        // Also reconcile any project that was marked 'running' in projects table without an active attempt
        const orphanedRunningProjects = db.prepare(`
            SELECT id FROM projects
            WHERE status = 'running' AND id NOT IN (
                SELECT project_id FROM workflow_attempts WHERE status = 'running'
            )
        `).all();

        for (const p of orphanedRunningProjects) {
            updateProject.run(p.id);
            insertChat.run(p.id, 'model', pauseMessage, nowIso);
            if (!recoveredProjectIds.includes(p.id)) {
                recoveredProjectIds.push(p.id);
            }
        }

        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    return {
        reconciledCount: recoveredProjectIds.length,
        recoveredProjectIds
    };
}
