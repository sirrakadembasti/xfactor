import { verifyArtifact } from './artifactVerifier.js';
import { getArtifact } from '../repositories/artifactRepository.js';
import {
    completeVerifiedProject,
    getProject,
    projectStateTransitionInTransaction
} from '../projectRepository.js';
import { db } from '../db.js';

/** Shared authoritative verification and completion orchestration for CLI/workflow. */
export async function verifyArtifactAndProject({
    projectId,
    contractId,
    artifactId,
    expectedRevision = null,
    complete = false,
    options = {}
} = {}) {
    if (!projectId || !contractId || !artifactId) {
        throw new Error('projectId, contractId, and artifactId are required.');
    }
    const initialProject = getProject(projectId);
    if (!initialProject) throw new Error(`Project ${projectId} does not exist.`);
    if (expectedRevision !== null && initialProject.revision !== expectedRevision) {
        throw new Error(`CAS Revision conflict on project ${projectId}`);
    }
    if (initialProject.status === 'implementing') {
        projectStateTransitionInTransaction({
            expectedRevision: initialProject.revision,
            statuses: ['implementation_finished']
        });
    }

    const verification = await verifyArtifact({ projectId, contractId, artifactId }, options);
    const artifact = getArtifact({ projectId, contractId, artifactId });
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

    if (!verification.passed || verification.status !== 'verified' || !artifact || artifact.status !== 'verified') {
        return { ...receipt, passed: false, completed: false };
    }
    if (!verification.runId || artifact.verificationRunId !== verification.runId) {
        throw new Error('Verified artifact is missing authoritative verification run linkage.');
    }
    if (!complete) return { ...receipt, passed: true, completed: false };

    let project = getProject(projectId);
    const statuses = project.status === 'runtime_verified'
        ? ['acceptance_verified', 'artifact_verified']
        : project.status === 'acceptance_verified'
            ? ['artifact_verified']
            : project.status === 'artifact_verified' ? [] : null;
    if (!statuses) throw new Error(`Project ${projectId} cannot complete from state ${project.status}.`);
    if (statuses.length > 0) {
        projectStateTransitionInTransaction({ projectId, expectedRevision: project.revision, statuses });
        project = getProject(projectId);
    }
    const completed = completeVerifiedProject({
        projectId,
        contractId,
        artifactId,
        expectedRevision: project.revision
    });
    return { ...receipt, passed: true, completed: true, completionReceiptId: completed.completionReceiptId, project: completed };
}

export const runVerification = verifyArtifactAndProject;
export const runVerificationCli = verifyArtifactAndProject;

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
