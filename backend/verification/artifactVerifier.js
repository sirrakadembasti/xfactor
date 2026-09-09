import crypto from 'node:crypto';
import JSZip from 'jszip';
import { validateRuntimeConfig } from '../config.js';
import { createExecutionClient } from '../executionClient.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { inspectZipEntries } from './safeExtractor.js';
import { assertWorkflowLease } from '../workflowAttempts.js';

async function loadRepositoryDefaults() {
    const [{ db }, artifactRepo, verificationRepo, traceability] = await Promise.all([
        import('../db.js'),
        import('../repositories/artifactRepository.js'),
        import('../repositories/verificationRepository.js'),
        import('../contracts/traceability.js')
    ]);
    return {
        db,
        getArtifact: artifactRepo.getArtifact,
        getArtifactFiles: artifactRepo.getArtifactFiles,
        updateArtifactStatus: artifactRepo.updateArtifactStatus,
        createRun: verificationRepo.createRun,
        updateRunStatus: verificationRepo.updateRunStatus,
        createCheck: verificationRepo.createCheck,
        linkRequirementToCheck: traceability.linkRequirementToCheck
    };
}

const TERMINAL_WORKER_STATES = new Set([
    'completed', 'failed', 'cancelled', 'failed_interrupted', 'failed_timeout'
]);

function assertIdentity(value, expected) {
    for (const key of [
        'version', 'jobId', 'operation', 'projectId', 'contractId',
        'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'
    ]) {
        if (value?.[key] !== expected[key]) {
            throw new Error(`Worker identity mismatch in ${key}`);
        }
    }
}

function checkStatus(value) {
    if (value === 'passed' || value === 'PASS') return 'PASS';
    if (value === 'failed' || value === 'FAIL') return 'FAIL';
    return 'BLOCKED';
}

function canonicalArchivePath(value) {
    const normalized = value.replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.split('/').some(part => part === '..')) {
        throw new Error(`Invalid archive path: ${value}`);
    }
    const canonical = normalized.split('/').filter(Boolean).join('/');
    if (!canonical || canonical === '.') throw new Error(`Invalid archive path: ${value}`);
    return canonical;
}

function runLeaseTransaction(database, assertLease, write) {
    database.exec('BEGIN IMMEDIATE;');
    try {
        assertLease();
        const result = write();
        database.exec('COMMIT;');
        return result;
    } catch (error) {
        try { database.exec('ROLLBACK;'); } catch {}
        throw error;
    }
}

/**
 * Verify one immutable artifact through the execution worker.
 *
 * The caller must provide the run/active-job identity created by the workflow.
 * `executionClient`, `db`, and repository functions are injectable so isolated
 * tests do not need a live worker or global database.
 */
export async function verifyArtifact(
    { projectId, contractId, artifactId },
    options = {}
) {
    const runId = options.runId;
    const activeJob = options.activeJob;
    if (!runId) throw new Error('verifyArtifact requires a supplied runId from the execution engine');
    if (!activeJob) throw new Error('verifyArtifact requires options.activeJob');
    if (activeJob.runId !== runId) {
        throw new Error(`Stale or cancelled job: runId ${runId} does not match active job ${activeJob.runId}`);
    }
    if (activeJob.cancelled || activeJob.status === 'cancelled' || activeJob.status === 'aborted') {
        throw new Error('Stale or cancelled job cannot be verified');
    }
    const now = options.now ?? Date.now();
    if (activeJob.deadline != null && now > Number(activeJob.deadline)) {
        throw new Error('Verification deadline exceeded');
    }

    const needsDefaults = !options.db || !options.getArtifact || !options.getArtifactFiles
        || !options.updateArtifactStatus || !options.createRun || !options.updateRunStatus
        || !options.createCheck || !options.linkRequirementToCheck;
    const loaded = needsDefaults ? await loadRepositoryDefaults() : {};
    const database = options.db || loaded.db;
    const getArtifact = options.getArtifact || loaded.getArtifact;
    const getArtifactFiles = options.getArtifactFiles || loaded.getArtifactFiles;
    const updateArtifactStatus = options.updateArtifactStatus || loaded.updateArtifactStatus;
    const createRun = options.createRun || loaded.createRun;
    const updateRunStatus = options.updateRunStatus || loaded.updateRunStatus;
    const createCheck = options.createCheck || loaded.createCheck;
    const linkRequirementToCheck = options.linkRequirementToCheck || loaded.linkRequirementToCheck;
    const assertLease = () => {
        if (options.attemptId !== undefined || options.leaseOwner !== undefined) {
            assertWorkflowLease(options.attemptId, options.leaseOwner, { projectId, database });
        }
    };
    const artifact = getArtifact({ projectId, contractId, artifactId });
    if (!artifact) throw new Error(`Artifact ${artifactId} for project ${projectId} not found.`);

    const contract = database.prepare(`
        SELECT id, revision, contract_hash, contract_json
        FROM project_contracts
        WHERE project_id = ? AND status = 'approved'
        ORDER BY revision DESC, id ASC
        LIMIT 1
    `).get(projectId);
    if (!contract || contract.id !== contractId) {
        throw new Error(`Contract ${contractId} is not the latest approved contract.`);
    }
    if (activeJob.projectId !== projectId
        || activeJob.contractId !== contract.id
        || activeJob.contractHash !== contract.contract_hash
        || Number(activeJob.revision) !== Number(contract.revision)) {
        throw new Error('Active job contract identity does not match persisted contract.');
    }

    const config = options.config || (options.executionClient ? null : validateRuntimeConfig(options.env || process.env));
    const executionClient = options.executionClient || createExecutionClient(config);
    const expected = {
        version: activeJob.version ?? 1,
        jobId: activeJob.jobId,
        operation: 'verify_artifact',
        projectId,
        contractId,
        contractHash: contract.contract_hash,
        revision: contract.revision,
        artifactId,
        nonce: activeJob.nonce,
        inputSha256: artifact.sha256,
        runId
    };
    if (!expected.jobId || !expected.nonce || !/^[a-f0-9]{64}$/i.test(expected.inputSha256 || '')) {
        throw new Error('Verification job identity is incomplete or malformed.');
    }
    const archiveBase64 = options.archiveBase64;
    if (typeof archiveBase64 !== 'string' || !archiveBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(archiveBase64)) {
        throw new Error('Verification archive is not valid base64.');
    }
    let archiveBytes;
    try { archiveBytes = Buffer.from(archiveBase64, 'base64'); } catch {
        throw new Error('Verification archive is not valid base64.');
    }
    if (crypto.createHash('sha256').update(archiveBytes).digest('hex') !== artifact.sha256) {
        throw new Error('Verification archive digest does not match persisted artifact.');
    }
    const zip = await JSZip.loadAsync(archiveBytes);
    const entries = await inspectZipEntries(zip, {
        maxFiles: ARTIFACT_LIMITS.maxFiles,
        maxTotalBytes: ARTIFACT_LIMITS.maxExtractedBytes,
        maxFileBytes: ARTIFACT_LIMITS.maxFileBytes,
        maxRatio: ARTIFACT_LIMITS.maxCompressionRatio
    });
    const submitted = entries.map(item => ({
        path: item.path,
        sha256: crypto.createHash('sha256').update(item.content).digest('hex'),
        size: item.content.length
    }));
    const persistedManifest = JSON.parse(artifact.manifestJson || '[]');
    const persistedFiles = getArtifactFiles({ contractId, artifactId }).map(row => ({
        path: canonicalArchivePath(row.path), sha256: row.sha256, size: Number(row.size)
    }));
    const compare = (left, right, label) => {
        const a = [...left].sort((x, y) => x.path.localeCompare(y.path));
        const b = [...right].sort((x, y) => x.path.localeCompare(y.path));
        if (a.length !== b.length || a.some((item, i) => item.path !== b[i].path
            || item.sha256 !== b[i].sha256 || Number(item.size) !== Number(b[i].size))) {
            throw new Error(`Artifact ${label} does not match submitted archive.`);
        }
    };
    compare(submitted, persistedManifest, 'manifest');
    compare(submitted, persistedFiles, 'file rows');
    let runCreated = false;
    try {
        runLeaseTransaction(database, assertLease, () => {
            createRun({
                id: runId, projectId, contractId, status: 'queued',
                policyVersion: options.policyVersion || ACTIVE_POLICY_VERSION
            });
        });
        runCreated = true;
        runLeaseTransaction(database, assertLease, () => {
            updateRunStatus(runId, 'running');
        });
        runLeaseTransaction(database, assertLease, () => {
            updateArtifactStatus({
                projectId, contractId, artifactId,
                status: 'verification_pending', verificationRunId: runId
            });
        });

        const workerJob = {
            ...expected,
            contract: JSON.parse(contract.contract_json),
            archiveBase64
        };
        const result = await executionClient.verifyArtifact(workerJob, { signal: options.signal });
        assertLease();
        assertIdentity(result, expected);
        if (!TERMINAL_WORKER_STATES.has(result.status)) {
            throw new Error(`Worker returned illegal terminal status: ${result.status}`);
        }
        const workerResult = result.result && typeof result.result === 'object' ? result.result : result;
        for (const check of workerResult.checks || []) {
            const checkId = check.id || crypto.randomUUID();
            runLeaseTransaction(database, assertLease, () => {
                createCheck({
                    id: checkId,
                    contractId,
                    runId,
                    gateName: check.gateName || check.name,
                    applicability: check.applicability || 'MANDATORY',
                    status: checkStatus(check.status),
                    command: check.command || null,
                    cwd: check.cwd || null,
                    startedAt: check.startedAt || new Date().toISOString(),
                    exitCode: check.exitCode ?? null,
                    stdoutDigest: check.stdoutDigest || null,
                    stderrDigest: check.stderrDigest || null,
                    evidenceJson: check.evidence ?? check.evidenceJson ?? null,
                    timedOut: Boolean(check.timedOut)
                });
            });
            for (const requirementId of check.requirementIds || []) {
                runLeaseTransaction(database, assertLease, () => {
                    linkRequirementToCheck({ contractId, requirementId, verificationCheckId: checkId });
                });
            }
        }
        const passed = result.status === 'completed';
        runLeaseTransaction(database, assertLease, () => {
            updateArtifactStatus({
                projectId, contractId, artifactId,
                status: passed ? 'verified' : 'rejected',
                verificationRunId: runId
            });
            updateRunStatus(runId, passed ? 'verified' : 'failed');
        });
        return {
            status: passed ? 'verified' : 'failed',
            passed,
            runId,
            error: passed ? null : (result.error || `Worker status: ${result.status}`)
        };
    } catch (error) {
        if (runCreated) {
            try {
                runLeaseTransaction(database, assertLease, () => {
                    updateRunStatus(runId, 'failed');
                });
            } catch {}
            try {
                runLeaseTransaction(database, assertLease, () => {
                    updateArtifactStatus({
                        projectId, contractId, artifactId,
                        status: 'rejected', verificationRunId: runId
                    });
                });
            } catch {}
        }
        throw error;
    }
}
