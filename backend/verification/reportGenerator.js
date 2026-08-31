import { db } from '../db.js';
import { MANDATORY_GATES } from './qualityPolicy.js';

const STATUS_PRIORITY = {
    PASS: 0,
    NOT_APPLICABLE: 0,
    BLOCKED: 1,
    FAIL: 2
};

function parseEvidence(value) {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return { raw: value };
    }
}

function aggregateGateChecks(rows) {
    const byGate = new Map();
    for (const row of rows) {
        const existing = byGate.get(row.gate_name);
        if (!existing || STATUS_PRIORITY[row.status] > STATUS_PRIORITY[existing.status]) {
            byGate.set(row.gate_name, row);
        }
    }

    const checks = MANDATORY_GATES.map(gateName => {
        const row = byGate.get(gateName);
        if (!row) {
            return {
                id: null,
                gateName,
                applicability: 'MANDATORY',
                status: 'BLOCKED',
                synthetic: true,
                evidence: null
            };
        }
        byGate.delete(gateName);
        return {
            id: row.id,
            gateName: row.gate_name,
            applicability: row.applicability,
            status: row.status,
            synthetic: false,
            command: row.command,
            exitCode: row.exit_code,
            timedOut: Boolean(row.timed_out),
            evidence: parseEvidence(row.evidence_json)
        };
    });

    for (const row of byGate.values()) {
        checks.push({
            id: row.id,
            gateName: row.gate_name,
            applicability: row.applicability,
            status: row.status,
            synthetic: false,
            command: row.command,
            exitCode: row.exit_code,
            timedOut: Boolean(row.timed_out),
            evidence: parseEvidence(row.evidence_json)
        });
    }
    return checks;
}

function reportStatus(checks) {
    const mandatory = checks.filter(check => check.applicability === 'MANDATORY');
    if (mandatory.some(check => check.status === 'FAIL')) return 'FAIL';
    if (mandatory.some(check => check.status !== 'PASS')) return 'BLOCKED';
    return 'PASS';
}

export async function generateCompletionReport({ projectId, contractId, runId }) {
    const run = db.prepare(`
        SELECT id, project_id, contract_id, status, policy_version, started_at, ended_at
        FROM verification_runs
        WHERE id = ? AND project_id = ? AND contract_id = ?
    `).get(runId, projectId, contractId);
    if (!run) {
        const error = new Error('Verification run not found for project contract');
        error.code = 'VERIFICATION_RUN_NOT_FOUND';
        throw error;
    }

    const checkRows = db.prepare(`
        SELECT *
        FROM verification_checks
        WHERE contract_id = ? AND run_id = ?
        ORDER BY gate_name, id
    `).all(contractId, runId);
    const checks = aggregateGateChecks(checkRows);

    const artifacts = db.prepare(`
        SELECT id, kind, path, sha256, size, status, verification_run_id
        FROM artifacts
        WHERE project_id = ? AND contract_id = ? AND verification_run_id = ?
        ORDER BY id
    `).all(projectId, contractId, runId).map(row => ({
        id: row.id,
        kind: row.kind,
        path: row.path,
        sha256: row.sha256,
        size: row.size,
        status: row.status,
        verificationRunId: row.verification_run_id
    }));

    const checkStatusById = new Map(checkRows.map(row => [row.id, row.status]));
    const artifactStatusById = new Map(artifacts.map(artifact => [artifact.id, artifact.status]));
    const requirementRows = db.prepare(`
        SELECT id, stable_key, statement, kind, priority, mandatory, status
        FROM requirements
        WHERE contract_id = ?
        ORDER BY stable_key, id
    `).all(contractId);
    const requirementCheckLinks = db.prepare(`
        SELECT links.requirement_id, links.verification_check_id
        FROM requirement_check_links AS links
        JOIN verification_checks AS checks
          ON checks.contract_id = links.contract_id
         AND checks.id = links.verification_check_id
        WHERE links.contract_id = ? AND checks.run_id = ?
        ORDER BY links.requirement_id, links.verification_check_id
    `).all(contractId, runId);
    const requirementArtifactLinks = db.prepare(`
        SELECT links.requirement_id, links.artifact_id
        FROM requirement_artifact_links AS links
        JOIN artifacts
          ON artifacts.contract_id = links.contract_id
         AND artifacts.id = links.artifact_id
        WHERE links.contract_id = ? AND artifacts.verification_run_id = ?
        ORDER BY links.requirement_id, links.artifact_id
    `).all(contractId, runId);

    const requirements = requirementRows.map(row => {
        const checkIds = requirementCheckLinks
            .filter(link => link.requirement_id === row.id)
            .map(link => link.verification_check_id);
        const artifactIds = requirementArtifactLinks
            .filter(link => link.requirement_id === row.id)
            .map(link => link.artifact_id);
        const linkedStatuses = [
            ...checkIds.map(id => checkStatusById.get(id)),
            ...artifactIds.map(id => artifactStatusById.get(id) === 'verified' ? 'PASS' : 'FAIL')
        ];
        let evidenceStatus = 'PASS';
        if (linkedStatuses.some(status => status === 'FAIL')) evidenceStatus = 'FAIL';
        else if (linkedStatuses.some(status => status === 'BLOCKED')) evidenceStatus = 'BLOCKED';
        else if (row.mandatory && linkedStatuses.length === 0) evidenceStatus = 'BLOCKED';

        return {
            id: row.id,
            stableKey: row.stable_key,
            statement: row.statement,
            kind: row.kind,
            priority: row.priority,
            mandatory: Boolean(row.mandatory),
            status: row.status,
            evidenceStatus,
            checkIds,
            artifactIds
        };
    });

    return {
        projectId,
        contractId,
        runId,
        status: reportStatus(checks),
        runStatus: run.status,
        policyVersion: run.policy_version,
        checks,
        requirements,
        artifacts
    };
}
