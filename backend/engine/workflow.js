import { executeControlledRepairs } from './controlledRepairs.js';
import { controlledRepairSourceHash } from './controlledRepairPlan.js';
import { inspectControlledSemanticReviewEligibility } from './controlledSemanticAuthority.js';
/**
 * XFactor Otonom DAG İş Akışı Motoru (Workflow Engine)
 * Referans: Archon Deterministic Engine & Agency-Agents
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { workflowCheckpointInventory } from './checkpointIdentity.js';
import {
    ensureDir,
    setupRootProtocol,
    setupDirectorProtocol,
    setupTeamleaderProtocol,
    setupCoderProtocol,
    writeDurum,
    writeRapor,
    checkTodoItem,
    readAltTalimatname,
    readTasksFromTodoFile,
    reconcileTaskCache,
    isTaskCheckpointValid
} from './fileProtocol.js';
import { getAgent } from '../agents/index.js';
import {
    validateManagerPlan,
    validateDirectorSpec,
    validateTeamleaderTasks,
    validateTaskDependencies,
    normalizeManagerPlan,
    normalizeDirectorSpec,
    normalizeTeamleaderTasks
} from '../agents/schemas.js';
import {
    validatePlanTasks,
    validateManagementTaskCoverage,
    formatManagementTaskDescription,
    resolveFrontendRuntimePlan
} from '../agents/director.js';
import { db } from '../db.js';
import { ensureProjectScaffold, listProjectTree, writeGeneratedFiles, detectProjectStack } from './codeGenerator.js';
import { buildCoderProjectContext } from './coderContext.js';
import { executeCorrectionLoop } from './selfCorrection.js';
import { getCurrentLLMProvider } from '../llm.js';
import { recordProjectTokenUsage } from '../projectTokenUsage.js';
import { logError, logWarning, redactSensitiveText } from '../observability.js';
import { workflowRecoveryAdvice } from './recoveryAdvice.js';
import { startLeaseHeartbeat, releaseWorkflowLease, assertWorkflowLease } from '../workflowAttempts.js';
import { registerProjectAbortController, unregisterProjectAbortController } from './cancellation.js';
import {
    getProjectDir,
    getProjectsRoot,
    getProject as readProjectState,
    saveProjectState as writeProjectState
} from '../projectRepository.js';
import { verifyArtifactAndProject, recoverVerifiedWorkerRepair } from '../verification/verificationCli.js';
import { saveCheckpoint } from './checkpointRepository.js';
import { computeTaskSpecHash, computeInputHash, computeOutputHash } from './checkpointHelper.js';
import { collectArtifactFiles } from '../artifactInventory.js';
import { fingerprintArtifactFiles, resolveDependencyResume, resolveGenerationResume } from './resumeStage.js';
import { createExecutionClient } from '../executionClient.js';
import { projectContractTasks } from '../contracts/taskProjection.js';
import { loadOpenWorkerRepairBatch, recordVerificationBlocker } from '../verification/workerFailures.js';
import { commitVerificationContext } from '../verification/verificationContext.js';
import { executeWorkerRepairs, readWorkerSnapshotSync } from './workerRepairs.js';
import { extractPreparedLockfile } from './stages/verificationStage.js';
export {
    executeStaticRepairLoop,
    executeTesterAdvisoryRepairs,
    resolveStaticAuditRepairIssues
} from './stages/repairStage.js';
import { runQualityStage } from './stages/qualityStage.js';
import { runAcceptanceStage } from './stages/acceptanceStage.js';
export { extractPreparedLockfile } from './stages/verificationStage.js';
export { getProjectDir, getProjectsRoot, readProjectState, writeProjectState };
import {
    computePlanHash,
    orderDomainsCoreFirst,
    normalizeWorkflowState,
    reconcilePlanningCache,
    buildExecutionDAG,
    mergeGeneratedProjectFiles,
    normalizeTeamleaderPlanForStack,
    runWithConcurrency,
    createWorkflowLogEvent,
    isExecutionActive,
    checkPause,
    callAgentLLM
} from './workflowSupport.js';
export {
    getStatePath,
    computePlanHash,
    orderDomainsCoreFirst,
    normalizeWorkflowState,
    reconcilePlanningCache,
    buildExecutionDAG,
    restoreDirectorSpecFromDisk,
    mergeGeneratedProjectFiles,
    canonicalizeNextTaskPath,
    normalizeTeamleaderPlanForStack,
    runWithConcurrency,
    logEvent,
    createWorkflowLogEvent,
    checkPause,
    callAgentLLM
} from './workflowSupport.js';

/**
 * Ana Otonom İş Akışı Yürütücüsü (Workflow Engine)
 */
export async function executeProjectTasks(projectId, wsHub = null, attemptId = null, leaseOwner = null, services = {}) {
    const controlledRepair = typeof services.controlledRepairHash === 'string';
    const controlledSemanticReview = services.controlledRepairSemanticReview === true;
    if (controlledSemanticReview && !controlledRepair) throw Error('Bağımsız inceleme aynı sınırlı onarım önerisiyle yetkilendirilmeli.');
    const verificationOnly = services.verificationOnly === true || controlledRepair;
    const callAgent = services.callAgent ?? callAgentLLM;
    const executionClientFactory = services.createExecutionClient ?? createExecutionClient;
    const verifyProject = services.verifyArtifactAndProject ?? verifyArtifactAndProject;
    if ([callAgent, executionClientFactory, verifyProject].some(service => typeof service !== 'function')) throw new TypeError('Workflow services must be callable.');
    if (!attemptId || !leaseOwner) {
        throw Object.assign(new Error('Workflow execution requires a durable attemptId and lease owner.'),
            { code: 'WORKFLOW_LEASE_FENCED' });
    }
    try { assertWorkflowLease(attemptId, leaseOwner, { projectId }); }
    catch (error) {
        logWarning('workflow.execution_fenced', error, { projectId, attemptId });
        return;
    }
    const projectDir = getProjectDir(projectId);
    const state = await readProjectState(projectId);

    if (!state) return;
    const executionStatus = db.prepare('SELECT status FROM projects WHERE id=?').get(projectId)?.status;
    if (executionStatus !== 'implementing') {
        const error = new Error(`Workflow execution is not authorized from project status ${executionStatus || 'missing'}.`);
        error.code = 'WORKFLOW_EXECUTION_NOT_AUTHORIZED';
        if (attemptId) releaseWorkflowLease(attemptId, 'failed', { error: error.message, leaseOwner });
        throw error;
    }

    state.workflow = verificationOnly ? (state.workflow || {}) : normalizeWorkflowState(state.workflow);

    const abortController = new AbortController();
    registerProjectAbortController(projectId, abortController, { attemptId, leaseOwner });
    const effectiveLeaseOwner = leaseOwner;
    const leaseOptions = attemptId
        ? { attemptId, leaseOwner: effectiveLeaseOwner }
        : null;
    const sourceFence = { projectId, attemptId, leaseOwner: effectiveLeaseOwner, signal: abortController.signal };
    const protocolOptions = { projectDir, sourceFence, strict: true };
    const assertWorkflowContract = () => {
        if (!sourceFence.contractId) return;
        const current = db.prepare(`SELECT id, contract_hash, revision FROM project_contracts
            WHERE project_id=? AND status='approved' ORDER BY revision DESC, id ASC LIMIT 1`).get(projectId);
        if (current?.id !== sourceFence.contractId || current.contract_hash !== sourceFence.contractHash
            || current.revision !== sourceFence.contractRevision) {
            const error = new Error('Workflow approved contract changed before state commit.');
            error.code = 'WORKFLOW_LEASE_FENCED';
            throw error;
        }
    };
    const workflowWriteState = (id, nextState) => writeProjectState(id, nextState,
        { ...leaseOptions, onTransaction: assertWorkflowContract });
    const workflowLogEvent = createWorkflowLogEvent(leaseOptions);
    const recordTokenUsage = usage => {
        try { recordProjectTokenUsage(projectId, getCurrentLLMProvider(), usage); }
        catch (error) { logWarning('workflow.token_usage_record_failed', error, { projectId }); }
    };
    const recordLLMDiagnostic = async diagnostic => {
        const task = diagnostic.taskId || `${diagnostic.agentRole}.task`;
        await workflowLogEvent(
            wsHub,
            projectId,
            'LLM',
            diagnostic.disposition,
            `llm/${task}`,
            `agent=${diagnostic.agentRole}; task=${task}; attempt=${diagnostic.attempt}/${diagnostic.maxAttempts}; elapsedMs=${diagnostic.elapsedMs}; retry=${diagnostic.retry}; disposition=${diagnostic.disposition}${diagnostic.error ? `; error=${diagnostic.error}` : ''}`,
            `llm-${diagnostic.agentRole}`,
            'manager'
        );
    };

    let leaseHeartbeat = null;
    let terminalStatus = 'aborted';
    let executionError = null;
    let controllerBoundary = null;
    let priorWorkerBlockers = false;

    if (attemptId) {
        leaseHeartbeat = startLeaseHeartbeat({ attemptId, leaseOwner: effectiveLeaseOwner, onLost: reason => {
            if (!abortController.signal.aborted) abortController.abort(reason);
        } });
    }

    try {
        if (attemptId) assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
        const approvedResumeContract = db.prepare(`
            SELECT id, contract_hash, contract_json, revision FROM project_contracts
            WHERE project_id = ? AND status = 'approved'
            ORDER BY revision DESC LIMIT 1
        `).get(projectId);
        if (abortController.signal.aborted) throw new Error('Workflow execution aborted before dispatch.');
        if (!approvedResumeContract) throw Object.assign(
            new Error('Workflow approval required: a persisted approved contract is missing.'),
            { code: 'WORKFLOW_APPROVAL_REQUIRED' });
        sourceFence.contractId = approvedResumeContract.id;
        sourceFence.contractHash = approvedResumeContract.contract_hash;
        sourceFence.contractRevision = approvedResumeContract.revision;
        if (controlledRepair && (state.workflow.controlledRepair?.proposal?.planHash !== services.controlledRepairHash
            || state.workflow.controlledRepair?.authorizedAttemptId !== attemptId)) {
            throw new Error('Sınırlı onarım önerisi bu yürütme için yetkilendirilmemiş veya değişmiş.');
        }
        state.plan = normalizeManagerPlan(JSON.parse(approvedResumeContract.contract_json));
        if (verificationOnly && !resolveGenerationResume(state.workflow.generationCompletion, approvedResumeContract, computePlanHash(state.plan))) {
            throw new Error('Yalnız yeniden doğrulama için aynı onaylı sözleşmeye ait tamamlanmış üretim kaydı gereklidir.');
        }
        const recoveredWorker = verificationOnly ? null : await recoverVerifiedWorkerRepair({ projectId, contract: approvedResumeContract,
            workflow: state.workflow, attemptId, leaseOwner: effectiveLeaseOwner, signal: abortController.signal });
        if (recoveredWorker?.completed) {
            await workflowLogEvent(wsHub, projectId, 'Manager', 'finish', '', 'Kaydedilmiş bağımsız worker kanıtıyla doğrulama tamamlandı.', 'manager');
            return;
        }
        const workerBatch = loadOpenWorkerRepairBatch({ projectId, contractId: approvedResumeContract.id, contractHash: approvedResumeContract.contract_hash });
        priorWorkerBlockers = workerBatch.issues.length > 0;
        let workerSession = null;
        let controlledSession = null;
        if (!verificationOnly && workerBatch.issues.length) {
            if (!resolveGenerationResume(state.workflow.generationCompletion, approvedResumeContract, computePlanHash(state.plan))) {
                throw new Error('Worker repair requires Manager revision: approved generation marker missing.');
            }
            workerSession = await executeWorkerRepairs({ projectDir, contract: approvedResumeContract, batch: workerBatch,
                workflow: state.workflow, sourceFence, persistWorkflow: () => workflowWriteState(projectId, state),
                callAgent, signal: abortController.signal, onUsage: recordTokenUsage, onDiagnostic: recordLLMDiagnostic });
            state.workflow.dependencyPreparation = null;
        }
        let resumeFiles = null;
        if (controlledRepair && !controlledSemanticReview) {
            await workflowLogEvent(wsHub, projectId, 'Manager', 'start', '', 'Mevcut çalışmada yalnız onarım önerisinde listelenen dosyalar düzeltiliyor; normal üretim aşamaları çalışmayacak.', 'controlled-repair');
            controlledSession = await executeControlledRepairs({ projectDir, contract: { ...approvedResumeContract, status: 'approved' },
                workflow: state.workflow, sourceFence, persistWorkflow: () => workflowWriteState(projectId, state), callAgent,
                signal: abortController.signal, onUsage: recordTokenUsage, onDiagnostic: recordLLMDiagnostic });
            controlledSession.assertCurrent();
        }
        if (verificationOnly) {
            resumeFiles = await collectArtifactFiles(projectDir);
            controlledSession?.assertCurrent();
            if (controlledSession && controlledRepairSourceHash(resumeFiles) !== controlledRepairSourceHash(controlledSession.expected)) {
                throw new Error('Toplanan kaynak görüntüsü onaylanan onarımdan farklı.');
            }
            const ledger = state.workflow.controlledRepair;
            if (!controlledSession && ledger?.phase === 'patched' && ledger.controlledAcceptancePolicy === 'controlled-acceptance-v1'
                && ledger.proposal?.contractId === approvedResumeContract.id
                && ledger.proposal?.contractHash === approvedResumeContract.contract_hash
                && ledger.proposal?.contractRevision === approvedResumeContract.revision
                && controlledRepairSourceHash(resumeFiles) === ledger.outputSourceHash) {
                const expected = readWorkerSnapshotSync(projectDir, { includeLockfile: true });
                const latestArtifact = db.prepare('SELECT * FROM artifacts WHERE project_id=? AND contract_id=? ORDER BY rowid DESC LIMIT 1').get(projectId, approvedResumeContract.id);
                const latestRun = db.prepare('SELECT * FROM verification_runs WHERE project_id=? AND contract_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1').get(projectId, approvedResumeContract.id);
                if (controlledSemanticReview) {
                    const eligibility = inspectControlledSemanticReviewEligibility({ workflow: state.workflow, latestArtifact, latestRun,
                        currentSourceHash: controlledRepairSourceHash(expected), contractId: approvedResumeContract.id });
                    if (!eligibility.eligible) throw Error(eligibility.reason);
                }
                controlledSession = { proposal: ledger.proposal, files: resumeFiles, expected,
                    diagnosticOnly: !controlledSemanticReview, previousDiagnostic: { artifactId: latestArtifact?.id, runId: latestRun?.id },
                    assertCurrent: () => {
                        assertWorkflowContract(); assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
                        if (abortController.signal.aborted || controlledRepairSourceHash(readWorkerSnapshotSync(projectDir, { includeLockfile: true })) !== ledger.outputSourceHash)
                            throw Error('Bağımsız inceleme sırasında onarım kaynakları değişti.');
                    } };
                controlledSession.assertCurrent();
            }
            if (controlledSemanticReview && !controlledSession) throw Error('Aynı kaynaklara ait incelenebilir sınırlı onarım kaydı gerekli.');
        }
        const verificationSourceHash = verificationOnly ? fingerprintArtifactFiles(resumeFiles) : null;
        const hasGenerationCompletion = state.workflow.generationCompletion !== undefined;
        if (!hasGenerationCompletion && state.workflow.dependencyPreparation && approvedResumeContract) {
            resumeFiles = await collectArtifactFiles(projectDir);
        }
        const resumeAtDependencyPreparation = verificationOnly || (!workerSession && !hasGenerationCompletion && resolveDependencyResume(
            state.workflow.dependencyPreparation,
            approvedResumeContract,
            resumeFiles
        ));
        let plan = state.plan;
        if (!resumeAtDependencyPreparation) {
        await workflowLogEvent(wsHub, projectId, "Manager", "start", "", "Otonom DAG orkestrasyon süreci başlatıldı.", "manager");

        // 1. AŞAMA: MANAGER & ROOT PROTOKOLÜ
        const rootPauseStatus = await checkPause(projectId, abortController.signal);
        if (!isExecutionActive(rootPauseStatus)) {
            terminalStatus = (rootPauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
            return;
        }
        plan = normalizeManagerPlan(plan);
        validateManagerPlan(plan);
        const planHash = computePlanHash(plan);
        if (state.workflow.planHash !== planHash) {
            logWarning('workflow.plan_revised_cache_cleared', null, { projectId, previousHash: state.workflow.planHash, newHash: planHash });
        }
        state.workflow = reconcilePlanningCache(state.workflow, plan);
        await workflowWriteState(projectId, state);
        const resumeAfterGeneration = resolveGenerationResume(state.workflow.generationCompletion, approvedResumeContract, planHash);

        const sortedRawDomains = orderDomainsCoreFirst(plan.domains);
        const domainList = sortedRawDomains.map(d => ({
            name: typeof d === 'string' ? d : d.name,
            prefix: typeof d === 'string' ? d : (d.prefix || d.name),
            description: typeof d === 'string' ? `${d} domaini` : (d.description || `${d.name} domaini`)
        }));
        if (!workerSession) await setupRootProtocol(projectDir, plan.talimatname, domainList, protocolOptions);
        await workflowLogEvent(wsHub, projectId, "Manager", "write", "TALIMATNAME.md", "Ana şartname ve kök TODO.md protokolü oluşturuldu.", "manager");

        // Architecture-First (Önce Mimari Sözleşme): Kodlama başlamadan önce onaylı paketler, .env.example ve köprüler kilitlenir!
        if (!workerSession) await ensureProjectScaffold(projectDir, state, plan, sourceFence);
        await workflowLogEvent(wsHub, projectId, "Manager", "write", "package.json, tsconfig.json, .env.example", "Mimari sözleşme ve onaylı teknoloji yığını diske kilitlendi; package-lock yalnızca izole worker tarafından hazırlanacaktır.", "manager");
        const stack = await detectProjectStack(projectDir, state, plan);

        const generatedProjectFiles = mergeGeneratedProjectFiles([], await listProjectTree(projectDir));
        const repairTargetFiles = new Set([
            'package.json',
            'tsconfig.json',
            '.env.example',
            'prisma/schema.prisma'
        ]);
        const managerDir = path.join(projectDir, 'manager');
        await ensureDir(managerDir, protocolOptions);
        // Reuse generated source, never its old quality evidence. Source repairs
        // invalidate task output hashes but are accepted only by the full gates below.
        if (!resumeAfterGeneration) {
        // 2. AŞAMA: DİREKTÖRLER (DIRECTORS - manager/ altında yuvalanır)
        for (const domain of domainList) {
            const domainPauseStatus = await checkPause(projectId, abortController.signal);
            if (!isExecutionActive(domainPauseStatus)) {
                terminalStatus = (domainPauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
                return;
            }

            const directorId = `${domain.prefix}.director`;
            let directorDir = path.join(managerDir, `${domain.prefix}.director`);
            let altTalimatOnDisk = await readAltTalimatname(directorDir, protocolOptions);
            let directorSpec = state.workflow.directorSpecs[domain.prefix];
            const newlyPlannedDirector = !directorSpec || Array.isArray(directorSpec)
                || (typeof directorSpec === 'object' && Object.keys(directorSpec).length === 0);
            if (!directorSpec || Array.isArray(directorSpec) || (typeof directorSpec === 'object' && Object.keys(directorSpec).length === 0)) {
                await workflowLogEvent(wsHub, projectId, "Director", "start", "", `${domain.name} Director görevi devraldı. Şartname hazırlanıyor...`, directorId, "manager");
                const directorAgent = getAgent('director');
                const directorPrompt = directorAgent.buildPrompt(domain.name, domain.description, plan.talimatname);
                const rawSpec = await callAgent('director', directorPrompt, {
                    signal: abortController.signal,
                    taskId: `${directorId}.spec`,
                    onUsage: recordTokenUsage,
                    onDiagnostic: recordLLMDiagnostic
                });
                directorSpec = normalizeDirectorSpec(rawSpec, domain.prefix);

                state.workflow.directorSpecs[domain.prefix] = directorSpec;
                await workflowWriteState(projectId, state);
            } else {
                directorSpec = normalizeDirectorSpec(directorSpec, domain.prefix);
            }
            validateDirectorSpec(directorSpec);
            const teamleaders = directorSpec.teamleaders && directorSpec.teamleaders.length > 0
                ? directorSpec.teamleaders
                : [{ name: `${domain.prefix}.teamleader`, prefix: domain.prefix, mission: `${domain.name} geliştirme` }];

            if (!altTalimatOnDisk || newlyPlannedDirector) {
                directorDir = await setupDirectorProtocol(
                    managerDir,
                    domain.prefix,
                    `# Görev: ${domain.name}\n\n${domain.description}`,
                    directorSpec.altTalimatname,
                    teamleaders,
                    protocolOptions
                );
                await workflowLogEvent(wsHub, projectId, "Director", "write", "ALT-TALIMATNAME.md", `${domain.name} için ALT-TALIMATNAME.md üretildi.`, directorId, "manager");
            }
            // 3. AŞAMA: TAKIM LİDERLERİ (TEAMLEADERS)
            for (const tl of teamleaders) {
                const tlPauseStatus = await checkPause(projectId, abortController.signal);
                if (!isExecutionActive(tlPauseStatus)) {
                    terminalStatus = (tlPauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
                    return;
                }

                const tlId = `${domain.prefix}.${tl.prefix}`;
                const tlDir = path.join(directorDir, tl.prefix);
                const tlTodoPath = path.join(tlDir, 'TODO.md');

                let taskPlan = state.workflow.teamleaderPlans[tlId];
                const tasksOnDisk = await readTasksFromTodoFile(tlTodoPath, protocolOptions);
                const normalizeTaskPlan = candidate => normalizeTeamleaderPlanForStack(
                    normalizeTeamleaderTasks(candidate, plan.requirements || []), stack);
                const resolution = await resolveFrontendRuntimePlan({
                    cachedPlan: taskPlan,
                    validateCandidate: candidate => {
                        const normalized = normalizeTaskPlan(candidate);
                        validateTeamleaderTasks(normalized);
                        const dependencies = validateTaskDependencies(normalized.tasks);
                        if (!dependencies.valid) throw new Error(`Geçersiz görev bağımlılıkları (${tl.name}): ${dependencies.errors.join(', ')}`);
                        const scope = validatePlanTasks(normalized.tasks, plan);
                        if (!scope.passed) throw new Error(`Geçersiz görev kapsamı (${tl.name}): ${scope.issues.join(', ')}`);
                        return normalized;
                    },
                    context: { stack, domain, files: generatedProjectFiles, contract: plan,
                        teamleaderId: tlId, teamleaderPlans: state.workflow.teamleaderPlans,
                        isLastTeamleader: tl === teamleaders[teamleaders.length - 1] },
                    onInvalidCachedPlan: async () => {
                        delete state.workflow.teamleaderPlans[tlId];
                        await workflowWriteState(projectId, state);
                    },
                    onInvalidCandidate: async diagnostic => {
                        await workflowLogEvent(wsHub, projectId, 'Teamleader', 'plan_rejected', '',
                            JSON.stringify(diagnostic), tlId, directorId);
                    },
                    generatePlan: async ({ attempt, missingPaths, missingCoverage, validationErrors }) => {
                    await workflowLogEvent(wsHub, projectId, "Teamleader", "start", "", `${tl.name} görevleri atomik parçalara (DAG) ayırıyor...`, tlId, directorId);
                    const tlAgent = getAgent('teamleader');
                    const existingFiles = generatedProjectFiles.filter(file => typeof file.content === 'string' && file.content.trim()
                        && /\.(?:[cm]?[jt]sx?|html|vue|svelte|prisma)$/i.test(file.path || '')).map(file => file.path);
                    const availablePaths = new Set(existingFiles);
                    const existingTasks = Object.entries(state.workflow.teamleaderPlans).flatMap(([team, cached]) =>
                        (Array.isArray(cached?.tasks) ? cached.tasks : []).filter(task => task && typeof task === 'object'
                            && Array.isArray(task.targetFiles) && task.targetFiles.length && task.targetFiles.every(file => availablePaths.has(file)))
                            .map(task => ({ team, taskId: task.id, targetFiles: task.targetFiles,
                                requirementIds: task.requirementIds || [], managementCoverage: task.managementCoverage || [] })));
                    const planningContext = { domain: domain.prefix, framework: stack.framework,
                        existingFiles: existingFiles.slice(0, 400), omittedFileCount: Math.max(0, existingFiles.length - 400),
                        existingTasks: existingTasks.slice(0, 100), omittedTaskCount: Math.max(0, existingTasks.length - 100),
                        previousTasks: (Array.isArray(taskPlan?.tasks) ? taskPlan.tasks : []).filter(task => task && typeof task === 'object').slice(0, 100).map(task => ({ id: task.id, title: task.title,
                            description: String(task.description || '').slice(0, 2000), targetFiles: task.targetFiles,
                            dependencies: task.dependencies, requirementIds: task.requirementIds, managementCoverage: task.managementCoverage })),
                        missingRuntimePaths: missingPaths, missingCoverage, validationErrors };
                    const tlPrompt = tlAgent.buildPrompt(tl.name, tl.mission, directorSpec.altTalimatname, plan.requirements || [], planningContext);
                    return await callAgent('teamleader', tlPrompt, {
                        signal: abortController.signal,
                        taskId: `${tlId}.plan${attempt > 1 ? '.correction' : ''}`,
                        onUsage: recordTokenUsage,
                        onDiagnostic: recordLLMDiagnostic
                    });
                    }
                });
                taskPlan = resolution.plan;
                const newlyPlannedTasks = resolution.newlyPlanned;
                validateTeamleaderTasks(taskPlan);
                const depCheck = validateTaskDependencies(taskPlan.tasks);
                if (!depCheck.valid) {
                    throw new Error(`Geçersiz görev bağımlılıkları (${tl.name}): ${depCheck.errors.join(', ')}`);
                }
                const scopeValidation = validatePlanTasks(taskPlan.tasks, plan);
                if (!scopeValidation.passed) {
                    throw new Error(
                        `Geçersiz görev kapsamı (${tl.name}): ${scopeValidation.issues.join(', ')}`
                    );
                }
                state.workflow.teamleaderPlans[tlId] = taskPlan;
                await workflowWriteState(projectId, state);
                if (approvedResumeContract) projectContractTasks({ projectId,
                    contractId: approvedResumeContract.id, contractHash: approvedResumeContract.contract_hash,
                    teamleaderPlans: state.workflow.teamleaderPlans, attemptId, leaseOwner: effectiveLeaseOwner });
                for (const task of taskPlan.tasks) {
                    for (const targetFile of task.targetFiles || []) {
                        repairTargetFiles.add(targetFile);
                    }
                }

                if (!tasksOnDisk || tasksOnDisk.length === 0 || newlyPlannedTasks) {
                    await setupTeamleaderProtocol(
                        directorDir,
                        tl.prefix,
                        `# Görev: ${tl.name}\n\nMisyon: ${tl.mission}`,
                        taskPlan.tasks,
                        protocolOptions
                    );
                }

                // 4. AŞAMA: DAG KURULUMU VE CODER / REVIEWER YÜRÜTÜCÜSÜ
                const dag = buildExecutionDAG(taskPlan.tasks);

                // DAG Dalgaları (Execution Waves): Bağımsız görevler paralel dalgalarda kontrollü çalışır
                const executionWaves = dag.getExecutionWaves ? dag.getExecutionWaves() : [dag.getExecutionOrder()];
                let waveHasFatalFailure = false;

                for (const wave of executionWaves) {
                    const wavePauseStatus = await checkPause(projectId, abortController.signal);
                    if (!isExecutionActive(wavePauseStatus)) {
                        terminalStatus = (wavePauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
                        return;
                    }
                    if (waveHasFatalFailure) break;

                    // Eşzamanlılık Sınırlandırıcı (Max 2 LLM görevi paralel çalışır, Rate-Limit koruması)
                    const CONCURRENCY_LIMIT = 2;

                    const processSingleTask = async (taskId) => {
                        if (!isExecutionActive(await checkPause(projectId, abortController.signal))) return { success: false, paused: true };

                        const task = dag.getTask(taskId);
                        const coderNodeId = `${tlId}.${taskId}`;
                        const coderDir = path.join(tlDir, taskId);

                        // Bağımlı görevlerin hedef dosyalarını deterministik sırayla topla.
                        const depTargetFileSet = new Set();
                        for (const depId of task.dependencies || []) {
                            const depTask = dag.getTask(depId);
                            if (!depTask) {
                                throw new Error(`Görev "${taskId}" tanımsız bağımlılığa sahip: "${depId}"`);
                            }
                            for (const targetFile of depTask.targetFiles || []) {
                                if (typeof targetFile === 'string' && targetFile.length > 0) {
                                    depTargetFileSet.add(targetFile);
                                }
                            }
                        }
                        const depTargetFiles = [...depTargetFileSet].sort();

                        // Cache retrieval and publication share the approved
                        // contract captured before any asynchronous work.
                        assertWorkflowContract();
                        const latestContract = approvedResumeContract;
                        const currentPlanHash = latestContract?.contract_hash || null;

                        // CAS CHECKPOINT DOĞRULAMASI
                        const checkpointValid = await isTaskCheckpointValid(
                            projectDir,
                            projectId,
                            task,
                            {
                                planHash: currentPlanHash,
                                contractId: latestContract?.id,
                                teamleaderId: tlId,
                                ownershipInventory: workflowCheckpointInventory({ contractId: latestContract.id, domains: domainList,
                                    directorSpecs: state.workflow.directorSpecs, teamleaderPlans: state.workflow.teamleaderPlans }),
                                dependencyTargetFiles: depTargetFiles,
                                gateVersion: '1.0.0',
                                allowAcceptanceRetry: Boolean(latestContract && db.prepare(`
                                    SELECT 1 FROM repair_issues
                                    WHERE project_id = ? AND contract_id = ? AND status = 'open'
                                    LIMIT 1
                                `).get(projectId, latestContract.id))
                            }
                        );

                        assertWorkflowContract();

                        await reconcileTaskCache({ projectDir, projectId, contractId: latestContract?.id,
                            teamleaderId: tlId, localTaskId: taskId, task, coderDir, teamleaderDir: tlDir,
                            directorDir, managerDir, domainPrefix: domain.prefix, domainName: domain.name,
                            teamleaderPrefix: tl.prefix, teamleaderName: tl.name, checkpointValid, sourceFence });
                        if (checkpointValid) {
                            dag.setTaskStatus(taskId, 'completed');
                            return { success: true, taskId, skipped: true };
                        }

                        await workflowLogEvent(wsHub, projectId, "Teamleader", "delegate", "", `Görev "${task.title}" Coder'a iletildi. Kod üretiliyor...`, coderNodeId, tlId);

                        const taskDescription = formatManagementTaskDescription(task, plan);

                        await setupCoderProtocol(
                            tlDir,
                            taskId,
                            task.title,
                            `# Atomik Görev: ${task.title}\n\nAçıklama: ${taskDescription}\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`,
                            protocolOptions
                        );

                        const projectContext = await buildCoderProjectContext({
                            projectDir,
                            files: await listProjectTree(projectDir, { strict: true }),
                            dependencyTargetFiles: depTargetFiles,
                            targetFiles: task.targetFiles
                        });

                        // Coder LLM çağrısı
                        const coderAgent = getAgent('coder');
                        const coderPrompt = coderAgent.buildPrompt(taskId, task.title, taskDescription, task.targetFiles, projectContext);
                        let coderOutput = await callAgent('coder', coderPrompt, {
                            signal: abortController.signal,
                            taskId,
                            onUsage: recordTokenUsage,
                            onDiagnostic: recordLLMDiagnostic
                        });

                        await workflowLogEvent(wsHub, projectId, "Coder", "write", task.targetFiles.join(', '), `İlk kod bloğu üretildi. Reviewer denetim döngüsü başlatılıyor...`, coderNodeId, tlId);

                        // 5. AŞAMA: REVIEWER & SELF-CORRECTION DÖNGÜSÜ
                        const loopResult = await executeCorrectionLoop({
                            taskId,
                            taskTitle: task.title,
                            taskDescription,
                            targetFiles: task.targetFiles,
                            initialCoderOutput: coderOutput,
                            coderPrompt,
                            projectContext,
                            maxRetries: 2,
                            callAgent,
                            signal: abortController.signal,
                            onLLMDiagnostic: recordLLMDiagnostic,
                            onUsage: recordTokenUsage,
                            onFeedback: async ({ iteration, feedback, summary }) => {
                                await workflowLogEvent(wsHub,
                                projectId,
                                "Reviewer",
                                "feedback",
                                "",
                                `[${iteration}. Tur İnceleme] Düzeltme istendi: ${feedback || summary}. Coder yeniden kodluyor...`,
                                coderNodeId,
                                tlId);
                            }
                        });

                        coderOutput = loopResult.finalOutput;

                        // VETO KONTROLÜ: Reviewer onay vermezse zarifçe fail durumuna al
                        if (!loopResult.approved) {
                            const failReason = loopResult.review?.feedback || loopResult.review?.summary || 'Reviewer kalite kapısını geçemedi.';
                            await writeDurum(coderDir, 'BASARISIZ', `Görev Reviewer tarafından reddedildi: ${failReason}`, protocolOptions);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\nReviewer Reddi:\n${failReason}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: REDDEDILDI\n\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`, protocolOptions);
                            dag.setTaskStatus(taskId, 'failed', { error: failReason });
                            await workflowLogEvent(wsHub,
                            projectId,
                            "Reviewer",
                            "veto",
                            task.targetFiles.join(', '),
                            `[VETO] Görev "${task.title}" kalite kapısından geçemedi: ${failReason}`,
                            coderNodeId,
                            tlId);
                            return { success: false, taskId, error: failReason };
                        }

                        const expectedTargetFiles = [...new Set(
                            (Array.isArray(task.targetFiles) ? task.targetFiles : [])
                                .filter(file => typeof file === 'string' && file.length > 0)
                                .map(file => path.normalize(file).replace(/\\/g, '/'))
                        )].sort();
                        if (expectedTargetFiles.length === 0) {
                            const writeError = 'Görev tamamlanamadı: kabul edilmiş hedef dosya yok.';
                            await writeDurum(coderDir, 'BASARISIZ', writeError, protocolOptions);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\n${writeError}`, protocolOptions);
                            dag.setTaskStatus(taskId, 'failed', { error: writeError });
                            await workflowLogEvent(wsHub, projectId, "Coder", "failure", "", writeError, coderNodeId, tlId);
                            return { success: false, taskId, error: writeError };
                        }

                        // Nihai onaylı dosyaları güvenli path guard üzerinden yaz.
                        const writtenMeta = await writeGeneratedFiles(projectDir, coderDir, coderOutput.files, task.targetFiles, sourceFence);
                        const writtenMetaByPath = new Map(
                            writtenMeta.map(file => [
                                path.normalize(file.path).replace(/\\/g, '/'),
                                file
                            ])
                        );
                        const writtenPathSet = new Set(writtenMetaByPath.keys());
                        const incompleteTargetFiles = [];
                        for (const expectedTargetFile of expectedTargetFiles) {
                            const written = writtenMetaByPath.get(expectedTargetFile);
                            if (!written || !Number.isFinite(written.size) || written.size <= 0) {
                                incompleteTargetFiles.push(expectedTargetFile);
                                continue;
                            }
                            const targetStat = await fs.stat(path.join(projectDir, written.path)).catch(() => null);
                            if (!targetStat?.isFile() || targetStat.size === 0) {
                                incompleteTargetFiles.push(expectedTargetFile);
                            }
                        }
                        if (incompleteTargetFiles.length > 0) {
                            const writeError = `Görev tamamlanamadı: kabul edilmiş hedef dosyalar boş veya yazılmadı (${incompleteTargetFiles.join(', ')}).`;
                            await writeDurum(coderDir, 'BASARISIZ', writeError, protocolOptions);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\n${writeError}`, protocolOptions);
                            dag.setTaskStatus(taskId, 'failed', { error: writeError });
                            await workflowLogEvent(wsHub, projectId, "Coder", "failure", incompleteTargetFiles.join(', '), writeError, coderNodeId, tlId);
                            return { success: false, taskId, error: writeError };
                        }
                        const writtenFiles = coderOutput.files
                            .filter(file => writtenPathSet.has(path.normalize(file.path).replace(/\\/g, '/')))
                            .map(file => ({ path: file.path, content: file.content }));

                        try {
                            // These bytes were reviewed under the captured
                            // contract. Never relabel them with a later approval.
                            const latestContract = approvedResumeContract;
                            if (latestContract) {
                                const specHash = computeTaskSpecHash(task);
                                const inHash = await computeInputHash(projectDir, depTargetFiles);
                                const outHash = await computeOutputHash(projectDir, task.targetFiles || []);
                                saveCheckpoint({
                                    projectId,
                                    taskId,
                                    teamleaderId: tlId,
                                    contractId: latestContract.id,
                                    planHash: latestContract.contract_hash,
                                    expectedContractHash: latestContract.contract_hash,
                                    expectedContractRevision: latestContract.revision,
                                    signal: abortController.signal,
                                    taskSpecHash: specHash,
                                    inputHash: inHash,
                                    outputHash: outHash,
                                    gateVersion: '1.0.0',
                                    status: 'completed',
                                    requirementIds: task.requirementIds || [],
                                    refreshReviewed: true,
                                    attemptId,
                                    leaseOwner: effectiveLeaseOwner
                                });
                            } else {
                                throw new Error('Onaylı sözleşme bulunamadı; görev checkpoint kaydı oluşturulamadı.');
                            }
                        } catch (cpErr) {
                            if (cpErr?.code === 'WORKFLOW_LEASE_FENCED') throw cpErr;
                            logWarning('workflow.checkpoint_save_failed', cpErr, { projectId, taskId });
                            throw cpErr;
                        }
                        // Publish completion only after durable resume evidence exists.
                        const statusDetail = `Görev başarıyla tamamlandı ve Reviewer tarafından onaylandı: ${coderOutput.summary}`;
                        await writeDurum(coderDir, 'TAMAMLANDI', statusDetail, protocolOptions);
                        await writeRapor(coderDir, `# Rapor: ${task.title}\n\n${statusDetail}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: ONAYLANDI\n\nÜretilen Dosyalar: ${JSON.stringify(task.targetFiles)}`, protocolOptions);
                        await checkTodoItem(path.join(tlDir, 'TODO.md'), { kind: 'task', id: taskId }, protocolOptions);
                        dag.setTaskStatus(taskId, 'completed', coderOutput);
                        await workflowLogEvent(wsHub,
                        projectId,
                        "Coder",
                        "finish",
                        task.targetFiles.join(', '),
                        `Görev "${task.title}" tamamlandı (Reviewer Onaylı).`,
                        coderNodeId,
                        tlId);

                        return { success: true, taskId, files: writtenFiles };
                    };

                    // Dalga görevlerini Concurrency Pool (Limitli Havuz) ile yürüt
                    const waveTaskResults = await runWithConcurrency(wave, CONCURRENCY_LIMIT, processSingleTask, { signal: abortController.signal });
                    // Dalga tamamlandığında üretilen dosyaları atomik olarak ana listeye birleştir
                    for (const res of waveTaskResults) {
                        if (res && res.success && Array.isArray(res.files)) {
                            for (const file of res.files) {
                                const existingIdx = generatedProjectFiles.findIndex(f => f.path === file.path);
                                if (existingIdx !== -1) {
                                    generatedProjectFiles[existingIdx] = { path: file.path, content: file.content };
                                } else {
                                    generatedProjectFiles.push({ path: file.path, content: file.content });
                                }
                            }
                        } else if (res && !res.success && !res.skipped && !res.paused) {
                            waveHasFatalFailure = true;
                        }
                    }
                    if (waveHasFatalFailure) {
                        const failedList = waveTaskResults
                            .filter(r => r && !r.success && !r.skipped && !r.paused)
                            .map(r => `• [${r.taskId}] ${r.error || 'Reviewer vetosu'}`)
                            .join('\n');
                        const errorDetail = `[DALGA VETOSU] Dalga içindeki şu görevler kalite kapısından geçemedi ve veto edildi:\n${failedList}\n\nSüreç güvenli modda duraklatıldı. Manager ile mimariyi düzenleyebilir veya 'Devam Et (Resume)' butonuna basarak yeniden deneyebilirsiniz.`;
                        await workflowLogEvent(wsHub, projectId, "Workflow", "error", "", errorDetail, tlId);
                        throw new Error(`Orkestrasyon duraklatıldı: Görevler kalite kapısını geçemedi.`);
                    }
                }
                // Teamleader tamamlandı
                await writeDurum(tlDir, 'TAMAMLANDI', 'Tüm coder görevleri başarıyla tamamlandı.', protocolOptions);
                await writeRapor(tlDir, `# Rapor: ${tl.name}\n\nDomain alt görevlerinin tamamı başarıyla üretildi.`, protocolOptions);
                await checkTodoItem(path.join(directorDir, 'TODO.md'), { kind: 'folder', folder: tl.prefix, name: tl.name }, protocolOptions);
            }

            // Director tamamlandı
            await writeDurum(directorDir, 'TAMAMLANDI', `${domain.name} domaini başarıyla tamamlandı.`, protocolOptions);
            await writeRapor(directorDir, `# Rapor: ${domain.name} Director\n\nTüm takım lideri görevleri tamamlandı.`, protocolOptions);
            await checkTodoItem(path.join(managerDir, 'TODO.md'), { kind: 'folder', folder: `${domain.prefix}.director` }, protocolOptions);
            if (fsSync.existsSync(path.join(projectDir, 'TODO.md'))) {
                await checkTodoItem(path.join(projectDir, 'TODO.md'), { kind: 'folder', folder: `${domain.prefix}.director` }, protocolOptions);
            }
        }

        }
        // Cancellation can arrive during the final wave; it must not publish a
        // completion marker for a partially dispatched generation.
        const waveEndPauseStatus = await checkPause(projectId, abortController.signal);
        if (!isExecutionActive(waveEndPauseStatus)) {
            terminalStatus = (waveEndPauseStatus === 'paused' || abortController.signal.reason === 'PAUSED') ? 'paused' : 'aborted';
            return;
        }
        // Preserve the same repair allowlist when generation is bypassed.
        for (const taskPlan of Object.values(state.workflow.teamleaderPlans)) {
            for (const task of taskPlan.tasks || []) {
                for (const target of task.targetFiles || []) repairTargetFiles.add(target);
            }
        }
        // 6. AŞAMA: TESTER AJANI VE NİHAİ KONSOLİDE RAPOR
        if (!workerSession && resumeAfterGeneration && approvedResumeContract && Object.keys(state.workflow.teamleaderPlans).length) {
            projectContractTasks({ projectId, contractId: approvedResumeContract.id,
                contractHash: approvedResumeContract.contract_hash, teamleaderPlans: state.workflow.teamleaderPlans,
                attemptId, leaseOwner: effectiveLeaseOwner });
        }
        const managementCoverage = validateManagementTaskCoverage(plan, state.workflow.teamleaderPlans);
        if (!managementCoverage.passed) {
            throw new Error(`Yönetim sözleşmesi için görev kapsamı eksik: ${managementCoverage.missing.join(', ')}`);
        }
        if (!resumeAfterGeneration && approvedResumeContract) {
            state.workflow.generationCompletion = { stage: 'generation_finished',
                contractId: approvedResumeContract.id, contractHash: approvedResumeContract.contract_hash, planHash };
            await workflowWriteState(projectId, state);
        }
        const qualityOutcome = { terminalStatus, executionError };
        let stopAfterQuality;
        try {
            stopAfterQuality = await runQualityStage({
                abortController, approvedResumeContract, assertWorkflowContract, attemptId, callAgent, effectiveLeaseOwner,
                generatedProjectFiles, plan, projectDir, projectId, protocolOptions, recordLLMDiagnostic, recordTokenUsage,
                repairTargetFiles, sourceFence, state, workerBatch, workerSession, workflowLogEvent, workflowWriteState, wsHub
            }, qualityOutcome);
        } finally {
            ({ terminalStatus, executionError } = qualityOutcome);
        }
        if (stopAfterQuality) return;
        }
        const acceptanceOutcome = { terminalStatus, executionError, controllerBoundary };
        try {
            await runAcceptanceStage({
                abortController, approvedResumeContract, attemptId, callAgent, controlledRepair, controlledSemanticReview,
                controlledSession, effectiveLeaseOwner, executionClientFactory, priorWorkerBlockers, projectDir, projectId,
                recordLLMDiagnostic, recordTokenUsage, resumeAtDependencyPreparation, resumeFiles, services, state,
                verificationOnly, verificationSourceHash, verifyProject, workerBatch, workerSession, workflowLogEvent,
                workflowWriteState, wsHub
            }, acceptanceOutcome);
        } finally {
            ({ terminalStatus, executionError, controllerBoundary } = acceptanceOutcome);
        }
    } catch (error) {
        if (error.code === 'WORKFLOW_APPROVAL_REQUIRED') {
            terminalStatus = 'failed';
            executionError = error.message;
            // The generic state writer can import legacy plan snapshots. An
            // authorization failure must leave an unapproved draft untouched.
            throw error;
        }
        let contractChanged = false;
        try { assertWorkflowContract(); } catch { contractChanged = true; }
        if (contractChanged || error.code === 'WORKFLOW_LEASE_FENCED') {
            terminalStatus = 'aborted';
            executionError = error.message;
            logWarning('workflow.execution_fenced', error, { projectId, attemptId });
        } else if (abortController.signal.aborted) {
            terminalStatus = abortController.signal.reason === 'PAUSED' ? 'paused' : 'aborted';
            logWarning('workflow.execution_aborted', null, { projectId, attemptId, reason: abortController.signal.reason });
        } else {
            terminalStatus = 'failed';
            executionError = error.message;
            if (controllerBoundary) {
                // A controller observation has its own active workflow fence,
                // not the expired job deadline. It does not ingest late checks
                // or claim worker authentication/success.
                const failureContext = { ...sourceFence, revision: sourceFence.contractRevision };
                try {
                    const known = loadOpenWorkerRepairBatch(failureContext).issues.some(issue =>
                        issue.run_id === controllerBoundary.runId || issue.detail.expectedIdentity?.jobId === controllerBoundary.jobId);
                    const recoverable = controllerBoundary.artifactId && db.prepare(`SELECT a.id FROM artifacts a JOIN verification_runs r
                        ON r.id=a.verification_run_id AND r.contract_id=a.contract_id WHERE a.id=? AND a.project_id=?
                        AND a.contract_id=? AND a.sha256=? AND a.status='verified' AND r.status='verified' AND r.id=?`)
                        .get(controllerBoundary.artifactId, projectId, sourceFence.contractId, controllerBoundary.inputSha256, controllerBoundary.runId);
                    if ((!known && !recoverable) || controllerBoundary.operation === 'prepare_dependencies') commitVerificationContext(failureContext,
                        () => recordVerificationBlocker(failureContext, { expectedIdentity: controllerBoundary, reason: error.message }));
                } catch (failureError) { logWarning('workflow.controller_blocker_fenced', failureError, { projectId, attemptId }); }
            }
            const errorLog = logError('workflow.execution_failed', error, { projectId, attemptId });
            const errStr = `${error?.message || ''} ${error?.code || ''} ${error?.status || ''} ${error?.stack || ''}`;
            const isQuotaError = /429|RESOURCE_EXHAUSTED|quota|rate limit|rate_limit/i.test(errStr);
            const isDepError = /dependency|package-lock|bağımlılık|package\.json|package-lock\.json/i.test(errStr);
            const errorMessageText = error?.message || 'Bilinmeyen hata';
            let logMsg;
            if (isQuotaError) {
                logMsg = `[Hata] LLM Kota ve Bütçe Sınırı Aşıldı: ${errorMessageText}`;
            } else if (isDepError) {
                logMsg = `[Hata] Bağımlılık Hazırlığı Başarısız: ${errorMessageText}`;
            } else {
                logMsg = `[Süreç Hatası] ${errorMessageText}`;
            }
            await workflowLogEvent(wsHub, projectId, "System", "error", "", logMsg, "system");
            const failedState = await readProjectState(projectId);
            if (failedState) {
                failedState.last_error = verificationOnly && priorWorkerBlockers
                    ? `Worker repair requires Manager revision: ${error?.message || errorMessageText}` : error?.message || errorMessageText;
                // fail-closed pause check
                const immutableStatuses = new Set(['completed', 'acceptance_verified', 'runtime_verified']);
                if (!immutableStatuses.has(failedState.status)) {
                    failedState.status = 'paused';
                }
                const errNow = new Date();
                const errDate = errNow.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const errTime = errNow.toLocaleTimeString('tr-TR', { hour12: false });

                if (!failedState.chatHistory) failedState.chatHistory = [];
                failedState.chatHistory.push({
                    role: 'model',
                    parts: [{ text: `⚠️ **Süreç Duraklatıldı:**\n\n${redactSensitiveText(errorMessageText)}\n\n${workflowRecoveryAdvice(failedState.last_error)} Ayrıntılar **Canlı Süreç Logları** ve **Canlı DAG Grafiği** sekmelerinde.` }],
                    timestamp: `${errDate} ${errTime}`,
                    created_at: errNow.toISOString()
                });
                await workflowWriteState(projectId, failedState);
                wsHub?.publish({ type: 'project_state_updated', projectId });
            }
        }
    } finally {
        await leaseHeartbeat?.stop();
        unregisterProjectAbortController(projectId, abortController);
        if (abortController.signal.aborted && abortController.signal.reason === 'PAUSED') {
            terminalStatus = 'paused';
        }
        if (attemptId) {
            releaseWorkflowLease(attemptId, terminalStatus, {
                error: executionError,
                leaseOwner: effectiveLeaseOwner
            });
        }
    }
}
