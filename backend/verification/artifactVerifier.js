import crypto from 'node:crypto';
import JSZip from 'jszip';
import { validateRuntimeConfig } from '../config.js';
import { createExecutionClient } from '../executionClient.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
import { verificationJobDeadline } from './verificationBudget.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { inspectZipEntries } from './safeExtractor.js';
import { assertWorkflowLease } from '../workflowAttempts.js';
import { db as globalDatabase } from '../db.js';
import { verifyDomainCompliance } from '../contracts/domainPolicy.js';
import { verifyPlaceholders } from './placeholderVerifier.js';
import { verifyContamination } from './contaminationVerifier.js';
import { verifySecurityBaseline } from './securityVerifier.js';
import {
    combineRuntimeGate,
    captureHardeningGate,
    RUNTIME_GATE_MEMBERS,
    MANDATORY_GATES
} from './qualityPolicy.js';
import { isManagementArtifactDetail, bindWorkerCheck, createWorkerReceipt, WORKER_RECEIPT_GATE,
    assertManagementCoverage } from './artifactEvidencePolicy.js';

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

export function normalizeWorkerCheckStatus(value, mandatory = false) {
    if (value === 'passed' || value === 'PASS') return 'PASS';
    if (value === 'failed' || value === 'FAIL') return 'FAIL';
    if (value === 'skipped' || value === 'NOT_APPLICABLE') return mandatory ? 'BLOCKED' : 'NOT_APPLICABLE';
    return 'BLOCKED';
}

export function isMandatoryArtifactCheck(gateName, contract = {}) {
    if (MANDATORY_GATES.includes(gateName)) return true;
    return isManagementArtifactDetail(gateName, contract);
}

export function hasMandatoryGateCoverage(checks = []) {
    const present = new Set(checks.map(check => check?.gateName || check?.name).filter(Boolean));
    return MANDATORY_GATES.every(name => present.has(name));
}

export function passingVerificationSourceNames(checks = []) {
    return checks
        .filter(check => check.status === 'passed' || check.status === 'PASS')
        .map(check => `detail:${check.gateName || check.name}`);
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
    if (options.db && options.db !== globalDatabase) {
        const requiredCallbacks = [
            'getArtifact',
            'getArtifactFiles',
            'updateArtifactStatus',
            'createRun',
            'updateRunStatus',
            'createCheck',
            'linkRequirementToCheck'
        ];
        const missingCallbacks = requiredCallbacks.filter(name => typeof options[name] !== 'function');
        if (missingCallbacks.length > 0) {
            throw new Error(
                `Alternate verifier database requires connection-bound callbacks: ${missingCallbacks.join(', ')}`
            );
        }
    }
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
        deadline: verificationJobDeadline({ deadline: activeJob.deadline, env: config || options.env || process.env, now }),
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
        const workerChecks = (Array.isArray(workerResult.checks) ? workerResult.checks : [])
            .map(check => ({ ...check, id: crypto.randomUUID() }));
        const workerCheckIds = new Set(workerChecks.map(check => check.id));
        const existingGateNames = new Set(workerChecks.map(c => c.gateName || c.name));
        const additionalChecks = [];

        const mandatoryRequirementIds = database.prepare(`
            SELECT id FROM requirements WHERE contract_id = ? AND mandatory = 1 ORDER BY stable_key
        `).all(contractId).map(row => row.id);

        for (const gateName of Object.keys(RUNTIME_GATE_MEMBERS)) {
            const aggregate = combineRuntimeGate(gateName, workerChecks, mandatoryRequirementIds);
            aggregate.id = crypto.randomUUID();
            // Raw runtime gates are sources, not a second authoritative base row.
            aggregate.evidence.sourceCheckIds = workerChecks.filter(check => RUNTIME_GATE_MEMBERS[gateName].has(check.gateName || check.name)).map(check => check.id);
            delete aggregate.evidence.sourceGateNames;
            additionalChecks.push(aggregate);
        }
        for (const check of workerChecks) {
            const name = check.gateName || check.name;
            if (RUNTIME_GATE_MEMBERS[name]) { check.name = `detail:${name}`; check.gateName = `detail:${name}`; check.applicability = 'OPTIONAL'; }
        }

            let parsedContract = {};
            try { parsedContract = JSON.parse(contract.contract_json); } catch {}
            const textEntries = entries.map(item => ({
                path: item.path,
                content: Buffer.isBuffer(item.content) ? item.content.toString('utf8') : String(item.content || '')
            }));
            const hardeningDefinitions = [
                ['domain_entity_check', () => verifyDomainCompliance(parsedContract, textEntries)],
                ['placeholder_check', () => verifyPlaceholders(textEntries)],
                ['contamination_check', () => verifyContamination(parsedContract, textEntries)],
                ['security_baseline', () => verifySecurityBaseline(parsedContract, textEntries, null)]
            ];
        for (const [name, fn] of hardeningDefinitions) {
            if (!existingGateNames.has(name)) {
                additionalChecks.push(await captureHardeningGate(name, fn));
            }
        }

        if (!existingGateNames.has('requirement_traceability')) {
            const allSoFar = [...workerChecks, ...additionalChecks];
            for (const check of allSoFar) check.id ||= crypto.randomUUID();
            const allPassed = allSoFar.every(c => c.status === 'passed' || c.status === 'PASS' || c.status === 'skipped');
            const timestamp = new Date().toISOString();
            additionalChecks.push({
                gateName: 'requirement_traceability',
                applicability: 'MANDATORY',
                status: allPassed ? 'PASS' : 'BLOCKED',
                requirementIds: [],
                startedAt: timestamp,
                endedAt: timestamp,
                stdoutDigest: crypto.createHash('sha256').update('traceability').digest('hex'),
                stderrDigest: crypto.createHash('sha256').update('').digest('hex'),
                policyVersion: ACTIVE_POLICY_VERSION,
                reason: `${mandatoryRequirementIds.length} mandatory requirement(s) evaluated.`,
                evidence: {
                    kind: 'derived_gate',
                    producer: 'quality-policy',
                    sourceGateNames: passingVerificationSourceNames(allSoFar),
                    sourceCheckIds: allSoFar.filter(check => check.status === 'passed' || check.status === 'PASS').map(check => check.id),
                    computedAt: timestamp,
                    policyVersion: ACTIVE_POLICY_VERSION
                }
            });
        }

        const allChecks = [...workerChecks, ...additionalChecks];
        if (workerResult.runtime?.executionProfile === 'local-trusted' && workerResult.runtime.osIsolation === false) {
            for (const check of allChecks) check.evidence = { ...(check.evidence || {}), executionProfile: 'local-trusted', osIsolation: false, isolation: false, runtime: 'local' };
        }
        const records = [];
        for (const check of allChecks) {
            const checkId = check.id || crypto.randomUUID();
            const gateName = check.gateName || check.name;
            const isMandatory = isMandatoryArtifactCheck(gateName, parsedContract);
            const applicability = isMandatory ? 'MANDATORY' : (check.applicability || 'OPTIONAL');
            const status = normalizeWorkerCheckStatus(check.status, isMandatory);
            let record = {
                    id: checkId,
                    contractId,
                    runId,
                    gateName,
                    applicability,
                    status,
                    command: check.command || null,
                    cwd: check.cwd || null,
                    startedAt: check.startedAt || new Date().toISOString(),
                    endedAt: check.endedAt || new Date().toISOString(),
                    exitCode: check.exitCode ?? null,
                    stdoutDigest: check.stdoutDigest || crypto.createHash('sha256').update(check.stdout || JSON.stringify(check.evidence || {})).digest('hex'),
                    stderrDigest: check.stderrDigest || crypto.createHash('sha256').update('').digest('hex'),
                    evidenceJson: check.evidence ?? check.evidenceJson ?? null,
                    timedOut: Boolean(check.timedOut)
                };
            if (workerCheckIds.has(checkId) && result.status === 'completed') record = bindWorkerCheck(record, expected);
            records.push(record);
            runLeaseTransaction(database, assertLease, () => {
                createCheck(record);
            });
            for (const requirementId of check.requirementIds || []) {
                runLeaseTransaction(database, assertLease, () => {
                    linkRequirementToCheck({ contractId, requirementId, verificationCheckId: checkId });
                });
            }
        }

        if (result.status === 'completed') {
            const receipt = createWorkerReceipt(expected, records.filter(record => workerCheckIds.has(record.id)));
            runLeaseTransaction(database, assertLease, () => createCheck({ id: crypto.randomUUID(), contractId, runId,
                gateName: WORKER_RECEIPT_GATE, applicability: 'OPTIONAL', status: 'PASS',
                evidenceJson: receipt, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() }));
        }

        let managementError = null;
        try { assertManagementCoverage(records, parsedContract); } catch (error) { managementError = error.message; }
        const uniqueBaseGates = MANDATORY_GATES.every(name => allChecks.filter(check => (check.gateName || check.name) === name).length === 1);
        const unknownMandatory = allChecks.some(check => check.applicability === 'MANDATORY' && !isMandatoryArtifactCheck(check.gateName || check.name, parsedContract));
        const passed = result.status === 'completed' && !managementError && uniqueBaseGates && !unknownMandatory
            && !allChecks.some(check => check.timedOut) && hasMandatoryGateCoverage(allChecks)
            && allChecks.every(c => ['PASS', 'NOT_APPLICABLE'].includes(normalizeWorkerCheckStatus(c.status, isMandatoryArtifactCheck(c.gateName || c.name, parsedContract))));
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
            error: passed ? null : (result.error || managementError || (!uniqueBaseGates ? 'Mandatory base gate set is missing or duplicated.' : null)
                || (unknownMandatory ? 'Worker returned an unknown mandatory gate.' : null) || `Worker status: ${result.status}`)
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
