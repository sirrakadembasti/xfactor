import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { ensureProjectScaffold } from '../engine/codeGenerator.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-auth-scaffold-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
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

    await runAsyncTest('3. ensureProjectScaffold creates prisma/seed.ts with admin seed', async () => {
        const workspace = await createTempWorkspace();
        await ensureProjectScaffold(workspace, { title: 'Admin App', hasAuth: true }, {});

        const seedPath = path.join(workspace, 'prisma', 'seed.ts');
        const seedContent = await fs.readFile(seedPath, 'utf8');

        assert.ok(seedContent.includes("username: 'admin'"), "seed.ts should seed username: 'admin'");
        assert.ok(seedContent.includes("role: 'admin'"), "seed.ts should assign role: 'admin'");
        assert.ok(seedContent.includes("admin123") || seedContent.includes("hashPassword"), "seed.ts should handle admin password");
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
        assert.strictEqual(authModule.verifyPassword('admin123', 'admin123'), true, 'verifyPassword should handle plaintext fallback');

        // Test requireAuth
        const validUser = { id: '1', username: 'user1', role: 'user' };
        const adminUser = { id: '2', username: 'admin', role: 'admin' };

        assert.deepStrictEqual(authModule.requireAuth({ user: validUser }), validUser);
        assert.throws(() => authModule.requireAuth({}), /Unauthorized/);

        // Test requireAdmin
        assert.deepStrictEqual(authModule.requireAdmin({ user: adminUser }), adminUser);
        assert.throws(() => authModule.requireAdmin({ user: validUser }), /Forbidden/);
    });
} finally {
    for (const dir of tempDirs) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

finish();
