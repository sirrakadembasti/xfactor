import crypto from 'crypto';
import { recordExecutionProgress } from '../../verification/executionProgress.js';
import { validateControlledRepairs } from '../controlledRepairs.js';
import { controlledRepairSourceHash } from '../controlledRepairPlan.js';
import {
    readControlledLocaleObservation,
    reserveControlledSemanticReviewCycle,
    compilePersistedControlledVerificationPlan,
    assertPersistedControlledSemanticEvidence
} from '../controlledSemanticAuthority.js';
import { loadRecordedDependencyLock } from '../../verification/dependencyLockReuse.js';
import { normalizeAssertionInventoryFile } from '../../contracts/requirementAssertionBindings.js';
import fs from 'fs/promises';
import { db } from '../../db.js';
import { formatProjectTokenUsage, getProjectTokenUsage } from '../../projectTokenUsage.js';
import { redactSensitiveText } from '../../observability.js';
import { getProject as readProjectState, assertVerifiedArtifactEvidence, appendProjectActionMessages } from '../../projectRepository.js';
import { createProjectZip } from '../../utils/archive.js';
import { verificationJobDeadline } from '../../verification/verificationBudget.js';
import { collectArtifactFiles } from '../../artifactInventory.js';
import { fingerprintArtifactFiles } from '../resumeStage.js';
import { ARTIFACT_LIMITS } from '../../artifactLimits.js';
import { validateRuntimeConfig } from '../../config.js';
import { reserveWorkerValidation, snapshotHash } from '../workerRepairs.js';
import { loadOpenWorkerRepairBatch } from '../../verification/workerFailures.js';
import { extractPreparedLockfile } from './verificationStage.js';
import { isExecutionActive, checkPause } from '../workflowSupport.js';

// Dependency preparation, artifact publication and canonical worker
// verification. terminalStatus, executionError and the active controller
// boundary are reported through `outcome`, which the caller copies back even
// when this stage throws so the failure handler sees the same boundary.
export async function runAcceptanceStage(ctx, outcome) {
    const {
        abortController,
        approvedResumeContract,
        attemptId,
        callAgent,
        controlledRepair,
        controlledSemanticReview,
        controlledSession,
        effectiveLeaseOwner,
        executionClientFactory,
        priorWorkerBlockers,
        projectDir,
        projectId,
        recordLLMDiagnostic,
        recordTokenUsage,
        resumeAtDependencyPreparation,
        resumeFiles,
        services,
        state,
        verificationOnly,
        verificationSourceHash,
        verifyProject,
        workerBatch,
        workerSession,
        workflowLogEvent,
        workflowWriteState,
        wsHub
    } = ctx;
    const prePrepPauseStatus = await checkPause(projectId, abortController.signal);
    if (!isExecutionActive(prePrepPauseStatus)) {
        outcome.terminalStatus = (prePrepPauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
        return;
    }
    if (resumeAtDependencyPreparation) {
        await workflowLogEvent(wsHub, projectId, 'Manager', 'resume', 'package.json',
            controlledRepair ? 'Listelenen kaynakların onarımı ve yeni kaynak incelemeleri bitti; şimdi bağımsız worker doğrulaması başlıyor.'
                : verificationOnly ? 'Aynı onaylı sözleşmede yalnız yeni worker doğrulaması başlıyor; kaynaklar ve görev kayıtları korunuyor.'
                : 'Kaydedilmiş statik üretim sonucu doğrulandı; bağımlılık hazırlığından devam ediliyor.', 'manager');
    }
    const postPrepPauseStatus = await checkPause(projectId, abortController.signal);
    if (!isExecutionActive(postPrepPauseStatus)) {
        outcome.terminalStatus = (postPrepPauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
        return;
    }

        const latestContract = db.prepare(`
            SELECT id, revision, contract_json, contract_hash FROM project_contracts
            WHERE project_id = ? AND status = 'approved'
            ORDER BY revision DESC LIMIT 1
        `).get(projectId);
        const limits = {
            maxFiles: ARTIFACT_LIMITS.maxFiles,
            maxTotalBytes: ARTIFACT_LIMITS.maxExtractedBytes,
            maxFileBytes: ARTIFACT_LIMITS.maxFileBytes
        };
        const files = resumeAtDependencyPreparation ? resumeFiles : await collectArtifactFiles(projectDir, limits);

        const config = validateRuntimeConfig(process.env);
        const executionClient = executionClientFactory(config, { onProgress: observation => recordExecutionProgress(
            { projectId, attemptId, leaseOwner: effectiveLeaseOwner }, observation) });
        workerSession?.assertCurrent();
        controlledSession?.assertCurrent();
        const workerReservation = workerSession ? await reserveWorkerValidation({ workflow: state.workflow,
            contract: approvedResumeContract, batchFingerprint: workerBatch.batchFingerprint,
            sourceSnapshotHash: snapshotHash(workerSession.expected), stage: 'worker_verification',
            persistWorkflow: () => workflowWriteState(projectId, state) }) : null;
        const contractHash = latestContract.contract_hash;
        if (!/^[a-f0-9]{64}$/.test(contractHash)) throw new Error('Approved contract has invalid hash.');
        const contract = JSON.parse(latestContract.contract_json);
        const nonce = crypto.randomBytes(32).toString('hex');
        const runId = `verification-${crypto.randomUUID()}`;
        const deadline = verificationJobDeadline({ env: config });
        const activeJob = {
            version: 1,
            projectId,
            contractId: latestContract.id,
            contractHash,
            revision: latestContract.revision,
            artifactId: `pending-${runId}`,
            contract,
            runId,
            deadline
        };

        const packageJsonFile = files.find(f => f.path === 'package.json');
        if (!packageJsonFile) throw new Error('Artifact requires package.json for dependency preparation.');
        const packageJsonBytes = Buffer.from(packageJsonFile.content);
        const prepJob = {
            ...activeJob,
            jobId: crypto.randomUUID(),
            nonce: crypto.randomBytes(32).toString('hex'),
            inputSha256: crypto.createHash('sha256').update(packageJsonBytes).digest('hex'),
            packageJsonBytes
        };
        const recordedLock = await (services.loadRecordedDependencyLock ?? loadRecordedDependencyLock)({ projectId, contractId: latestContract.id, packageJsonBytes });
        let lockContent;
        if (recordedLock) {
            lockContent = recordedLock.bytes;
            await workflowLogEvent(wsHub, projectId, 'System', 'input_reuse', 'package-lock.json',
                'Aynı onaylı sözleşme ve birebir paket tanımıyla eşleşen kayıtlı kilit dosyası girdi olarak korunuyor. Eski test sonuçları kullanılmıyor; temiz kurulum ve bütün kontroller yeni worker koşusunda çalışacak.', 'dependency-preparation', 'manager');
        } else {
            let prepResult = null, prepError = null;
            await workflowLogEvent(wsHub, projectId, 'System', 'start', 'package.json',
                'İzole bağımlılık hazırlığı ve lockfile üretimi başladı.', 'dependency-preparation', 'manager');
            try {
                outcome.controllerBoundary = { operation: 'prepare_dependencies', projectId, contractId: latestContract.id,
                    contractHash, runId, jobId: prepJob.jobId, nonce: prepJob.nonce, inputSha256: prepJob.inputSha256 };
                prepResult = await executionClient.prepareDependencies(prepJob, { signal: abortController.signal });
            } catch (err) { prepError = err; }
            const { packageLockBase64, packageLockSha256 } = extractPreparedLockfile(prepResult, prepError);
            lockContent = Buffer.from(packageLockBase64, 'base64');
            if (packageLockSha256 && crypto.createHash('sha256').update(lockContent).digest('hex') !== packageLockSha256) {
                throw new Error('Worker returned a package-lock digest mismatch.');
            }
        }
        workerSession?.assertCurrent();
        controlledSession?.assertCurrent();
        state.workflow.dependencyInputs = [...(Array.isArray(state.workflow.dependencyInputs) ? state.workflow.dependencyInputs : []), {
            runId, attemptId, contractId: latestContract.id, packageJsonSha256: prepJob.inputSha256,
            lockSha256: crypto.createHash('sha256').update(lockContent).digest('hex'),
            mode: recordedLock ? 'recorded_input' : 'fresh_worker_preparation',
            sourceArtifactId: recordedLock?.artifactId || null, sourceRunId: recordedLock?.runId || null,
            preparationJobId: recordedLock ? null : prepJob.jobId, recordedAt: new Date().toISOString()
        }].slice(-64);
        await workflowWriteState(projectId, state);
        outcome.controllerBoundary = null;
        if (!verificationOnly) {
            state.workflow.dependencyPreparation = null;
            await workflowWriteState(projectId, state);
        }
        const existingLockIndex = files.findIndex(f => f.path === 'package-lock.json');
        if (existingLockIndex >= 0) files[existingLockIndex].content = lockContent;
        else files.push({ path: 'package-lock.json', content: lockContent });

        // Review the exact final ZIP inventory, including the worker-prepared
        // in-memory root lock. Disk remains fenced independently by session.
        if (controlledSession && !controlledSession.diagnosticOnly) {
            let localeObservation = null;
            if (controlledSemanticReview) {
                localeObservation = readControlledLocaleObservation(db, { projectId, contractId: latestContract.id,
                    sourceHash: controlledRepairSourceHash(files), ...controlledSession.previousDiagnostic });
                if (!localeObservation) throw Error('Aynı kaynaklara ait doğrulanmış tarayıcı metin gözlemi yok. Önce yalnız yeniden doğrulama gerekli.');
                reserveControlledSemanticReviewCycle({ ledger: state.workflow.controlledRepair, attemptId, observation: localeObservation,
                    sourceHash: controlledRepairSourceHash(files) });
                await workflowWriteState(projectId, state);
            }
            await validateControlledRepairs({ session: controlledSession, verificationFiles: files, projectDir,
                contract: latestContract, workflow: state.workflow, persistWorkflow: () => workflowWriteState(projectId, state),
                callAgent, signal: abortController.signal, onUsage: recordTokenUsage, onDiagnostic: recordLLMDiagnostic, localeObservation });
            controlledSession.assertCurrent();
        }

        const artifact = await createProjectZip(
            projectId,
            latestContract.id,
            files
        );
        const archiveBytes = await fs.readFile(artifact.path);
        const artifactSha256 = crypto.createHash('sha256').update(archiveBytes).digest('hex');
        if (artifactSha256 !== artifact.sha256) throw new Error('Published artifact digest mismatch.');
        const verifyIdentity = {
            ...activeJob,
            jobId: crypto.randomUUID(),
            nonce: crypto.randomBytes(32).toString('hex'),
            deadline: verificationJobDeadline({ env: config }),
            artifactId: artifact.id,
            inputSha256: artifactSha256,
            archiveBase64: archiveBytes.toString('base64')
        };
        workerSession?.assertCurrent();
        controlledSession?.assertCurrent();
        if (workerReservation) {
            Object.assign(workerReservation, { artifactId: artifact.id, artifactSha256: artifact.sha256, runId,
                jobId: verifyIdentity.jobId, nonce: verifyIdentity.nonce });
            await workflowWriteState(projectId, state);
            workerSession.assertCurrent();
        }
        outcome.controllerBoundary = { operation: 'verify_artifact', projectId, contractId: latestContract.id,
            contractHash, runId, artifactId: artifact.id, jobId: verifyIdentity.jobId, nonce: verifyIdentity.nonce, inputSha256: artifactSha256 };
        const semanticFiles = files.map(normalizeAssertionInventoryFile);
        const controlledVerificationPlan = controlledSession ? compilePersistedControlledVerificationPlan({
            database: db, projectId, files: semanticFiles, identity: verifyIdentity }).plan : null;
        let controlledWorkerReservation = null;
        if (controlledSession) {
            state.workflow.controlledRepair.validations ||= [];
            const priorWorkers = state.workflow.controlledRepair.validations.filter(row => row.stage === 'worker_verification');
            state.workflow.controlledRepair.workerVerificationHistory = [...(state.workflow.controlledRepair.workerVerificationHistory || []), ...priorWorkers].slice(-64);
            state.workflow.controlledRepair.validations = state.workflow.controlledRepair.validations.filter(row => row.stage !== 'worker_verification');
            controlledWorkerReservation = { id: crypto.randomUUID(), stage: 'worker_verification', phase: 'reserved',
                planHash: controlledVerificationPlan.planHash, sourceHash: controlledVerificationPlan.sourceHash,
                artifactId: artifact.id, artifactSha256: artifact.sha256, runId, jobId: verifyIdentity.jobId, nonce: verifyIdentity.nonce,
                createdAt: new Date().toISOString(), deadline: verifyIdentity.deadline };
            state.workflow.controlledRepair.validations.push(controlledWorkerReservation);
            await workflowWriteState(projectId, state);
            controlledSession.assertCurrent();
        }
        const controlledCanonical = controlledSession && !controlledSession.diagnosticOnly
            && Boolean(controlledVerificationPlan?.assertionReview && controlledVerificationPlan?.uiLanguageReview);
        const completion = await verifyProject({
            projectId,
            contractId: latestContract.id,
            artifactId: artifact.id,
            expectedRevision: (await readProjectState(projectId))?.revision ?? null,
            complete: !verificationOnly || Boolean(controlledCanonical),
            attemptId,
            leaseOwner: effectiveLeaseOwner,
            options: {
                runId,
                preserveGenerationRecords: verificationOnly,
                activeJob: verifyIdentity,
                archiveBase64: verifyIdentity.archiveBase64,
                signal: abortController.signal,
                executionClient,
                ...(controlledVerificationPlan ? { verificationPlan: controlledVerificationPlan } : {}),
                ...(controlledCanonical ? { controlledRepairAcceptance: {
                    planHash: controlledVerificationPlan.planHash, validationId: controlledWorkerReservation.id,
                    assertCurrent: controlledSession.assertCurrent,
                    assertSemanticEvidence: args => assertPersistedControlledSemanticEvidence({ ...args, files: semanticFiles })
                } } : {}),
                ...(workerReservation ? { workerRepairValidationId: workerReservation.id } : {}),
                files,
                contract
            }
        });
        outcome.controllerBoundary = null;
        controlledSession?.assertCurrent();
        if (!completion.completed) {
            // A registry/network outage is reported as such; it carries no Manager-revision veto.
            const infrastructure = loadOpenWorkerRepairBatch({ projectId, contractId: latestContract.id, contractHash })
                .infrastructureIssues.filter(issue => issue.run_id === runId);
            if (infrastructure.length) completion.error = infrastructure.map(issue => issue.detail.reason).join('; ');
        }
        if (verificationOnly && !completion.completed) {
            if (fingerprintArtifactFiles(await collectArtifactFiles(projectDir)) !== verificationSourceHash) {
                throw new Error('Yeniden doğrulama sırasında kaynak envanteri değişti; sonuç mevcut kaynakların kabulü sayılamaz.');
            }
            const diagnosticState = await readProjectState(projectId);
            diagnosticState.status = 'paused';
            diagnosticState.last_error = completion.passed ? null : completion.error || 'Yeniden doğrulama başarısız.';
            if (priorWorkerBlockers) diagnosticState.last_error = `Worker repair requires Manager revision: ${completion.passed
                ? 'Yeni tanılama geçti; önceki açık onarım kayıtları çözülmedi. Teslim ve kaynak onarımı ayrıca değerlendirilmelidir.'
                : diagnosticState.last_error}`;
            await workflowWriteState(projectId, diagnosticState);
            outcome.terminalStatus = completion.passed ? 'completed' : 'failed';
            outcome.executionError = diagnosticState.last_error;
            appendProjectActionMessages(projectId, {
                actionId: `reverify-${runId}`, userText: 'Aynı onaylı sözleşmede kaynakları değiştirmeden yeniden doğrula.',
                modelText: completion.passed
                    ? controlledRepair ? 'Listelenen dosyaların onarımından sonra yeni worker doğrulaması geçti. Teslim kabulü ve açık onarım kayıtları ayrıca değerlendirilmelidir.'
                        : 'Yeni worker doğrulaması geçti. Kaynaklar ve görevler korunmuştur; açık onarım kayıtları ve teslim kabulü ayrıca değerlendirilmelidir.'
                    : controlledRepair ? `Listelenen dosyalara onarım uygulandı ancak bağımsız doğrulama geçmedi; proje teslim edilmedi. ${redactSensitiveText(outcome.executionError)}`
                        : `Yeniden doğrulama tamamlandı; proje teslim edilmedi. Kaynaklar ve görevler korunmuştur. ${redactSensitiveText(outcome.executionError)}`
            });
            wsHub?.publish({ type: 'project_state_updated', projectId });
            return;
        }
        if (!completion.completed) {
            throw new Error(completion.error || 'Canonical verification did not complete the project.');
        }
        if (workerSession) {
            assertVerifiedArtifactEvidence({ projectId, contractId: latestContract.id, artifactId: artifact.id });
            if ((await readProjectState(projectId))?.status !== 'completed') throw new Error('Worker repair lacks canonical project completion.');
        }
        outcome.terminalStatus = 'completed';
        await workflowLogEvent(wsHub, projectId, "Manager", "finish", "RAPOR.md, README.md", "Tüm süreç ve testler başarıyla tamamlandı! Proje doğrulanmış ZIP olarak indirilebilir; kaynak kodları indirilen pakette inceleyebilirsiniz.", "manager");
        try {
            appendProjectActionMessages(projectId, {
                actionId: `action-finish-${Date.now()}`,
                userText: '✅ Proje geliştirme ve doğrulama süreci tamamlandı.',
                modelText: `🎉 Tebrikler Boss! Uygulamanız başarıyla üretildi ve doğrulandı. Projeyi ZIP olarak indirebilir, kaynak kodlarını indirdiğiniz pakette inceleyebilirsiniz.\n\n${formatProjectTokenUsage(getProjectTokenUsage(projectId))}`
            });
        } catch {}
}
