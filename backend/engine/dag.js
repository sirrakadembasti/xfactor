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
