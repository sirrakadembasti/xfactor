import { assertWorkerCheck, evidencePayload } from '../verification/artifactEvidencePolicy.js';
import { digest } from '../verification/workerFailures.js';
import { buildControlledVerificationPlan, authenticateControlledAssertionReservation } from './controlledSemanticPlan.js';
import { inspectControlledSemanticEvidence } from './controlledSemanticEvidence.js';

export function inspectControlledSemanticReviewEligibility({ workflow, latestArtifact, latestRun, currentSourceHash, contractId }) {
    const ledger = workflow?.controlledRepair, remainingReviews = Math.max(0, 3 - (ledger?.semanticReviewHistory?.length || 0));
    const blocked = reason => ({ eligible: false, reason, planHash: ledger?.proposal?.planHash || null, remainingReviews });
    if (ledger?.phase !== 'patched' || ledger.controlledAcceptancePolicy !== 'controlled-acceptance-v1'
        || ledger.proposal?.contractId !== contractId) return blocked('İncelenebilir sınırlı onarım kaydı bulunamadı.');
    if (!remainingReviews) return blocked('Bu sınırlı onarım için üç bağımsız inceleme hakkı kullanıldı; yeni tanılama ve öneri gerekli.');
    if (!currentSourceHash || currentSourceHash !== ledger.outputSourceHash) return blocked('Onarım sonrası kaynaklar değişti; yeni öneri gerekli.');
    const candidates = [...(ledger.validations || []), ...(ledger.workerVerificationHistory || []),
        ...(ledger.semanticReviewHistory || []).flatMap(entry => entry.validations || [])]
        .filter(row => row.stage === 'worker_verification' && row.artifactId === latestArtifact?.id && row.runId === latestRun?.id);
    const rows = [...new Map(candidates.map(row => [row.id || `${row.runId}:${row.artifactId}:${row.jobId}`, row])).values()];
    if (rows.length !== 1 || rows[0].artifactId !== latestArtifact?.id || rows[0].artifactSha256 !== latestArtifact?.sha256
        || rows[0].runId !== latestRun?.id || latestArtifact?.verification_run_id !== latestRun?.id
        || !['failed', 'verified', 'rejected', 'blocked'].includes(latestRun?.status)) return blocked('En güncel tamamlanmış worker tanılaması gerekli.');
    return { eligible: true, reason: null, planHash: ledger.proposal.planHash, remainingReviews };
}

export function reserveControlledSemanticReviewCycle({ ledger, attemptId, observation, sourceHash = ledger?.reviewedArtifactSourceHash }) {
    if (!attemptId || ledger.authorizedAttemptId !== attemptId || ledger.phase !== 'patched'
        || ledger.controlledAcceptancePolicy !== 'controlled-acceptance-v1' || !observation?.observationHash
        || observation.sourceHash !== sourceHash) throw Error('Yetkili aynı kaynak inceleme rezervasyonu gerekli.');
    ledger.semanticReviewHistory ||= [];
    if (ledger.semanticReviewHistory.length >= 3 || ledger.semanticReviewHistory.some(row => row.attemptId === attemptId)) throw Error('Bu bağımsız inceleme rezervasyonu tüketilmiş.');
    const { checkId, artifactId, runId, observationHash } = observation;
    ledger.semanticReviewHistory.push({ attemptId, sourceHash, planHash: ledger.proposal.planHash,
        validations: structuredClone(ledger.validations || []), createdAt: new Date().toISOString() });
    ledger.semanticReviewInput = { checkId, artifactId, runId, observationHash };
    ledger.validations = [];
    return ledger.semanticReviewInput;
}

// Only backend-persisted action receipts may seed independent locale review.
// Failed diagnostic runs need no aggregate PASS receipt: the actual action row
// is bound by the controller before persistence and must still match its digest.
export function readControlledLocaleObservation(database, { projectId, contractId, sourceHash, artifactId, runId, checkId = null }) {
    if (!artifactId || !runId) return null;
    const rows = database.prepare(`SELECT c.*,r.status AS run_status,a.id AS source_artifact_id,a.sha256 AS source_artifact_sha256
        FROM verification_checks c JOIN verification_runs r ON r.id=c.run_id AND r.contract_id=c.contract_id
        JOIN artifacts a ON a.verification_run_id=r.id AND a.contract_id=r.contract_id AND a.project_id=r.project_id
        WHERE r.project_id=? AND c.contract_id=? AND a.id=? AND r.id=? AND c.gate_name='ui_language_evidence'
        ORDER BY c.rowid DESC LIMIT 16`).all(projectId, contractId, artifactId, runId);
    for (const row of rows) {
        try {
            if (checkId && row.id !== checkId) continue;
            if (!['failed', 'verified', 'rejected', 'blocked'].includes(row.run_status)
                || row.source_artifact_id !== artifactId) continue;
            const supplied = evidencePayload(row.evidence_json), receipt = supplied.workerReceipt;
            if (!receipt || receipt.projectId !== projectId || receipt.contractId !== contractId || receipt.runId !== runId
                || receipt.artifactId !== artifactId || receipt.inputSha256 !== row.source_artifact_sha256
                || receipt.operation !== 'verify_artifact' || receipt.version !== 1 || !receipt.jobId || !receipt.nonce) continue;
            const observed = assertWorkerCheck(row, { ...receipt, checkDigests: { [row.id]: receipt.checkDigest } });
            const binding = observed.observationBinding || observed.binding;
            if (observed.controlledSemanticSourceHash !== sourceHash || !/^[a-f0-9]{64}$/.test(observed.controlledSemanticPlanHash || '')
                || binding?.sourceHash !== sourceHash || binding.contractId !== contractId || binding.runId !== runId
                || binding.artifactHash !== row.source_artifact_sha256 || observed.inventory?.version !== 1
                || !Array.isArray(observed.inventory.snapshots)) continue;
            return { checkId: row.id, artifactId, runId, sourceHash, inventory: observed.inventory,
                observationHash: digest(observed.inventory) };
        } catch { /* Never use tampered, unbound or incomplete transport evidence. */ }
    }
    return null;
}

export function compilePersistedControlledVerificationPlan({ database, projectId, files, identity }) {
    const workflow = evidencePayload(database.prepare('SELECT workflow_state FROM projects WHERE id=?').get(projectId)?.workflow_state);
    const ledger = workflow.controlledRepair;
    if (!ledger?.proposal || ledger.proposal.contractId !== identity.contractId) throw Error('Persisted controlled repair authority missing.');
    const requirements = database.prepare('SELECT id,stable_key,statement,mandatory FROM requirements WHERE contract_id=? ORDER BY stable_key').all(identity.contractId);
    const approvedContract = evidencePayload(database.prepare("SELECT contract_json FROM project_contracts WHERE id=? AND project_id=? AND status='approved'").get(identity.contractId, projectId)?.contract_json);
    const reference = ledger.semanticReviewInput;
    const observation = reference ? readControlledLocaleObservation(database, { projectId, contractId: identity.contractId,
        sourceHash: ledger.reviewedArtifactSourceHash, ...reference }) : null;
    const plan = buildControlledVerificationPlan({ ledger, files, requirements, identity, approvedContract, localeObservation: observation,
        authenticateLocaleObservation: supplied => supplied === observation && supplied?.observationHash === reference?.observationHash });
    return { plan, ledger, requirements };
}

export function assertPersistedControlledSemanticEvidence({ context, artifact, run, receipt, database, files }) {
    const identity = { ...receipt, inputSha256: artifact.sha256, artifactId: artifact.id, runId: run.id, contractId: context.contractId };
    const { plan, ledger, requirements } = compilePersistedControlledVerificationPlan({ database, projectId: context.projectId, files, identity });
    identity.authorizedWindow = controlledAssertionExecutionWindow(ledger, identity);
    const rows = database.prepare("SELECT * FROM verification_checks WHERE contract_id=? AND run_id=? AND gate_name IN ('requirement_assertions','ui_language_evidence')").all(context.contractId, run.id);
    const checks = rows.map(row => ({ ...row, evidence: evidencePayload(row.evidence_json) }));
    return inspectControlledSemanticEvidence({ plan, files, checks, identity,
        authenticateReservation: reservation => authenticateControlledAssertionReservation(ledger, requirements, reservation),
        authenticateReceipt: check => { try { assertWorkerCheck(check, receipt); return true; } catch { return false; } } });
}

export function controlledAssertionExecutionWindow(ledger, identity) {
    const rows = (ledger?.validations || []).filter(row => row.stage === 'worker_verification'
        && row.runId === identity.runId && row.jobId === identity.jobId && row.artifactId === identity.artifactId && row.nonce === identity.nonce);
    if (rows.length !== 1 || !Number.isFinite(Date.parse(rows[0].createdAt)) || !Number.isSafeInteger(rows[0].deadline)) return undefined;
    return { startedAt: rows[0].createdAt, deadline: new Date(rows[0].deadline).toISOString() };
}
