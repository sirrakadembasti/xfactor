/**
 * Project Observability Routes (DAT-6a)
 * Read-only endpoints for contracts, verification runs, checks logs, repair issues, artifacts, and metrics.
 */

import { db as defaultDb } from '../db.js';
import { asyncHandler } from '../security.js';
import { readExecutionProgress } from '../verification/executionProgress.js';
import { readLatestAttemptObservation } from '../verification/attemptObservation.js';
import {
    getGateMetrics,
    getStackMetrics,
    getTrendMetrics,
    getFailureMetrics
} from '../observability.js';
import { listArtifacts } from '../repositories/artifactRepository.js';
import {
    projectArtifactSummary,
    projectCheckLog,
    projectCheckSummary,
    projectContractSummary,
    projectRepairIssue,
    projectRunSummary
} from './observabilityShapes.js';

function rejectRepeatedQuery(req) {
    for (const v of Object.values(req.query || {})) {
        if (Array.isArray(v)) return true;
    }
    const rawUrl = req.originalUrl || req.url || '';
    const qIdx = rawUrl.indexOf('?');
    if (qIdx !== -1) {
        const qs = rawUrl.slice(qIdx + 1);
        const keys = qs.split('&').map(p => decodeURIComponent(p.split('=')[0]));
        if (new Set(keys).size !== keys.length) return true;
    }
    return false;
}

export function registerProjectObservabilityRoutes(router, deps = {}) {
    const { requireAuth, projectAccess } = deps;

    router.get('/:id/execution-progress', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        const projectId = req.params.id;
        const attempt = db.prepare("SELECT id,lease_owner FROM workflow_attempts WHERE project_id=? AND status='running' ORDER BY started_epoch DESC LIMIT 1").get(projectId);
        const contract = db.prepare("SELECT id,contract_hash FROM project_contracts WHERE project_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(projectId);
        const lastAttempt = readLatestAttemptObservation(db, projectId, contract?.id);
        const progress = attempt && contract ? readExecutionProgress({ projectId, attemptId: attempt.id,
            leaseOwner: attempt.lease_owner, contractId: contract.id, contractHash: contract.contract_hash }) : null;
        res.json({ ...(progress || { projectId, active: Boolean(attempt), available: false, advisory: true, commands: [] }), lastAttempt });
    }));

    // P3.1 Observability read-only endpoints
    router.get('/:id/contracts', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        const rows = db.prepare(`
            SELECT id, revision, status, contract_hash, approved_at, created_at
            FROM project_contracts WHERE project_id = ? ORDER BY revision ASC
        `).all(req.params.id);
        res.json(rows.map(projectContractSummary));
    }));

    router.get('/:id/verification-runs', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        let rawLimit = req.query.limit;
        if (Array.isArray(rawLimit)) rawLimit = rawLimit[0];
        let limit = 20;
        if (rawLimit !== undefined) {
            const trimmed = String(rawLimit).trim();
            if (!/^\d+$/.test(trimmed)) {
                return res.status(400).json({ error: 'Invalid limit' });
            }
            const parsed = parseInt(trimmed, 10);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
                return res.status(400).json({ error: 'Invalid limit' });
            }
            limit = parsed;
        }
        let rawCursor = req.query.cursor;
        if (Array.isArray(rawCursor)) rawCursor = rawCursor[0];
        let cursorStartedAt = null;
        let cursorId = null;
        if (rawCursor !== undefined && rawCursor !== null && String(rawCursor).length > 0) {
            const cursorStr = String(rawCursor);
            let decoded;
            try {
                const json = Buffer.from(cursorStr, 'base64url').toString('utf8');
                decoded = JSON.parse(json);
            } catch {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
            if (!decoded || typeof decoded.id !== 'string' || typeof decoded.started_at !== 'string') {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
            const cursorRow = db.prepare(`
                SELECT started_at FROM verification_runs WHERE id = ? AND project_id = ?
            `).get(decoded.id, req.params.id);
            if (!cursorRow || cursorRow.started_at !== decoded.started_at) {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
            cursorStartedAt = decoded.started_at;
            cursorId = decoded.id;
        }
        let rows;
        if (cursorStartedAt !== null) {
            rows = db.prepare(`
                SELECT id, contract_id, status, policy_version, started_at, ended_at
                FROM verification_runs
                WHERE project_id = ?
                  AND (started_at < ? OR (started_at = ? AND id > ?))
                ORDER BY started_at DESC, id ASC
                LIMIT ?
            `).all(req.params.id, cursorStartedAt, cursorStartedAt, cursorId, limit + 1);
        } else {
            rows = db.prepare(`
                SELECT id, contract_id, status, policy_version, started_at, ended_at
                FROM verification_runs
                WHERE project_id = ?
                ORDER BY started_at DESC, id ASC
                LIMIT ?
            `).all(req.params.id, limit + 1);
        }
        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        let nextCursor = null;
        if (hasMore) {
            const last = slice[slice.length - 1];
            nextCursor = Buffer.from(JSON.stringify({ id: last.id, started_at: last.started_at })).toString('base64url');
        }
        res.json({ runs: slice.map(projectRunSummary), nextCursor });
    }));

    router.get('/:id/verification-runs/:runId', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        const run = db.prepare(`
            SELECT id, contract_id, status, policy_version, started_at, ended_at
            FROM verification_runs WHERE id = ? AND project_id = ?
        `).get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Verification run not found' });
        const checks = db.prepare(`
            SELECT id, gate_name, applicability, status, exit_code, stdout_digest, stderr_digest, started_at, ended_at, timed_out, evidence_json
            FROM verification_checks WHERE run_id = ? AND contract_id = ? ORDER BY started_at ASC, id ASC
        `).all(run.id, run.contract_id);
        res.json({ run: projectRunSummary(run), checks: checks.map(projectCheckSummary) });
    }));

    router.get('/:id/verification-runs/:runId/checks/:checkId/log', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        const run = db.prepare(`
            SELECT id, contract_id FROM verification_runs WHERE id = ? AND project_id = ?
        `).get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Verification run not found' });
        const check = db.prepare(`
            SELECT id, gate_name, evidence_json FROM verification_checks WHERE id = ? AND run_id = ? AND contract_id = ?
        `).get(req.params.checkId, run.id, run.contract_id);
        if (!check) return res.status(404).json({ error: 'Check not found' });
        res.json(projectCheckLog(check));
    }));

    router.get('/:id/repair-issues', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        const rows = db.prepare(`
            SELECT id, contract_id, requirement_id, severity, status, resolved_at
            FROM repair_issues WHERE project_id = ? ORDER BY created_at DESC
        `).all(req.params.id);
        res.json(rows.map(projectRepairIssue));
    }));

    router.get('/:id/artifacts', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        res.json(listArtifacts({ projectId: req.params.id }).map(projectArtifactSummary));
    }));

    // P3.2 Metrics APIs - read-only, scoped, finite
    router.get('/:id/metrics/gates', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        if (rejectRepeatedQuery(req)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getGateMetrics(req.params.id, db);
        res.json(result);
    }));

    router.get('/:id/metrics/stacks', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        if (rejectRepeatedQuery(req)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getStackMetrics(req.params.id, db);
        res.json(result);
    }));

    router.get('/:id/metrics/trends', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        if (rejectRepeatedQuery(req)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getTrendMetrics(req.params.id, db);
        res.json(result);
    }));

    router.get('/:id/metrics/failures', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const db = deps.db ?? defaultDb;
        if (rejectRepeatedQuery(req)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getFailureMetrics(req.params.id, db);
        res.json(result);
    }));
}
