import crypto from 'crypto';
/**
 * XFactor Otonom DAG İş Akışı Motoru (Workflow Engine)
 * Referans: Archon Deterministic Engine & Agency-Agents
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TaskDAG } from './dag.js';
import {
    ensureDir,
    setupRootProtocol,
    setupDirectorProtocol,
    setupTeamleaderProtocol,
    setupCoderProtocol,
    writeDurum,
    writeRapor,
    checkTodoItem,
    uncheckTodoItem,
    isTaskCompleted,
    isFolderCompleted,
    readAltTalimatname,
    readTasksFromTodoFile,
    reconcileTaskCache,
    isTaskCheckpointValid,
    writeGeneratedFiles as writeRepairFiles
} from './fileProtocol.js';
import { getAgent, runDeterministicProjectAudit } from '../agents/index.js';
import {
    validateManagerPlan,
    validateDirectorSpec,
    validateTeamleaderTasks,
    validateTaskDependencies,
    normalizeManagerPlan,
    normalizeDirectorSpec,
    normalizeTeamleaderTasks
} from '../agents/schemas.js';
import { validatePlanTasks } from '../agents/director.js';
import { db, getProjectState, saveProjectState, dbEvents, saveProjectLog } from '../db.js';
import { ensureProjectScaffold, listProjectTree, writeGeneratedFiles, validateGenerationQuotas } from './codeGenerator.js';
import { executeCorrectionLoop } from './selfCorrection.js';
import { generateLLMResponse } from '../llm.js';
import { validateProjectBuild } from './buildValidator.js';
import { logError, logWarning, redactSensitiveText } from '../observability.js';
import { updateAttemptHeartbeat, releaseWorkflowLease } from '../workflowAttempts.js';
import { registerProjectAbortController, unregisterProjectAbortController } from './cancellation.js';
import {
    getProjectDir,
    getProjectsRoot,
    getProject as readProjectState,
    saveProjectState as writeProjectState
} from '../projectRepository.js';
import { verifyArtifactAndProject } from '../verification/verificationCli.js';
import { createProjectZip } from '../utils/archive.js';
import { saveCheckpoint } from './checkpointRepository.js';
import { computeTaskSpecHash, computeInputHash, computeOutputHash } from './checkpointHelper.js';
export { getProjectDir, getProjectsRoot, readProjectState, writeProjectState };
export const getStatePath = (projectId, env = process.env) => path.join(getProjectDir(projectId, env), 'state.json');
export function computePlanHash(plan) {
    if (!plan || typeof plan !== 'object') return '0'.repeat(16);
    const normalized = {
        summary: String(plan.summary || '').trim(),
        talimatname: String(plan.talimatname || '').trim(),
        domains: (plan.domains || []).map(d => ({
            name: typeof d === 'string' ? d : d.name,
            prefix: typeof d === 'string' ? d : (d.prefix || d.name)
        }))
    };
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
}

export function orderDomainsCoreFirst(domains = []) {
    if (!Array.isArray(domains)) return [];

    const CORE_PRIORITIES = {
        'database': 1,
        'db': 1,
        'core': 2,
        'backend': 3,
        'api': 4,
        'auth': 5,
        'frontend': 6,
        'ui': 7,
        'analytics': 8
    };

    return [...domains].sort((a, b) => {
        const nameA = String(typeof a === 'string' ? a : (a.name || a.prefix || '')).toLowerCase();
        const nameB = String(typeof b === 'string' ? b : (b.name || b.prefix || '')).toLowerCase();

        const prioA = CORE_PRIORITIES[nameA] ?? 50;
        const prioB = CORE_PRIORITIES[nameB] ?? 50;

        return prioA - prioB;
    });
}

export function normalizeWorkflowState(value) {
    const workflow = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const directorSpecs = workflow.directorSpecs && typeof workflow.directorSpecs === 'object' && !Array.isArray(workflow.directorSpecs) ? workflow.directorSpecs : {};
    const teamleaderPlans = workflow.teamleaderPlans && typeof workflow.teamleaderPlans === 'object' && !Array.isArray(workflow.teamleaderPlans) ? workflow.teamleaderPlans : {};

    return {
        planHash: workflow.planHash ?? null,
        directorSpecs,
        teamleaderPlans
    };
}

 


/**
 * Bağımsız görevleri katı bir concurrency limiti ile yürüten güvenli havuz fonksiyonu
 * - Girdi sırasına göre deterministik sonuç dizisi
 * - Rejection durumunda fail-fast: yeni dispatch yapılmaz, in-flight worker'lar beklenir, unhandled rejection oluşmaz
 */
export async function runWithConcurrency(items, limit, workerFn, { signal = null } = {}) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const concurrencyLimit = Math.max(1, limit || 1);
    const results = new Array(items.length);
    const executing = new Set();
    let firstError = null;

    for (let index = 0; index < items.length; index++) {
        if (signal?.aborted || firstError) break;

        const item = items[index];
        const taskPromise = (async () => {
            if (signal?.aborted || firstError) return null;
            try {
                const res = await workerFn(item, index);
                results[index] = res;
                return res;
            } catch (err) {
                if (!firstError) {
                    firstError = err;
                }
                throw err;
            }
        })();

        // Rejection'ları havuz düzeyinde güvenle yakala (unhandled rejection önleme)
        const safeTrackerPromise = taskPromise.catch(() => null).finally(() => {
            executing.delete(safeTrackerPromise);
        });

        executing.add(safeTrackerPromise);

        if (executing.size >= concurrencyLimit) {
            await Promise.race(executing);
        }
    }

    // Kalan tüm in-flight worker'ların tamamlanmasını bekle
    await Promise.all(executing);

    if (firstError) {
        throw firstError;
    }

    return results.filter(r => r !== undefined);
}

export async function logEvent(wsHub, projectId, agentType, action, filePath, message, nodeId, parentNodeId = null) {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });
    const event = {
        projectId,
        timestamp: `${formattedDate} ${formattedTime}`,
        time_only: formattedTime,
        created_at: now.toISOString(),
        agent: agentType,
        action: action,
        file: redactSensitiveText(filePath),
        message: redactSensitiveText(message),
        node_id: nodeId,
        parent_node_id: parentNodeId
    };

    try {
        saveProjectLog(event);
    } catch (error) {
        logError('workflow.event_persist_failed', error, { projectId, action });
    }

    if (wsHub) {
        wsHub.publish(event);
    }
}

function isExecutionActive(status) {
    return status === 'implementing' || status === 'running';
}

/**
 * Projenin duraklatma (pause) durumunu kontrol eder
 */
export async function checkPause(projectId, signal = null) {
    if (signal?.aborted) {
        return 'paused';
    }
    let state = await readProjectState(projectId);
    if (!state || state.status !== 'paused') return state?.status;


    return new Promise((resolve, reject) => {
        let onStateChange;
        let onAbort;

        const cleanup = () => {
            if (onStateChange) dbEvents.off(`stateChange:${projectId}`, onStateChange);
            if (onAbort && signal) signal.removeEventListener('abort', onAbort);
        };

        onStateChange = (newStatus) => {
            if (newStatus !== 'paused') {
                cleanup();
                resolve(newStatus);
            }
        };

        if (signal) {
            onAbort = () => {
                cleanup();
                resolve('paused');
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }

        dbEvents.on(`stateChange:${projectId}`, onStateChange);
    });
}
/**
 * Güvenli LLM Ajan Çağrısı
 */
async function callAgentLLM(agentRole, userPrompt, { signal = null } = {}) {
    const agent = getAgent(agentRole);
    const messages = [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const rawResponse = await generateLLMResponse(messages, { signal });
    return agent.parseResponse(rawResponse);
}

/**
 * Ana Otonom İş Akışı Yürütücüsü (Workflow Engine)
 */
export async function executeProjectTasks(projectId, wsHub = null, attemptId = null) {
    const projectDir = getProjectDir(projectId);
    const state = await readProjectState(projectId);

    if (!state) return;

    state.workflow = normalizeWorkflowState(state.workflow);

    const abortController = new AbortController();
    registerProjectAbortController(projectId, abortController);

    let heartbeatTimer = null;
    let terminalStatus = 'completed';
    let executionError = null;

    if (attemptId) {
        heartbeatTimer = setInterval(() => {
            updateAttemptHeartbeat(attemptId);
        }, 5000);
    }

    try {
        await logEvent(wsHub, projectId, "Manager", "start", "", "Otonom DAG orkestrasyon süreci başlatıldı.", "manager");

        // 1. AŞAMA: MANAGER & ROOT PROTOKOLÜ
        await checkPause(projectId, abortController.signal);
        let plan = state.plan;

        if (!plan || !plan.domains || plan.domains.length === 0) {
            const managerAgent = getAgent('manager');
            const managerPrompt = managerAgent.buildPrompt(state.title, state.chatHistory ? state.chatHistory.map(m => ({ role: m.role, content: m.parts ? m.parts[0].text : '' })) : []);
            plan = await callAgentLLM('manager', managerPrompt, { signal: abortController.signal });
            state.plan = plan;
            await writeProjectState(projectId, state);
        }
        plan = normalizeManagerPlan(plan);
        validateManagerPlan(plan);
        const planHash = computePlanHash(plan);
        if (state.workflow.planHash && state.workflow.planHash !== planHash) {
            logWarning('workflow.plan_revised_cache_cleared', null, { projectId, previousHash: state.workflow.planHash, newHash: planHash });
            state.workflow.directorSpecs = {};
            state.workflow.teamleaderPlans = {};
        }
        state.workflow.planHash = planHash;
        await writeProjectState(projectId, state);

        const sortedRawDomains = orderDomainsCoreFirst(plan.domains);
        const domainList = sortedRawDomains.map(d => ({
            name: typeof d === 'string' ? d : d.name,
            prefix: typeof d === 'string' ? d : (d.prefix || d.name),
            description: typeof d === 'string' ? `${d} domaini` : (d.description || `${d.name} domaini`)
        }));
        await setupRootProtocol(projectDir, plan.talimatname, domainList);
        await logEvent(wsHub, projectId, "Manager", "write", "TALIMATNAME.md", "Ana şartname ve kök TODO.md protokolü oluşturuldu.", "manager");

        // Architecture-First (Önce Mimari Sözleşme): Kodlama başlamadan önce onaylı paketler, .env.example ve köprüler kilitlenir!
        await ensureProjectScaffold(projectDir, state, plan);
        await logEvent(wsHub, projectId, "Manager", "write", "package.json, tsconfig.json, .env.example", "Mimari sözleşme ve onaylı teknoloji yığını (package.json, tsconfig, .env.example) önceden diske kilitlendi.", "manager");

        const generatedProjectFiles = [];
        const repairTargetFiles = new Set();

        const managerDir = path.join(projectDir, 'manager');
        await ensureDir(managerDir);
        // 2. AŞAMA: DİREKTÖRLER (DIRECTORS - manager/ altında yuvalanır)
        for (const domain of domainList) {
            if (!isExecutionActive(await checkPause(projectId, abortController.signal))) return;

            const directorId = `${domain.prefix}.director`;
            let directorDir = path.join(managerDir, `${domain.prefix}.director`);
            const legacyDirectorDir = path.join(projectDir, `${domain.prefix}.director`);

            let altTalimatOnDisk = await readAltTalimatname(directorDir);
            if (!altTalimatOnDisk && await readAltTalimatname(legacyDirectorDir)) {
                altTalimatOnDisk = await readAltTalimatname(legacyDirectorDir);
                directorDir = legacyDirectorDir;
            }

            let directorSpec = state.workflow.directorSpecs[domain.prefix];
            if (!directorSpec || Array.isArray(directorSpec) || (typeof directorSpec === 'object' && Object.keys(directorSpec).length === 0)) {
                await logEvent(wsHub, projectId, "Director", "start", "", `${domain.name} Director görevi devraldı. Şartname hazırlanıyor...`, directorId, "manager");
                const directorAgent = getAgent('director');
                const directorPrompt = directorAgent.buildPrompt(domain.name, domain.description, plan.talimatname);
                const rawSpec = await callAgentLLM('director', directorPrompt, { signal: abortController.signal });
                directorSpec = normalizeDirectorSpec(rawSpec, domain.prefix);

                state.workflow.directorSpecs[domain.prefix] = directorSpec;
                await writeProjectState(projectId, state);
            } else {
                directorSpec = normalizeDirectorSpec(directorSpec, domain.prefix);
            }
            validateDirectorSpec(directorSpec);
            const teamleaders = directorSpec.teamleaders && directorSpec.teamleaders.length > 0
                ? directorSpec.teamleaders
                : [{ name: `${domain.prefix}.teamleader`, prefix: domain.prefix, mission: `${domain.name} geliştirme` }];

            if (!altTalimatOnDisk) {
                directorDir = await setupDirectorProtocol(
                    managerDir,
                    domain.prefix,
                    `# Görev: ${domain.name}\n\n${domain.description}`,
                    directorSpec.altTalimatname,
                    teamleaders
                );
                await logEvent(wsHub, projectId, "Director", "write", "ALT-TALIMATNAME.md", `${domain.name} için ALT-TALIMATNAME.md üretildi.`, directorId, "manager");
            }
            // 3. AŞAMA: TAKIM LİDERLERİ (TEAMLEADERS)
            for (const tl of teamleaders) {
                if (!isExecutionActive(await checkPause(projectId, abortController.signal))) return;

                const tlId = `${domain.prefix}.${tl.prefix}`;
                const tlDir = path.join(directorDir, tl.prefix);
                const tlTodoPath = path.join(tlDir, 'TODO.md');

                let taskPlan = state.workflow.teamleaderPlans[tlId];
                const tasksOnDisk = await readTasksFromTodoFile(tlTodoPath);

                if (!taskPlan) {
                    await logEvent(wsHub, projectId, "Teamleader", "start", "", `${tl.name} görevleri atomik parçalara (DAG) ayırıyor...`, tlId, directorId);
                    const tlAgent = getAgent('teamleader');
                    const tlPrompt = tlAgent.buildPrompt(tl.name, tl.mission, directorSpec.altTalimatname);
                    taskPlan = await callAgentLLM('teamleader', tlPrompt, { signal: abortController.signal });

                    state.workflow.teamleaderPlans[tlId] = taskPlan;
                    await writeProjectState(projectId, state);
                }
                taskPlan = normalizeTeamleaderTasks(taskPlan);
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
                for (const task of taskPlan.tasks) {
                    for (const targetFile of task.targetFiles || []) {
                        repairTargetFiles.add(targetFile);
                    }
                }

                if (!tasksOnDisk || tasksOnDisk.length === 0) {
                    await setupTeamleaderProtocol(
                        directorDir,
                        tl.prefix,
                        `# Görev: ${tl.name}\n\nMisyon: ${tl.mission}`,
                        taskPlan.tasks
                    );
                }

                // 4. AŞAMA: DAG KURULUMU VE CODER / REVIEWER YÜRÜTÜCÜSÜ
                const dag = new TaskDAG();
                for (const t of taskPlan.tasks) {
                    dag.addTask({
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        dependencies: t.dependencies || [],
                        targetFiles: t.targetFiles || []
                    });
                }

                // DAG Dalgaları (Execution Waves): Bağımsız görevler paralel dalgalarda kontrollü çalışır
                const executionWaves = dag.getExecutionWaves ? dag.getExecutionWaves() : [dag.getExecutionOrder()];
                let waveHasFatalFailure = false;

                for (const wave of executionWaves) {
                    if (!isExecutionActive(await checkPause(projectId, abortController.signal))) return;
                    if (waveHasFatalFailure) break;

                    // Eşzamanlılık Sınırlandırıcı (Max 2 LLM görevi paralel çalışır, Rate-Limit koruması)
                    const CONCURRENCY_LIMIT = 2;

                    const processSingleTask = async (taskId) => {
                        if (!isExecutionActive(await checkPause(projectId, abortController.signal))) return { success: false, paused: true };

                        const task = dag.getTask(taskId);
                        const coderNodeId = `${tlId}.${taskId}`;
                        const coderDir = path.join(tlDir, taskId);

                        // Bağımlı görevlerin hedef dosyalarını topla
                        const depTargetFiles = [];
                        if (Array.isArray(task.dependencies)) {
                            for (const depId of task.dependencies) {
                                const depTask = dag.getTask(depId);
                                if (depTask && Array.isArray(depTask.targetFiles)) {
                                    depTargetFiles.push(...depTask.targetFiles);
                                }
                            }
                        }

                        const latestContract = db.prepare(`
                            SELECT id, contract_hash FROM project_contracts
                            WHERE project_id = ? AND status = 'approved'
                            ORDER BY revision DESC LIMIT 1
                        `).get(projectId);
                        const currentPlanHash = latestContract?.contract_hash || null;

                        // CAS CHECKPOINT DOĞRULAMASI
                        const checkpointValid = await isTaskCheckpointValid(
                            projectDir,
                            projectId,
                            task,
                            { planHash: currentPlanHash, dependencyTargetFiles: depTargetFiles, gateVersion: '1.0.0' }
                        );

                        if (checkpointValid) {
                            dag.setTaskStatus(taskId, 'completed');
                            await logEvent(
                                wsHub,
                                projectId,
                                "Coder",
                                "skip",
                                task.targetFiles ? task.targetFiles.join(', ') : '',
                                `Görev "${task.title}" CAS checkpoint doğrulamasıyla geçerli, atlanıyor.`,
                                coderNodeId,
                                tlId
                            );
                            return { success: true, taskId, skipped: true };
                        }

                        // Checkpoint geçersizse dosya sistemi önbelleğini ve TODO durumunu sıfırla
                        await reconcileTaskCache(projectDir, taskId, task);

                        await logEvent(wsHub, projectId, "Teamleader", "delegate", "", `Görev "${task.title}" Coder'a iletildi. Kod üretiliyor...`, coderNodeId, tlId);

                        await setupCoderProtocol(
                            tlDir,
                            taskId,
                            task.title,
                            `# Atomik Görev: ${task.title}\n\nAçıklama: ${task.description}\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`
                        );

                        // Yapılandırılmış Proje Bağlamı (Şemalar, Tipler, Route'lar)
                        const contextFiles = generatedProjectFiles.filter(f => 
                            f.path.includes('schema.prisma') || 
                            f.path.endsWith('.d.ts') || 
                            f.path.includes('types') || 
                            f.path.includes('validations') ||
                            f.path.includes('/api/') ||
                            f.path.includes('service')
                        );
                        let projectContext = '';
                        if (contextFiles.length > 0) {
                            projectContext = contextFiles.map(f => {
                                const snippet = f.content.length > 2000 ? f.content.slice(0, 2000) + '\n// ... [kesildi]' : f.content;
                                return `Dosya: ${f.path}\n\`\`\`\n${snippet}\n\`\`\``;
                            }).join('\n\n');
                        }

                        // Coder LLM çağrısı
                        const coderAgent = getAgent('coder');
                        const coderPrompt = coderAgent.buildPrompt(taskId, task.title, task.description, task.targetFiles, projectContext);
                        let coderOutput = await callAgentLLM('coder', coderPrompt, { signal: abortController.signal });

                        await logEvent(wsHub, projectId, "Coder", "write", task.targetFiles.join(', '), `İlk kod bloğu üretildi. Reviewer denetim döngüsü başlatılıyor...`, coderNodeId, tlId);

                        // 5. AŞAMA: REVIEWER & SELF-CORRECTION DÖNGÜSÜ
                        const loopResult = await executeCorrectionLoop({
                            taskId,
                            taskTitle: task.title,
                            targetFiles: task.targetFiles,
                            initialCoderOutput: coderOutput,
                            coderPrompt,
                            maxRetries: 2,
                            signal: abortController.signal,
                            onFeedback: async ({ iteration, feedback, summary }) => {
                                await logEvent(
                                    wsHub,
                                    projectId,
                                    "Reviewer",
                                    "feedback",
                                    "",
                                    `[${iteration}. Tur İnceleme] Düzeltme istendi: ${feedback || summary}. Coder yeniden kodluyor...`,
                                    coderNodeId,
                                    tlId
                                );
                            }
                        });

                        coderOutput = loopResult.finalOutput;

                        // VETO KONTROLÜ: Reviewer onay vermezse zarifçe fail durumuna al
                        if (!loopResult.approved) {
                            const failReason = loopResult.review?.feedback || loopResult.review?.summary || 'Reviewer kalite kapısını geçemedi.';
                            await writeDurum(coderDir, 'BASARISIZ', `Görev Reviewer tarafından reddedildi: ${failReason}`);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\nReviewer Reddi:\n${failReason}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: REDDEDILDI\n\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`);
                            dag.setTaskStatus(taskId, 'failed', { error: failReason });
                            await logEvent(
                                wsHub,
                                projectId,
                                "Reviewer",
                                "veto",
                                task.targetFiles.join(', '),
                                `[VETO] Görev "${task.title}" kalite kapısından geçemedi: ${failReason}`,
                                coderNodeId,
                                tlId
                            );
                            return { success: false, taskId, error: failReason };
                        }

                        // Nihai onaylı dosyaları güvenli path guard üzerinden yaz.
                        const writtenMeta = await writeGeneratedFiles(projectDir, coderDir, coderOutput.files, task.targetFiles);
                        const writtenPathSet = new Set(writtenMeta.map(file => file.path));
                        const writtenFiles = coderOutput.files
                            .filter(file => writtenPathSet.has(file.path))
                            .map(file => ({ path: file.path, content: file.content }));

                        const statusDetail = `Görev başarıyla tamamlandı ve Reviewer tarafından onaylandı: ${coderOutput.summary}`;
                        await writeDurum(coderDir, 'TAMAMLANDI', statusDetail);
                        await writeRapor(coderDir, `# Rapor: ${task.title}\n\n${statusDetail}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: ONAYLANDI\n\nÜretilen Dosyalar: ${JSON.stringify(task.targetFiles)}`);
                        await checkTodoItem(path.join(tlDir, 'TODO.md'), task.title);

                        try {
                            const latestContract = db.prepare(`
                                SELECT id, contract_hash FROM project_contracts
                                WHERE project_id = ? AND status = 'approved'
                                ORDER BY revision DESC LIMIT 1
                            `).get(projectId);
                            if (latestContract) {
                                const specHash = computeTaskSpecHash(task);
                                const inHash = await computeInputHash(projectDir, depTargetFiles);
                                const outHash = await computeOutputHash(projectDir, task.targetFiles || []);
                                saveCheckpoint({
                                    projectId,
                                    taskId,
                                    contractId: latestContract.id,
                                    planHash: latestContract.contract_hash,
                                    taskSpecHash: specHash,
                                    inputHash: inHash,
                                    outputHash: outHash,
                                    gateVersion: '1.0.0',
                                    status: 'completed'
                                });
                            }
                        } catch (cpErr) {
                            logWarning('workflow.checkpoint_save_failed', cpErr, { projectId, taskId });
                        }
                        dag.setTaskStatus(taskId, 'completed', coderOutput);
                        await logEvent(
                            wsHub,
                            projectId,
                            "Coder",
                            "finish",
                            task.targetFiles.join(', '),
                            `Görev "${task.title}" tamamlandı (Reviewer Onaylı).`,
                            coderNodeId,
                            tlId
                        );

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
                        await logEvent(wsHub, projectId, "Workflow", "error", "", errorDetail, tlId);
                        throw new Error(`Orkestrasyon duraklatıldı: Görevler kalite kapısını geçemedi.`);
                    }
                }
                // Teamleader tamamlandı
                await writeDurum(tlDir, 'TAMAMLANDI', 'Tüm coder görevleri başarıyla tamamlandı.');
                await writeRapor(tlDir, `# Rapor: ${tl.name}\n\nDomain alt görevlerinin tamamı başarıyla üretildi.`);
                await checkTodoItem(path.join(directorDir, 'TODO.md'), tl.name);
            }

            // Director tamamlandı
            await writeDurum(directorDir, 'TAMAMLANDI', `${domain.name} domaini başarıyla tamamlandı.`);
            await writeRapor(directorDir, `# Rapor: ${domain.name} Director\n\nTüm takım lideri görevleri tamamlandı.`);
            await checkTodoItem(path.join(managerDir, 'TODO.md'), domain.name);
            if (fsSync.existsSync(path.join(projectDir, 'TODO.md'))) {
                await checkTodoItem(path.join(projectDir, 'TODO.md'), domain.name);
            }
        }

        // 6. AŞAMA: TESTER AJANI VE NİHAİ KONSOLİDE RAPOR
        if (isExecutionActive(await checkPause(projectId, abortController.signal))) {
            // 1. Tüm fiziksel disk dosyalarını topla (Önceki dalgalarda üretilmiş tüm dosyalar dahil!)
            const allDiskFiles = await listProjectTree(projectDir);
            for (const df of allDiskFiles) {
                const idx = generatedProjectFiles.findIndex(gf => gf.path === df.path);
                if (idx !== -1) {
                    generatedProjectFiles[idx] = df;
                } else {
                    generatedProjectFiles.push(df);
                }
            }

            let deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);
            let buildAudit = await validateProjectBuild(projectDir, state, plan, { signal: abortController.signal });

            let allQualityIssues = [
                ...(!deterministicAudit.passed ? deterministicAudit.issues : []),
                ...(!buildAudit.passed ? buildAudit.issues : [])
            ];

            // Eğer deterministik veya compiler/build hataları varsa Coder'a maksimum 2 tur otomatik onarım uygula
            let repairAttempts = 0;
            const MAX_REPAIR_ATTEMPTS = 2;

            while (allQualityIssues.length > 0 && repairAttempts < MAX_REPAIR_ATTEMPTS) {
                repairAttempts++;
                await logEvent(
                    wsHub,
                    projectId,
                    "Tester",
                    "feedback",
                    "",
                    `[Kalite Kapısı Uyarısı - Onarım ${repairAttempts}/${MAX_REPAIR_ATTEMPTS}] Hatalar tespit edildi (${allQualityIssues.slice(0, 2).join(' | ')}). Coder otomatik onarım döngüsü başlatılıyor...`,
                    "tester",
                    "manager"
                );

                const coderAgent = getAgent('coder');
                const existingFilesList = generatedProjectFiles.map(f => f.path).join(', ');
                const repairPrompt = `# PROJE GENELİ ONARIM GÖREVİ (Tur ${repairAttempts}): ${state.title}\n\nCompiler ve Kalite Denetiminde Aşağıdaki Kritik Hatalar Tespit Edildi:\n"""\n${allQualityIssues.map(i => `- ${i}`).join('\n')}\n"""\n\nPROJEDE MEVCUT DOSYALAR:\n${existingFilesList}\n\nLütfen yalnızca hatalı olan dosyaları (TypeScript tip hatalarını, Prisma şema uyumsuzluklarını ve sözdizimi hatalarını düzelterek) eksiksiz ve hatasız biçimde JSON formatında yeniden üret.`;
                
                try {
                    const rawRepair = await callAgentLLM('coder', repairPrompt, { signal: abortController.signal });
                    if (rawRepair && Array.isArray(rawRepair.files) && rawRepair.files.length > 0) {
                        const repairMeta = await writeRepairFiles(
                            {
                                projectDir,
                                allowedFiles: [...repairTargetFiles]
                            },
                            rawRepair.files
                        );
                        const repairPathSet = new Set(repairMeta.map(file => file.path));
                        for (const file of rawRepair.files.filter(file => repairPathSet.has(file.path))) {
                            const existingIdx = generatedProjectFiles.findIndex(f => f.path === file.path);
                            if (existingIdx !== -1) {
                                generatedProjectFiles[existingIdx] = { path: file.path, content: file.content };
                            } else {
                                generatedProjectFiles.push({ path: file.path, content: file.content });
                            }
                        }
                        // Yeniden denetle: Hem statik denetim hem compiler doğrulaması
                        deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);
                        buildAudit = await validateProjectBuild(projectDir, state, plan, { signal: abortController.signal });
                        allQualityIssues = [
                            ...(!deterministicAudit.passed ? deterministicAudit.issues : []),
                            ...(!buildAudit.passed ? buildAudit.issues : [])
                        ];
                    } else {
                        break;
                    }
                } catch (error) {
                    logWarning('workflow.auto_repair_failed', error, { projectId, attempt: repairAttempts });
                    break;
                }
            }

            const isQualityPassed = deterministicAudit.passed && buildAudit.passed;

            const testerAgent = getAgent('tester');
            const testerPrompt = testerAgent.buildPrompt(state.title, plan.talimatname, generatedProjectFiles, {
                buildResults: buildAudit,
                deterministicAudit
            });
            let testerAdvisory = await callAgentLLM('tester', testerPrompt, { signal: abortController.signal });
            if (!testerAdvisory || typeof testerAdvisory !== 'object') {
                testerAdvisory = { approved: false, summary: "Tester geri bildirimi alınamadı.", issues: [] };
            }
            testerAdvisory.issues = Array.isArray(testerAdvisory.issues) ? testerAdvisory.issues : [];

            const verificationEvaluation = evaluateVerificationRun({
                checks: [
                    ...(deterministicAudit?.checks || []),
                    ...(buildAudit?.checks || [])
                ],
                agentApproved: testerAdvisory.approved,
                agentSummary: testerAdvisory.summary
            });

            const testResult = {
                approved: isQualityPassed && verificationEvaluation.passed,
                summary: isQualityPassed ? (testerAdvisory.summary || 'Tüm kalite denetimleri başarıyla tamamlandı.') : `[Kritik Kalite Hataları]: ${allQualityIssues.join(' | ')}`,
                issues: isQualityPassed ? testerAdvisory.issues : [...testerAdvisory.issues, ...allQualityIssues]
            };

            const finalRapor = `# RAPOR: ${state.title}\n\n## 1. Proje Özeti\n${plan.summary || state.title}\n\n## 2. Test & Kalite Doğrulaması\n- Sonuç: ${testResult.approved ? 'BAŞARILI' : 'REDDEDİLDİ / KRİTİK HATALAR MEVCUT'}\n- Detay: ${testResult.summary}\n${testResult.issues.length > 0 ? `\n### Tespit Edilen Kritik Sorunlar:\n${testResult.issues.map(i => `- ${i}`).join('\n')}\n` : ''}\n## 3. Üretilen Dosyalar\n${generatedProjectFiles.map(f => `- \`${f.path}\``).join('\n')}\n`;
            await writeRapor(projectDir, finalRapor);

            if (!testResult.approved) {
                await writeDurum(
                    projectDir,
                    'BASARISIZ',
                    `Proje kabul testlerini geçemedi: ${testResult.summary}`
                );
                await logEvent(
                    wsHub,
                    projectId,
                    "Tester",
                    "error",
                    "",
                    `Proje kabul testlerini geçemedi: ${testResult.summary}`,
                    "tester",
                    "manager"
                );

                const latestContract = db.prepare(`
                    SELECT id FROM project_contracts
                    WHERE project_id = ? AND status = 'approved'
                `).get(projectId);
                if (latestContract) {
                    for (const issue of testResult.issues) {
                        const issueText = String(issue);
                        const issueId = `repair-${crypto.randomUUID()}`;
                        const fingerprint = crypto.createHash('md5')
                            .update(issueText)
                            .digest('hex');
                        db.prepare(`
                            INSERT INTO repair_issues (
                                id, project_id, contract_id, run_id,
                                fingerprint, severity, status, detail_json
                            ) VALUES (?, ?, ?, ?, ?, 'critical', 'open', ?)
                        `).run(
                            issueId,
                            projectId,
                            latestContract.id,
                            attemptId,
                            fingerprint,
                            JSON.stringify({ issue: issueText })
                        );
                    }
                }
                invalidateProjectCheckpoints(projectId);
                if (typeof dag?.getAllTasks === 'function') {
                    for (const t of dag.getAllTasks()) {
                        await reconcileTaskCache(projectDir, t.id, t);
                    }
                }

                terminalStatus = 'rejected';
                executionError = `Proje kabul testlerini geçemedi: ${testResult.summary}`;

                const failedState = await readProjectState(projectId);
                if (failedState) {
                    const failurePaths = {
                        implementing: [
                            'implementation_finished',
                            'verification_pending',
                            'verification_running',
                            'verification_failed'
                        ],
                        implementation_finished: [
                            'verification_pending',
                            'verification_running',
                            'verification_failed'
                        ],
                        verification_pending: [
                            'verification_running',
                            'verification_failed'
                        ],
                        verification_running: ['verification_failed']
                    };
                    const failurePath = failurePaths[failedState.status] || ['verification_failed'];
                    for (const status of failurePath.slice(0, -1)) {
                        failedState.status = status;
                        await writeProjectState(projectId, failedState);
                    }

                    failedState.status = failurePath.at(-1);
                    const now = new Date();
                    const formattedDate = now.toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                    const formattedTime = now.toLocaleTimeString('tr-TR', {
                        hour12: false
                    });

                    if (!failedState.chatHistory) failedState.chatHistory = [];
                    failedState.chatHistory.push({
                        role: 'model',
                        parts: [{
                            text: `⚠️ **Tester Kalite Kapısı Uyarısı:**\n\nProje kabul testlerinde bazı sözdizimi veya kırık ithalat (import) hataları tespit edildi ve proje güvenli modda duraklatıldı:\n\n${testResult.issues.map(issue => `- ${issue}`).join('\n')}\n\nSüreci düzeltip devam ettirmek için üst menüdeki **'Projeyi Devam Ettir (Resume)'** butonuna basabilir veya bana revizyon bildirebilirsiniz.`
                        }],
                        timestamp: `${formattedDate} ${formattedTime}`,
                        created_at: now.toISOString()
                    });
                    await writeProjectState(projectId, failedState);
                }
                return;
            }

            // Product completion is evidence-authorized exclusively by completeVerifiedProject.
            // Workflow output remains advisory until artifact verification supplies these IDs.
            // Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (Scaffold Guard)
            await ensureProjectScaffold(projectDir, state, plan);

            // Otomatik Çalıştırma ve Kurulum Kılavuzu (Kapsamlı README.md)
            let managerTalimat = plan.talimatname || '';
            if (!managerTalimat) {
                try {
                    const talimatPath = path.join(projectDir, 'manager', 'TALIMATNAME.md');
                    if (fsSync.existsSync(talimatPath)) {
                        managerTalimat = fsSync.readFileSync(talimatPath, 'utf8');
                    }
                } catch {}
            }

            let cleanTalimat = managerTalimat.replace(/^#\s+[^\n]+\n/, '').trim();
            // İç ajan, orkestrasyon jargonu ve onay buton yönlendirmelerini temizle
            cleanTalimat = cleanTalimat
                .replace(/###\s*(?:📦\s*)?(?:\d+\.\s*)?Domain\s*(&|ve)\s*Ajan\s*Bölünmesi[\s\S]*?(?=(?:###|##|---|$))/gi, '')
                .replace(/\*?\*?`?(?:backend|frontend|database)\.director`?\*?:[^\n]*/gi, '')
                .replace(/Mimari planı ve şartnameyi hazırladım[\s\S]*$/gi, '')
                .replace(/\[PLAN_HAZIR\]/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            const readmeContent = `# 🚀 ${state.title}

> ${plan.summary || 'Modern web ve API uygulaması.'}

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:

### 1. Adım: Bağımlılıkları Yükleyin
\`\`\`bash
npm install
\`\`\`

### 2. Adım: Veritabanı ve Şemayı Hazırlayın (Prisma / SQLite)
> **Not:** \`.env.example\` dosyasını \`.env\` olarak kopyalayın, \`NEXTAUTH_SECRET\` değerini uzun rastgele bir anahtarla değiştirin ve \`DATABASE_URL="file:./dev.db"\` ayarını doğrulayın.
\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`

### 3. Adım: (Varsa) Tohum / Örnek Verileri Yükleyin
\`\`\`bash
npx prisma db seed
\`\`\`

### 4. Adım: Uygulamayı Başlatın
\`\`\`bash
npm run dev
\`\`\`
Uygulamanız varsayılan olarak \`http://localhost:3000\` adresinde çalışacaktır.

---

## 📋 Proje Özellikleri ve Mimari Yapı

${cleanTalimat}
`;
            await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent, 'utf8');

            const latestContract = db.prepare(`
                SELECT id FROM project_contracts
                WHERE project_id = ? AND status = 'approved'
                ORDER BY revision DESC LIMIT 1
            `).get(projectId);
            if (!latestContract) throw new Error(`Project ${projectId} has no approved contract.`);
            const artifact = await createProjectZip(
                projectId,
                latestContract.id,
                await listProjectTree(projectDir)
            );
            const completion = await verifyArtifactAndProject({
                projectId,
                contractId: latestContract.id,
                artifactId: artifact.id,
                expectedRevision: (await readProjectState(projectId))?.revision ?? null,
                complete: true
            });
            if (!completion.completed) {
                throw new Error(completion.error || 'Canonical verification did not complete the project.');
            }
            await logEvent(wsHub, projectId, "Manager", "finish", "RAPOR.md, README.md", "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.", "manager");
        }
    } catch (error) {
        if (abortController.signal.aborted) {
            terminalStatus = abortController.signal.reason === 'PAUSED' ? 'paused' : 'aborted';
            logWarning('workflow.execution_aborted', null, { projectId, attemptId, reason: abortController.signal.reason });
        } else {
            terminalStatus = 'failed';
            executionError = error.message;
            const errorLog = logError('workflow.execution_failed', error, { projectId, attemptId });
            await logEvent(wsHub, projectId, "System", "error", "", `Süreç hatası. Referans: ${errorLog.requestId}`, "system");
            const failedState = await readProjectState(projectId);
            if (failedState) {
                failedState.status = 'paused';
                const errNow = new Date();
                const errDate = errNow.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const errTime = errNow.toLocaleTimeString('tr-TR', { hour12: false });

                if (!failedState.chatHistory) failedState.chatHistory = [];
                failedState.chatHistory.push({
                    role: 'model',
                    parts: [{ text: `⚠️ **Süreç Duraklatıldı (Müdahale Gerekli):**\n\nAlt ajanların görev üretiminde bir kalite kapısı engeli ile karşılaşıldı ve proje güvenli modda duraklatıldı.\n\n- Ayrıntıları üst menüdeki **'Canlı Süreç Logları'** veya **'Canlı DAG Grafiği'** sekmesinden inceleyebilirsiniz.\n- Bana buradan *"Hata neydi, ne yapmalıyız?"* diye sorabilir veya hazır olduğunuzda üstteki **'Devam Et (Resume)'** butonuna tıklayabilirsiniz.` }],
                    timestamp: `${errDate} ${errTime}`,
                    created_at: errNow.toISOString()
                });
                await writeProjectState(projectId, failedState);
            }
        }
    } finally {
        clearInterval(heartbeatTimer);
        unregisterProjectAbortController(projectId);
        if (abortController.signal.aborted && abortController.signal.reason === 'PAUSED') {
            terminalStatus = 'paused';
        }
        if (attemptId) {
            releaseWorkflowLease(attemptId, terminalStatus, { error: executionError });
        }
    }
}
