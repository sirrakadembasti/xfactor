import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createTestHarness } from './testHarness.js';
import { ensureProjectScaffold, detectProjectStack } from '../engine/codeGenerator.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-auth-scaffold-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('React frontend with Express REST API uses the split Vite runtime without requiring a Vite keyword', async () => {
        const workspace = await createTempWorkspace();
        const stack = await detectProjectStack(workspace, { title: 'Inventory' }, {
            summary: 'Express.js REST API ve React/Tailwind ön yüz',
            talimatname: 'Node Express TypeScript, Prisma SQLite; frontend React TypeScript.'
        });
        assert.equal(stack.framework, 'vite');
        assert.equal(stack.hasExpressApi, true);
        assert.equal(stack.isNext, false);
        const explicitNext = await detectProjectStack(workspace, {}, { summary: 'Next.js frontend with Express API' });
        assert.equal(explicitNext.framework, 'nextjs');
    });
    await runAsyncTest('Next.js plus Express preserves both runtime services and their container entrypoint', async () => {
        const workspace = await createTempWorkspace();
        const plan = { summary: 'Next.js frontend with Express API' };
        assert.equal((await detectProjectStack(workspace, {}, plan)).hasExpressApi, true);
        await ensureProjectScaffold(workspace, { title: 'Split Next Inventory' }, plan);
        const manifest = JSON.parse(await fs.readFile(path.join(workspace, 'service-manifest.json'), 'utf8'));
        assert.equal(manifest.services.web.type, 'nextjs');
        assert.equal(manifest.services.api.type, 'express');
        assert.notEqual(manifest.services.web.port, manifest.services.api.port);
        const pkg = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8'));
        assert.equal(pkg.scripts['start:api'], 'tsx src/server.ts');
        assert.equal(pkg.scripts['start:services'], 'node scripts/xfactor-start.cjs');
        const docker = await fs.readFile(path.join(workspace, 'Dockerfile'), 'utf8');
        assert.ok(docker.includes('COPY --from=builder /app ./'));
        assert.ok(docker.includes('start:services'));
        const app = await fs.readFile(path.join(workspace, 'src/httpApp.ts'), 'utf8');
        assert.ok(!app.includes('cors()'), 'the default API must not enable wildcard CORS');
    });
    await runAsyncTest('split service launcher passes each port and stops the sibling when one runtime fails', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, {}, { summary: 'Next.js frontend with Express API' });
        const serviceSource = "const fs = require('node:fs'); fs.writeFileSync(process.argv[2], JSON.stringify({ port: process.env.PORT, pid: process.pid })); if (process.argv[3] === 'fail') setTimeout(() => process.exit(7), 500); else setInterval(() => {}, 1000);";
        await fs.writeFile(path.join(workspace, 'service.cjs'), serviceSource);
        await fs.writeFile(path.join(workspace, 'service-manifest.json'), JSON.stringify({ services: {
            web: { command: process.execPath, args: ['service.cjs', 'web.json'], port: 3000 },
            api: { command: process.execPath, args: ['service.cjs', 'api.json', 'fail'], port: 3001 }
        } }));
        const child = spawn(process.execPath, ['scripts/xfactor-start.cjs'], { cwd: workspace, stdio: 'ignore' });
        const timer = setTimeout(() => child.kill(), 10000);
        try {
            const [code] = await once(child, 'exit');
            assert.equal(code, 7);
            const web = JSON.parse(await fs.readFile(path.join(workspace, 'web.json'), 'utf8'));
            const api = JSON.parse(await fs.readFile(path.join(workspace, 'api.json'), 'utf8'));
            assert.equal(web.port, '3000');
            assert.equal(api.port, '3001');
            assert.throws(() => process.kill(web.pid, 0), /ESRCH/);
        } finally { clearTimeout(timer); }
    });
    await runAsyncTest('an explicit Vite revision cannot silently reuse a Next output tree', async () => {
        const workspace = await createTempWorkspace();
        await fs.mkdir(path.join(workspace, 'src', 'app'), { recursive: true });
        await fs.writeFile(path.join(workspace, 'next.config.ts'), 'export default {};');
        await assert.rejects(ensureProjectScaffold(workspace, {}, { summary: 'Vite React frontend ve Express API' }),
            /Worker repair requires Manager revision:.*framework/i);
        assert.equal(await fs.readFile(path.join(workspace, 'next.config.ts'), 'utf8'), 'export default {};');
        await assert.rejects(fs.access(path.join(workspace, 'package.json')));
    });
    await runAsyncTest('1. ensureProjectScaffold creates schema.prisma with User model when state.contract.authentication.required is true', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { contract: { authentication: { required: true } }, title: 'auth-app' }, {});

        const schemaPath = path.join(workspace, 'prisma', 'schema.prisma');
        const schemaContent = await fs.readFile(schemaPath, 'utf8');

        assert.ok(schemaContent.includes('model User'), 'schema.prisma should contain model User');
        assert.ok(schemaContent.includes('id'), 'User model should have id');
        assert.ok(schemaContent.includes('username'), 'User model should have username');
        assert.ok(schemaContent.includes('password'), 'User model should have password');
        assert.ok(schemaContent.includes('role'), 'User model should have role');
        assert.ok(schemaContent.includes('createdAt'), 'User model should have createdAt');
    });

    await runAsyncTest('2. ensureProjectScaffold updates existing schema.prisma to include User model when auth is indicated in plan', async () => {
        const workspace = await createTempWorkspace();
        const prismaDir = path.join(workspace, 'prisma');
        await fs.mkdir(prismaDir, { recursive: true });
        await fs.writeFile(path.join(prismaDir, 'schema.prisma'), `
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Product {
  id    String @id @default(uuid())
  name  String
}
`, 'utf8');

        await ensureProjectScaffold(workspace, { title: 'shop-app' }, { talimatname: 'Kullanici girisi ve admin paneli' });

        const schemaContent = await fs.readFile(path.join(prismaDir, 'schema.prisma'), 'utf8');
        assert.ok(schemaContent.includes('model Product'), 'Existing model Product should be preserved');
        assert.ok(schemaContent.includes('model User'), 'model User should be added to existing schema');
        assert.ok(schemaContent.includes('username'), 'User model should have username');
        assert.ok(schemaContent.includes('role'), 'User model should have role');
    });

    await runAsyncTest('3. ensureProjectScaffold creates isolated demo seeds for every declared role', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Asset App' }, { management: {
            needed: true,
            roles: [
                { name: 'manager', demoUser: { username: 'manager-fixture', setup: 'isolated-test-seed' } },
                { name: 'viewer', demoUser: { username: 'viewer-fixture', setup: 'isolated-test-seed' } }
            ]
        } });

        const seedPath = path.join(workspace, 'prisma', 'seed.ts');
        const seedContent = await fs.readFile(seedPath, 'utf8');

        assert.ok(seedContent.includes('manager-fixture'));
        assert.ok(seedContent.includes('viewer-fixture'));
        assert.ok(seedContent.includes('XFACTOR_DEMO_PASSWORD_MANAGER'));
        assert.ok(seedContent.includes('XFACTOR_DEMO_PASSWORD_VIEWER'));
        assert.ok(!seedContent.includes('admin123'));
        assert.ok(seedContent.includes("NODE_ENV === 'production'"));
        const envExample = await fs.readFile(path.join(workspace, '.env.example'), 'utf8');
        assert.ok(envExample.includes('XFACTOR_DEMO_PASSWORD_MANAGER='));
        assert.ok(envExample.includes('XFACTOR_DEMO_PASSWORD_VIEWER='));
        const pkg = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8'));
        assert.match(pkg.scripts['xfactor:test:setup'] || '', /prisma db push/);
        assert.match(pkg.scripts['xfactor:test:setup'] || '', /prisma db seed/);
    });

    await runAsyncTest('4. ensureProjectScaffold creates src/lib/auth.ts with required auth helpers', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Login App' }, {});

        const authPath = path.join(workspace, 'src', 'lib', 'auth.ts');
        const authContent = await fs.readFile(authPath, 'utf8');

        assert.ok(authContent.includes('export function hashPassword'), 'auth.ts should export hashPassword');
        assert.ok(authContent.includes('export function verifyPassword'), 'auth.ts should export verifyPassword');
        assert.ok(authContent.includes('export function requireAuth'), 'auth.ts should export requireAuth');
        assert.ok(authContent.includes('export function requireAdmin'), 'auth.ts should export requireAdmin');
    });

    await runAsyncTest('5. verify function logic in generated src/lib/auth file', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Auth Logic App', auth: true }, {});

        const authPath = path.join(workspace, 'src', 'lib', 'auth.ts');
        const content = await fs.readFile(authPath, 'utf8');
        // Strip type annotations for inline evaluation test
        const jsContent = content
            .replace(/\?: (string|boolean|any)/g, ' = undefined')
            .replace(/: (string|boolean|any)/g, '')
            .replace(/: any/g, '');
        const dataUri = `data:text/javascript;charset=utf-8,${encodeURIComponent(jsContent)}`;
        const authModule = await import(dataUri);

        const hash = authModule.hashPassword('admin123');
        assert.strictEqual(typeof hash, 'string');
        assert.ok(hash.includes(':'), 'Hashed password should include salt:hash');

        assert.strictEqual(authModule.verifyPassword('admin123', hash), true, 'verifyPassword should return true for correct password');
        assert.strictEqual(authModule.verifyPassword('wrongpass', hash), false, 'verifyPassword should return false for incorrect password');
        assert.strictEqual(authModule.verifyPassword('admin123', 'admin123'), false, 'plaintext passwords must be rejected');

        // Test requireAuth
        const validUser = { id: '1', username: 'user1', role: 'user' };
        const adminUser = { id: '2', username: 'admin', role: 'admin' };

        assert.deepStrictEqual(authModule.requireAuth({ user: validUser }), validUser);
        assert.throws(() => authModule.requireAuth({}), /Unauthorized/);
        // Test requireAdmin
        assert.deepStrictEqual(authModule.requireAdmin({ user: adminUser }), adminUser);
        assert.throws(() => authModule.requireAdmin({ user: validUser }), /Forbidden/);
        const matrix = {
            manager: [{ resource: 'assets', operations: ['create', 'read'] }],
            viewer: [{ resource: 'assets', operations: ['read'] }]
        };
        assert.equal(authModule.hasPermission({ role: 'manager' }, 'assets', 'create', matrix), true);
        assert.equal(authModule.hasPermission({ role: 'viewer' }, 'assets', 'create', matrix), false);
        assert.equal(authModule.hasPermission({ role: 'viewer' }, 'assets', 'read', matrix), true);
        assert.throws(() => authModule.requirePermission({ user: { role: 'viewer' } }, 'assets', 'create', matrix), /Forbidden/);
        assert.deepStrictEqual(authModule.requirePermission({ user: { role: 'manager' } }, 'assets', 'create', matrix), { role: 'manager' });
    });

    await runAsyncTest('6. ensureProjectScaffold creates Dockerfile and .dockerignore for generated projects', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'container-test-app' }, {});
        const dockerfileExists = await fs.stat(path.join(workspace, 'Dockerfile')).then(() => true).catch(() => false);
        const dockerignoreExists = await fs.stat(path.join(workspace, '.dockerignore')).then(() => true).catch(() => false);
        assert.strictEqual(dockerfileExists, true, 'Dockerfile must be generated');
        assert.strictEqual(dockerignoreExists, true, '.dockerignore must be generated');
        const dockerfileContent = await fs.readFile(path.join(workspace, 'Dockerfile'), 'utf8');
        assert.ok(dockerfileContent.includes('FROM node:22-alpine'), 'Must use node 22 alpine base image');
        assert.ok(dockerfileContent.includes('EXPOSE'), 'Must expose service port');
        assert.ok(dockerfileContent.includes('RUN npm ci && mkdir -p node_modules'),
            'A dependency-free build must still provide the runner COPY source');
        const publicCopy = dockerfileContent.indexOf('COPY --from=builder /app/public ./public');
        if (publicCopy >= 0) {
            const publicPreparation = dockerfileContent.indexOf('RUN mkdir -p public');
            assert.ok(publicPreparation >= 0 && publicPreparation < publicCopy,
                'Optional public directory must exist in the builder before runner COPY');
        }
    });
    await runAsyncTest('7. Next scaffold does not produce passing placeholder test or unsupported next lint', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Next app' }, { talimatname: 'Next.js app router' });
        const pkg = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8'));
        assert.ok(!pkg.scripts.test.includes('No tests specified'));
        assert.ok(!pkg.scripts.lint.includes('next lint'));
        assert.ok(pkg.devDependencies.eslint);
        assert.ok(pkg.devDependencies['eslint-config-next']);
        assert.ok((await fs.readFile(path.join(workspace, 'eslint.config.mjs'), 'utf8')).includes('eslint-config-next/core-web-vitals'));
    });
    await runAsyncTest('8. Express Prisma image retains its generator toolchain', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Express Inventory' }, {
            talimatname: 'Express server with Prisma SQLite', management: { needed: true, roles: [] }
        });
        const dockerfile = await fs.readFile(path.join(workspace, 'Dockerfile'), 'utf8');
        assert.ok(!dockerfile.includes('npm ci --omit=dev\nCOPY . .\nRUN npx prisma generate'));
        assert.ok(dockerfile.includes('RUN npx prisma generate'));
        assert.ok(dockerfile.includes('DATABASE_URL=file:/data/app.db'));
        assert.ok(dockerfile.includes('VOLUME ["/data"]'));
        assert.ok(dockerfile.includes('npx prisma db push && npm start'));
    });
    await runAsyncTest('9. explicit non-management assessment does not trigger auth from negated keywords', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Public Gallery' }, {
            management: { needed: false, reason: 'No user accounts or operational records.' },
            talimatname: 'A public gallery with no users, login or admin panel.'
        });
        assert.equal(await fs.stat(path.join(workspace, 'src', 'lib', 'auth.ts')).then(() => true).catch(() => false), false);
    });
} finally {
    for (const dir of tempDirs) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

finish();
