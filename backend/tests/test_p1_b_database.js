import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';
import { verifyDatabase, resolveDatabaseFilePath } from '../verification/databaseVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-db-verif-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('0. Prisma SQLite file URL resolves relative to schema directory', async () => {
        const workspace = await createTempWorkspace();
        assert.strictEqual(
            resolveDatabaseFilePath(workspace, { DATABASE_URL: 'file:./dev.db' }),
            path.join(workspace, 'prisma', 'dev.db')
        );
    });
    await runAsyncTest('0a. sandbox probe uses sandbox paths, not host project paths', async () => {
        const workspace = await createTempWorkspace();
        let probeArgs;
        const adapter = {
            id: 'docker-worker',
            isAvailable() { return true; },
            async execute(request) {
                probeArgs = request.args;
                return { passed: true, exitCode: 0, stdout: '{"schemaExists":true,"databaseExists":true,"writeSucceeded":true}', stderr: '' };
            }
        };
        const result = await verifyDatabase(workspace, { database: { engine: 'sqlite' } }, { DATABASE_URL: 'file:./dev.db' }, { adapter, workspace: '/workspace' });
        assert.strictEqual(result.passed, true);
        assert.strictEqual(probeArgs[2], '/workspace/prisma/dev.db');
        assert.strictEqual(result.dbPath, '/workspace/prisma/dev.db');
    });
    await runAsyncTest('0b. an existing database without a successful write probe is blocked', async () => {
        const adapter = {
            id: 'read-only-worker',
            isAvailable() { return true; },
            async execute() {
                return { passed: true, exitCode: 0, stdout: JSON.stringify({ schemaExists: true, databaseExists: true, writeSucceeded: false }), stderr: '' };
            }
        };
        const result = await verifyDatabase('/workspace', { database: { engine: 'sqlite' } },
            { DATABASE_URL: 'file:./dev.db' }, { adapter, workspace: '/workspace' });
        assert.equal(result.passed, false);
        assert.equal(result.checks.find(check => check.name === 'database_write_capability')?.status, 'blocked');
    });
    await runAsyncTest('1. verifyDatabase should fail-closed when database schema or file is missing', async () => {
        const workspace = await createTempWorkspace();
        const res = await verifyDatabase(workspace, { database: { engine: 'sqlite' } }, {});
        assert.strictEqual(res.passed, false);
        assert.ok(res.checks.some(c => c.status === 'failed' || c.status === 'blocked'));
    });

    await runAsyncTest('2. verifyDatabase should verify valid SQLite database and assert write/read capability', async () => {
        const workspace = await createTempWorkspace();
        const prismaDir = path.join(workspace, 'prisma');
        await fs.mkdir(prismaDir, { recursive: true });
        const dbPath = path.join(prismaDir, 'dev.db');

        // Create mock database with tables
        const testDb = new DatabaseSync(dbPath);
        testDb.exec(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL
            );
            CREATE TABLE posts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
        `);
        testDb.close();

        // Create prisma schema
        await fs.writeFile(path.join(prismaDir, 'schema.prisma'), `
            datasource db {
                provider = "sqlite"
                url      = "file:./dev.db"
            }
            model User {
                id    String @id @default(uuid())
                name  String
                email String @unique
            }
        `);

        const mockSandboxAdapter = {
            id: 'mock-sandbox',
            isAvailable() { return true; },
            async execute(request) {
                const result = spawnSync(process.execPath, request.args, { cwd: request.workspace, encoding: 'utf8' });
                if (result.error) throw result.error;
                return { passed: result.status === 0, exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
            }
        };

        const res = await verifyDatabase(workspace, {
            database: { engine: 'sqlite' }
        }, {
            DATABASE_URL: 'file:./dev.db'
        }, {
            adapter: mockSandboxAdapter,
            workspace
        });

        assert.strictEqual(res.passed, true, JSON.stringify(res));
        assert.ok(res.checks.some(c => c.name === 'database_connectivity' && c.status === 'passed'));
        assert.ok(res.checks.some(c => c.name === 'database_write_capability' && c.status === 'passed'));
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
