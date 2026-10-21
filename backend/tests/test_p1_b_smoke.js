import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import EventEmitter from 'node:events';
import { createTestHarness } from './testHarness.js';
import { verifyProjectSmoke } from '../verification/smokeVerifier.js';
const { runAsyncTest, finish } = createTestHarness();
const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-smoke-test-') { const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix)); tempDirs.push(dir); return dir; }
try {
    await runAsyncTest('1. verifyProjectSmoke executes adapter-only unified runtime validation', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ version: '1.0', services: { backend: { type: 'express', port: 3000, healthEndpoint: '/health' } } }));
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ name: 'smoke-test-project', scripts: { test: 'node --test test.js' } }));
        const calls = [];
        const adapter = {
            id: 'mock-sandbox',
            getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async execute(request) { calls.push(['execute', request]); return { passed: true, exitCode: 0,
                stdout: request.args?.includes('test') ? '# tests 1\n# pass 1' : JSON.stringify({ schemaExists: true, databaseExists: true, writeSucceeded: true }), stderr: '' }; },
            async request(request) {
                calls.push(['request', request]);
                if (request.method === 'POST') {
                    this.created = { id: 'fixture-1', name: request.data.name };
                    return { statusCode: 201, data: this.created };
                }
                if (request.url.endsWith('/api/items')) return { statusCode: 200, data: [this.created] };
                return { statusCode: 200, rawBody: '<html><body><div id="app">Live App</div></body></html>' };
            }
        };
        const result = await verifyProjectSmoke(workspace, { domains: [{ name: 'users', prefix: 'users' }], database: { engine: 'sqlite' }, api: { baseUrl: 'http://service' } }, { adapter, skipSpawnForLiveServer: true, baseUrl: 'http://service' });
        assert.strictEqual(result.passed, true, JSON.stringify(result));
        assert.ok(result.checks.some(c => c.name === 'smoke_gate' && c.status === 'passed'));
        const smokeGate = result.checks.find(c => c.name === 'smoke_gate');
        assert.strictEqual(smokeGate.evidence?.kind, 'derived_gate');
        assert.ok(smokeGate.evidence.sourceGateNames.includes('detail:smoke_liveness_probe'));
        assert.ok(result.checks.some(c => c.name === 'database_connectivity' && c.status === 'passed'));
        assert.ok(calls.some(([kind]) => kind === 'request'));
    });
    await runAsyncTest('2. verifyProjectSmoke starts and probes the service declared by the manifest', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({
            version: '1.0',
            services: {
                web: {
                    type: 'nextjs',
                    command: 'npm',
                    args: ['run', 'start'],
                    port: 3000,
                    healthEndpoint: '/'
                }
            }
        }));
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({
            name: 'manifest-runtime',
            scripts: { test: 'node --test test.js' }
        }));
        const calls = [];
        const adapter = {
            id: 'manifest-runtime-adapter',
            getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async spawn(request) {
                calls.push(['spawn', request]);
                const child = new EventEmitter();
                child.pid = 42;
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                return child;
            },
            async kill(pid) { calls.push(['kill', pid]); },
            async request(request) {
                calls.push(['request', request]);
                return { statusCode: 200, rawBody: '<html>ready</html>' };
            },
            async execute(request) {
                calls.push(['execute', request]);
                return { passed: true, exitCode: 0, stdout: request.args?.includes('test') ? '# tests 1\n# pass 1' : '', stderr: '' };
            }
        };

        const result = await verifyProjectSmoke(workspace, {}, { adapter, startupTimeoutMs: 100 });

        assert.strictEqual(result.passed, true);
        assert.ok(calls.some(([kind, request]) => kind === 'spawn'
            && request.command === 'npm'
            && request.args.join(' ') === 'run start'));
        assert.ok(calls.some(([kind, request]) => kind === 'spawn'
            && request.env?.DATABASE_URL === 'file:./dev.db'));
        assert.ok(calls.some(([kind, request]) => kind === 'execute'
            && request.env?.DATABASE_URL === 'file:./dev.db'));
        assert.ok(calls.some(([kind, request]) => kind === 'request'
            && request.url === 'http://127.0.0.1:3000/'));
        assert.ok(calls.some(([kind, pid]) => kind === 'kill' && pid === 42));
    });
    await runAsyncTest('2. verifyProjectSmoke fails closed when manifest is missing', async () => { const result = await verifyProjectSmoke(await createTempWorkspace(), {}); assert.strictEqual(result.passed, false); });
    await runAsyncTest('3. Next task route and page provide runtime evidence when contract omits URLs', async () => {
        const workspace = await createTempWorkspace();
        const manifest = { version: '1.0', services: { web: { type: 'nextjs', port: 3000, healthEndpoint: '/' } } };
        const calls = [];
        const adapter = {
            id: 'mock-sandbox',
            getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async request(request) {
                calls.push(request);
                return { statusCode: 200, rawBody: '<html><main>Tasks</main></html>', html: '<html><main>Tasks</main></html>', data: { data: [] } };
            },
            async execute() { return { passed: true, exitCode: 0, stdout: '', stderr: '' }; }
        };
        const result = await verifyProjectSmoke(workspace, {}, {
            adapter,
            skipSpawnForLiveServer: true,
            files: [
                { path: 'service-manifest.json', content: JSON.stringify(manifest) },
                { path: 'package.json', content: JSON.stringify({ scripts: { test: 'echo ok' } }) },
                { path: 'src/app/api/tasks/route.ts', content: 'export async function GET() {}\nexport async function POST() {}' },
                { path: 'src/app/page.tsx', content: 'export default function Page() { return <main>Tasks</main>; }' }
            ]
        });
        assert.ok(result.checks.some(check => check.name === 'api_status_check' && check.status === 'passed'));
        assert.ok(result.checks.some(check => check.name === 'browser_journey_steps' && check.status === 'passed'));
        assert.ok(calls.some(call => call.url === 'http://127.0.0.1:3000/api/tasks' && call.method === 'POST'));
        assert.ok(calls.some(call => call.url === 'http://127.0.0.1:3000/' && call.method === 'GET'));
    });
    await runAsyncTest('4. management contract reaches the browser gate', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ version: '1.0', services: { web: { type: 'nextjs', port: 3000, healthEndpoint: '/' } } }));
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node --test test.js' } }));
        const adapter = {
            id: 'html-only', getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async request() { return { statusCode: 200, html: '<main>Admin</main>', rawBody: '<main>Admin</main>' }; },
            async execute() { return { passed: true, exitCode: 0, stdout: 'ok', stderr: '' }; }
        };
        const result = await verifyProjectSmoke(workspace, {
            management: { needed: true, roles: [{ name: 'manager' }], resources: [] },
            browser: { url: 'http://127.0.0.1:3000/', journey: { steps: [{ action: 'assert_element', selector: 'main' }] } }
        }, { adapter, skipSpawnForLiveServer: true });
        assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'blocked');
    });
    await runAsyncTest('5. missing management API and browser contracts block smoke verification', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ version: '1.0', services: { web: { type: 'nextjs', port: 3000, healthEndpoint: '/' } } }));
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node --test test.js' } }));
        const adapter = {
            id: 'html-only', getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async request() { return { statusCode: 200, html: '<main>Home</main>' }; },
            async execute() { return { passed: true, exitCode: 0, stdout: 'ok', stderr: '' }; }
        };
        const result = await verifyProjectSmoke(workspace, {
            management: { needed: true, resources: [{ name: 'assets', apiPath: '/api/assets', uiPath: '/admin/assets', operations: ['create'] }], roles: [{ name: 'manager' }] }
        }, { adapter, skipSpawnForLiveServer: true });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'management_runtime_contract')?.status, 'blocked');
    });
    await runAsyncTest('6. management smoke seeds isolated roles and probes authorized API behavior', async () => {
        const workspace = await createTempWorkspace();
        const calls = [];
        let created;
        const adapter = {
            id: 'role-flow', getCapabilities: () => ({ available: true, isolation: true, serviceSpawn: true }),
            async request(request) {
                if (request.method === 'POST') return { statusCode: 403, data: {} };
                return { statusCode: 200, html: '<main>Dashboard</main>', data: created ? [created] : [] };
            },
            async execute(request) {
                calls.push(request);
                if (request.args?.[1]?.includes('xfactor:test:setup')) return { passed: true, exitCode: 0, stdout: 'seeded' };
                if (request.args?.[1]?.includes('Role login')) {
                    const method = request.args[4], username = request.args[5];
                    if (method === 'POST' && username === 'viewer-fixture') return { passed: true, exitCode: 0, stdout: JSON.stringify({ statusCode: 403, data: {} }) };
                    if (method === 'POST') {
                        created = { id: '1', name: JSON.parse(request.args[9]).name };
                        return { passed: true, exitCode: 0, stdout: JSON.stringify({ statusCode: 201, data: created }) };
                    }
                    return { passed: true, exitCode: 0, stdout: JSON.stringify({ statusCode: 200, data: [created] }) };
                }
                return { passed: true, exitCode: 0, stdout: '' };
            }
        };
        const management = {
            needed: true,
            authentication: { apiLogin: { path: '/api/auth/login' } },
            resources: [{ name: 'assets', apiPath: '/api/assets', operations: ['create', 'read'] }],
            roles: [
                { name: 'manager', demoUser: { username: 'manager-fixture' }, permissions: [{ resource: 'assets', operations: ['create', 'read'] }] },
                { name: 'viewer', demoUser: { username: 'viewer-fixture' }, permissions: [{ resource: 'assets', operations: ['read'] }] }
            ]
        };
        const result = await verifyProjectSmoke(workspace, {
            management,
            api: { baseUrl: 'http://127.0.0.1:3000' },
            browser: { url: 'http://127.0.0.1:3000/', journey: { steps: [] } }
        }, {
            adapter, skipSpawnForLiveServer: true,
            files: [
                { path: 'service-manifest.json', content: JSON.stringify({ services: { web: { port: 3000, healthEndpoint: '/' } } }) },
                { path: 'package.json', content: JSON.stringify({ scripts: { test: 'node tests/smoke.test.js', 'xfactor:test:setup': 'prisma db push && prisma db seed' } }) }
            ]
        });
        assert.equal(result.checks.find(check => check.name === 'management_demo_seed')?.status, 'passed');
        assert.deepEqual(result.checks.filter(check => check.name === 'management_role_login')
            .map(check => [check.evidence?.role, check.status]),
            [['manager', 'passed'], ['viewer', 'passed']]);
        assert.equal(result.checks.find(check => check.name === 'api_role_create_allowed')?.status, 'passed');
        assert.equal(result.checks.find(check => check.name === 'api_role_create_denied')?.status, 'passed');
        assert.ok(calls.some(call => call.args?.[1]?.includes('xfactor:test:setup') && call.input));
    });
    await runAsyncTest('7. browser role journeys declared in the contract reach the interactive adapter', async () => {
        const workspace = await createTempWorkspace();
        const journeys = [
            { role: 'manager', kind: 'positive', steps: [{ action: 'click', selector: '#create' }], expectedOutcome: { kind: 'success', text: 'Created' } },
            { role: 'manager', kind: 'negative', steps: [{ action: 'submit', selector: '#forbidden' }], expectedOutcome: { kind: 'denied', text: 'Access denied' } }
        ];
        const interactions = [];
        const adapter = {
            id: 'interactive-fixture',
            async request() { return { statusCode: 200, html: '<main>Dashboard</main>' }; },
            async interact(request) {
                interactions.push(request);
                return { passed: true, session: { authenticatedRole: request.role },
                    actions: [{ index: 0, action: request.steps[0].action, target: request.steps[0].selector,
                        completed: true, accessibleName: 'Submit record', keyboardReachable: true }],
                    outcome: { kind: request.kind === 'positive' ? 'success' : 'denied',
                        text: request.kind === 'positive' ? 'Created' : 'Access denied', visible: true },
                    viewport: { width: 375, horizontalOverflow: false } };
            },
            async execute() { return { passed: true, exitCode: 0, stdout: '' }; }
        };
        const result = await verifyProjectSmoke(workspace, {
            management: { needed: true, roles: [{ name: 'manager' }], resources: [] },
            browser: { journey: { steps: [] }, roleJourneys: journeys }
        }, {
            adapter, skipSpawnForLiveServer: true,
            files: [
                { path: 'service-manifest.json', content: JSON.stringify({ services: { web: { port: 3000 } } }) },
                { path: 'package.json', content: JSON.stringify({ scripts: { test: 'node tests/smoke.test.js' } }) },
                { path: 'src/app/page.tsx', content: 'export default function Page() { return <main>Dashboard</main>; }' }
            ]
        });
        assert.equal(result.checks.find(check => check.name === 'browser_management_interaction')?.status, 'passed');
        assert.equal(interactions.length, 2);
    });
    await runAsyncTest('8. mixed services each start and become ready with independent ports before web browser verification', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ services: {
            api: { type: 'express', command: 'npm', args: ['run', 'start:api'], port: 3001, healthEndpoint: '/api/health' },
            web: { type: 'vite', command: 'npm', args: ['run', 'preview'], port: 4173, healthEndpoint: '/' }
        } }));
        await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node --test test.js' } }));
        const calls = [], running = new Map();
        let created;
        const adapter = {
            id: 'mixed-fixture', getCapabilities: () => ({ available: true, isolation: true }),
            async spawn(request) {
                calls.push(['spawn', request]);
                const child = new EventEmitter(); child.pid = request.port;
                running.set(request.port, child); return child;
            },
            async request(request) {
                const port = Number(new URL(request.url).port);
                assert.ok(running.has(port), `request reached unstarted service: ${port}`);
                calls.push(['request', request]);
                if (request.method === 'POST') {
                    created = { id: 'mixed-1', name: request.data.name };
                    return { statusCode: 201, data: created };
                }
                if (request.url.endsWith('/api/items')) return { statusCode: 200, data: [created] };
                return { statusCode: 200, html: '<main>Dashboard</main>', rawBody: '<main>Dashboard</main>' };
            },
            async execute() { return { passed: true, exitCode: 0, stdout: '# tests 1\n# pass 1', stderr: '' }; },
            async kill(pid) { calls.push(['kill', pid]); running.delete(pid); }
        };
        const result = await verifyProjectSmoke(workspace, {
            api: { domains: [{ prefix: 'items' }] },
            browser: { journey: { steps: [{ action: 'assert_element', selector: 'main' }] } }
        }, { adapter, env: { PORT: '9999' }, startupTimeoutMs: 50,
            files: undefined });
        assert.equal(result.passed, true, JSON.stringify(result));
        assert.deepEqual(calls.filter(([kind]) => kind === 'spawn').map(([, request]) => [request.port, request.env.PORT]), [[3001, '3001'], [4173, '4173']]);
        const serviceEnvs = calls.filter(([kind]) => kind === 'spawn').map(([, request]) => request.env);
        assert.match(serviceEnvs[0].AUTH_SECRET, /^[a-f0-9]{64}$/);
        assert.equal(serviceEnvs[1].AUTH_SECRET, serviceEnvs[0].AUTH_SECRET);
        assert.equal(serviceEnvs[0].JWT_SECRET, serviceEnvs[0].AUTH_SECRET);
        assert.equal(serviceEnvs[0].NEXTAUTH_SECRET, serviceEnvs[0].AUTH_SECRET);
        assert.ok(calls.some(([kind, request]) => kind === 'request' && request.url === 'http://127.0.0.1:3001/api/health'));
        assert.ok(calls.some(([kind, request]) => kind === 'request' && request.url === 'http://127.0.0.1:4173/'));
        assert.equal(result.baseUrl, 'http://127.0.0.1:4173');
        assert.deepEqual([...running.keys()], []);
        assert.equal(result.checks.filter(check => check.name === 'smoke_liveness_probe' && check.status === 'passed').length, 2);
        const repeat = await verifyProjectSmoke(workspace, {
            api: { domains: [{ prefix: 'items' }] },
            browser: { journey: { steps: [{ action: 'assert_element', selector: 'main' }] } }
        }, { adapter, startupTimeoutMs: 50 });
        assert.equal(repeat.passed, true, JSON.stringify(repeat));
        const repeatedEnvs = calls.filter(([kind]) => kind === 'spawn').map(([, request]) => request.env);
        assert.notEqual(repeatedEnvs[2].AUTH_SECRET, serviceEnvs[0].AUTH_SECRET);
    });
    await runAsyncTest('9. every started service is cleaned after readiness failure even if another cleanup fails', async () => {
        const workspace = await createTempWorkspace();
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ services: {
            web: { command: 'npm', args: ['run', 'preview'], port: 4173 },
            api: { command: 'npm', args: ['run', 'start:api'], port: 3001 }
        } }));
        const killed = [];
        const adapter = {
            id: 'mixed-failure', getCapabilities: () => ({ available: true, isolation: true }),
            async spawn(request) { const child = new EventEmitter(); child.pid = request.port; return child; },
            async request(request) { return { statusCode: request.url.includes(':3001') ? 503 : 200 }; },
            async kill(pid) { killed.push(pid); if (pid === 4173) throw new Error('fixture cleanup failure'); }
        };
        const result = await verifyProjectSmoke(workspace, {}, { adapter, startupTimeoutMs: 1 });
        assert.equal(result.passed, false);
        assert.deepEqual(killed.sort(), [3001, 4173]);
        assert.ok(result.issues.some(issue => issue.includes('cleanup')));
    });
    await runAsyncTest('10. Manager-shaped mixed contract infers endpoints and executes SQLite evidence from inventory', async () => {
        const workspace = await createTempWorkspace();
        const calls = [];
        const adapter = {
            id: 'manager-shape', getCapabilities: () => ({ available: true, isolation: true }),
            async request(request) { calls.push(request); return { statusCode: 200, html: '<main>Rooms</main>', data: [] }; },
            async execute(request) {
                calls.push(request);
                if (request.args?.[1]?.includes('DatabaseSync')) return { passed: true, exitCode: 0,
                    stdout: JSON.stringify({ schemaExists: true, databaseExists: true, writeSucceeded: true }) };
                if (request.args?.[1]?.includes('Role login')) return { passed: true, exitCode: 0,
                    stdout: JSON.stringify({ statusCode: 200, data: [] }) };
                return { passed: true, exitCode: 0, stdout: '# tests 1\n# pass 1' };
            }
        };
        const result = await verifyProjectSmoke(workspace, {
            summary: 'Hotel', domains: [{ prefix: 'rooms' }],
            management: { needed: true, authentication: { apiLogin: { path: '/api/auth/login' } },
                roles: [{ name: 'manager', demoUser: { username: 'manager-fixture' }, permissions: [{ resource: 'rooms', operations: ['read'] }] }],
                resources: [{ name: 'rooms', apiPath: '/api/rooms', readAccess: 'public', operations: ['read'] }] },
            browser: { roleJourneys: [] }
        }, { adapter, skipSpawnForLiveServer: true, files: [
            { path: 'service-manifest.json', content: JSON.stringify({ services: {
                web: { type: 'vite', port: 4173 }, api: { type: 'express', port: 3001, healthEndpoint: '/api/health' }
            } }) },
            { path: 'prisma/schema.prisma', content: 'datasource db {\n provider = "sqlite"\n url = env("DATABASE_URL")\n}' },
            { path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test test.js' } }) }
        ] });
        assert.ok(!result.checks.some(check => check.name === 'management_runtime_contract'), JSON.stringify(result));
        assert.equal(result.checks.find(check => check.name === 'database_connectivity')?.status, 'passed');
        assert.equal(result.checks.find(check => check.name === 'database_write_capability')?.status, 'passed');
        assert.ok(calls.some(request => request.url === 'http://127.0.0.1:3001/api/rooms'));
        assert.ok(calls.some(request => request.url === 'http://127.0.0.1:4173/'));
        assert.ok(calls.some(request => request.args?.[1]?.includes('DatabaseSync') && request.args.at(-1) === 'prisma/schema.prisma'));
    });
    await runAsyncTest('11. split Manager domains never become guessed API resources', async () => {
        for (const domains of [[{ name: 'frontend', prefix: 'frontend' }, { name: 'backend', prefix: 'backend' }], []]) {
            const workspace = await createTempWorkspace();
            const requests = [];
            const adapter = {
                id: 'missing-api-contract', getCapabilities: () => ({ available: true, isolation: true }),
                async request(request) { requests.push(request); return { statusCode: 200, html: '<main>Hotel</main>', data: [] }; },
                async execute() { return { passed: true, exitCode: 0, stdout: '# tests 1\n# pass 1' }; }
            };
            const result = await verifyProjectSmoke(workspace, { domains, management: { needed: false } }, {
                adapter, skipSpawnForLiveServer: true, files: [
                    { path: 'service-manifest.json', content: JSON.stringify({ services: {
                        web: { type: 'vite', port: 4173 }, api: { type: 'express', port: 3001, healthEndpoint: '/api/health' }
                    } }) },
                    { path: 'package.json', content: JSON.stringify({ scripts: { test: 'node --test test.js' } }) }
                ]
            });
            assert.deepEqual(requests.filter(request => request.method !== 'GET' || /\/api\/(?:frontend|backend|items)$/.test(request.url)), []);
            assert.equal(result.passed, false);
            assert.ok(result.checks.some(check => check.name === 'api_runtime_contract' && check.status === 'blocked'), JSON.stringify(result));
        }
    });
    finish();
} finally { await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true }))); }
