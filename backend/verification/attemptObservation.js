import { redactSensitiveText } from '../observability.js';

// Durable controller history is distinct from verification evidence. An attempt
// can fail before any verification run exists, including after a server restart.
export function readLatestAttemptObservation(database, projectId, contractId) {
    const attempt = database.prepare(`SELECT id,status,started_at,ended_at,error FROM workflow_attempts
        WHERE project_id=? ORDER BY COALESCE(started_epoch,0) DESC,started_at DESC,id DESC LIMIT 1`).get(projectId);
    if (!attempt) return null;
    const run = contractId ? database.prepare(`SELECT id FROM verification_runs WHERE project_id=? AND contract_id=?
        AND julianday(started_at)>=julianday(?) AND (? IS NULL OR julianday(started_at)<=julianday(?))
        ORDER BY started_at DESC,rowid DESC LIMIT 1`).get(projectId, contractId, attempt.started_at, attempt.ended_at, attempt.ended_at) : null;
    const phase = database.prepare(`SELECT node_id FROM project_logs WHERE project_id=? AND attempt_id=? AND action='start'
        AND node_id IN ('dependency-preparation','controlled-repair') ORDER BY id DESC LIMIT 1`).get(projectId, attempt.id);
    return { id: attempt.id, status: attempt.status, startedAt: attempt.started_at, endedAt: attempt.ended_at || null,
        error: redactSensitiveText(String(attempt.error || '')).slice(0, 1500), verificationRunId: run?.id || null,
        noVerificationRun: !run, stage: run ? 'verify_artifact' : phase?.node_id === 'dependency-preparation' ? 'prepare_dependencies'
            : phase?.node_id === 'controlled-repair' ? 'source_repair' : 'workflow' };
}
