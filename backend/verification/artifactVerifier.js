import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { db } from '../db.js';
import { getArtifact, updateArtifactStatus } from '../repositories/artifactRepository.js';
import { createRun, updateRunStatus } from '../repositories/verificationRepository.js';
import { safeExtractZip } from './safeExtractor.js';
import { runProjectVerification } from './qualityPolicy.js';

export async function verifyArtifact({ projectId, contractId, artifactId }, options = {}) {
    const artifact = getArtifact({ projectId, contractId, artifactId });
    if (!artifact) {
        throw new Error(`Artifact ${artifactId} for project ${projectId} not found.`);
    }

    const runId = options.runId || `verification-${crypto.randomUUID()}`;
    createRun({
        id: runId,
        projectId,
        contractId,
        status: 'running',
        policyVersion: options.policyVersion || '1.0'
    });

    updateArtifactStatus({
        projectId,
        contractId,
        artifactId,
        status: 'verification_pending',
        verificationRunId: runId
    });

    const cleanRoomDir = await fs.mkdtemp(path.join(os.tmpdir(), `xfactor-cleanroom-${projectId}-`));

    try {
        await safeExtractZip(artifact.path, cleanRoomDir, options.limits);

        const verifyResult = await runProjectVerification({
            projectId,
            projectDir: cleanRoomDir,
            options
        });

        const newStatus = verifyResult.passed ? 'verified' : 'rejected';
        updateArtifactStatus({
            projectId,
            contractId,
            artifactId,
            status: newStatus,
            verificationRunId: verifyResult.runId
        });

        // Ensure the initial runId is updated if runProjectVerification generated a nested one
        if (verifyResult.runId && verifyResult.runId !== runId) {
            updateRunStatus(runId, verifyResult.passed ? 'verified' : 'failed');
        }

        return {
            status: verifyResult.passed ? 'verified' : 'failed',
            passed: Boolean(verifyResult.passed),
            runId: verifyResult.runId || runId,
            error: verifyResult.passed ? null : (verifyResult.error || 'Clean-room verification gates failed.')
        };
    } catch (error) {
        updateRunStatus(runId, 'failed');
        updateArtifactStatus({
            projectId,
            contractId,
            artifactId,
            status: 'rejected',
            verificationRunId: runId
        });

        return {
            status: 'failed',
            passed: false,
            runId,
            error: error.message || String(error)
        };
    } finally {
        await fs.rm(cleanRoomDir, { recursive: true, force: true }).catch(() => {});
    }
}
