import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { verifyArtifact } from './artifactVerifier.js';
import { verificationJobDeadline } from './verificationBudget.js';
import { getArtifact } from '../repositories/artifactRepository.js';
import {
    completeVerifiedProject,
    assertVerifiedArtifactRunEvidence,
    getProject,
    getProjectDir,
    projectStateTransitionInTransaction
} from '../projectRepository.js';
import { assertVerificationContext, commitVerificationContext, readApprovedVerificationContract } from './verificationContext.js';
import { db, initializeDatabase, closeDatabase } from '../db.js';
import { resolveWorkerRepairIssues, readWorkerSnapshotSync, snapshotHash } from '../engine/workerRepairs.js';

export async function recoverVerifiedWorkerRepair({ projectId, contract, workflow, attemptId, leaseOwner, signal }) {
    const ledger = workflow.workerRepairs;
    if (!ledger || ledger.contractId !== contract.id || ledger.contractHash !== contract.contract_hash) return null;
    const candidate = [...ledger.validations].reverse().find(item => item.stage === 'worker_verification'
        && ['reserved', 'passed'].includes(item.phase) && item.artifactId && item.runId
        && db.prepare("SELECT id FROM artifacts WHERE id=? AND project_id=? AND contract_id=? AND status='verified' AND verification_run_id=?")
            .get(item.artifactId, projectId, contract.id, item.runId));
    if (!candidate) return null;
    const context = { projectId, contractId: contract.id, contractHash: contract.contract_hash, revision: contract.revision, attemptId, leaseOwner, signal };
    assertVerificationContext(context);
    assertVerifiedArtifactRunEvidence({ projectId, contractId: contract.id, artifactId: candidate.artifactId });
    if (snapshotHash(readWorkerSnapshotSync(getProjectDir(projectId))) !== candidate.sourceSnapshotHash) throw new Error('Worker recovery requires Manager revision: verified source changed.');
    const receipt = JSON.parse(db.prepare("SELECT evidence_json FROM verification_checks WHERE run_id=? AND gate_name='worker_verification_receipt' AND status='PASS'").get(candidate.runId)?.evidence_json || '{}');
    if (receipt.jobId !== candidate.jobId || receipt.nonce !== candidate.nonce || receipt.inputSha256 !== candidate.artifactSha256) throw new Error('Worker recovery receipt mismatch.');
    for (const stage of ['reviewer_acceptance', 'static_acceptance']) if (!ledger.validations.some(item => item.stage === stage
        && item.phase === 'passed' && item.result?.approved === true && item.sourceSnapshotHash === candidate.sourceSnapshotHash
        && item.batchFingerprint === candidate.batchFingerprint)) throw new Error('Worker recovery static acceptance missing.');
    for (const attempt of ledger.attempts.filter(item => item.phase === 'patched')) {
        const row = db.prepare('SELECT task_spec_json FROM contract_tasks WHERE id=? AND contract_id=?').get(attempt.ownerTaskId, contract.id);
        if (!row || JSON.parse(row.task_spec_json).executionTaskSpecHash !== attempt.ownerSpecHash) throw new Error('Worker recovery owner changed.');
    }
    // Only this internal recovery path supplies a runner backed by immutable
    // evidence already checked above. No worker or provider is dispatched.
    return verifyArtifactAndProject({ projectId, contractId: contract.id, artifactId: candidate.artifactId, complete: true,
        attemptId, leaseOwner, options: { signal, workerRepairValidationId: candidate.id },
        verificationRunner: async () => ({ passed: true, status: 'verified', runId: candidate.runId }) });
}

export function formatVerificationFailure(checks = [], fallback = 'Canonical verification did not complete the project.') {
    const failed = checks.filter(check => check.status === 'FAIL');
    const blocked = checks.filter(check => check.status === 'BLOCKED' && !failed.some(item => item.gate_name === check.gate_name));
    const relevant = failed.length ? [...failed, ...blocked] : blocked;
    if (relevant.length === 0) return fallback;
    const names = relevant.map(check => check.gate_name).slice(0, 8);
    const issues = relevant.flatMap(check => {
        try {
            const evidence = JSON.parse(check.evidence_json || '{}');
            return Array.isArray(evidence.issues) ? evidence.issues : (evidence.reason ? [evidence.reason] : []);
        } catch {
            return [];
        }
    }).map(issue => String(issue).slice(0, 240)).slice(0, 3);
    return `Doğrulama başarısız: ${names.join(', ')}${issues.length ? ` — ${issues.join('; ')}` : ''}`;
}

export async function verifyArtifactAndProject({
    projectId,
    contractId,
    artifactId,
    expectedRevision = null,
    complete = false,
    attemptId = null,
    leaseOwner = null,
    options = {},
    verificationRunner = verifyArtifact
} = {}) {
    if (!projectId || !contractId || !artifactId) {
        throw new Error('projectId, contractId, and artifactId are required.');
    }
    const initialProject = getProject(projectId);
    if (!initialProject) throw new Error(`Project ${projectId} does not exist.`);
    if (expectedRevision !== null && initialProject.revision !== expectedRevision) {
        throw new Error(`CAS Revision conflict on project ${projectId}`);
    }
    const contract = readApprovedVerificationContract(projectId);
    const context = { projectId, contractId, contractHash: contract?.contract_hash, revision: contract?.revision,
        attemptId, leaseOwner, signal: options.signal, deadline: options.activeJob?.deadline };
    assertVerificationContext(context);
    if (initialProject.status === 'implementing') {
        commitVerificationContext(context, () => projectStateTransitionInTransaction({
            projectId,
            expectedRevision: initialProject.revision,
            statuses: ['implementation_finished'],
            attemptId,
            leaseOwner,
            transactionOpen: true
        }));
    }

    const verificationOptions = {
        ...options,
        ...(attemptId !== null || leaseOwner !== null ? { attemptId, leaseOwner } : {})
    };
    const verification = await verificationRunner(
        { projectId, contractId, artifactId },
        verificationOptions
    );

    const artifact = getArtifact({ projectId, contractId, artifactId });
    const receipt = { runId: verification?.runId, contractId, artifactId };
    commitVerificationContext(context, () => {
        const current = db.prepare('SELECT workflow_state FROM projects WHERE id = ?').get(projectId);
        let workflow = {};
        try { workflow = current?.workflow_state ? JSON.parse(current.workflow_state) : {}; } catch {}
        workflow.verificationReceipt = receipt;
        db.prepare('UPDATE projects SET workflow_state = ? WHERE id = ?').run(JSON.stringify(workflow), projectId);
    });

    if (!verification.passed || verification.status !== 'verified' || !artifact || artifact.status !== 'verified') {
        const checks = verification.runId
            ? db.prepare('SELECT gate_name, status, evidence_json FROM verification_checks WHERE run_id = ?').all(verification.runId)
            : [];
        return { ...receipt, passed: false, completed: false, error: formatVerificationFailure(checks, verification.error) };
    }
    if (!verification.runId || artifact.verificationRunId !== verification.runId) {
        throw new Error('Verified artifact is missing authoritative verification run linkage.');
    }
    if (options.workerRepairValidationId) commitVerificationContext(context, () => resolveWorkerRepairIssues(context,
        { artifactId, runId: verification.runId, validationId: options.workerRepairValidationId }));
    if (!complete) return { ...receipt, passed: true, completed: false };

    let project = getProject(projectId);
    const statuses = project.status === 'implementation_finished'
        ? ['verification_pending', 'verification_running', 'build_verified', 'runtime_verified', 'acceptance_verified', 'artifact_verified']
        : project.status === 'verification_pending'
            ? ['verification_running', 'build_verified', 'runtime_verified', 'acceptance_verified', 'artifact_verified']
            : project.status === 'verification_running'
                ? ['build_verified', 'runtime_verified', 'acceptance_verified', 'artifact_verified']
                : project.status === 'build_verified'
                    ? ['runtime_verified', 'acceptance_verified', 'artifact_verified']
                    : project.status === 'runtime_verified'
                        ? ['acceptance_verified', 'artifact_verified']
                        : project.status === 'acceptance_verified'
                            ? ['artifact_verified']
                            : project.status === 'artifact_verified' ? [] : null;
    if (!statuses) throw new Error(`Project ${projectId} cannot complete from state ${project.status}.`);
    if (statuses.length > 0) {
        commitVerificationContext(context, () => projectStateTransitionInTransaction({
            projectId,
            expectedRevision: project.revision,
            statuses,
            attemptId,
            leaseOwner,
            transactionOpen: true
        }));
        project = getProject(projectId);
    }
    const completed = completeVerifiedProject({
        projectId,
        contractId,
        artifactId,
        expectedRevision: project.revision,
        attemptId,
        leaseOwner
    });
    return { ...receipt, passed: true, completed: true, completionReceiptId: completed.completionReceiptId, project: completed };
}

export const runVerification = verifyArtifactAndProject;
export const runVerificationCli = verifyArtifactAndProject;

if (process.argv[1] && process.argv[1].endsWith('verificationCli.js')) {
    await (async () => {
        try {
            initializeDatabase(process.env.DB_PATH ? { path: process.env.DB_PATH } : {});
            const args = process.argv.slice(2);
            const complete = args.includes('--complete');
            const revisionIndex = args.indexOf('--expected-revision');
            const expectedRevision = revisionIndex >= 0 ? Number(args[revisionIndex + 1]) : null;
            const runIndex = args.indexOf('--run-id');
            const runId = runIndex >= 0 ? args[runIndex + 1] : null;
            const positional = args.filter((arg, index) => !['--complete', '--expected-revision', '--run-id'].includes(arg)
                && index !== revisionIndex && index !== revisionIndex + 1 && index !== runIndex + 1);
            const [projectId, contractId, artifactId] = positional;
            if (!projectId || !contractId || !artifactId || !runId) {
                console.error('Usage: node backend/verification/verificationCli.js <projectId> <contractId> <artifactId> --run-id RUN_ID [--complete --expected-revision N]');
                process.exitCode = 2;
                return;
            }
            const contract = db.prepare('SELECT id, revision, contract_hash, contract_json FROM project_contracts WHERE project_id = ? AND status = ? ORDER BY revision DESC LIMIT 1').get(projectId, 'approved');
            const artifact = getArtifact({ projectId, contractId, artifactId });
            if (!contract || contract.id !== contractId || !artifact) throw new Error('Latest approved contract and artifact are required.');
            const archiveBytes = await fs.readFile(artifact.path);
            const activeJob = { version: 1, jobId: crypto.randomUUID(), projectId, contractId, contractHash: contract.contract_hash, revision: contract.revision, artifactId, nonce: crypto.randomBytes(32).toString('hex'), runId, deadline: verificationJobDeadline(), contract: JSON.parse(contract.contract_json) };
            const receipt = await verifyArtifactAndProject({ projectId, contractId, artifactId, complete, expectedRevision, options: { runId, activeJob, archiveBase64: archiveBytes.toString('base64') } });
            console.log(JSON.stringify(receipt));
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        } finally {
            closeDatabase();
        }
    })();
}
