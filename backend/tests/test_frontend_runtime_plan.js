import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateFrontendRuntimePlan, resolveFrontendRuntimePlan, formatManagementTaskDescription, validateDomainPlanCoverage } from '../agents/director.js';
import { buildTeamleaderPrompt } from '../agents/teamleader.js';
import { validateTeamleaderTasks, validateTaskDependencies } from '../agents/schemas.js';
import { validatePlanTasks, validateManagementTaskCoverage } from '../agents/director.js';

const context = { stack: { framework: 'vite', isVue: false }, domain: { prefix: 'frontend' }, files: [] };
const task = (id, target) => ({ id, title: id, description: id, targetFiles: [target], dependencies: [], requirementIds: ['REQ-1'], managementCoverage: [] });
const valid = { tasks: [task('html', 'index.html'), task('main', 'src/main.tsx'), task('app', 'src/App.tsx')] };
const managed = { management: { needed: true, resources: Array.from({ length: 8 }, (_, i) => ({ name: `Resource${i}`, operations: ['create', 'read', 'update', 'delete'] })), roles: [{ name: 'admin' }] } };
const apiTasks = managed.management.resources.map((_, i) => ({ ...task(`api${i}`, `src/routes/resource${i}.ts`),
    requirementIds: [`MGMT-RESOURCE-${i + 1}`], managementCoverage: ['create', 'read', 'update', 'delete'].map(operation => ({ requirementId: `MGMT-RESOURCE-${i + 1}`, surface: 'api', operation })) }));
const backendContext = { contract: managed, domain: { prefix: 'backend' }, teamleaderId: 'backend.lead', isLastTeamleader: true, teamleaderPlans: {} };

test('camel and Pascal login/auth filenames count in both guards; unrelated AuthorList does not', () => {
    const contract = { management: { needed: true, resources: [], roles: [{ name: 'admin' }] } };
    const makeRoleTask = (journey, target) => ({ ...task(journey, target), requirementIds: ['MGMT-ROLE-1'],
        managementCoverage: [{ requirementId: 'MGMT-ROLE-1', journey }] });
    const journeys = [makeRoleTask('positive', 'src/pages/Dashboard.tsx'), makeRoleTask('negative', 'src/pages/AccessDenied.tsx')];
    for (const file of ['src/pages/LoginPage.tsx', 'src/context/AuthContext.tsx', 'src/sessionManager.ts', 'src/middlewareGuard.ts']) {
        const tasks = [makeRoleTask('login', file), ...journeys];
        assert.equal(validateManagementTaskCoverage(contract, { 'frontend.ui': { tasks } }).passed, true, file);
        assert.equal(validateDomainPlanCoverage(tasks, { contract, domain: 'frontend', teamleaderId: 'frontend.ui' }).passed, true, file);
    }
    const unrelated = [makeRoleTask('login', 'src/pages/randomAuthorList.tsx'), ...journeys];
    assert.equal(validateManagementTaskCoverage(contract, { 'frontend.ui': { tasks: unrelated } }).passed, false);
    assert.equal(validateDomainPlanCoverage(unrelated, { contract, domain: 'frontend', teamleaderId: 'frontend.ui' }).passed, false);
});

test('rejected candidate diagnostics contain bounded metadata, never code or descriptions', async () => {
    const rejected = { tasks: [{ ...task('bad-plan', 'src/pages/OnlyFragment.tsx'), description: 'PRIVATE RAW SOURCE' }], raw: 'PRIVATE RAW LLM' };
    const diagnostics = [];
    await assert.rejects(resolveFrontendRuntimePlan({ context, generatePlan: async () => rejected,
        onInvalidCandidate: async diagnostic => diagnostics.push(diagnostic) }));
    assert.equal(diagnostics.length, 2);
    assert.deepEqual(diagnostics.map(d => d.attempt), [1, 2]);
    assert.equal(diagnostics[0].tasks[0].id, 'bad-plan');
    assert.deepEqual(diagnostics[0].tasks[0].targetFiles, ['src/pages/OnlyFragment.tsx']);
    assert.ok(diagnostics[0].missingPaths.length);
    assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE'));
});

test('schema dependency and scope errors share one bounded plan correction, preserving real DAG edges', async () => {
    const good = { tasks: [task('engine', 'src/lib/engine.ts'), { ...task('reservations', 'src/routes/reservations.ts'), dependencies: ['engine'] }] };
    const validateCandidate = candidate => {
        validateTeamleaderTasks(candidate);
        const deps = validateTaskDependencies(candidate.tasks);
        if (!deps.valid) throw new Error(deps.errors.join('; '));
        const scope = validatePlanTasks(candidate.tasks, { requirements: [{ id: 'REQ-1' }] });
        if (!scope.passed) throw new Error(scope.issues.join('; '));
        return candidate;
    };
    for (const invalid of [{ tasks: [{ ...good.tasks[1], dependencies: ['backend-05-reservationEngine'] }] },
        { tasks: [] }, { tasks: 'not-a-list' }, { tasks: [null] }, { tasks: [{ ...good.tasks[0], requirementIds: ['UNAPPROVED'] }] }]) {
        let calls = 0;
        const result = await resolveFrontendRuntimePlan({ validateCandidate, context: { ...context, files: valid.tasks.map(t => ({ path: t.targetFiles[0], content: 'existing root' })) }, generatePlan: async ({ validationErrors }) => {
            calls++; if (calls === 2) assert.ok(validationErrors.length, 'validation failure must be included in the correction prompt');
            return calls === 1 ? invalid : good;
        } });
        assert.equal(calls, 2);
        assert.deepEqual(result.plan.tasks[1].dependencies, ['engine']);
        calls = 0;
        await assert.rejects(resolveFrontendRuntimePlan({ validateCandidate, generatePlan: async () => { calls++; return invalid; } }));
        assert.equal(calls, 2);
    }
    let calls = 0;
    await assert.rejects(resolveFrontendRuntimePlan({ validateCandidate, generatePlan: async () => { calls++; throw new Error('PAUSED'); } }), /PAUSED/);
    assert.equal(calls, 1, 'provider/abort failures must never be mistaken for invalid candidate plans');
});

test('last backend TL needs actual backend API tasks; source inventory and frontend wrappers never count', () => {
    const infrastructure = [task('schema', 'prisma/schema.prisma'), task('client', 'src/lib/prisma.ts')];
    assert.equal(validateDomainPlanCoverage(infrastructure, backendContext).passed, false);
    assert.equal(validateDomainPlanCoverage(apiTasks, backendContext).passed, true, 'API coverage does not require fake UI counterpart tasks');
    assert.equal(validateDomainPlanCoverage(infrastructure, { ...backendContext, files: apiTasks.map(t => ({ path: t.targetFiles[0], content: 'existing' })),
        teamleaderPlans: { 'frontend.clients': { tasks: apiTasks } } }).passed, false);
    assert.equal(validateDomainPlanCoverage(infrastructure, { ...backendContext, isLastTeamleader: false }).passed, true);
    assert.equal(validateDomainPlanCoverage(apiTasks.slice(4), { ...backendContext, teamleaderPlans: { 'backend.first': { tasks: apiTasks.slice(0, 4) } } }).passed, true);
});

test('last frontend TL needs UI and every role journey from current plans, not filenames', () => {
    const uiTasks = apiTasks.map(t => ({ ...t, targetFiles: [`src/pages/${t.id}.tsx`], managementCoverage: t.managementCoverage.map(m => ({ ...m, surface: 'ui' })) }));
    const roles = ['login', 'positive', 'negative'].map(journey => ({ ...task(journey, journey === 'login' ? 'src/auth/login.ts' : `src/pages/${journey}.tsx`),
        requirementIds: ['MGMT-ROLE-1'], managementCoverage: [{ requirementId: 'MGMT-ROLE-1', journey }] }));
    const frontend = { ...backendContext, domain: { prefix: 'frontend' }, teamleaderId: 'frontend.lead', teamleaderPlans: { 'backend.lead': { tasks: apiTasks } } };
    assert.equal(validateDomainPlanCoverage(uiTasks, frontend).passed, false);
    assert.equal(validateDomainPlanCoverage([...uiTasks, ...roles], frontend).passed, true);
    assert.equal(validateDomainPlanCoverage([...uiTasks, ...roles.map(t => ({ ...t, targetFiles: ['src/auth/Login.tsx'] }))], frontend).passed, false,
        'a login file alone cannot substitute for actual positive/negative UI journey tasks');
});

test('coverage-invalid cached backend is discarded before generation and correction is bounded', async () => {
    let invalidated = 0, calls = 0;
    const result = await resolveFrontendRuntimePlan({ cachedPlan: { tasks: [task('schema', 'prisma/schema.prisma')] }, context: backendContext,
        onInvalidCachedPlan: async () => { invalidated++; }, generatePlan: async ({ missingCoverage }) => {
            assert.equal(invalidated, 1); assert.equal(missingCoverage.length, 32); calls++; return { tasks: apiTasks };
        } });
    assert.equal(calls, 1); assert.equal(result.plan.tasks.length, 8);
    calls = 0;
    await assert.rejects(resolveFrontendRuntimePlan({ context: backendContext, generatePlan: async () => { calls++; return { tasks: [] }; } }), /coverage/i);
    assert.equal(calls, 2);
});

test('resource UI task receives approved real form selectors while API-only tasks do not', () => {
    const contract = { management: { resources: [{ name: 'Room' }] }, browser: { roleJourneys: [
        { role: 'admin', positive: { steps: [{ action: 'fill', selector: '#room-number', value: '{nonce}' }] } }
    ] } };
    const ui = { description: 'Room form', managementCoverage: [{ requirementId: 'MGMT-RESOURCE-1', surface: 'ui', operation: 'create' }] };
    assert.match(formatManagementTaskDescription(ui, contract), /#room-number/);
    assert.doesNotMatch(formatManagementTaskDescription({ ...ui, managementCoverage: [{ ...ui.managementCoverage[0], surface: 'api' }] }, contract), /#room-number/);
});

test('Vite React frontend plan rejects fragmented resource tasks without runtime entrypoints', () => {
    const result = validateFrontendRuntimePlan(Array.from({ length: 74 }, (_, i) => task(`fragment${i}`, `src/components/Fragment${i}.tsx`)), context);
    assert.equal(result.passed, false);
    assert.equal(result.missing.length, 3);
    assert.match(result.missing.join(' '), /index\.html/);
    assert.match(result.missing.join(' '), /src\/main/);
    assert.equal(validateFrontendRuntimePlan(valid.tasks, context).passed, true);
    assert.equal(validateFrontendRuntimePlan(valid.tasks.slice(0, 2).concat(task('router', 'src/router.tsx')), context).passed, true);
});

test('existing roots count only when explicitly supplied with real nonempty file content; backend and Vue stay unaffected', () => {
    assert.equal(validateFrontendRuntimePlan([], { ...context, files: valid.tasks.map(t => ({ path: t.targetFiles[0], content: 'existing source' })) }).passed, true);
    assert.equal(validateFrontendRuntimePlan([], { ...context, files: valid.tasks.map(t => ({ path: t.targetFiles[0] })) }).passed, false);
    for (const other of [{ ...context, domain: { prefix: 'backend' } }, { ...context, stack: { framework: 'express' } },
        { ...context, stack: { framework: 'vite', isVue: true } }]) assert.equal(validateFrontendRuntimePlan([], other).passed, true);
});

test('invalid cached frontend plan is discarded alone, then regenerated with missing path hints and intact metadata', async () => {
    const backend = { tasks: Array.from({ length: 25 }, (_, i) => task(`backend${i}`, `src/backend/${i}.ts`)) };
    const cache = { 'backend.domain': backend, 'frontend.domain': { tasks: [task('old', 'src/components/Old.tsx')] } };
    const beforeBackend = structuredClone(backend);
    let calls = 0, invalidations = 0;
    const result = await resolveFrontendRuntimePlan({ cachedPlan: cache['frontend.domain'], context,
        onInvalidCachedPlan: async () => { delete cache['frontend.domain']; invalidations++; },
        generatePlan: async ({ missingPaths }) => { calls++; assert.match(missingPaths.join(' '), /index\.html/); return valid; } });
    assert.equal(calls, 1);
    assert.equal(invalidations, 1);
    assert.deepEqual(cache['backend.domain'], beforeBackend);
    assert.deepEqual(result.plan, valid);
    assert.equal(result.newlyPlanned, true);
});

test('fresh frontend plan gets at most one correction before blocking all Coder work', async () => {
    let calls = 0;
    await assert.rejects(resolveFrontendRuntimePlan({ context,
        generatePlan: async ({ attempt, missingPaths }) => { calls++; assert.equal(attempt, calls); assert.ok(missingPaths.length); return { tasks: [task('partial', 'src/main.tsx')] }; }
    }), /frontend.*entry|frontend.*giriş/i);
    assert.equal(calls, 2);
    let generated = false;
    const reused = await resolveFrontendRuntimePlan({ cachedPlan: valid, context, generatePlan: async () => { generated = true; } });
    assert.equal(generated, false);
    assert.equal(reused.newlyPlanned, false);
});

test('planning context explains domain scope, existing pages, runtime roots and consolidated CRUD client tasks', () => {
    const prompt = buildTeamleaderPrompt('Frontend', 'Wire pages', '# React Vite', [{ id: 'REQ-1', statement: 'UI' }], {
        domain: 'frontend', framework: 'vite', existingFiles: ['src/pages/admin/RoomsPage.tsx'],
        existingTasks: [{ team: 'backend.domain', taskId: 'room-ui', targetFiles: ['src/pages/admin/RoomsPage.tsx'],
            requirementIds: ['REQ-1'], managementCoverage: [{ requirementId: 'MGMT-RESOURCE-1', surface: 'ui', operation: 'read' }] }],
        missingRuntimePaths: ['index.html', 'src/main.tsx', 'src/App.tsx']
    });
    for (const term of ['RoomsPage.tsx', 'index.html', 'src/main', 'CRUD', 'managementCoverage']) assert.ok(prompt.includes(term));
    assert.match(prompt, /existingFiles yalnız kod referansıdır/);
    assert.match(prompt, /previousTasks.*kapsam kanıtı değildir/);
    assert.ok(!buildTeamleaderPrompt('Legacy', 'Mission', '# Spec').includes('undefined'));
});
