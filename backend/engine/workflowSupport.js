// Stateless helpers shared by the workflow engine. workflow.js re-exports every
// public name, so existing imports from './workflow.js' keep working.
import crypto from 'crypto';
import fsSync from 'fs';
import path from 'path';
import { TaskDAG } from './dag.js';
import { getAgent } from '../agents/index.js';
import { dbEvents, saveProjectLog } from '../db.js';
import { runLLMTaskWithRetry } from './llmTaskRetry.js';
import { logError, redactSensitiveText } from '../observability.js';
import { getProjectDir, getProject as readProjectState } from '../projectRepository.js';

export const getStatePath = (projectId, env = process.env) => path.join(getProjectDir(projectId, env), 'state.json');
export function computePlanHash(plan) {
    if (!plan || typeof plan !== 'object') return '0'.repeat(64);
    const canonicalize = value => Array.isArray(value) ? value.map(canonicalize)
        : value && typeof value === 'object'
            ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
            : value;
    // All approved obligations participate. The full digest also retires the
    // old 16-character cache format, which could contain disk-recovered tasks.
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(plan))).digest('hex');
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
        teamleaderPlans,
        ...(workflow.workerRepairs ? { workerRepairs: workflow.workerRepairs } : {}),
        ...(Array.isArray(workflow.testerAdvisoryRepairs) ? { testerAdvisoryRepairs: workflow.testerAdvisoryRepairs } : {}),
        ...(workflow.dependencyPreparation ? { dependencyPreparation: workflow.dependencyPreparation } : {}),
        ...(workflow.generationCompletion !== undefined ? { generationCompletion: workflow.generationCompletion } : {})
    };
}

export function reconcilePlanningCache(value, plan) {
    const workflow = normalizeWorkflowState(value);
    const planHash = computePlanHash(plan);
    return workflow.planHash === planHash ? workflow : {
        ...workflow, planHash, directorSpecs: {}, teamleaderPlans: {}, dependencyPreparation: null, generationCompletion: null,
        testerAdvisoryRepairs: []
    };
}

export function buildExecutionDAG(tasks = []) {
    const dag = new TaskDAG();
    for (const task of tasks) {
        dag.addTask({
            id: task.id,
            title: task.title,
            description: task.description,
            dependencies: task.dependencies || [],
            targetFiles: task.targetFiles || [],
            requirementIds: task.requirementIds || [],
            managementCoverage: task.managementCoverage || []
        });
    }
    return dag;
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
    return results;
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


export function isExecutionActive(status) {
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
export async function callAgentLLM(agentRole, userPrompt, {
    signal = null,
    taskId = null,
    onDiagnostic = null,
    onUsage = null,
    maxAttempts,
    maxOutputTokens,
    timeoutMs,
    googleThinkingLevel,
    formatRetryMessage
} = {}) {
    const agent = getAgent(agentRole);
    return runLLMTaskWithRetry({
        agentRole,
        taskId,
        signal,
        onDiagnostic: onDiagnostic || undefined,
        onUsage,
        maxAttempts,
        maxOutputTokens,
        timeoutMs,
        googleThinkingLevel,
        formatRetryMessage,
        messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        parseResponse: rawResponse => agent.parseResponse(rawResponse)
    });
}
