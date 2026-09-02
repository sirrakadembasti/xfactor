import { verifyArtifact } from './artifactVerifier.js';
import { completeVerifiedProject } from '../projectRepository.js';
import { db } from '../db.js';

/**
 * Single orchestration entrypoint for CLI and HTTP callers. Verification is
 * authoritative only when the persisted artifact/run receipts are returned;
 * completion is an explicit second, evidence-gated projection.
 */
export async function verifyArtifactAndProject({
    projectId,
    contractId,
    artifactId,
    expectedRevision = null,
    complete = false,
    options = {}
} = {}) {
    const verification = await verifyArtifact({ projectId, contractId, artifactId }, options);
    const receipt = { runId: verification.runId, contractId, artifactId };
    db.exec('BEGIN IMMEDIATE');
    try {
        const current = db.prepare('SELECT workflow_state FROM projects WHERE id = ?').get(projectId);
        let workflow = {};
        try { workflow = current?.workflow_state ? JSON.parse(current.workflow_state) : {}; } catch {}
        workflow.verificationReceipt = receipt;
        db.prepare('UPDATE projects SET workflow_state = ? WHERE id = ?').run(JSON.stringify(workflow), projectId);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    if (complete) {
        if (!Number.isInteger(Number(expectedRevision))) throw new Error('expectedRevision is required for completion.');
        if (!verification.passed) return { ...receipt, completionReceiptId: undefined };
        const project = completeVerifiedProject({ projectId, contractId, artifactId, expectedRevision });
        receipt.completionReceiptId = project.completionReceiptId;
    }
    return receipt;
}

export const runVerification = verifyArtifactAndProject;

if (process.argv[1] && process.argv[1].endsWith('verificationCli.js')) {
    const args = process.argv.slice(2);
    const complete = args.includes('--complete');
    const revisionIndex = args.indexOf('--expected-revision');
    const expectedRevision = revisionIndex >= 0 ? Number(args[revisionIndex + 1]) : null;
    const positional = args.filter((arg, index) => arg !== '--complete' && index !== revisionIndex && index !== revisionIndex + 1);
    const [projectId, contractId, artifactId] = positional;
    if (!projectId || !contractId || !artifactId) {
        console.error('Usage: node backend/verification/verificationCli.js <projectId> <contractId> <artifactId> [--complete --expected-revision N]');
        process.exitCode = 2;
    } else {
        verifyArtifactAndProject({ projectId, contractId, artifactId, complete, expectedRevision })
            .then(receipt => console.log(JSON.stringify(receipt)))
            .catch(error => { console.error(error.message); process.exitCode = 1; });
    }
}
