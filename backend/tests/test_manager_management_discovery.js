import assert from 'node:assert/strict';
import { normalizeManagerPlan, normalizeTeamleaderTasks, validateManagerPlan } from '../agents/schemas.js';
import * as managerAgent from '../agents/manager.js';
import * as directorAgent from '../agents/director.js';
import * as reviewerAgent from '../agents/reviewer.js';

const base = {
    summary: 'Inventory workspace',
    talimatname: '# Inventory workspace\n\n## Management proposal\nManage assets with scoped permissions.',
    domains: [{ name: 'app' }],
    requirements: [{ id: 'REQ-1', statement: 'Track assets' }],
    browser: { roleJourneys: [
        { role: 'owner', kind: 'positive', steps: [{ action: 'click', selector: '#create' }], expectedOutcome: { kind: 'success', text: 'Created' } },
        { role: 'owner', kind: 'negative', steps: [{ action: 'submit', selector: '#forbidden' }], expectedOutcome: { kind: 'denied', text: 'Access denied' } },
        { role: 'viewer', kind: 'positive', steps: [{ action: 'click', selector: '#view' }], expectedOutcome: { kind: 'success', text: 'Asset details' } },
        { role: 'viewer', kind: 'negative', steps: [{ action: 'click', selector: '#delete' }], expectedOutcome: { kind: 'denied', text: 'Access denied' } }
    ] }
};

const managed = {
    needed: true,
    reason: 'Assets are created and changed by staff.',
    authentication: { login: '/login', apiLogin: { path: '/api/auth/login' }, accountProvisioning: 'Staff invite by owner', publicRegistration: false },
    resources: [{ name: 'Asset', operations: ['create', 'read', 'update', 'delete'], readAccess: 'authenticated', uiPath: '/assets', apiPath: '/api/assets',
        deletionPolicy: { relatedData: 'none', reason: 'This asset has no linked records.' },
        verification: { itemPath: '/api/assets/{id}', updateMethod: 'PATCH', deleteExpectation: { kind: 'absent' } } }],
    roles: [
        {
            name: 'owner',
            permissions: [{ resource: 'Asset', operations: ['create', 'read', 'update', 'delete'] }],
            demoUser: { username: 'owner-fixture', setup: 'isolated-test-seed' },
            journeys: {
                positive: ['Sign in, create an asset, and see it in the list'],
                negative: ['Anonymous mutation is denied']
            }
        },
        {
            name: 'viewer',
            permissions: [{ resource: 'Asset', operations: ['read'] }],
            demoUser: { username: 'viewer-fixture', setup: 'isolated-test-seed' },
            journeys: {
                positive: ['Sign in and view assets'],
                negative: ['Asset deletion is denied']
            }
        }
    ]
};

assert.throws(() => validateManagerPlan({ ...base }, { requireManagement: true }), /management/i,
    'new Manager output without an assessment must be rejected');
assert.deepEqual(normalizeManagerPlan({ ...base, management: managed }).management, managed,
    'normalization must retain the assessment');
assert.equal(validateManagerPlan({ ...base, management: managed }, { requireManagement: true }), true);
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    resources: [{ ...managed.resources[0], readAccess: undefined }]
} }, { requireManagement: true }), /readAccess/i,
    'new managed resources must decide whether anonymous reads are public or authenticated');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    resources: [{ ...managed.resources[0], deletionPolicy: undefined }]
} }, { requireManagement: true }), /deletionPolicy/i,
    'new delete plans must state what happens to linked records');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    resources: [{ ...managed.resources[0], deletionPolicy: { relatedData: 'preserve', reason: 'Keep history.' } }]
} }, { requireManagement: true }), /retention|related/i,
    'a preserve policy requires a runnable related-record fixture');
const preservedResource = { ...managed.resources[0],
    deletionPolicy: { relatedData: 'preserve', reason: 'Keep completed activity history.',
        retentionRule: 'Keep until an approved archival decision.' },
    verification: { ...managed.resources[0].verification,
        retention: { createPath: '/api/history', itemPath: '/api/history/{id}', parentField: 'assetId',
            createBody: { assetId: '{parentId}', note: '{nonce}' } } } };
assert.equal(validateManagerPlan({ ...base, management: { ...managed, resources: [preservedResource] } }, { requireManagement: true }), true);
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    resources: [{ ...preservedResource, deletionPolicy: { ...preservedResource.deletionPolicy, retentionRule: undefined } }]
} }, { requireManagement: true }), /retentionRule/i,
    'preserved history needs a specific retention rule in the approved contract');
assert.throws(() => validateManagerPlan({ ...base, browser: undefined, management: managed }, { requireManagement: true }), /browser|journey/i,
    'new managed plans must define executable browser journeys for every role');
assert.throws(() => validateManagerPlan({ ...base, browser: { roleJourneys: base.browser.roleJourneys.slice(0, 3) }, management: managed }, { requireManagement: true }), /browser|journey/i,
    'a missing denied journey for one role must be rejected during planning');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    resources: [{ ...managed.resources[0], verification: undefined }]
} }, { requireManagement: true }), /verification/i,
    'new CRUD plans need operation-specific verification fixtures');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    authentication: { login: '/login', accountProvisioning: 'Staff invite by owner', publicRegistration: false }
} }, { requireManagement: true }), /apiLogin/i,
    'new managed plans must declare the API login endpoint used by role verification');
assert.equal(validateManagerPlan({ ...base, management: { needed: false, reason: 'A static publication has no mutable operational records or staff actions.' } }, { requireManagement: true }), true,
    'a justified non-management application must remain valid');
assert.throws(() => validateManagerPlan({ ...base, management: { needed: false, reason: '' } }, { requireManagement: true }), /reason/i);
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed, roles: [] } }, { requireManagement: true }), /roles/i);
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    roles: managed.roles.map(role => ({ ...role, permissions: [{ resource: 'Asset', operations: ['read'] }] }))
} }, { requireManagement: true }), /uncovered|operation/i,
    'every promised management operation must be granted to at least one role');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    roles: [{ ...managed.roles[0], permissions: [{ resource: 'Asset', operations: ['archive'] }] }]
} }, { requireManagement: true }), /permissions/i);
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    roles: [{ ...managed.roles[0] }, { ...managed.roles[0], demoUser: { username: 'other-fixture', setup: 'isolated-test-seed' } }]
} }, { requireManagement: true }), /role|unique|benzersiz/i,
    'role names must be unique even with different demo users');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    roles: [
        { ...managed.roles[0], name: 'ops-lead' },
        { ...managed.roles[1], name: 'ops_lead' }
    ]
} }, { requireManagement: true }), /role|credential|benzersiz/i,
    'different role names must not collapse to the same demo credential variable');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed,
    resources: [{ ...managed.resources[0], apiPath: 'https://external.example/collect' }] } }, { requireManagement: true }), /apiPath|resources/i,
    'management API paths must stay on the generated application origin');
assert.throws(() => validateManagerPlan({ ...base, management: { ...managed, roles: [{ ...managed.roles[0], journeys: { positive: ['Create asset'], negative: [] } }] } }, { requireManagement: true }), /negative/i,
    'every role needs a denied journey');
assert.throws(() => managerAgent.parseManagerResponse(JSON.stringify(base)), /management/i,
    'new Manager responses cannot silently omit assessment');
assert.equal(validateManagerPlan({ ...base }, { requireManagement: false }), true,
    'previously approved legacy plans remain readable');
assert.equal(typeof managerAgent.formatManagementProposal, 'function');
const proposal = managerAgent.formatManagementProposal(managed, base.browser);
assert.match(proposal, /Asset/);
assert.match(proposal, /authenticated/);
assert.match(proposal, /This asset has no linked records/);
assert.match(proposal, /owner/);
assert.match(proposal, /viewer/);
assert.match(proposal, /isolated-test-seed/);
assert.match(proposal, /Sign in, create an asset/);
assert.match(proposal, /Asset deletion is denied/);
assert.match(proposal, /#create/);
assert.match(proposal, /Access denied/);

const delegated = normalizeManagerPlan({ ...base, requirements: [...base.requirements], management: managed });
assert.ok(delegated.requirements.some(requirement => requirement.id === 'MGMT-RESOURCE-1'
    && requirement.statement.includes('Asset') && requirement.statement.includes('delete')
    && requirement.statement.includes('/api/assets/{id}')
    && requirement.statement.includes('relatedData none')),
    'each managed resource must become an explicit downstream requirement');
assert.ok(delegated.requirements.some(requirement => requirement.id === 'MGMT-ROLE-1'
    && requirement.statement.includes('owner') && requirement.statement.includes('denied')),
    'each role must carry a positive and negative journey requirement');
assert.match(delegated.talimatname, /Asset/);
assert.match(delegated.talimatname, /owner-fixture/);
const withdrawn = normalizeManagerPlan({ ...delegated, management: { needed: false, reason: 'The approved scope is a static public page.' } });
assert.ok(!withdrawn.requirements.some(requirement => /^MGMT-/.test(requirement.id)),
    'withdrawn management scope must not leave mandatory role or resource requirements');
assert.equal(typeof directorAgent.validateManagementTaskCoverage, 'function');
const partialTasks = { app: { tasks: [{ id: 'asset-crud', targetFiles: ['src/assets.js'], requirementIds: ['MGMT-RESOURCE-1'] }] } };
assert.ok(directorAgent.validateManagementTaskCoverage(delegated, partialTasks).missing.some(item => item.includes('api:create')),
    'one UI task cannot prove an API CRUD task');
const tagged = normalizeTeamleaderTasks({ tasks: [{ id: 'asset-ui', targetFiles: ['src/assets/page.tsx'],
    requirementIds: ['MGMT-RESOURCE-1'], managementCoverage: [{ requirementId: 'MGMT-RESOURCE-1', surface: 'ui', operation: 'create' }] }] },
delegated.requirements);
assert.equal(tagged.tasks[0].managementCoverage?.[0]?.surface, 'ui', 'coverage metadata must survive task normalization');
const falselyCombined = { app: { tasks: [{ id: 'everything', targetFiles: ['src/assets.tsx'],
    requirementIds: ['MGMT-RESOURCE-1', 'MGMT-ROLE-1', 'MGMT-ROLE-2'],
    managementCoverage: [
        ...['ui', 'api'].flatMap(surface => managed.resources[0].operations.map(operation =>
            ({ requirementId: 'MGMT-RESOURCE-1', surface, operation }))),
        ...['MGMT-ROLE-1', 'MGMT-ROLE-2'].flatMap(requirementId =>
            ['login', 'positive', 'negative'].map(journey => ({ requirementId, journey })))
    ] }] } };
assert.equal(directorAgent.validateManagementTaskCoverage(delegated, falselyCombined).passed, false,
    'one target file cannot claim both UI and API work or all role journeys');
const completeTasks = { app: { tasks: [
    { id: 'asset-ui', targetFiles: ['src/assets/page.tsx'], requirementIds: ['MGMT-RESOURCE-1'],
        managementCoverage: managed.resources[0].operations.map(operation => ({ requirementId: 'MGMT-RESOURCE-1', surface: 'ui', operation })) },
    { id: 'asset-api', targetFiles: ['src/app/api/assets/route.ts'], requirementIds: ['MGMT-RESOURCE-1'],
        managementCoverage: managed.resources[0].operations.map(operation => ({ requirementId: 'MGMT-RESOURCE-1', surface: 'api', operation })) },
    { id: 'auth-roles', targetFiles: ['src/auth.ts'], requirementIds: ['MGMT-ROLE-1', 'MGMT-ROLE-2'],
        managementCoverage: ['MGMT-ROLE-1', 'MGMT-ROLE-2'].map(requirementId => ({ requirementId, journey: 'login' })) },
    { id: 'role-ui', targetFiles: ['src/components/AssetActions.tsx'], requirementIds: ['MGMT-ROLE-1', 'MGMT-ROLE-2'],
        managementCoverage: ['MGMT-ROLE-1', 'MGMT-ROLE-2'].flatMap(requirementId =>
            ['positive', 'negative'].map(journey => ({ requirementId, journey }))) }
] } };
assert.equal(directorAgent.validateManagementTaskCoverage(delegated, completeTasks).passed, true);
const sameTarget = { app: { tasks: completeTasks.app.tasks.map(task => task.id === 'asset-api'
    ? { ...task, targetFiles: ['src/assets/page.tsx'] } : task) } };
assert.equal(directorAgent.validateManagementTaskCoverage(delegated, sameTarget).passed, false,
    'separate task labels on one file cannot claim both UI and API coverage');
const falseSurfaceFiles = { app: { tasks: completeTasks.app.tasks.map(task => ({ ...task,
    targetFiles: [task.id === 'asset-ui' ? 'README.md'
        : task.id === 'asset-api' ? 'package.json'
            : task.id === 'auth-roles' ? 'docs/auth.md' : 'docs/roles.md'] })) } };
assert.equal(directorAgent.validateManagementTaskCoverage(delegated, falseSurfaceFiles).passed, false,
    'documentation and package metadata cannot claim generated UI, API, or role behavior');
assert.match(directorAgent.formatManagementTaskDescription(completeTasks.app.tasks[0]), /MGMT-RESOURCE-1.*ui.*create/s,
    'the Coder and Reviewer must receive the UI operation obligation');
assert.match(directorAgent.formatManagementTaskDescription(completeTasks.app.tasks[0], delegated), /\/api\/assets\/\{id\}/,
    'Coder must receive the approved resource behavior and paths');
assert.match(directorAgent.formatManagementTaskDescription(completeTasks.app.tasks[2], delegated), /\/api\/auth\/login/,
    'role login tasks must receive approved authentication paths and provisioning');
assert.match(directorAgent.formatManagementTaskDescription(completeTasks.app.tasks[3], delegated), /#forbidden/,
    'role UI tasks must receive approved browser journey steps and outcomes');
assert.match(reviewerAgent.buildReviewerPrompt('Asset UI', ['src/assets/page.tsx'], [],
    directorAgent.formatManagementTaskDescription(completeTasks.app.tasks[0])), /MGMT-RESOURCE-1.*ui.*create/s,
    'review prompt must show the same operation obligation');

console.log('Manager management discovery contract passed');
