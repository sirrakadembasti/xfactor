/**
 * Deterministik DAG (Directed Acyclic Graph) Görev Çözümleyici ve Yürütme Sıralayıcısı
 * Referans: Archon Workflow Engine
 */

export class TaskDAG {
    constructor() {
        this.tasks = new Map(); // id -> { id, title, description, dependencies: Set, targetFiles, status: 'pending'|'running'|'completed'|'blocked'|'failed', result: null }
    }

    /**
     * DAG'a yeni bir görev ekler
     */
    addTask({ id, title, description, dependencies = [], targetFiles = [], meta = {} }) {
        if (!id) throw new Error('Görev id zorunludur.');
        if (this.tasks.has(id)) throw new Error(`Görev "${id}" zaten DAG içinde mevcut.`);

        this.tasks.set(id, {
            id,
            title: title || id,
            description: description || '',
            dependencies: new Set(dependencies),
            targetFiles: targetFiles || [],
            meta: { ...meta },
            status: 'pending',
            result: null,
            error: null
        });
    }

    getTask(id) {
        return this.tasks.get(id);
    }

    getAllTasks() {
        return Array.from(this.tasks.values());
    }

    /**
     * Döngüsel bağımlılık (Cycle) kontrolü yapar
     */
    detectCycles() {
        const visited = new Set();
        const recStack = new Set();

        const checkCycle = (taskId) => {
            visited.add(taskId);
            recStack.add(taskId);

            const task = this.tasks.get(taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    if (!this.tasks.has(depId)) {
                        throw new Error(`Görev "${taskId}" tanımsız bağımlılığa sahip: "${depId}"`);
                    }
                    if (!visited.has(depId)) {
                        if (checkCycle(depId)) return true;
                    } else if (recStack.has(depId)) {
                        return true; // Döngü tespit edildi
                    }
                }
            }

            recStack.delete(taskId);
            return false;
        };

        for (const taskId of this.tasks.keys()) {
            if (!visited.has(taskId)) {
                if (checkCycle(taskId)) return true;
            }
        }
        return false;
    }

    /**
     * Topolojik sıralama ile sıralı görev dizisi döner
     */
    getExecutionOrder() {
        if (this.detectCycles()) {
            throw new Error('DAG içinde döngüsel bağımlılık (circular dependency) tespit edildi.');
        }

        const visited = new Set();
        const order = [];

        const visit = (taskId) => {
            if (visited.has(taskId)) return;
            visited.add(taskId);

            const task = this.tasks.get(taskId);
            if (task) {
                for (const depId of task.dependencies) {
                    visit(depId);
                }
            }
            order.push(taskId);
        };

        for (const taskId of this.tasks.keys()) {
            visit(taskId);
        }

        return order;
    }

    /**
     * Bağımsız görevleri eşzamanlı/paralel dalgalar halinde gruplayıp döner
     * @returns {Array<Array<string>>} [[taskId1, taskId2], [taskId3], ...]
     */
    getExecutionWaves() {
        if (this.detectCycles()) {
            throw new Error('DAG içinde döngüsel bağımlılık (circular dependency) tespit edildi.');
        }

        const waves = [];
        const inDegree = new Map();
        const dependents = new Map();

        for (const [id, task] of this.tasks.entries()) {
            inDegree.set(id, task.dependencies.size);
            if (!dependents.has(id)) {
                dependents.set(id, []);
            }
            for (const depId of task.dependencies) {
                if (!dependents.has(depId)) {
                    dependents.set(depId, []);
                }
                dependents.get(depId).push(id);
            }
        }

        let currentWave = [];
        for (const [id, deg] of inDegree.entries()) {
            if (deg === 0) {
                currentWave.push(id);
            }
        }

        let visitedCount = 0;
        while (currentWave.length > 0) {
            waves.push(currentWave);
            visitedCount += currentWave.length;
            const nextWave = [];
            for (const taskId of currentWave) {
                const deps = dependents.get(taskId) || [];
                for (const nextId of deps) {
                    const newDeg = inDegree.get(nextId) - 1;
                    inDegree.set(nextId, newDeg);
                    if (newDeg === 0) {
                        nextWave.push(nextId);
                    }
                }
            }
            currentWave = nextWave;
        }

        if (visitedCount !== this.tasks.size) {
            throw new Error('DAG içinde çözülemeyen döngü veya eksik bağımlılık tespit edildi.');
        }

        return waves;
    }

    /**
     * Bağımlılıkları tamamlanmış ve çalıştırılmaya hazır görevleri döner
     */
    getReadyTasks() {
        const ready = [];
        for (const [id, task] of this.tasks.entries()) {
            if (task.status !== 'pending') continue;

            let allDepsCompleted = true;
            for (const depId of task.dependencies) {
                const depTask = this.tasks.get(depId);
                if (!depTask || depTask.status !== 'completed') {
                    allDepsCompleted = false;
                    break;
                }
            }

            if (allDepsCompleted) {
                ready.push(task);
            }
        }
        return ready;
    }

    setTaskStatus(id, status, resultOrError = null) {
        const task = this.tasks.get(id);
        if (!task) throw new Error(`Görev "${id}" bulunamadı.`);

        task.status = status;
        if (status === 'completed') {
            task.result = resultOrError;
        } else if (status === 'failed' || status === 'blocked') {
            task.error = resultOrError;
        }
    }

    isAllCompleted() {
        if (this.tasks.size === 0) return true;
        for (const task of this.tasks.values()) {
            if (task.status !== 'completed') return false;
        }
        return true;
    }

    hasFailedTasks() {
        for (const task of this.tasks.values()) {
            if (task.status === 'failed' || task.status === 'blocked') return true;
        }
        return false;
    }
}

function getTaskPriority(task) {
    const links = [
        ...(Array.isArray(task.requirementLinks) ? task.requirementLinks : []),
        ...(Array.isArray(task.requirements) ? task.requirements : [])
    ];
    const priorities = [
        task.core === true ? 'core' : null,
        typeof task.priority === 'string' ? task.priority.toLowerCase() : null
    ];

    for (const link of links) {
        if (!link || typeof link !== 'object') continue;
        if (link.core === true) priorities.push('core');
        if (typeof link.priority === 'string') priorities.push(link.priority.toLowerCase());
    }

    if (priorities.includes('core')) return 'core';
    if (
        task.core === false ||
        priorities.includes('supporting') ||
        priorities.includes('optional')
    ) {
        return 'deferred';
    }
    return null;
}

export function validatePlanDAG(planTasks = []) {
    const issues = [];
    const tasksById = new Map();
    const duplicateIds = new Set();

    for (const task of planTasks) {
        if (typeof task.id !== 'string' || task.id.length === 0) {
            issues.push('Task ID must be a non-empty string');
            continue;
        }
        if (tasksById.has(task.id)) {
            if (!duplicateIds.has(task.id)) {
                issues.push(`Task ID "${task.id}" is duplicated`);
                duplicateIds.add(task.id);
            }
            continue;
        }
        tasksById.set(task.id, task);
    }

    for (const task of planTasks) {
        if (typeof task.id !== 'string' || task.id.length === 0) continue;
        for (const dependencyId of task.dependencies || []) {
            if (!tasksById.has(dependencyId)) {
                issues.push(`Task "${task.id}" depends on unknown task "${dependencyId}"`);
            }
        }
    }

    if (issues.length > 0) {
        return { passed: false, issues };
    }

    const visiting = new Set();
    const visited = new Set();

    function hasCycle(task) {
        if (visiting.has(task.id)) return true;
        if (visited.has(task.id)) return false;
        visiting.add(task.id);
        for (const dependencyId of task.dependencies || []) {
            if (hasCycle(tasksById.get(dependencyId))) return true;
        }
        visiting.delete(task.id);
        visited.add(task.id);
        return false;
    }

    if (planTasks.some(hasCycle)) {
        return {
            passed: false,
            issues: ['Task graph contains a dependency cycle']
        };
    }

    const coreTasks = planTasks.filter(task => getTaskPriority(task) === 'core');
    const deferredTasks = planTasks.filter(task => getTaskPriority(task) === 'deferred');

    function dependsOn(task, dependencyId, seen = new Set()) {
        for (const directDependencyId of task.dependencies || []) {
            if (directDependencyId === dependencyId) return true;
            if (seen.has(directDependencyId)) continue;
            seen.add(directDependencyId);
            if (dependsOn(tasksById.get(directDependencyId), dependencyId, seen)) return true;
        }
        return false;
    }

    const terminalCoreTasks = coreTasks.filter(coreTask =>
        !coreTasks.some(otherCoreTask =>
            otherCoreTask !== coreTask && dependsOn(otherCoreTask, coreTask.id)
        )
    );

    for (const deferredTask of deferredTasks) {
        for (const coreTask of terminalCoreTasks) {
            if (!dependsOn(deferredTask, coreTask.id)) {
                issues.push(
                    `Task "${deferredTask.id}" can run before core task "${coreTask.id}" completes`
                );
            }
        }
    }

    return {
        passed: issues.length === 0,
        issues
    };
}
