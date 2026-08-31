import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import * as dagModule from '../engine/dag.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (!filteredTest || filteredTest === 'dag-priority') {
    await runAsyncTest('P2.6.1: validatePlanDAG rejects optional tasks runnable before core tasks', async () => {
        const planTasks = [
            {
                id: 'prisma-migration',
                dependencies: [],
                requirementLinks: [{ requirementId: 'REQ-DB', priority: 'core' }]
            },
            {
                id: 'todo-crud-routes',
                dependencies: ['prisma-migration'],
                requirementLinks: [{ requirementId: 'REQ-CRUD', priority: 'core' }]
            },
            {
                id: 'theme-toggle',
                dependencies: [],
                requirementLinks: [{ requirementId: 'REQ-THEME', priority: 'optional' }]
            }
        ];

        const result = typeof dagModule.validatePlanDAG === 'function'
            ? dagModule.validatePlanDAG(planTasks)
            : { passed: true, issues: [] };

        assert.strictEqual(
            result.passed,
            false,
            'Expected DAG validation to fail on early optional task'
        );
        assert.deepStrictEqual(result.issues, [
            'Task "theme-toggle" can run before core task "todo-crud-routes" completes'
        ]);
    });

    await runAsyncTest('P2.6.1: validatePlanDAG requires supporting tasks to follow every core branch', async () => {
        const planTasks = [
            {
                id: 'database-core',
                dependencies: [],
                requirementLinks: [{ requirementId: 'REQ-DB', core: true }]
            },
            {
                id: 'api-core',
                dependencies: [],
                requirementLinks: [{ requirementId: 'REQ-API', core: true }]
            },
            {
                id: 'docs-support',
                dependencies: ['database-core'],
                requirementLinks: [{ requirementId: 'REQ-DOCS', priority: 'supporting' }]
            }
        ];

        const result = typeof dagModule.validatePlanDAG === 'function'
            ? dagModule.validatePlanDAG(planTasks)
            : { passed: true, issues: [] };

        assert.strictEqual(result.passed, false);
        assert.deepStrictEqual(result.issues, [
            'Task "docs-support" can run before core task "api-core" completes'
        ]);
    });

    await runAsyncTest('P2.6.1: validatePlanDAG passes when optional tasks follow the complete core subgraph', async () => {
        const planTasks = [
            {
                id: 'prisma-migration',
                dependencies: [],
                requirementLinks: [{ requirementId: 'REQ-DB', priority: 'core' }]
            },
            {
                id: 'todo-crud-routes',
                dependencies: ['prisma-migration'],
                requirementLinks: [{ requirementId: 'REQ-CRUD', priority: 'core' }]
            },
            {
                id: 'theme-toggle',
                dependencies: ['todo-crud-routes'],
                requirementLinks: [{ requirementId: 'REQ-THEME', priority: 'optional' }]
            }
        ];

        const result = typeof dagModule.validatePlanDAG === 'function'
            ? dagModule.validatePlanDAG(planTasks)
            : { passed: false, issues: ['validatePlanDAG is missing'] };

        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });

    await runAsyncTest('P2.6.1: validatePlanDAG rejects dependency cycles', async () => {
        const result = dagModule.validatePlanDAG([
            { id: 'core-a', core: true, dependencies: ['core-b'] },
            { id: 'core-b', core: true, dependencies: ['core-a'] },
            { id: 'optional', core: false, dependencies: [] }
        ]);

        assert.strictEqual(result.passed, false);
        assert.deepStrictEqual(result.issues, [
            'Task graph contains a dependency cycle'
        ]);
    });

    await runAsyncTest('P2.6.1: validatePlanDAG rejects missing and duplicate task references', async () => {
        const result = dagModule.validatePlanDAG([
            { id: 'core', core: true, dependencies: ['missing'] },
            { id: 'core', core: true, dependencies: [] },
            { id: 'optional', core: false, dependencies: ['core'] }
        ]);

        assert.strictEqual(result.passed, false);
        assert.deepStrictEqual(result.issues, [
            'Task ID "core" is duplicated',
            'Task "core" depends on unknown task "missing"'
        ]);
    });

    await runAsyncTest('P2.6.1: validatePlanDAG rejects empty task IDs', async () => {
        const result = dagModule.validatePlanDAG([
            { id: '', core: true, dependencies: [] }
        ]);

        assert.strictEqual(result.passed, false);
        assert.deepStrictEqual(result.issues, [
            'Task ID must be a non-empty string'
        ]);
    });

    await runAsyncTest('P2.6.1: validatePlanDAG combines both requirement metadata arrays', async () => {
        const result = dagModule.validatePlanDAG([
            {
                id: 'core',
                dependencies: [],
                requirementLinks: [],
                requirements: [{ requirementId: 'REQ-CORE', core: true }]
            },
            {
                id: 'optional',
                core: false,
                dependencies: []
            }
        ]);

        assert.strictEqual(result.passed, false);
        assert.deepStrictEqual(result.issues, [
            'Task "optional" can run before core task "core" completes'
        ]);
    });
}

finish();
