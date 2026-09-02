import { db } from '../db.js';

export function createArtifact({
    id,
    projectId,
    contractId,
    kind,
    path,
    sha256,
    size,
    manifestJson = '[]',
    status = 'draft'
}) {
    const result = db.prepare(`
        INSERT INTO artifacts (
            id, project_id, contract_id, kind, path, sha256, size, manifest_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, contractId, kind, path, sha256, size, manifestJson, status);

    if (result.changes !== 1) {
        throw new Error(`Failed to create artifact ${id} for project ${projectId}.`);
    }

    return getArtifact({ projectId, contractId, artifactId: id });
}

const ARTIFACT_TRANSITIONS = {
    draft: new Set(['built', 'verification_pending', 'rejected']),
    built: new Set(['verification_pending', 'rejected']),
    verification_pending: new Set(['verified', 'rejected']),
    verified: new Set(['superseded']),
    rejected: new Set(['superseded']),
    superseded: new Set([])
};

export function updateArtifactStatus({
    projectId,
    contractId,
    artifactId,
    status,
    verificationRunId = null
}) {
    const artifact = getArtifact({ projectId, contractId, artifactId });
    if (!artifact) throw new Error(`Artifact ${artifactId} for project ${projectId} was not found.`);
    if (!ARTIFACT_TRANSITIONS[artifact.status]?.has(status)) {
        throw new Error(`Artifact ${artifactId} has an invalid or immutable status transition from ${artifact.status} to ${status}.`);
    }
    if (status === 'verified' && !verificationRunId) {
        throw new Error(`Artifact ${artifactId} requires verification_run_id when verified.`);
    }
    if (status !== 'verified') verificationRunId = status === 'rejected' ? null : verificationRunId;
    const result = db.prepare(`
        UPDATE artifacts SET status = ?, verification_run_id = ?
        WHERE project_id = ? AND contract_id = ? AND id = ? AND status = ?
    `).run(status, verificationRunId, projectId, contractId, artifactId, artifact.status);
    if (result.changes !== 1) throw new Error(`Artifact ${artifactId} for project ${projectId} was not updated.`);
    return getArtifact({ projectId, contractId, artifactId });
}

export function getArtifact({ projectId, contractId, artifactId }) {
    return db.prepare(`
        SELECT *
        FROM artifacts
        WHERE project_id = ? AND contract_id = ? AND id = ?
    `).get(projectId, contractId, artifactId);
}

export function addArtifactFile({
    contractId,
    artifactId,
    path,
    sha256,
    size
}) {
    const result = db.prepare(`
        INSERT INTO artifact_files (
            contract_id, artifact_id, path, sha256, size
        ) VALUES (?, ?, ?, ?, ?)
    `).run(contractId, artifactId, path, sha256, size);

    if (result.changes !== 1) {
        throw new Error(`Failed to insert artifact file ${path} for artifact ${artifactId}.`);
    }
}

export function getArtifactFiles({ contractId, artifactId }) {
    return db.prepare(`
        SELECT *
        FROM artifact_files
        WHERE contract_id = ? AND artifact_id = ?
        ORDER BY path ASC
    `).all(contractId, artifactId);
}

export function getLatestVerifiedArtifact({ projectId, contractId }) {
    return db.prepare(`
        SELECT *
        FROM artifacts
        WHERE project_id = ? AND contract_id = ? AND status = 'verified'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    `).get(projectId, contractId);
}

export function supersedeArtifacts({ projectId, contractId, exceptArtifactId = null }) {
    if (exceptArtifactId) {
        return db.prepare(`
            UPDATE artifacts
            SET status = 'superseded'
            WHERE project_id = ? AND contract_id = ? AND id != ? AND status IN ('draft', 'built', 'verification_pending', 'verified')
        `).run(projectId, contractId, exceptArtifactId);
    }

    return db.prepare(`
        UPDATE artifacts
        SET status = 'superseded'
        WHERE project_id = ? AND contract_id = ? AND status IN ('draft', 'built', 'verification_pending', 'verified')
    `).run(projectId, contractId);
}
