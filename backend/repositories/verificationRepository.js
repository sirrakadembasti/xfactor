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

export function updateRunStatus(runId, status, endedAt = new Date().toISOString()) {
    db.prepare(`
        UPDATE verification_runs
        SET status = ?, ended_at = ?
        WHERE id = ?
    `).run(status, endedAt, runId);

    return db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(runId);
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
    db.prepare(`
        UPDATE verification_checks
        SET status = ?, exit_code = ?, ended_at = ?, timed_out = ?,
            stdout_digest = ?, stderr_digest = ?, evidence_json = ?
        WHERE id = ? AND contract_id = ? AND run_id = ?
    `).run(
        status,
        exitCode,
        endedAt,
        timedOut ? 1 : 0,
        stdoutDigest,
        stderrDigest,
        evidenceJson,
        id,
        contractId,
        runId
    );

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
