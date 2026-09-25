import crypto from 'crypto';
/**
 * XFactor Otonom DAG İş Akışı Motoru (Workflow Engine)
 * Referans: Archon Deterministic Engine & Agency-Agents
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
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
    readAltTalimatname,
    readTasksFromTodoFile,
    reconcileTaskCache,
    isTaskCheckpointValid,
    writeGeneratedFiles as writeRepairFiles
} from './fileProtocol.js';
import { getAgent, runDeterministicProjectAudit, groupAuditIssuesByFile } from '../agents/index.js';
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
import { db, dbEvents, saveProjectLog } from '../db.js';
import { ensureProjectScaffold, listProjectTree, writeGeneratedFiles, detectProjectStack } from './codeGenerator.js';
import { executeCorrectionLoop } from './selfCorrection.js';
import { runLLMTaskWithRetry } from './llmTaskRetry.js';
import { logError, logWarning, redactSensitiveText } from '../observability.js';
import {
    updateAttemptHeartbeat,
    releaseWorkflowLease,
    assertWorkflowLease
} from '../workflowAttempts.js';
import { registerProjectAbortController, unregisterProjectAbortController } from './cancellation.js';
import {
    getProjectDir,
    getProjectsRoot,
    getProject as readProjectState,
    saveProjectState as writeProjectState,
    appendProjectActionMessages
} from '../projectRepository.js';
import { verifyArtifactAndProject } from '../verification/verificationCli.js';
import { createProjectZip } from '../utils/archive.js';
import { saveCheckpoint } from './checkpointRepository.js';
import { computeTaskSpecHash, computeInputHash, computeOutputHash } from './checkpointHelper.js';
import { generateProjectReadme } from './readmeGenerator.js';
import { collectArtifactFiles } from '../artifactInventory.js';
import { restoreTaskTargetsFromProtocol } from '../services/reconciliationService.js';
import { createExecutionClient } from '../executionClient.js';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { validateRuntimeConfig } from '../config.js';
import { executeSafeCommand } from './buildValidator.js';
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

export function resolveStaticAuditRepairIssues(database, projectId, contractId) {
    return database.prepare(`
        UPDATE repair_issues
        SET status = 'resolved', resolved_at = ?
        WHERE project_id = ? AND contract_id = ? AND status = 'open'
          AND requirement_id IS NULL
          AND run_id IN (SELECT id FROM workflow_attempts WHERE project_id = ?)
    `).run(new Date().toISOString(), projectId, contractId, projectId).changes;
}

export function restoreDirectorSpecFromDisk(domain, altTalimatname, directorDir, teamleaderPlans = {}) {
    if (!altTalimatname || !fsSync.existsSync(directorDir)) return null;
    const prefix = `${domain.prefix}.`;
    const teamleaders = Object.entries(teamleaderPlans)
        .filter(([key, plan]) => key.startsWith(prefix) && Array.isArray(plan?.tasks) && plan.tasks.length > 0)
        .map(([key]) => {
            const tlPrefix = key.slice(prefix.length);
            if (!tlPrefix || !/^[a-zA-Z0-9_-]+$/.test(tlPrefix)
                || !fsSync.existsSync(path.join(directorDir, tlPrefix, 'TODO.md'))) return null;
            return { name: `${tlPrefix}.teamleader`, prefix: tlPrefix, mission: `${domain.name} geliştirme` };
        }).filter(Boolean);
    if (teamleaders.length === 0) return null;
    return { domain: domain.name, altTalimatname, teamleaders };
}
export function mergeGeneratedProjectFiles(generatedFiles = [], diskFiles = []) {
    const filesByPath = new Map();
    for (const file of generatedFiles) {
        if (file?.path) filesByPath.set(file.path.replace(/\\/g, '/'), file);
    }
    for (const file of diskFiles) {
        if (file?.path) filesByPath.set(file.path.replace(/\\/g, '/'), file);
    }
    return [...filesByPath.values()];
}

const NEXT_ROOT_CONFIG_FILES = new Set([
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lockb',
    'bun.lock',
    'tsconfig.json',
    'jsconfig.json',
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'next.config.cjs',
    'tailwind.config.js',
    'tailwind.config.ts',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
    'postcss.config.js',
    'postcss.config.mjs',
    'postcss.config.ts',
    'postcss.config.cjs',
    'next-env.d.ts',
    'components.json'
]);

const NEXT_ROOT_DIR_PREFIXES = [
    'src/',
    'prisma/',
    'public/',
    'node_modules/',
    '.next/',
    '.git/',
    'manager/'
];

export function canonicalizeNextTaskPath(filePath) {
    if (typeof filePath !== 'string') return filePath;
    let normalized = filePath.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (!normalized) return normalized;

    for (const prefix of NEXT_ROOT_DIR_PREFIXES) {
        if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) {
            return normalized;
        }
    }

    const lower = normalized.toLowerCase();
    if (NEXT_ROOT_CONFIG_FILES.has(lower)) {
        return normalized;
    }
    if (lower.startsWith('tsconfig.') && lower.endsWith('.json')) {
        return normalized;
    }
    if (lower.startsWith('.env') || lower.startsWith('.git') || lower.startsWith('.eslint') || lower.startsWith('eslint.config.') || lower.startsWith('.prettier') || lower.startsWith('prettier.config.')) {
        return normalized;
    }
    if (lower === 'readme.md' || lower === 'readme' || lower === 'talimatname.md' || lower === 'todo.md' || lower === 'rapor.md' || lower === 'durum.md') {
        return normalized;
    }

    return `src/${normalized}`;
}

export function normalizeTeamleaderPlanForStack(taskPlan, stack = {}) {
    if (!taskPlan || typeof taskPlan !== 'object') return taskPlan;
    const isNext = typeof stack === 'boolean'
        ? stack
        : Boolean(stack.isNext ?? (stack.framework === 'nextjs' || stack.framework === undefined));

    if (!isNext) return taskPlan;

    const tasks = Array.isArray(taskPlan.tasks)
        ? taskPlan.tasks.map(task => {
            if (!task || typeof task !== 'object') return task;
            const targetFiles = Array.isArray(task.targetFiles)
                ? task.targetFiles.map(canonicalizeNextTaskPath)
                : task.targetFiles;
            return {
                ...task,
                ...(targetFiles !== undefined ? { targetFiles } : {})
            };
        })
        : taskPlan.tasks;

    return {
        ...taskPlan,
        ...(tasks !== undefined ? { tasks } : {})
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

export async function logEvent(
    wsHub,
    projectId,
    agentType,
    action,
    filePath,
    message,
    nodeId,
    parentNodeId = null,
    leaseOptions = null
) {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });
    const event = {
        projectId,
        timestamp: `${formattedDate} ${formattedTime}`,
        time_only: formattedTime,
        created_at: now.toISOString(),
        agent: agentType,
        action,
        file: redactSensitiveText(filePath),
        message: redactSensitiveText(message),
        node_id: nodeId,
        parent_node_id: parentNodeId,
        attemptId: leaseOptions?.attemptId ?? null,
        leaseOwner: leaseOptions?.leaseOwner ?? null
    };

    try {
        saveProjectLog(event, leaseOptions);
    } catch (error) {
        if (leaseOptions) throw error;
        logError('workflow.event_persist_failed', error, { projectId, action });
    }

    if (wsHub) {
        wsHub.publish(event);
    }
}
export function createWorkflowLogEvent(leaseOptions, eventLogger = logEvent) {
    return (
        wsHub,
        projectId,
        agentType,
        action,
        filePath,
        message,
        nodeId,
        parentNodeId = null
    ) => eventLogger(
        wsHub,
        projectId,
        agentType,
        action,
        filePath,
        message,
        nodeId,
        parentNodeId,
        leaseOptions
    );
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
async function callAgentLLM(agentRole, userPrompt, {
    signal = null,
    taskId = null,
    onDiagnostic = null
} = {}) {
    const agent = getAgent(agentRole);
    return runLLMTaskWithRetry({
        agentRole,
        taskId,
        signal,
        onDiagnostic: onDiagnostic || undefined,
        messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        parseResponse: rawResponse => agent.parseResponse(rawResponse)
    });
}

/**
 * Deterministik statik kaynak denetimi sonrası hedefli (path-aware) onarım döngüsü.
 * Her LLM çağrısı tek bir hatalı dosyayı, mevcut içeriği ve o dosyaya ait hatalarla hedefler.
 */
export async function executeStaticRepairLoop({
    projectId,
    projectDir = null,
    projectTitle = '',
    generatedProjectFiles = [],
    repairTargetFiles = [],
    plan = {},
    state = {},
    callAgent = callAgentLLM,
    wsHub = null,
    workflowLog = workflowLogEvent,
    recordDiagnostic = null,
    signal = null,
    maxRounds = 5,
    maxTotalAttempts = 15
}) {
    const repairTargetSet = new Set(
        (repairTargetFiles || []).map(f => (typeof f === 'string' ? f.replace(/\\/g, '/') : ''))
    );

    let deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);
    if (deterministicAudit.passed) {
        return {
            success: true,
            attempts: 0,
            rounds: 0,
            audit: deterministicAudit,
            generatedFiles: generatedProjectFiles
        };
    }

    let round = 0;
    let totalAttempts = 0;

    while (!deterministicAudit.passed && round < maxRounds && totalAttempts < maxTotalAttempts) {
        round++;
        const { fileIssuesMap } = groupAuditIssuesByFile(deterministicAudit);
        const failingFilePaths = Array.from(fileIssuesMap.keys())
            .filter(p => p && p !== 'unknown')
            .sort();

        if (failingFilePaths.length === 0) {
            break;
        }

        let progressMadeInRound = false;
        const initialIssuesCount = deterministicAudit.issues.length;

        for (const targetPath of failingFilePaths) {
            if (totalAttempts >= maxTotalAttempts) break;
            if (signal?.aborted) break;

            if (!repairTargetSet.has(targetPath)) {
                logWarning('workflow.repair_target_not_allowed', null, { projectId, targetPath });
                continue;
            }

            let currentContent = '';
            if (projectDir) {
                try {
                    currentContent = await fs.readFile(path.join(projectDir, targetPath), 'utf8');
                } catch {
                    const memFile = generatedProjectFiles.find(f => f.path?.replace(/\\/g, '/') === targetPath);
                    currentContent = memFile?.content || '';
                }
            } else {
                const memFile = generatedProjectFiles.find(f => f.path?.replace(/\\/g, '/') === targetPath);
                currentContent = memFile?.content || '';
            }

            const targetIssues = fileIssuesMap.get(targetPath) || [];
            totalAttempts++;

            await workflowLog(
                wsHub,
                projectId,
                "Tester",
                "feedback",
                targetPath,
                `[Hedef Onarım ${totalAttempts} - Tur ${round}] "${targetPath}" dosyasındaki hatalar gideriliyor (${targetIssues.slice(0, 2).join(' | ')})...`,
                "tester-qa",
                "manager"
            );

            const title = projectTitle || state.title || 'Proje';
            const repairPrompt = `# HEDEF DOSYA STATİK ONARIM GÖREVİ (Dosya: ${targetPath})\nProje: ${title}\n\n"${targetPath}" dosyasında deterministik kaynak denetiminde aşağıdaki kritik hatalar tespit edildi:\n"""\n${targetIssues.map(i => `- ${i}`).join('\n')}\n"""\n\nDOSYANIN MEVCUT İÇERİĞİ:\n"""\n${currentContent}\n"""\n\nLütfen YALNIZCA "${targetPath}" dosyasını hataları düzelterek (tip sözleşmesi, Prisma şeması, hardcoded fallback veya sözdizimi hatalarını gidererek) eksiksiz ve hatasız biçimde JSON formatında yeniden üret. Başka hiçbir dosya üretme veya değiştirme. Gerçek clean-install/typecheck/build doğrulaması yalnızca izole worker tarafından yapılacaktır.`;

            try {
                const rawRepair = await callAgent('coder', repairPrompt, {
                    signal,
                    taskId: `generation.repair.${totalAttempts}`,
                    onDiagnostic: recordDiagnostic
                });

                if (rawRepair && Array.isArray(rawRepair.files) && rawRepair.files.length > 0) {
                    const matchingFiles = rawRepair.files.filter(
                        f => f && typeof f.path === 'string' && f.path.replace(/\\/g, '/') === targetPath && typeof f.content === 'string'
                    );

                    if (matchingFiles.length === 0) {
                        logWarning('workflow.repair_file_mismatch', null, { projectId, targetPath, returnedFiles: rawRepair.files.map(f => f.path) });
                        continue;
                    }

                    const repairFile = { path: targetPath, content: matchingFiles[0].content };
                    if (projectDir) {
                        await writeRepairFiles(
                            {
                                projectDir,
                                allowedFiles: [targetPath],
                                allowConfigMutation: true
                            },
                            [repairFile]
                        );
                    }

                    const existingIdx = generatedProjectFiles.findIndex(f => f.path?.replace(/\\/g, '/') === targetPath);
                    if (existingIdx !== -1) {
                        generatedProjectFiles[existingIdx] = repairFile;
                    } else {
                        generatedProjectFiles.push(repairFile);
                    }

                    if (projectDir) {
                        await ensureProjectScaffold(projectDir, state, plan);
                        generatedProjectFiles.splice(
                            0,
                            generatedProjectFiles.length,
                            ...mergeGeneratedProjectFiles(generatedProjectFiles, await listProjectTree(projectDir))
                        );
                    }

                    const nextAudit = runDeterministicProjectAudit(generatedProjectFiles);
                    if (nextAudit.issues.length < initialIssuesCount || nextAudit.passed) {
                        progressMadeInRound = true;
                    } else {
                        const { fileIssuesMap: nextFileIssues } = groupAuditIssuesByFile(nextAudit);
                        const remainingForTarget = nextFileIssues.get(targetPath) || [];
                        if (remainingForTarget.length < targetIssues.length) {
                            progressMadeInRound = true;
                        }
                    }

                    deterministicAudit = nextAudit;
                    if (deterministicAudit.passed) {
                        return {
                            success: true,
                            attempts: totalAttempts,
                            rounds: round,
                            audit: deterministicAudit,
                            generatedFiles: generatedProjectFiles
                        };
                    }
                }
            } catch (error) {
                logWarning('workflow.auto_repair_failed', error, { projectId, attempt: totalAttempts, targetPath });
            }
        }

        if (!progressMadeInRound && deterministicAudit.issues.length >= initialIssuesCount) {
            break;
        }
    }

    return {
        success: deterministicAudit.passed,
        attempts: totalAttempts,
        rounds: round,
        audit: deterministicAudit,
        generatedFiles: generatedProjectFiles
    };
}

/**
 * Ana Otonom İş Akışı Yürütücüsü (Workflow Engine)
 */
export async function executeProjectTasks(projectId, wsHub = null, attemptId = null, leaseOwner = null) {
    const projectDir = getProjectDir(projectId);
    const state = await readProjectState(projectId);

    if (!state) return;

    state.workflow = normalizeWorkflowState(state.workflow);

    const abortController = new AbortController();
    registerProjectAbortController(projectId, abortController);
    const effectiveLeaseOwner = leaseOwner;
    const leaseOptions = attemptId
        ? { attemptId, leaseOwner: effectiveLeaseOwner }
        : null;
    const workflowWriteState = (id, nextState) => writeProjectState(id, nextState, leaseOptions);
    const workflowLogEvent = createWorkflowLogEvent(leaseOptions);
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

    let heartbeatTimer = null;
    let terminalStatus = 'completed';
    let executionError = null;

    if (attemptId) {
        heartbeatTimer = setInterval(() => {
            if (!updateAttemptHeartbeat(attemptId, effectiveLeaseOwner)
                && !abortController.signal.aborted) {
                abortController.abort('LEASE_LOST');
            }
        }, 5000);
    }

    try {
        if (attemptId) assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
        await workflowLogEvent(wsHub, projectId, "Manager", "start", "", "Otonom DAG orkestrasyon süreci başlatıldı.", "manager");

        // 1. AŞAMA: MANAGER & ROOT PROTOKOLÜ
        await checkPause(projectId, abortController.signal);
        let plan = state.plan;

        if (!plan || !plan.domains || plan.domains.length === 0) {
            const managerAgent = getAgent('manager');
            const managerPrompt = managerAgent.buildPrompt(state.title, state.chatHistory ? state.chatHistory.map(m => ({ role: m.role, content: m.parts ? m.parts[0].text : '' })) : []);
            plan = await callAgentLLM('manager', managerPrompt, {
                signal: abortController.signal,
                taskId: 'manager.plan',
                onDiagnostic: recordLLMDiagnostic
            });
            state.plan = plan;
            await workflowWriteState(projectId, state);
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
        await workflowWriteState(projectId, state);

        const sortedRawDomains = orderDomainsCoreFirst(plan.domains);
        const domainList = sortedRawDomains.map(d => ({
            name: typeof d === 'string' ? d : d.name,
            prefix: typeof d === 'string' ? d : (d.prefix || d.name),
            description: typeof d === 'string' ? `${d} domaini` : (d.description || `${d.name} domaini`)
        }));
        await setupRootProtocol(projectDir, plan.talimatname, domainList);
        await workflowLogEvent(wsHub, projectId, "Manager", "write", "TALIMATNAME.md", "Ana şartname ve kök TODO.md protokolü oluşturuldu.", "manager");

        // Architecture-First (Önce Mimari Sözleşme): Kodlama başlamadan önce onaylı paketler, .env.example ve köprüler kilitlenir!
        await ensureProjectScaffold(projectDir, state, plan);
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
            if (!directorSpec) {
                directorSpec = restoreDirectorSpecFromDisk(domain, altTalimatOnDisk, directorDir, state.workflow.teamleaderPlans);
                if (directorSpec) {
                    state.workflow.directorSpecs[domain.prefix] = directorSpec;
                    await workflowWriteState(projectId, state);
                }
            }
            if (!directorSpec || Array.isArray(directorSpec) || (typeof directorSpec === 'object' && Object.keys(directorSpec).length === 0)) {
                await workflowLogEvent(wsHub, projectId, "Director", "start", "", `${domain.name} Director görevi devraldı. Şartname hazırlanıyor...`, directorId, "manager");
                const directorAgent = getAgent('director');
                const directorPrompt = directorAgent.buildPrompt(domain.name, domain.description, plan.talimatname);
                const rawSpec = await callAgentLLM('director', directorPrompt, {
                    signal: abortController.signal,
                    taskId: `${directorId}.spec`,
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

            if (!altTalimatOnDisk) {
                directorDir = await setupDirectorProtocol(
                    managerDir,
                    domain.prefix,
                    `# Görev: ${domain.name}\n\n${domain.description}`,
                    directorSpec.altTalimatname,
                    teamleaders
                );
                await workflowLogEvent(wsHub, projectId, "Director", "write", "ALT-TALIMATNAME.md", `${domain.name} için ALT-TALIMATNAME.md üretildi.`, directorId, "manager");
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
                    await workflowLogEvent(wsHub, projectId, "Teamleader", "start", "", `${tl.name} görevleri atomik parçalara (DAG) ayırıyor...`, tlId, directorId);
                    const tlAgent = getAgent('teamleader');
                    const tlPrompt = tlAgent.buildPrompt(tl.name, tl.mission, directorSpec.altTalimatname, plan.requirements || []);
                    taskPlan = await callAgentLLM('teamleader', tlPrompt, {
                        signal: abortController.signal,
                        taskId: `${tlId}.plan`,
                        onDiagnostic: recordLLMDiagnostic
                    });
                }
                taskPlan = normalizeTeamleaderTasks(taskPlan, plan.requirements || []);
                taskPlan = {
                    ...taskPlan,
                    tasks: restoreTaskTargetsFromProtocol(tlDir, taskPlan.tasks)
                };
                taskPlan = normalizeTeamleaderPlanForStack(taskPlan, stack);
                state.workflow.teamleaderPlans[tlId] = taskPlan;
                await workflowWriteState(projectId, state);
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
                            {
                                planHash: currentPlanHash,
                                contractId: latestContract?.id,
                                dependencyTargetFiles: depTargetFiles,
                                gateVersion: '1.0.0',
                                allowAcceptanceRetry: Boolean(latestContract && db.prepare(`
                                    SELECT 1 FROM repair_issues
                                    WHERE project_id = ? AND contract_id = ? AND status = 'open'
                                    LIMIT 1
                                `).get(projectId, latestContract.id))
                            }
                        );

                        if (checkpointValid) {
                            dag.setTaskStatus(taskId, 'completed');
                            await workflowLogEvent(wsHub,
                            projectId,
                            "Coder",
                            "skip",
                            task.targetFiles ? task.targetFiles.join(', ') : '',
                            `Görev "${task.title}" CAS checkpoint doğrulamasıyla geçerli, atlanıyor.`,
                            coderNodeId,
                            tlId);
                            return { success: true, taskId, skipped: true };
                        }

                        // Checkpoint geçersizse dosya sistemi önbelleğini ve TODO durumunu sıfırla
                        await reconcileTaskCache(projectDir, taskId, task);

                        await workflowLogEvent(wsHub, projectId, "Teamleader", "delegate", "", `Görev "${task.title}" Coder'a iletildi. Kod üretiliyor...`, coderNodeId, tlId);

                        await setupCoderProtocol(
                            tlDir,
                            taskId,
                            task.title,
                            `# Atomik Görev: ${task.title}\n\nAçıklama: ${task.description}\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`
                        );

                        // Yapılandırılmış Proje Bağlamı (Şemalar, Tipler, Route'lar)
                        // Şema daima en başta ve kesilmeden tam metin olarak verilmelidir!
                        const schemaFile = generatedProjectFiles.find(f => f.path.includes('schema.prisma'));
                        const otherContextFiles = generatedProjectFiles.filter(f =>
                            !f.path.includes('schema.prisma') && (
                                f.path.endsWith('.d.ts') ||
                                f.path.includes('types') ||
                                f.path.includes('validations') ||
                                f.path.includes('/api/') ||
                                f.path.includes('service')
                            )
                        );

                        const contextParts = [];
                        if (schemaFile && schemaFile.content) {
                            contextParts.push(`⚠️ PROJE PRISMA ŞEMASI (Veritabanı modelleri ve ilişki isimleri kesinlikle bu şemaya uymalıdır):\nDosya: ${schemaFile.path}\n\`\`\`prisma\n${schemaFile.content}\n\`\`\``);
                        }
                        for (const f of otherContextFiles) {
                            const snippet = f.content.length > 2000 ? f.content.slice(0, 2000) + '\n// ... [kesildi]' : f.content;
                            contextParts.push(`Dosya: ${f.path}\n\`\`\`\n${snippet}\n\`\`\``);
                        }
                        const projectContext = contextParts.join('\n\n');

                        // Coder LLM çağrısı
                        const coderAgent = getAgent('coder');
                        const coderPrompt = coderAgent.buildPrompt(taskId, task.title, task.description, task.targetFiles, projectContext);
                        let coderOutput = await callAgentLLM('coder', coderPrompt, {
                            signal: abortController.signal,
                            taskId,
                            onDiagnostic: recordLLMDiagnostic
                        });

                        await workflowLogEvent(wsHub, projectId, "Coder", "write", task.targetFiles.join(', '), `İlk kod bloğu üretildi. Reviewer denetim döngüsü başlatılıyor...`, coderNodeId, tlId);

                        // 5. AŞAMA: REVIEWER & SELF-CORRECTION DÖNGÜSÜ
                        const loopResult = await executeCorrectionLoop({
                            taskId,
                            taskTitle: task.title,
                            targetFiles: task.targetFiles,
                            initialCoderOutput: coderOutput,
                            coderPrompt,
                            maxRetries: 2,
                            signal: abortController.signal,
                            onLLMDiagnostic: recordLLMDiagnostic,
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
                            await writeDurum(coderDir, 'BASARISIZ', `Görev Reviewer tarafından reddedildi: ${failReason}`);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\nReviewer Reddi:\n${failReason}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: REDDEDILDI\n\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`);
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
                            await writeDurum(coderDir, 'BASARISIZ', writeError);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\n${writeError}`);
                            dag.setTaskStatus(taskId, 'failed', { error: writeError });
                            await workflowLogEvent(wsHub, projectId, "Coder", "failure", "", writeError, coderNodeId, tlId);
                            return { success: false, taskId, error: writeError };
                        }

                        // Nihai onaylı dosyaları güvenli path guard üzerinden yaz.
                        const writtenMeta = await writeGeneratedFiles(projectDir, coderDir, coderOutput.files, task.targetFiles);
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
                            await writeDurum(coderDir, 'BASARISIZ', writeError);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\n${writeError}`);
                            dag.setTaskStatus(taskId, 'failed', { error: writeError });
                            await workflowLogEvent(wsHub, projectId, "Coder", "failure", incompleteTargetFiles.join(', '), writeError, coderNodeId, tlId);
                            return { success: false, taskId, error: writeError };
                        }
                        const writtenFiles = coderOutput.files
                            .filter(file => writtenPathSet.has(path.normalize(file.path).replace(/\\/g, '/')))
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
                                    status: 'completed',
                                    attemptId,
                                    leaseOwner: effectiveLeaseOwner
                                });
                            }
                        } catch (cpErr) {
                            if (cpErr?.code === 'WORKFLOW_LEASE_FENCED') throw cpErr;
                            logWarning('workflow.checkpoint_save_failed', cpErr, { projectId, taskId });
                        }
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
            generatedProjectFiles.splice(
                0,
                generatedProjectFiles.length,
                ...mergeGeneratedProjectFiles(generatedProjectFiles, allDiskFiles)
            );

            // Scaffold package.json ve yardımcı dosyaları değiştirebilir; denetim her
            // zaman diskten yeniden yüklenmiş en güncel içerikle yapılır.
            await ensureProjectScaffold(projectDir, state, plan);
            generatedProjectFiles.splice(
                0,
                generatedProjectFiles.length,
                ...mergeGeneratedProjectFiles(generatedProjectFiles, await listProjectTree(projectDir))
            );

            let deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);

            if (!deterministicAudit.passed) {
                const repairResult = await executeStaticRepairLoop({
                    projectId,
                    projectDir,
                    projectTitle: state.title,
                    generatedProjectFiles,
                    repairTargetFiles: [...repairTargetFiles],
                    plan,
                    state,
                    callAgent: callAgentLLM,
                    wsHub,
                    workflowLog: workflowLogEvent,
                    recordDiagnostic: recordLLMDiagnostic,
                    signal: abortController.signal
                });
                deterministicAudit = repairResult.audit;
            }

            let allQualityIssues = !deterministicAudit.passed ? [...deterministicAudit.issues] : [];
            const isQualityPassed = deterministicAudit.passed;

            await workflowLogEvent(
                wsHub,
                projectId,
                "Tester",
                "start",
                "",
                "Proje kabul testleri ve statik denetim başlatılıyor...",
                "tester-qa",
                "manager"
            );

            const testerAgent = getAgent('tester');
            const testerPrompt = testerAgent.buildPrompt(state.title, plan.talimatname, generatedProjectFiles, {
                deterministicAudit
            });
            let testerAdvisory = await callAgentLLM('tester', testerPrompt, {
                signal: abortController.signal,
                taskId: 'tester.static-audit',
                onDiagnostic: recordLLMDiagnostic
            });
            if (!testerAdvisory || typeof testerAdvisory !== 'object') {
                testerAdvisory = { approved: false, summary: "Tester geri bildirimi alınamadı.", issues: [] };
            }
            testerAdvisory.issues = Array.isArray(testerAdvisory.issues) ? testerAdvisory.issues : [];

            const testResult = {
                approved: isQualityPassed && (testerAdvisory.approved !== false),
                summary: isQualityPassed ? (testerAdvisory.summary || 'Deterministik kaynak denetimi tamamlandı; izole runtime doğrulaması bekliyor.') : `[Kritik Statik Kalite Hataları]: ${allQualityIssues.join(' | ')}`,
                issues: isQualityPassed ? testerAdvisory.issues : [...testerAdvisory.issues, ...allQualityIssues]
            };

            const finalRapor = `# RAPOR: ${state.title}\n\n## 1. Proje Özeti\n${plan.summary || state.title}\n\n## 2. Statik Üretim Denetimi\n- Sonuç: ${testResult.approved ? 'STATİK DENETİM GEÇTİ — İZOLE RUNTIME DOĞRULAMASI BEKLİYOR' : 'REDDEDİLDİ / KRİTİK HATALAR MEVCUT'}\n- Detay: ${testResult.summary}\n- Sınır: Bu aşama yalnızca JSON, AST, ithalat ve sözleşme denetimidir; gerçek clean install, Prisma generate/db push/seed, TypeScript, framework build ve runtime smoke başarısını iddia etmez.\n${testResult.issues.length > 0 ? `\n### Tespit Edilen Kritik Sorunlar:\n${testResult.issues.map(i => `- ${i}`).join('\n')}\n` : ''}\n## 3. Üretilen Dosyalar\n${generatedProjectFiles.map(f => `- \`${f.path}\``).join('\n')}\n`;
            await writeRapor(projectDir, finalRapor);

            if (!testResult.approved) {
                await writeDurum(
                    projectDir,
                    'BASARISIZ',
                    `Proje kabul testlerini geçemedi: ${testResult.summary}`
                );
                await workflowLogEvent(
                    wsHub,
                    projectId,
                    "Tester",
                    "error",
                    "",
                    `Proje kabul testlerini geçemedi: ${testResult.summary}`,
                    "tester-qa",
                    "manager"
                );

                db.exec('BEGIN IMMEDIATE;');
                try {
                    assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
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
                                    fingerprint, severity, status, detail_json,
                                    attempt_id, lease_owner
                                ) VALUES (?, ?, ?, ?, ?, 'critical', 'open', ?, ?, ?)
                            `).run(
                                issueId,
                                projectId,
                                latestContract.id,
                                attemptId,
                                fingerprint,
                                JSON.stringify({ issue: issueText }),
                                attemptId,
                                effectiveLeaseOwner
                            );
                        }
                    }
                    db.exec('COMMIT;');
                } catch (repairError) {
                    try { db.exec('ROLLBACK;'); } catch {}
                    throw repairError;
                }
                terminalStatus = 'rejected';
                executionError = `Proje kabul testlerini geçemedi: ${testResult.summary}`;

                const failedState = await readProjectState(projectId);
                if (failedState) {
                    failedState.last_error = executionError;
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
                        await workflowWriteState(projectId, failedState);
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
                    await workflowWriteState(projectId, failedState);
                    wsHub?.publish({ type: 'project_state_updated', projectId });
                }
                return;
            }

            db.exec('BEGIN IMMEDIATE;');
            try {
                assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
                const approvedContract = db.prepare(`
                    SELECT id FROM project_contracts
                    WHERE project_id = ? AND status = 'approved'
                    ORDER BY revision DESC LIMIT 1
                `).get(projectId);
                if (approvedContract) resolveStaticAuditRepairIssues(db, projectId, approvedContract.id);
                db.exec('COMMIT;');
            } catch (repairError) {
                try { db.exec('ROLLBACK;'); } catch {}
                throw repairError;
            }

            await workflowLogEvent(
                wsHub,
                projectId,
                "Tester",
                "finish",
                "",
                `Proje kabul testleri başarıyla tamamlandı: ${testResult.summary}`,
                "tester-qa",
                "manager"
            );

            // Product completion is evidence-authorized exclusively by completeVerifiedProject.
            // Workflow output remains advisory until artifact verification supplies these IDs.
            // Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (Scaffold Guard)
            await ensureProjectScaffold(projectDir, state, plan);

            // Otomatik Çalıştırma ve Kurulum Kılavuzu (Kapsamlı README.md)
            // P7 Task 5: stack-aware dynamic README — inspects package.json,
            // .env.example and Prisma presence instead of a hardcoded template.
            let managerTalimat = plan.talimatname || '';
            if (!managerTalimat) {
                try {
                    const talimatPath = path.join(projectDir, 'manager', 'TALIMATNAME.md');
                    if (fsSync.existsSync(talimatPath)) {
                        managerTalimat = fsSync.readFileSync(talimatPath, 'utf8');
                    }
                } catch {}
            }

            const readmeContent = await generateProjectReadme({
                projectTitle: state.title,
                summary: plan.summary,
                talimatname: managerTalimat,
                projectDir,
                manifest: plan.service_manifest || plan.serviceManifest || null,
                detectedStack: plan.stack || plan.detectedStack || null,
            });
            await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent, 'utf8');

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
            const files = await collectArtifactFiles(projectDir, limits);

            const config = validateRuntimeConfig(process.env);
            const executionClient = createExecutionClient(config);
            const contractHash = latestContract.contract_hash;
            if (!/^[a-f0-9]{64}$/.test(contractHash)) throw new Error('Approved contract has invalid hash.');
            const contract = JSON.parse(latestContract.contract_json);
            const nonce = crypto.randomBytes(32).toString('hex');
            const runId = `verification-${crypto.randomUUID()}`;
            const deadline = Date.now() + 15 * 60 * 1000;
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
            let prepResult = null;
            let prepError = null;
            try {
                prepResult = await executionClient.prepareDependencies(prepJob, { signal: abortController.signal });
            } catch (err) {
                prepError = err;
            }

            let packageLockBase64 = null;
            let packageLockSha256 = null;

            if (prepResult?.status === 'completed' && prepResult.result?.packageLockBase64) {
                packageLockBase64 = prepResult.result.packageLockBase64;
                packageLockSha256 = prepResult.result.packageLockSha256;
            } else {
                const lockPath = path.join(projectDir, 'package-lock.json');
                await executeSafeCommand('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: projectDir }).catch(() => {});
                if (fsSync.existsSync(lockPath)) {
                    const lockBytes = await fs.readFile(lockPath);
                    packageLockBase64 = lockBytes.toString('base64');
                    packageLockSha256 = crypto.createHash('sha256').update(lockBytes).digest('hex');
                } else {
                    const errorMsg = prepError?.message || 'Dependency preparation did not produce a package-lock.json.';
                    throw new Error(errorMsg);
                }
            }

            if (!packageLockBase64) {
                throw new Error('Dependency preparation did not produce a package-lock.json.');
            }

            const lockContent = Buffer.from(packageLockBase64, 'base64');
            if (packageLockSha256 && crypto.createHash('sha256').update(lockContent).digest('hex') !== packageLockSha256) {
                throw new Error('Worker returned a package-lock digest mismatch.');
            }
            const existingLockIndex = files.findIndex(f => f.path === 'package-lock.json');
            if (existingLockIndex >= 0) files[existingLockIndex].content = lockContent;
            else files.push({ path: 'package-lock.json', content: lockContent });

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
                deadline: Date.now() + 15 * 60 * 1000,
                artifactId: artifact.id,
                inputSha256: artifactSha256,
                archiveBase64: archiveBytes.toString('base64')
            };
            const completion = await verifyArtifactAndProject({
                projectId,
                contractId: latestContract.id,
                artifactId: artifact.id,
                expectedRevision: (await readProjectState(projectId))?.revision ?? null,
                complete: true,
                attemptId,
                leaseOwner: effectiveLeaseOwner,
                options: {
                    runId,
                    activeJob: verifyIdentity,
                    archiveBase64: verifyIdentity.archiveBase64,
                    signal: abortController.signal,
                    files,
                    contract
                }
            });
            if (!completion.completed) {
                throw new Error(completion.error || 'Canonical verification did not complete the project.');
            }
            await workflowLogEvent(wsHub, projectId, "Manager", "finish", "RAPOR.md, README.md", "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.", "manager");
            try {
                appendProjectActionMessages(projectId, {
                    actionId: `action-finish-${Date.now()}`,
                    userText: '✅ Proje geliştirme ve doğrulama süreci tamamlandı.',
                    modelText: '🎉 Tebrikler Boss! Uygulamanız başarıyla üretildi ve doğrulandı. Kodları Monaco IDE üzerinden inceleyebilir veya doğrudan ZIP olarak indirebilirsiniz.'
                });
            } catch {}
        }
    } catch (error) {
        if (abortController.signal.aborted) {
            terminalStatus = abortController.signal.reason === 'PAUSED' ? 'paused' : 'aborted';
            logWarning('workflow.execution_aborted', null, { projectId, attemptId, reason: abortController.signal.reason });
        } else {
            terminalStatus = 'failed';
            executionError = error.message;
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
                failedState.last_error = error?.message || errorMessageText;
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
                    parts: [{ text: `⚠️ **Süreç Duraklatıldı:**\n\n${redactSensitiveText(errorMessageText)}\n\nManager bu hata kaydını görebilir. Düzeltme talimatı verebilir veya **Devam Et (Resume)** ile kayıtlı görevlerden sürdürebilirsiniz. Ayrıntılar **Canlı Süreç Logları** ve **Canlı DAG Grafiği** sekmelerinde.` }],
                    timestamp: `${errDate} ${errTime}`,
                    created_at: errNow.toISOString()
                });
                await workflowWriteState(projectId, failedState);
                wsHub?.publish({ type: 'project_state_updated', projectId });
            }
        }
    } finally {
        clearInterval(heartbeatTimer);
        unregisterProjectAbortController(projectId);
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
