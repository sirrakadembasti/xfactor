import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { collectArtifactFiles, isExcludedArtifactEntry, ARTIFACT_IGNORED_DIRS } from '../artifactInventory.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { digest, safeWorkerPath } from '../verification/workerFailures.js';
import { qualifiedTaskId } from './checkpointIdentity.js';
import { buildCoderProjectContext } from './coderContext.js';
import { writeGeneratedFiles, isProtectedOrchestrationPath } from './codeGenerator.js';
import { assertVerificationContext } from '../verification/verificationContext.js';
import { loadOpenWorkerRepairBatch } from '../verification/workerFailures.js';
import { assertVerifiedArtifactRunEvidence, getProjectDir } from '../projectRepository.js';

const stop = message => { throw new Error(`Worker repair requires Manager revision: ${message}`); };
export function sourceSnapshot(files) {
    return files.filter(file => file.path !== 'package-lock.json').map(file => ({ path: file.path,
        sha256: file.sha256 || digest(file.content) })).sort((a, b) => a.path.localeCompare(b.path));
}
export const snapshotHash = snapshot => digest(sourceSnapshot(snapshot));
export function assertWorkerSourceSnapshot(files, expected) {
    if (snapshotHash(files) !== snapshotHash(expected)) stop('source changed outside the reserved repair; stale diagnostics cannot be applied.');
}

// Synchronous twin of the artifact inventory boundary, used inside the source
// commit transaction after asynchronous staging. It detects additions as well
// as modified/deleted context files; temporary staged writes are not artifacts.
export function readWorkerSnapshotSync(root) {
    const files = [], ignored = ARTIFACT_IGNORED_DIRS;
    let totalBytes = 0;
    function walk(relative) {
        const absolute = path.join(root, relative), name = path.basename(absolute);
        if (isExcludedArtifactEntry(name, relative)) return;
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) stop('symlink in source inventory.');
        if (stat.isDirectory()) {
            if (ignored.has(name)) return;
            for (const child of fs.readdirSync(absolute).sort()) walk(relative ? `${relative}/${child}` : child);
        } else if (stat.isFile()) {
            if (files.length >= ARTIFACT_LIMITS.maxFiles || stat.size > ARTIFACT_LIMITS.maxFileBytes
                || totalBytes + stat.size > ARTIFACT_LIMITS.maxExtractedBytes) stop('source inventory limits exceeded.');
            const content = fs.readFileSync(absolute);
            if (content.length !== stat.size) stop('source changed while reading.');
            totalBytes += content.length;
            files.push({ path: relative, sha256: digest(content) });
        }
        else stop('unsupported source entry.');
    }
    walk('');
    return sourceSnapshot(files);
}

export function planWorkerRepairs({ batch, tasks, contract }) {
    if (!batch.issues.length) return { targets: [] };
    if (batch.issues.length > 64) stop('finding budget exhausted.');
    const owners = tasks.map(row => ({ ...row, spec: typeof row.task_spec_json === 'string'
        ? JSON.parse(row.task_spec_json) : row.task_spec_json }));
    const ownerKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
    const ownerIndex = new Map();
    for (const owner of owners) {
        if (owner.spec?.targetFiles?.length !== 1) stop('projected owner must have exactly one target.');
        const normalized = safeWorkerPath(owner.spec.targetFiles[0]);
        if (!normalized) stop('unsafe projected owner alias.');
        const key = ownerKey(normalized);
        if (ownerIndex.has(key)) stop(`duplicate physical file owner alias: ${normalized}.`);
        ownerIndex.set(key, owner);
    }
    const byTarget = new Map();
    for (const issue of batch.issues) {
        if (issue.detail?.kind !== 'worker_product_failure') stop(issue.detail?.reason || 'unrepairable worker failure.');
        const target = safeWorkerPath(issue.detail.filePath);
        if (!target || isProtectedOrchestrationPath(target) || !/\.[cm]?tsx?$/.test(target)) stop('unsafe repair target.');
        const candidates = [ownerIndex.get(ownerKey(target))].filter(Boolean);
        if (candidates.length !== 1) stop(`target ${target} needs one unique current owner (duplicate or missing owner).`);
        const owner = candidates[0], spec = owner.spec;
        if (spec.targetFiles.length !== 1 || !spec.executionTaskSpecHash || !Array.isArray(spec.dependencies)
            || !Array.isArray(spec.requirementIds) || !spec.requirementIds.length
            || owner.id !== qualifiedTaskId({ contractId: contract.id, teamleaderId: spec.teamleaderId, localTaskId: spec.executionTaskId })) stop('invalid current projected owner.');
        const dependencies = spec.dependencies.map(id => {
            const matches = owners.filter(item => item.id === id);
            if (matches.length !== 1 || matches[0].spec?.targetFiles?.length !== 1) stop('missing or ambiguous dependency context.');
            const file = safeWorkerPath(matches[0].spec.targetFiles[0]);
            if (!file) stop('unsafe dependency context.');
            return file;
        });
        if (!byTarget.has(target)) byTarget.set(target, { target, owner, dependencies, issues: [] });
        byTarget.get(target).issues.push(issue);
    }
    if (byTarget.size > 8) stop('target batch budget exhausted.');
    return { targets: [...byTarget.values()].sort((a, b) => a.target.localeCompare(b.target)) };
}

function ledgerFor(workflow, contract) {
    let ledger = workflow.workerRepairs;
    if (!ledger || ledger.contractId !== contract.id || ledger.contractHash !== contract.contract_hash) {
        ledger = workflow.workerRepairs = { version: 1, contractId: contract.id, contractHash: contract.contract_hash, attempts: [], validations: [] };
    }
    if (ledger.version !== 1 || !Array.isArray(ledger.attempts) || !Array.isArray(ledger.validations)
        || ledger.attempts.length > 64 || ledger.validations.length > 192) stop('invalid repair ledger.');
    return ledger;
}
export async function reserveWorkerValidation({ workflow, contract, batchFingerprint, sourceSnapshotHash, stage, persistWorkflow }) {
    const ledger = ledgerFor(workflow, contract);
    if (!['reviewer_acceptance', 'static_acceptance', 'worker_verification'].includes(stage)) stop('invalid validation stage.');
    const signature = digest([contract.id, contract.contract_hash, batchFingerprint, sourceSnapshotHash, stage]);
    const existing = ledger.validations.find(item => item.signature === signature);
    if (existing) {
        if (stage !== 'worker_verification' && existing.phase === 'passed' && existing.result?.approved === true) return existing;
        stop(`${stage} reservation already consumed; its result must be reviewed before another dispatch.`);
    }
    if (ledger.validations.filter(item => item.stage === stage).length >= 64) stop('validation budget exhausted.');
    const reservation = { id: crypto.randomUUID(), signature, stage, batchFingerprint, sourceSnapshotHash,
        phase: 'reserved', createdAt: new Date().toISOString() };
    ledger.validations.push(reservation);
    await persistWorkflow();
    return reservation;
}

export async function executeWorkerRepairs({ projectDir, contract, batch, workflow, sourceFence,
    persistWorkflow, callAgent, signal, onUsage, onDiagnostic, database = db }) {
    if (!sourceFence?.attemptId || !sourceFence?.leaseOwner) stop('durable source fence is required.');
    const context = { ...sourceFence, revision: sourceFence.contractRevision };
    const assertActive = () => assertVerificationContext(context, database);
    assertActive();
    const readTasks = () => database.prepare('SELECT * FROM contract_tasks WHERE contract_id=?').all(contract.id);
    const tasks = readTasks(), ownershipHash = digest(tasks);
    const plan = planWorkerRepairs({ batch, tasks, contract });
    const ledger = ledgerFor(workflow, contract);
    if (ledger.ownershipHash && ledger.ownershipHash !== ownershipHash) stop('projected owner inventory changed after reservation.');
    const files = await collectArtifactFiles(projectDir);
    assertActive();
    // Most recent rejected artifact is the baseline for the next correction.
    const artifactIds = [...new Set(batch.issues.map(issue => issue.detail.artifactId))];
    const artifacts = artifactIds.map(id => database.prepare('SELECT rowid AS sequence,* FROM artifacts WHERE id=? AND project_id=? AND contract_id=?').get(id, sourceFence.projectId, contract.id))
        .filter(Boolean).sort((a, b) => b.sequence - a.sequence);
    if (!artifacts.length) stop('rejected artifact provenance missing.');
    const baseline = artifacts[0];
    let expected = sourceSnapshot(database.prepare('SELECT path,sha256 FROM artifact_files WHERE artifact_id=? AND contract_id=?').all(baseline.id, contract.id));
    if (!expected.length) stop('rejected source inventory missing.');
    for (const attempt of ledger.attempts) {
        if (attempt.baselineArtifactId !== baseline.id || !['proposed', 'patched'].includes(attempt.phase)) continue;
        if (attempt.baselineSnapshotHash !== snapshotHash(expected)) stop('repair history source chain mismatch.');
        const row = expected.find(file => file.path === attempt.target);
        if (!row || row.sha256 !== attempt.sourceSha256) stop('repair history target mismatch.');
        row.sha256 = attempt.proposedOutputSha256;
    }
    assertWorkerSourceSnapshot(files, expected);
    const groups = [];
    for (const repair of plan.targets) {
        const previous = ledger.attempts.filter(item => item.ownerTaskId === repair.owner.id && item.target === repair.target);
        if (previous.some(item => item.ownerSpecHash !== repair.owner.spec.executionTaskSpecHash)) stop('projected owner changed after reservation.');
        const fingerprints = [...new Set(repair.issues.map(issue => issue.fingerprint))].sort();
        const issueInputs = [...new Set(repair.issues.map(issue => digest([issue.fingerprint, issue.detail.sourceSha256])))].sort();
        const current = files.find(file => file.path === repair.target);
        if (!current) stop('owned source is missing.');
        const currentHash = digest(current.content);
        const applied = previous.findLast(item => ['proposed', 'patched'].includes(item.phase)
            && item.proposedOutputSha256 === currentHash && issueInputs.every(value => item.issueInputs?.includes(value)));
        if (applied) { applied.phase = 'patched'; applied.outputSha256 = currentHash; continue; }
        // No inner retries, including changed diagnostic wording at identical bytes.
        if (previous.some(item => item.sourceSha256 === currentHash)) stop('Coder reservation already consumed for these source inputs.');
        if (previous.length >= 2) stop('owner target repair budget exhausted.');
        if (!repair.issues.some(issue => issue.detail.artifactId === baseline.id && issue.detail.sourceSha256 === currentHash)) stop('diagnostic is stale for current target bytes.');
        const projectContext = await buildCoderProjectContext({ projectDir, files,
            dependencyTargetFiles: repair.dependencies, targetFiles: [repair.target] });
        if (projectContext.includes('OMITTED CONTEXT') || repair.dependencies.some(file => !projectContext.includes(`File: ${file} (`))) stop('Coder context omitted required or reference files.');
        groups.push({ ...repair, fingerprints, issueInputs, projectContext, current, currentHash });
    }
    if (ledger.attempts.length + groups.length > 64) stop('whole batch Coder budget exhausted.');
    // Reserve the entire batch before any paid call. A crash consumes every
    // reservation; an unknown provider result is never silently regenerated.
    for (const group of groups) {
        group.reservation = { id: crypto.randomUUID(), contractId: contract.id, contractHash: contract.contract_hash,
            ownerTaskId: group.owner.id, ownerSpecHash: group.owner.spec.executionTaskSpecHash, target: group.target,
            issueFingerprints: group.fingerprints, issueInputs: group.issueInputs, baselineArtifactId: baseline.id, sourceSha256: group.currentHash,
            contextHash: digest(group.projectContext), inputSignature: digest([contract.id, contract.contract_hash, group.owner.spec,
                group.target, group.currentHash, group.fingerprints, digest(group.projectContext)]), phase: 'reserved', createdAt: new Date().toISOString() };
        ledger.attempts.push(group.reservation);
    }
    const assertCurrent = () => { assertActive(); if (digest(readTasks()) !== ownershipHash) stop('projected task ownership changed.');
        assertWorkerSourceSnapshot(readWorkerSnapshotSync(projectDir), expected); };
    assertCurrent();
    ledger.ownershipHash = ownershipHash;
    await persistWorkflow();
    for (const group of groups) {
        assertCurrent();
        // Earlier authorized targets can affect the exact dependency context.
        const currentContext = await buildCoderProjectContext({ projectDir, files,
            dependencyTargetFiles: group.dependencies, targetFiles: [group.target] });
        if (currentContext.includes('OMITTED CONTEXT') || group.dependencies.some(file => !currentContext.includes(`File: ${file} (`))) stop('Coder context omission.');
        group.reservation.contextHash = digest(currentContext);
        group.reservation.baselineSnapshotHash = snapshotHash(expected);
        await persistWorkflow();
        assertCurrent();
        const prompt = `Repair this current approved owner task only. Return exactly one file at ${group.target}. Dependency context is read-only.\n`
            + JSON.stringify({ ownerTaskId: group.owner.id, task: group.owner.spec, findings: group.issues.map(issue => issue.detail.diagnostic) })
            + `\nCurrent target ${group.target}:\n${group.current.content.toString('utf8')}\n${currentContext}`;
        const result = await callAgent('coder', prompt, { taskId: group.owner.id, signal, onUsage, onDiagnostic, maxAttempts: 1 });
        assertCurrent();
        if (!Array.isArray(result?.files) || result.files.length !== 1 || result.files[0].path !== group.target
            || typeof result.files[0].content !== 'string') stop('Coder must return exactly its one owned file.');
        const outputSha256 = digest(result.files[0].content);
        if (outputSha256 === group.currentHash) stop('Coder returned unchanged source.');
        group.reservation.phase = 'proposed'; group.reservation.proposedOutputSha256 = outputSha256;
        await persistWorkflow();
        await writeGeneratedFiles(projectDir, null, result.files, [group.target], { ...sourceFence, assertBeforeCommit: assertCurrent });
        const nextContent = result.files[0].content;
        const existingIdx = files.findIndex(f => f?.path === group.target);
        if (existingIdx >= 0) {
            files[existingIdx] = { ...files[existingIdx], path: group.target, content: nextContent };
        } else {
            files.push({ path: group.target, content: nextContent });
        }
        expected.find(file => file.path === group.target).sha256 = outputSha256;
        group.reservation.phase = 'patched'; group.reservation.outputSha256 = outputSha256;
        await persistWorkflow();
    }
    assertCurrent();
    return { batch, contract, expected, assertCurrent, ownershipHash, targets: plan.targets, files };
}

// Synchronous, called inside the authoritative verification-context transaction.
// A returned `passed:true` or a verified SQL status is never sufficient evidence.
export function resolveWorkerRepairIssues(context, { artifactId, runId, validationId }, database = db) {
    assertVerificationContext(context, database);
    const batch = loadOpenWorkerRepairBatch(context, database);
    if (!batch.issues.length) return;
    const { artifact, run } = assertVerifiedArtifactRunEvidence({ projectId: context.projectId, contractId: context.contractId, artifactId });
    if (run.id !== runId) stop('fresh verification run mismatch.');
    const workflow = JSON.parse(database.prepare('SELECT workflow_state FROM projects WHERE id=?').get(context.projectId).workflow_state || '{}');
    const ledger = workflow.workerRepairs;
    if (!ledger || ledger.contractId !== context.contractId || ledger.contractHash !== context.contractHash) stop('repair ledger missing at acceptance.');
    const validation = ledger.validations.find(item => item.id === validationId && item.stage === 'worker_verification');
    if (!validation || validation.phase !== 'reserved' || validation.batchFingerprint !== batch.batchFingerprint
        || validation.runId !== runId || validation.artifactId !== artifactId || validation.artifactSha256 !== artifact.sha256) stop('fresh worker reservation mismatch.');
    const receiptRow = database.prepare("SELECT evidence_json FROM verification_checks WHERE run_id=? AND gate_name='worker_verification_receipt' AND status='PASS'").get(runId);
    const receipt = JSON.parse(receiptRow?.evidence_json || '{}');
    if (receipt.jobId !== validation.jobId || receipt.nonce !== validation.nonce) stop('independent worker receipt missing.');
    const manifest = sourceSnapshot(database.prepare('SELECT path,sha256 FROM artifact_files WHERE artifact_id=? AND contract_id=?').all(artifactId, context.contractId));
    if (snapshotHash(manifest) !== validation.sourceSnapshotHash) stop('verified artifact differs from repaired source.');
    assertWorkerSourceSnapshot(readWorkerSnapshotSync(getProjectDir(context.projectId)), manifest);
    for (const stage of ['reviewer_acceptance', 'static_acceptance']) if (!ledger.validations.some(item => item.stage === stage
        && item.phase === 'passed' && item.result?.approved === true
        && item.batchFingerprint === batch.batchFingerprint && item.sourceSnapshotHash === validation.sourceSnapshotHash)) stop(`fresh ${stage} missing.`);
    const plan = planWorkerRepairs({ batch, tasks: database.prepare('SELECT * FROM contract_tasks WHERE contract_id=?').all(context.contractId),
        contract: { id: context.contractId } });
    for (const group of plan.targets) {
        const applied = ledger.attempts.findLast(item => item.phase === 'patched' && item.ownerTaskId === group.owner.id
            && item.ownerSpecHash === group.owner.spec.executionTaskSpecHash && item.target === group.target
            && item.outputSha256 === manifest.find(file => file.path === group.target)?.sha256);
        if (!applied || group.issues.some(issue => !applied.issueInputs?.includes(digest([issue.fingerprint, issue.detail.sourceSha256]))
            || issue.run_id === runId || issue.detail.artifactId === artifactId || issue.detail.artifactSha256 === artifact.sha256
            || issue.detail.jobId === receipt.jobId || issue.detail.nonce === receipt.nonce)) stop('fresh worker result does not cover every applied finding.');
    }
    for (const issue of batch.issues) database.prepare("UPDATE repair_issues SET status='resolved',resolved_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=? AND contract_id=? AND status='open'")
        .run(issue.id, context.projectId, context.contractId);
    validation.phase = 'passed';
    database.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify(workflow), context.projectId);
}
