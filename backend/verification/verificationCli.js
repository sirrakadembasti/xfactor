import { verifyArtifact } from './artifactVerifier.js';
import { completeVerifiedProject } from '../projectRepository.js';

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
    const receipt = {
        runId: verification.runId,
        artifactId,
        completionReceiptId: undefined
    };
    if (complete && verification.passed) {
        const project = completeVerifiedProject({
            projectId,
            contractId,
            artifactId,
            expectedRevision
        });
        receipt.completionReceiptId = project.completionReceiptId;
    }
    return receipt;
}

export const runVerification = verifyArtifactAndProject;

if (process.argv[1] && process.argv[1].endsWith('verificationCli.js')) {
    const [projectId, contractId, artifactId] = process.argv.slice(2);
    if (!projectId || !contractId || !artifactId) {
        console.error('Usage: node backend/verification/verificationCli.js <projectId> <contractId> <artifactId>');
        process.exitCode = 2;
    } else {
        verifyArtifactAndProject({ projectId, contractId, artifactId })
            .then(receipt => console.log(JSON.stringify(receipt)))
            .catch(error => { console.error(error.message); process.exitCode = 1; });
    }
}
