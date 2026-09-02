import { db } from '../db.js';

export function createRun({
    id,
    projectId,
    contractId,
    status = 'queued',
    policyVersion = '1.0',
    startedAt = new Date().toISOString()
}) {
    db.prepare(`
        INSERT INTO verification_runs (
            id, project_id, contract_id, status, policy_version, started_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, contractId, status, policyVersion, startedAt);

    return db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(id);
}

const RUN_TRANSITIONS = {
    queued: new Set(['running', 'blocked']),
    running: new Set(['verified', 'failed', 'blocked', 'rejected']),
    failed: new Set([]),
    verified: new Set([]),
    blocked: new Set([]),
    rejected: new Set([])
};

function assertRunMutable(run, status) {
    if (!run) throw new Error('Verification run not found.');
    if (!RUN_TRANSITIONS[run.status]?.has(status)) {
        throw new Error(`Verification run ${run.id} is finalized or immutable; cannot transition ${run.status} to ${status}.`);
    }
}

export function updateRunStatus(runId, status, endedAt = new Date().toISOString()) {
    const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(runId);
    assertRunMutable(run, status);
    const result = db.prepare(`
        UPDATE verification_runs SET status = ?, ended_at = ? WHERE id = ? AND status = ?
    `).run(status, endedAt, runId, run.status);
    if (result.changes !== 1) throw new Error(`Verification run ${runId} was not updated.`);
    return db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(runId);
}

export function createCheck({ id, projectId: _projectId, status = 'BLOCKED', evidenceJson = null, ...options }) {
    const check = startCheck({ id, ...options });
    if (status !== 'BLOCKED') {
        return endCheck({ id, ...options, status, evidenceJson: typeof evidenceJson === 'string' ? evidenceJson : JSON.stringify(evidenceJson ?? {}) });
    }
    return check;

}
export function updateCheck(id, updates = {}) {
    const check = db.prepare('SELECT * FROM verification_checks WHERE id = ?').get(id);
    if (!check) throw new Error(`Verification check ${id} not found.`);
    const run = db.prepare('SELECT status FROM verification_runs WHERE id = ?').get(check.run_id);
    if (['verified', 'failed', 'blocked', 'rejected'].includes(run?.status)
        || ['PASS', 'FAIL'].includes(check.status) || check.ended_at) {
        throw new Error(`Verification check ${id} is finalized or immutable.`);
    }
    const fields = { status: 'status', exitCode: 'exit_code', endedAt: 'ended_at', timedOut: 'timed_out', stdoutDigest: 'stdout_digest', stderrDigest: 'stderr_digest', evidenceJson: 'evidence_json', command: 'command', cwd: 'cwd' };
    const entries = Object.entries(updates).filter(([key]) => fields[key]);
    if (!entries.length) return check;
    const result = db.prepare(`UPDATE verification_checks SET ${entries.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ? AND status = ? AND ended_at IS NULL`)
        .run(...entries.map(([key]) => key === 'timedOut' ? (updates[key] ? 1 : 0) : updates[key]), id, check.status);
    if (result.changes !== 1) throw new Error(`Verification check ${id} was not updated.`);
    return db.prepare('SELECT * FROM verification_checks WHERE id = ?').get(id);
}

export function startCheck({
    id,
    contractId,
    runId,
    gateName,
    applicability = 'MANDATORY',
    command = null,
    cwd = null,
    startedAt = new Date().toISOString()
}) {
    db.prepare(`
        INSERT INTO verification_checks (
            id, contract_id, run_id, gate_name, applicability, status,
            command, cwd, started_at
        ) VALUES (?, ?, ?, ?, ?, 'BLOCKED', ?, ?, ?)
    `).run(id, contractId, runId, gateName, applicability, command, cwd, startedAt);

    return db.prepare('SELECT * FROM verification_checks WHERE id = ?').get(id);
}

export function endCheck({
    id,
    contractId,
    runId,
    status,
    exitCode = null,
    endedAt = new Date().toISOString(),
    timedOut = false,
    stdoutDigest = null,
    stderrDigest = null,
    evidenceJson = null
}) {
    const existing = db.prepare('SELECT status, ended_at FROM verification_checks WHERE id = ? AND contract_id = ? AND run_id = ?').get(id, contractId, runId);
    const run = db.prepare('SELECT status FROM verification_runs WHERE id = ?').get(runId);
    if (!existing) throw new Error(`Verification check ${id} not found.`);
    if (['verified', 'failed', 'blocked', 'rejected'].includes(run?.status)
        || ['PASS', 'FAIL'].includes(existing.status) || existing.ended_at) {
        throw new Error(`Verification check ${id} is finalized or immutable.`);
    }
    const result = db.prepare(`
        UPDATE verification_checks
        SET status = ?, exit_code = ?, ended_at = ?, timed_out = ?,
            stdout_digest = ?, stderr_digest = ?, evidence_json = ?
        WHERE id = ? AND contract_id = ? AND run_id = ? AND status = ? AND ended_at IS NULL
    `).run(
        status, exitCode, endedAt, timedOut ? 1 : 0, stdoutDigest, stderrDigest,
        evidenceJson, id, contractId, runId, existing.status
    );
    if (result.changes !== 1) throw new Error(`Verification check ${id} was not updated.`);
    return db.prepare('SELECT * FROM verification_checks WHERE id = ?').get(id);
}

export function getRunEvidence(runId) {
    const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(runId);
    if (!run) return null;

    const checks = db.prepare(`
        SELECT * FROM verification_checks
        WHERE run_id = ?
        ORDER BY started_at ASC
    `).all(runId);

    return { run, checks };
}

export function getLatestRunForProject(projectId) {
    return db.prepare(`
        SELECT * FROM verification_runs
        WHERE project_id = ?
        ORDER BY started_at DESC
        LIMIT 1
    `).get(projectId);
}
