/**
 * Project Traceability & Artifact Download Routes (DAT-6a)
 * Endpoints for requirement impact analysis, rebuild previews, and verified artifact downloads.
 */

import crypto from 'node:crypto';
import { db as defaultDb } from '../db.js';
import { asyncHandler } from '../security.js';
import {
    workflowCheckpointInventory,
    projectedCheckpointInventory,
    uniquelyOwnsLegacy
} from '../engine/checkpointIdentity.js';
import { deriveCheckpointId, collectDownstreamTaskIds } from '../observability.js';
import { authorizeArtifactDownload } from './artifactDownloadAuthorization.js';
import { assertVerifiedArtifactEvidence, appendProjectActionMessages } from '../projectRepository.js';
import { sendArtifactDownload } from './artifactDownload.js';

const defaultGetActionId = req => {
    const supplied = req.get('X-XFactor-Action-Id');
    if (supplied !== undefined && (
        !supplied.trim()
        || supplied.length > 128
    )) {
        const error = new Error('Invalid X-XFactor-Action-Id header.');
        error.status = 400;
        throw error;
    }
    return supplied || `server-${crypto.randomUUID()}`;
};

export function checkpointTaskFilter(projectId, contractId, taskRows, allTasks, db = defaultDb) {
    const inventory = projectedCheckpointInventory(allTasks);
    const oldProjection = allTasks.every(row => {
        const spec = JSON.parse(row.task_spec_json);
        return !spec.executionTaskId && !spec.teamleaderId;
    });
    if (oldProjection) inventory.complete = true;
    else {
        const record = db.prepare(`SELECT p.workflow_state, pc.contract_json FROM projects p
            JOIN project_contracts pc ON pc.project_id=p.id WHERE p.id=? AND pc.id=?`).get(projectId, contractId);
        let workflow = {}, contract = {};
        try { workflow = JSON.parse(record?.workflow_state || '{}'); contract = JSON.parse(record?.contract_json || '{}'); } catch {}
        const expected = workflowCheckpointInventory({ contractId, domains: contract.domains,
            directorSpecs: workflow.directorSpecs, teamleaderPlans: workflow.teamleaderPlans });
        const projectedById = new Map(inventory.owners.map(owner => [owner.id, owner]));
        inventory.complete = expected.complete && expected.owners.length === inventory.owners.length
            && expected.owners.every(owner => projectedById.get(owner.id)?.specHash === owner.specHash);
    }
    const selected = new Set(taskRows.map(row => row.id));
    const params = [...new Set(inventory.owners.filter(owner => selected.has(owner.id)).flatMap(owner => [owner.id, owner.localTaskId]))];
    return { clause: `task_id IN (${params.map(() => '?').join(',')})`, params,
        matches: row => row.task_identity_version === 1
            ? selected.has(row.task_id)
            : inventory.owners.some(owner => selected.has(owner.id) && owner.localTaskId === row.task_id
                && uniquelyOwnsLegacy(inventory, { ...owner, specHash: row.task_spec_hash })) };
}

export function registerProjectTraceabilityRoutes(router, deps = {}) {
    const {
        requireAuth,
        projectAccess,
        db = defaultDb,
        getActionId = defaultGetActionId
    } = deps;

    router.get('/:id/requirements/:reqId/impact', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const projectId = req.params.id;
        const reqId = req.params.reqId;
        const row = db.prepare(`
            SELECT r.id as reqId, r.contract_id as contractId
            FROM requirements r
            JOIN project_contracts pc ON pc.id = r.contract_id
            WHERE r.id = ? AND pc.project_id = ?
        `).get(reqId, projectId);
        if (!row) return res.status(404).json({ error: 'Requirement not found' });
        const contractId = row.contractId;
        const taskRows = db.prepare(`
            SELECT ct.id as taskId, ct.stable_key as stableKey, ct.task_spec_json as taskSpecJson
            FROM contract_tasks ct
            JOIN requirement_task_links rtl ON rtl.task_id = ct.id AND rtl.contract_id = ct.contract_id
            WHERE rtl.contract_id = ? AND rtl.requirement_id = ?
        `).all(contractId, reqId);
        const taskMap = new Map();
        for (const tr of taskRows) {
            if (taskMap.has(tr.taskId)) continue;
            let title = null;
            try {
                const spec = JSON.parse(tr.taskSpecJson);
                if (typeof spec.title === 'string' && spec.title.trim().length > 0) title = spec.title.trim();
            } catch {}
            if (!title) title = tr.stableKey;
            taskMap.set(tr.taskId, { taskId: tr.taskId, taskTitle: title });
        }
        const impactedTasks = Array.from(taskMap.values()).sort((a, b) => a.taskId.localeCompare(b.taskId));
        const fileRows = db.prepare(`
            SELECT DISTINCT path FROM requirement_file_links WHERE contract_id = ? AND requirement_id = ?
        `).all(contractId, reqId);
        const fileSet = new Set();
        for (const fr of fileRows) fileSet.add(fr.path);
        const impactedFiles = Array.from(fileSet).sort().map(p => ({ path: p }));
        const allTasks = db.prepare('SELECT id, task_spec_json FROM contract_tasks WHERE contract_id=?').all(contractId);
        const taskFilter = checkpointTaskFilter(projectId, contractId,
            taskRows.map(row => ({ id: row.taskId, task_spec_json: row.taskSpecJson })), allTasks, db);
        let impactedCheckpoints = [];
        if (taskFilter.params.length > 0) {
            const cpRows = db.prepare(`
                SELECT project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version, task_identity_version
                FROM task_checkpoints
                WHERE project_id = ? AND contract_id = ? AND status = 'completed' AND invalidated_at IS NULL AND (${taskFilter.clause})
            `).all(projectId, contractId, ...taskFilter.params);
            const cpSet = new Set();
            for (const r of cpRows) {
                if (!taskFilter.matches(r)) continue;
                const id = deriveCheckpointId(r);
                cpSet.add(id);
            }
            impactedCheckpoints = Array.from(cpSet).sort().map(id => ({ checkpointId: id }));
        }
        res.json({ requirementId: reqId, impactedTasks, impactedCheckpoints, impactedFiles });
    }));

    router.post('/:id/rebuild-preview', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const projectId = req.params.id;
        const body = req.body;
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            return res.status(400).json({ error: 'Invalid body' });
        }
        const keys = Object.keys(body);
        if (keys.length !== 1 || keys[0] !== 'changedRequirementKeys') {
            return res.status(400).json({ error: 'Invalid body' });
        }
        const val = body.changedRequirementKeys;
        if (!Array.isArray(val)) return res.status(400).json({ error: 'Invalid changedRequirementKeys' });
        const trimmed = [];
        for (const el of val) {
            if (typeof el !== 'string') return res.status(400).json({ error: 'Invalid requirement key' });
            const t = el.trim();
            if (t.length === 0) return res.status(400).json({ error: 'Empty requirement key' });
            trimmed.push(t);
        }
        if (new Set(trimmed).size !== trimmed.length) return res.status(400).json({ error: 'Duplicate requirement keys' });

        let latest, contractId, reqRows, directTaskIds, allTasks, tasksToReRun, invalidatedCheckpointIds;
        let inTx = false;
        try {
            db.exec('BEGIN');
            inTx = true;
            latest = db.prepare(`
                SELECT id FROM project_contracts WHERE project_id = ? AND status='approved' ORDER BY revision DESC, id ASC LIMIT 1
            `).get(projectId);
            if (!latest) {
                db.exec('ROLLBACK');
                inTx = false;
                return res.status(404).json({ error: 'No approved contract' });
            }
            contractId = latest.id;
            if (trimmed.length === 0) {
                db.exec('COMMIT');
                inTx = false;
                return res.json({ willRebuild: false, invalidatedCheckpointIds: [], tasksToReRun: [] });
            }
            const placeholders = trimmed.map(() => '?').join(',');
            reqRows = db.prepare(`
                SELECT id, stable_key FROM requirements WHERE contract_id = ? AND stable_key IN (${placeholders})
            `).all(contractId, ...trimmed);
            const foundKeys = new Set(reqRows.map(r => r.stable_key));
            for (const k of trimmed) if (!foundKeys.has(k)) {
                db.exec('ROLLBACK');
                inTx = false;
                return res.status(400).json({ error: `Unknown requirement key ${k}` });
            }
            const requirementIds = reqRows.map(r => r.id);
            let directIds = [];
            let linkedFilePaths = [];
            if (requirementIds.length > 0) {
                const reqPlace = requirementIds.map(() => '?').join(',');
                const rows = db.prepare(`
                    SELECT DISTINCT task_id FROM requirement_task_links WHERE contract_id = ? AND requirement_id IN (${reqPlace})
                `).all(contractId, ...requirementIds);
                directIds = rows.map(r => r.task_id);
                const fileRows = db.prepare(`
                    SELECT DISTINCT path FROM requirement_file_links WHERE contract_id = ? AND requirement_id IN (${reqPlace})
                `).all(contractId, ...requirementIds);
                linkedFilePaths = fileRows.map(row => row.path);
            }
            directTaskIds = directIds;
            allTasks = db.prepare(`SELECT id, task_spec_json FROM contract_tasks WHERE contract_id = ?`).all(contractId);
            try {
                tasksToReRun = collectDownstreamTaskIds(allTasks, directTaskIds, linkedFilePaths);
            } catch (e) {
                try { db.exec('ROLLBACK'); } catch {}
                inTx = false;
                return res.status(409).json({ error: e.message || 'Graph validation failed' });
            }
            invalidatedCheckpointIds = [];
            if (tasksToReRun.length > 0) {
                const impactedIds = new Set(tasksToReRun);
                const taskFilter = checkpointTaskFilter(projectId, contractId, allTasks.filter(task => impactedIds.has(task.id)), allTasks, db);
                const cpRows = db.prepare(`
                    SELECT project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version, task_identity_version
                    FROM task_checkpoints WHERE project_id = ? AND contract_id = ? AND status='completed' AND invalidated_at IS NULL AND (${taskFilter.clause})
                `).all(projectId, contractId, ...taskFilter.params);
                const idSet = new Set();
                for (const r of cpRows) if (taskFilter.matches(r)) idSet.add(deriveCheckpointId(r));
                invalidatedCheckpointIds = Array.from(idSet).sort();
            }
            db.exec('COMMIT');
            inTx = false;
        } catch (e) {
            if (inTx) try { db.exec('ROLLBACK'); } catch {}
            throw e;
        } finally {
            if (inTx) try { db.exec('ROLLBACK'); } catch {}
        }
        const willRebuild = tasksToReRun.length > 0;
        res.json({ willRebuild, invalidatedCheckpointIds, tasksToReRun });
    }));

    router.get('/:id/contracts/:contractId/artifacts/:artifactId/download', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res, next) => {
        const { id, contractId, artifactId } = req.params;
        const { getArtifact } = await import('../repositories/artifactRepository.js');
        const artifact = getArtifact({ projectId: id, contractId, artifactId });
        const authorization = authorizeArtifactDownload({
            artifact,
            assertEvidence: () => assertVerifiedArtifactEvidence({ projectId: id, contractId, artifactId, strict: true })
        });
        if (authorization.status !== 200) {
            return res.status(authorization.status).json({ error: authorization.error });
        }
        const actionId = getActionId(req);
        sendArtifactDownload(res, artifact, {
            onComplete: () => appendProjectActionMessages(id, {
                actionId,
                userText: '📥 Doğrulanmış proje ZIP paketini indirdim.',
                modelText: 'Doğrulanmış artefakt başarıyla indirildi.'
            }),
            onError: next
        });
    }));
}
