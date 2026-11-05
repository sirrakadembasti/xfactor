import { db } from '../db.js';
import { digest } from '../verification/workerFailures.js';
import { controlledRepairSourceHash } from './controlledRepairPlan.js';
import { readAuthenticatedControlledLineageIssueIds } from './controlledRepairLineage.js';
import { readWorkerSnapshotSync } from './workerRepairs.js';
import { assertVerificationContext } from '../verification/verificationContext.js';
import { assertVerifiedArtifactRunEvidence, getProjectDir } from '../projectRepository.js';
import { assertWorkerReceipt, assertWorkerCheck, evidencePayload } from '../verification/artifactEvidencePolicy.js';

const stop = reason => { throw new Error(`Controlled repair acceptance blocked: ${reason}`); };
const present = value => typeof value === 'string' && value.length > 0;
export const CONTROLLED_ACCEPTANCE_POLICY = 'controlled-acceptance-v1';

export function assertControlledRepairSemanticProof(semantic, expected) {
    if (semantic?.then || semantic?.passed !== true || semantic.controlledAcceptancePolicy !== CONTROLLED_ACCEPTANCE_POLICY
        || Object.entries(expected).some(([key, value]) => semantic[key] !== value)
        || !/^[a-f0-9]{64}$/.test(semantic.assertionBindingHash || '')
        || !/^[a-f0-9]{64}$/.test(semantic.localeCatalogueHash || '')) stop('fresh authoritative semantic binding and locale evidence required.');
}

// Pure policy over already authenticated persisted evidence. This function does
// not authenticate worker messages; the transaction adapter below does that.
export function inspectControlledRepairAcceptance({ context, ledger, planHash, validationId,
    artifact, run, receipt, manifest, currentSource, issues, historicalIdentities = [], dependencyInput = null, authenticatedDiagnostics = [], authenticatedLineageIssueIds = [] }) {
    const proposal = ledger?.proposal;
    if (!proposal || ledger.phase !== 'patched' || proposal.ready !== true
        || ledger.controlledAcceptancePolicy !== CONTROLLED_ACCEPTANCE_POLICY) stop('patched ready proposal and current controlled acceptance policy required.');
    const { planHash: recordedHash, ...body } = proposal;
    if (recordedHash !== planHash || digest(body) !== planHash
        || proposal.projectId !== context.projectId || proposal.contractId !== context.contractId
        || proposal.contractHash !== context.contractHash || proposal.contractRevision !== context.revision) stop('proposal or approved contract changed.');
    const sourceHash = controlledRepairSourceHash(manifest);
    if (!manifest.length || sourceHash !== ledger.reviewedArtifactSourceHash
        || controlledRepairSourceHash(currentSource) !== ledger.outputSourceHash) stop('source or reviewed artifact manifest changed.');
    // Dependency preparation may provide a root lock in the ZIP without a
    // generated-source write. Disk and reviewed ZIP are separate fenced inputs;
    // their only allowed difference is this exact current-run dependency input.
    const nonLock = files => files.filter(file => file.path !== 'package-lock.json');
    if (controlledRepairSourceHash(nonLock(manifest)) !== controlledRepairSourceHash(nonLock(currentSource))) stop('artifact differs from current non-lock source.');
    const artifactLock = manifest.find(file => file.path === 'package-lock.json');
    const diskLock = currentSource.find(file => file.path === 'package-lock.json');
    if (artifactLock?.sha256 !== diskLock?.sha256) {
        const packageJson = manifest.find(file => file.path === 'package.json');
        if (!artifactLock || !packageJson || dependencyInput?.runId !== run.id
            || dependencyInput.contractId !== context.contractId || dependencyInput.packageJsonSha256 !== packageJson.sha256
            || dependencyInput.lockSha256 !== artifactLock.sha256) stop('current-run dependency input provenance mismatch.');
    }
    for (const target of proposal.targets) {
        const output = manifest.find(file => file.path === target.path);
        if (!output || !ledger.attempts?.some(item => item.phase === 'patched' && item.target === target.path
            && item.outputSha256 === output.sha256)) stop('patched output does not match artifact.');
    }
    for (const stage of ['reviewer', 'tester']) {
        const rows = ledger.validations?.filter(item => item.stage === stage) || [];
        if (rows.length !== 1 || rows[0].phase !== 'passed' || rows[0].result?.approved !== true
            || rows[0].planHash !== planHash || rows[0].sourceHash !== sourceHash) stop(`fresh ${stage} reservation required.`);
    }
    const reservations = ledger.validations?.filter(item => item.stage === 'worker_verification') || [];
    const reservation = reservations.find(item => item.id === validationId);
    if (reservations.length !== 1 || !reservation || reservation.phase !== 'reserved'
        || reservation.planHash !== planHash || reservation.sourceHash !== sourceHash
        || reservation.runId !== run.id || reservation.artifactId !== artifact.id
        || reservation.artifactSha256 !== artifact.sha256
        || !present(reservation.jobId) || !present(reservation.nonce)
        || receipt.jobId !== reservation.jobId || receipt.nonce !== reservation.nonce
        || receipt.runId !== run.id || receipt.artifactId !== artifact.id || receipt.inputSha256 !== artifact.sha256) stop('fresh worker reservation or receipt mismatch.');
    if (run.id === proposal.baselineRunId || artifact.id === proposal.baselineArtifactId
        || artifact.sha256 === proposal.baselineArtifactSha256) stop('fresh worker cannot reuse baseline run or archive.');
    const oldIdentities = [...historicalIdentities, ...issues.map(issue => issue.detail?.expectedIdentity || issue.detail || {})];
    for (const identity of oldIdentities) {
        if (identity.runId === run.id || identity.artifactId === artifact.id
            || (identity.artifactSha256 || identity.inputSha256) === artifact.sha256
            || identity.jobId === receipt.jobId || identity.nonce === receipt.nonce) stop('fresh worker cannot reuse historical evidence.');
    }
    const issueIds = issues.filter(issue => {
        const detail = issue.detail;
        if (!detail || detail.version !== 1 || detail.contractHash !== context.contractHash) return false;
        if (authenticatedLineageIssueIds.includes(issue.id)) return true;
        if (detail.kind === 'verification_controller_blocker') {
            const identity = detail.expectedIdentity;
            return detail.authenticatedWorker === false && identity?.projectId === context.projectId
                && identity.contractId === context.contractId && identity.contractHash === context.contractHash
                && identity.runId === proposal.baselineRunId && identity.artifactId === proposal.baselineArtifactId
                && identity.inputSha256 === proposal.baselineArtifactSha256;
        }
        if (detail.authenticatedWorker !== true || detail.contractRevision !== context.revision) return false;
        const diagnostic = authenticatedDiagnostics.some(identity => identity.sourceHash === sourceHash && identity.planHash === planHash
            && identity.runId === issue.run_id && identity.runId === detail.runId && identity.artifactId === detail.artifactId
            && identity.artifactSha256 === detail.artifactSha256 && identity.jobId === detail.jobId && identity.nonce === detail.nonce);
        if (diagnostic) return ['worker_verification_blocker', 'worker_product_failure'].includes(detail.kind);
        if (issue.run_id !== proposal.baselineRunId || detail.runId !== proposal.baselineRunId
            || detail.artifactId !== proposal.baselineArtifactId || detail.artifactSha256 !== proposal.baselineArtifactSha256) return false;
        if (detail.kind === 'worker_verification_blocker') return true;
        return detail.kind === 'worker_product_failure' && proposal.targets.some(target => target.path === detail.filePath
            && target.sourceSha256 === detail.sourceSha256 && target.checkIds.includes(detail.checkId));
    }).map(issue => issue.id);
    return { issueIds, reservation, sourceHash };
}

// Admission requires both the controller's same-plan reservation and a persisted
// authenticated action. A failed diagnostic never supplies acceptance evidence.
export function readAuthenticatedControlledDiagnostics(database, {context, ledger, currentRunId}) {
    const candidates = [...(ledger?.workerVerificationHistory || []),
        ...(ledger?.semanticReviewHistory || []).flatMap(entry => entry.validations || [])];
    const accepted = new Map();
    for (const candidate of candidates) {
        if (candidate.stage !== 'worker_verification' || candidate.runId === currentRunId
            || candidate.planHash !== ledger.proposal?.planHash || candidate.sourceHash !== ledger.reviewedArtifactSourceHash
            || !present(candidate.jobId) || !present(candidate.nonce)) continue;
        const artifact = database.prepare('SELECT * FROM artifacts WHERE id=? AND project_id=? AND contract_id=?').get(candidate.artifactId, context.projectId, context.contractId);
        const run = database.prepare('SELECT * FROM verification_runs WHERE id=? AND project_id=? AND contract_id=?').get(candidate.runId, context.projectId, context.contractId);
        if (run?.status !== 'failed' || artifact?.verification_run_id !== run.id || artifact.sha256 !== candidate.artifactSha256) continue;
        const rows = database.prepare("SELECT * FROM verification_checks WHERE run_id=? AND contract_id=? AND gate_name IN ('requirement_assertions','ui_language_evidence')").all(run.id, context.contractId);
        for (const row of rows) {
            try {
                const evidence = evidencePayload(row.evidence_json), receipt = evidence.workerReceipt;
                if (receipt?.projectId !== context.projectId || receipt.contractId !== context.contractId
                    || receipt.contractHash !== context.contractHash || receipt.revision !== context.revision
                    || receipt.runId !== run.id || receipt.artifactId !== artifact.id || receipt.inputSha256 !== artifact.sha256
                    || receipt.jobId !== candidate.jobId || receipt.nonce !== candidate.nonce || receipt.operation !== 'verify_artifact') continue;
                const action = assertWorkerCheck(row, {...receipt,checkDigests:{[row.id]:receipt.checkDigest}});
                if (action.controlledSemanticSourceHash !== candidate.sourceHash || action.controlledSemanticPlanHash !== candidate.planHash) continue;
                accepted.set(candidate.runId, {runId:run.id,artifactId:artifact.id,artifactSha256:artifact.sha256,
                    jobId:candidate.jobId,nonce:candidate.nonce,sourceHash:candidate.sourceHash,planHash:candidate.planHash});
            } catch { /* Unauthenticated history cannot authorize issue closure. */ }
        }
    }
    return [...accepted.values()];
}

// Synchronous hook: caller must invoke inside completeVerifiedProject's own
// transaction. Closure and canonical receipt then roll back together.
export function acceptControlledRepairInTransaction(context, { artifactId, runId, planHash, validationId, assertCurrent, assertSemanticEvidence }, database = db) {
    if ((database.isTransaction ?? database.inTransaction) !== true) stop('canonical completion transaction required.');
    if (typeof assertSemanticEvidence !== 'function') stop('semantic evidence authority required.');
    if (typeof assertCurrent !== 'function') stop('synchronous source assertion required.');
    if (assertCurrent()?.then) stop('source assertion must be synchronous.');
    assertVerificationContext(context, database);
    const { artifact, run } = assertVerifiedArtifactRunEvidence({ projectId: context.projectId, contractId: context.contractId, artifactId });
    if (run.id !== runId) stop('authoritative run mismatch.');
    const rows = database.prepare("SELECT evidence_json FROM verification_checks WHERE run_id=? AND contract_id=? AND gate_name='worker_verification_receipt' AND status='PASS'").all(runId, context.contractId);
    if (rows.length !== 1) stop('authenticated worker receipt required.');
    const receipt = evidencePayload(rows[0].evidence_json);
    assertWorkerReceipt(receipt, { projectId: context.projectId, contractId: context.contractId, contractHash: context.contractHash,
        revision: context.revision, artifactId, inputSha256: artifact.sha256, runId });
    const workflow = JSON.parse(database.prepare('SELECT workflow_state FROM projects WHERE id=?').get(context.projectId).workflow_state || '{}');
    const issues = database.prepare("SELECT * FROM repair_issues WHERE project_id=? AND contract_id=? AND status='open'").all(context.projectId, context.contractId)
        .map(row => ({ ...row, detail: evidencePayload(row.detail_json) }));
    const historicalIdentities = database.prepare(`SELECT c.evidence_json FROM verification_checks c
        JOIN verification_runs r ON r.id=c.run_id AND r.contract_id=c.contract_id
        WHERE r.project_id=? AND c.run_id<>? AND c.gate_name='worker_verification_receipt'`).all(context.projectId, runId)
        .map(row => evidencePayload(row.evidence_json));
    historicalIdentities.push(...database.prepare('SELECT id AS artifactId,sha256 AS inputSha256 FROM artifacts WHERE project_id=? AND id<>?')
        .all(context.projectId, artifactId));
    historicalIdentities.push(...database.prepare('SELECT detail_json FROM repair_issues WHERE project_id=?').all(context.projectId)
        .map(row => { const detail = evidencePayload(row.detail_json); return detail.expectedIdentity || detail; }));
    const dependencyInputs = (Array.isArray(workflow.dependencyInputs) ? workflow.dependencyInputs : [])
        .filter(item => item.runId === runId && item.contractId === context.contractId);
    const currentSource = readWorkerSnapshotSync(getProjectDir(context.projectId), { includeLockfile: true });
    const result = inspectControlledRepairAcceptance({ context, ledger: workflow.controlledRepair, planHash, validationId, artifact, run, receipt, historicalIdentities,
        dependencyInput: dependencyInputs.length === 1 ? dependencyInputs[0] : null,
        authenticatedDiagnostics: readAuthenticatedControlledDiagnostics(database, {context,ledger:workflow.controlledRepair,currentRunId:runId}),
        authenticatedLineageIssueIds: readAuthenticatedControlledLineageIssueIds(database, {context,ledger:workflow.controlledRepair,currentSource}),
        manifest: database.prepare('SELECT path,sha256 FROM artifact_files WHERE artifact_id=? AND contract_id=?').all(artifactId, context.contractId),
        currentSource, issues });
    // Internal authoritative checker must authenticate actual requirement
    // assertion bindings and the fresh locale catalogue. An agent/model/client
    // verdict is never an implementation of this hook. There is no default PASS.
    const semantic = assertSemanticEvidence({ context, artifact, run, sourceHash: result.sourceHash, receipt, database });
    assertControlledRepairSemanticProof(semantic, {sourceHash: result.sourceHash, artifactHash: artifact.sha256,
        contractId: context.contractId, runId});
    // Repeat at the mutation boundary after every evidence/disk read.
    if (assertCurrent()?.then) stop('source assertion must be synchronous.');
    for (const id of result.issueIds) database.prepare("UPDATE repair_issues SET status='resolved',resolved_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=? AND contract_id=? AND status='open'")
        .run(id, context.projectId, context.contractId);
    result.reservation.phase = 'passed';
    workflow.controlledRepair.phase = 'accepted';
    workflow.controlledRepair.acceptance = { controlledAcceptancePolicy: CONTROLLED_ACCEPTANCE_POLICY,
        planHash, sourceHash: result.sourceHash, runId, artifactId, issueIds: result.issueIds,
        assertionBindingHash: semantic.assertionBindingHash, localeCatalogueHash: semantic.localeCatalogueHash };
    database.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify(workflow), context.projectId);
    return result;
}
