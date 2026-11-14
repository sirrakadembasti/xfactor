/**
 * Canonical response shapes for the read-only observability API.
 * Routes build every response through these projections and the exact-key tests read the same
 * key lists, so a field added here is added for both and cannot drift between them.
 */
import { redactSensitiveText } from '../observability.js';

export const CONTRACT_SUMMARY_KEYS = Object.freeze(['id', 'revision', 'status', 'contract_hash', 'approved_at', 'created_at']);
export const RUN_SUMMARY_KEYS = Object.freeze(['id', 'contract_id', 'status', 'policy_version', 'started_at', 'ended_at']);
export const CHECK_SUMMARY_KEYS = Object.freeze(['id', 'gate_name', 'applicability', 'status', 'exit_code', 'reason',
    'stdout_digest', 'stderr_digest', 'started_at', 'ended_at', 'timed_out']);
/** Present only for checks executed by the local-trusted worker profile (no OS isolation). */
export const CHECK_LOCAL_PROFILE_KEYS = Object.freeze(['executionProfile', 'osIsolation']);
export const CHECK_LOG_KEYS = Object.freeze(['id', 'gate_name', 'stdout', 'stderr']);
export const REPAIR_ISSUE_KEYS = Object.freeze(['id', 'contract_id', 'requirement_id', 'severity', 'status', 'resolved_at']);
export const ARTIFACT_SUMMARY_KEYS = Object.freeze(['id', 'kind', 'sha256', 'size', 'status', 'verificationRunId']);
export const MAX_CHECK_REASON_LENGTH = 4000;

const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key]]));

export const projectContractSummary = row => pick(row, CONTRACT_SUMMARY_KEYS);
export const projectRunSummary = row => pick(row, RUN_SUMMARY_KEYS);
export const projectRepairIssue = row => pick(row, REPAIR_ISSUE_KEYS);
export const projectArtifactSummary = artifact => pick(artifact, ARTIFACT_SUMMARY_KEYS);

function parseEvidence(evidenceJson) {
    try {
        const evidence = JSON.parse(evidenceJson || '{}');
        return evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {};
    } catch {
        return {};
    }
}

/** A check row always carries the same keys; unreadable evidence yields an empty reason, never a missing one. */
export function projectCheckSummary(row) {
    const evidence = parseEvidence(row.evidence_json);
    const reason = typeof evidence.reason === 'string' ? redactSensitiveText(evidence.reason).slice(0, MAX_CHECK_REASON_LENGTH) : '';
    const localProfile = evidence.executionProfile === 'local-trusted' && evidence.osIsolation === false
        ? { executionProfile: 'local-trusted', osIsolation: false } : {};
    return { ...pick({ ...row, reason }, CHECK_SUMMARY_KEYS), ...localProfile };
}

/** Raw worker output is returned only after redaction. Both evidence layouts are accepted. */
export function projectCheckLog(row) {
    const evidence = parseEvidence(row.evidence_json);
    const nested = evidence.evidence && typeof evidence.evidence === 'object' ? evidence.evidence : {};
    const text = key => (typeof nested[key] === 'string' && nested[key]) || (typeof evidence[key] === 'string' ? evidence[key] : '');
    return { id: row.id, gate_name: row.gate_name, stdout: redactSensitiveText(text('stdout')), stderr: redactSensitiveText(text('stderr')) };
}
