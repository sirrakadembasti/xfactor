import crypto from 'node:crypto';
import JSZip from 'jszip';
import { validateRuntimeConfig } from '../config.js';
import { createExecutionClient } from '../executionClient.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
import { verificationJobDeadline } from './verificationBudget.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { inspectZipEntries } from './safeExtractor.js';
import { assertVerificationContext, commitVerificationContext } from './verificationContext.js';
import { db as globalDatabase } from '../db.js';
import { normalizeWorkerCheckLog, redactObservedEvidence, summarizeWorkerRejection, recordWorkerRejection, recordVerificationBlocker } from './workerFailures.js';
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
    const verificationContext = () => ({
        projectId, contractId, contractHash: expected.contractHash, revision: expected.revision,
        attemptId: options.attemptId, leaseOwner: options.leaseOwner,
        signal: options.signal, deadline: expected.deadline
    });
    const assertLease = () => assertVerificationContext(verificationContext(), database);
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
    assertLease();
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
        const AUTHORITATIVE_BACKEND_GATES = new Set([
            'domain_entity_check',
            'placeholder_check',
            'contamination_check',
            'security_baseline'
        ]);
        const rawWorkerChecks = Array.isArray(workerResult.checks) ? workerResult.checks : [];
        const filteredWorkerChecks = rawWorkerChecks.filter(c => !AUTHORITATIVE_BACKEND_GATES.has(c?.gateName || c?.name || c?.gate_name));
        const workerChecks = filteredWorkerChecks.map(check => ({ ...check, id: crypto.randomUUID() }));
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
            additionalChecks.push(await captureHardeningGate(name, fn));
        }

        if (!existingGateNames.has('requirement_traceability')) {
            const allSoFar = [...workerChecks, ...additionalChecks];
            for (const check of allSoFar) check.id ||= crypto.randomUUID();
            const passingChecks = allSoFar.filter(c => c.status === 'passed' || c.status === 'PASS');
            const coveredReqIds = new Set(passingChecks.flatMap(c => c.requirementIds || []));
            const missingMandatoryIds = mandatoryRequirementIds.filter(id => !coveredReqIds.has(id));
            const allMandatoryCovered = missingMandatoryIds.length === 0 && (mandatoryRequirementIds.length === 0 || passingChecks.length > 0);
            const allPassed = allMandatoryCovered && allSoFar.every(c => c.status === 'passed' || c.status === 'PASS' || (c.status === 'skipped' && !isMandatoryArtifactCheck(c.gateName || c.name, parsedContract)));
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
                reason: allPassed
                    ? `${mandatoryRequirementIds.length} mandatory requirement(s) evaluated and passed.`
                    : `${missingMandatoryIds.length} mandatory requirement(s) lack passing machine evidence.`,
                evidence: {
                    kind: 'derived_gate',
                    producer: 'quality-policy',
                    sourceGateNames: passingVerificationSourceNames(allSoFar),
                    sourceCheckIds: passingChecks.map(check => check.id),
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

            const isWorkerCheck = workerCheckIds.has(checkId);
            const isExecutable = Boolean(check.command) || (check.exitCode !== null && check.exitCode !== undefined);
            const isMandatoryCheck = applicability === 'MANDATORY';
            const isPassingClaim = ['passed', 'PASS', 'NOT_APPLICABLE'].includes(check.status) || check.exitCode === 0;
            const missingEvidence = isWorkerCheck && isExecutable && isMandatoryCheck && isPassingClaim && (
                !check.startedAt || !check.endedAt || !check.stdoutDigest || !check.stderrDigest
            );

            let status = normalizeWorkerCheckStatus(check.status, isMandatory);
            let exitCode = check.exitCode ?? null;
            let reason = check.reason || null;
            let startedAt = check.startedAt || new Date().toISOString();
            let endedAt = check.endedAt || new Date().toISOString();
            let stdoutDigest = check.stdoutDigest || null;
            let stderrDigest = check.stderrDigest || null;

            if (missingEvidence) {
                status = 'BLOCKED';
                exitCode = -1;
                reason = 'Missing mandatory execution evidence digest or timestamps';
                stdoutDigest = check.stdoutDigest || crypto.createHash('sha256').update(reason).digest('hex');
                stderrDigest = check.stderrDigest || crypto.createHash('sha256').update('').digest('hex');
            } else {
                stdoutDigest = stdoutDigest || crypto.createHash('sha256').update(check.stdout || JSON.stringify(check.evidence || {})).digest('hex');
                stderrDigest = stderrDigest || crypto.createHash('sha256').update('').digest('hex');
            }

            const checkEvidence = check.evidence ?? check.evidenceJson ?? {};
            const log = normalizeWorkerCheckLog(check);
            const evidenceJsonPayload = {
                ...redactObservedEvidence(checkEvidence),
                ...log,
                ...(missingEvidence ? { reason } : {})
            };
            if (['domain_entity_check', 'placeholder_check', 'contamination_check', 'security_baseline'].includes(gateName)) {
                evidenceJsonPayload.evidence = {
                    kind: 'derived_gate',
                    producer: 'quality-policy',
                    sourceGateNames: [gateName],
                    policyVersion: ACTIVE_POLICY_VERSION,
                    computedAt: startedAt,
                    ...(checkEvidence.issues ? { issues: checkEvidence.issues } : {})
                };
            }

            let record = {
                id: checkId,
                contractId,
                runId,
                gateName,
                applicability,
                status,
                command: check.command || null,
                cwd: check.cwd || null,
                startedAt,
                endedAt,
                exitCode,
                stdoutDigest,
                stderrDigest,
                stdout_digest: stdoutDigest,
                stderr_digest: stderrDigest,
                evidenceJson: evidenceJsonPayload,
                timedOut: Boolean(check.timedOut)
            };
            if (isWorkerCheck && result.status === 'completed') record = bindWorkerCheck(record, expected);
            records.push(record);
        }

        let managementError = null;
        try { assertManagementCoverage(records, parsedContract); } catch (error) { managementError = error.message; }
        const uniqueBaseGates = MANDATORY_GATES.every(name => allChecks.filter(check => (check.gateName || check.name) === name).length === 1);
        const unknownMandatory = allChecks.some(check => check.applicability === 'MANDATORY' && !isMandatoryArtifactCheck(check.gateName || check.name, parsedContract));
        const passed = result.status === 'completed' && !managementError && uniqueBaseGates && !unknownMandatory
            && !allChecks.some(check => check.timedOut) && hasMandatoryGateCoverage(allChecks)
            && records.every(r => ['PASS', 'NOT_APPLICABLE'].includes(r.status));

        commitVerificationContext(verificationContext(), () => {
            for (const record of records) {
                createCheck(record);
            }
            for (const check of allChecks) {
                const rec = records.find(r => r.id === check.id);
                if (rec && rec.status === 'PASS') {
                    for (const requirementId of check.requirementIds || []) {
                        linkRequirementToCheck({ contractId, requirementId, verificationCheckId: check.id });
                    }
                }
            }
            if (result.status === 'completed' && passed) {
                const receipt = createWorkerReceipt(expected, records.filter(record => workerCheckIds.has(record.id)));
                createCheck({
                    id: crypto.randomUUID(), contractId, runId,
                    gateName: WORKER_RECEIPT_GATE, applicability: 'OPTIONAL', status: 'PASS',
                    evidenceJson: receipt, startedAt: new Date().toISOString(), endedAt: new Date().toISOString()
                });
            }
            if (!passed) {
                recordWorkerRejection(verificationContext(), {
                    identity: expected, terminalStatus: result.status,
                    artifact, summary: summarizeWorkerRejection({
                        identity: expected, terminalStatus: result.status,
                        rawChecks: workerChecks, records, artifactManifest: persistedFiles,
                        acceptanceBlockers: [managementError, !uniqueBaseGates && 'Mandatory base gate set is missing or duplicated.',
                            unknownMandatory && 'Worker returned an unknown mandatory gate.'].filter(Boolean)
                    })
                }, database);
                database.prepare(`
                    UPDATE task_checkpoints
                    SET status = 'invalidated', invalidation_reason = 'VERIFICATION_FAILED', invalidated_at = ?
                    WHERE project_id = ? AND contract_id = ? AND invalidated_at IS NULL
                `).run(new Date().toISOString(), projectId, contractId);
            }
            updateArtifactStatus({
                projectId, contractId, artifactId,
                status: passed ? 'verified' : 'rejected',
                verificationRunId: runId
            });
            updateRunStatus(runId, passed ? 'verified' : 'failed');
        }, database);

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
                // Expiry forbids late worker evidence, but the still-current
                // controller may durably record its own indeterminate failure.
                const controllerContext = { ...verificationContext(), deadline: undefined };
                commitVerificationContext(controllerContext, () => recordVerificationBlocker(controllerContext,
                    { expectedIdentity: expected, reason: error.message }, database), database);
            } catch {}
            try {
                commitVerificationContext({ ...verificationContext(), deadline: undefined }, () => {
                    updateRunStatus(runId, 'failed');
                    updateArtifactStatus({
                        projectId, contractId, artifactId,
                        status: 'rejected', verificationRunId: runId
                    });
                    database.prepare(`
                        UPDATE task_checkpoints
                        SET status = 'invalidated', invalidation_reason = 'VERIFICATION_FAILED', invalidated_at = ?
                        WHERE project_id = ? AND contract_id = ? AND invalidated_at IS NULL
                    `).run(new Date().toISOString(), projectId, contractId);
                }, database);
            } catch {}
        }
        throw error;
    }
}
