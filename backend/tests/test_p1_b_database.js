import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DatabaseSync } from 'node:sqlite';
import { createTestHarness } from './testHarness.js';
import { verifyDatabase } from '../verification/databaseVerifier.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-db-verif-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. verifyDatabase should fail-closed when database schema or file is missing', async () => {
        const workspace = await createTempWorkspace();
        const res = await verifyDatabase(workspace, { database: { engine: 'sqlite' } }, {});
        assert.strictEqual(res.passed, false);
        assert.ok(res.checks.some(c => c.status === 'failed' || c.status === 'blocked'));
    });

    await runAsyncTest('2. verifyDatabase should verify valid SQLite database and assert write/read capability', async () => {
        const workspace = await createTempWorkspace();
        const dbPath = path.join(workspace, 'dev.db');

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
        const prismaDir = path.join(workspace, 'prisma');
        await fs.mkdir(prismaDir, { recursive: true });
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
            async execute() {
                return { status: 'PASS', passed: true, exitCode: 0, stdout: 'Prisma migration pass', stderr: '' };
            }
        };

        const res = await verifyDatabase(workspace, {
            database: { engine: 'sqlite' }
        }, {
            DATABASE_URL: 'file:./dev.db'
        }, {
            adapter: mockSandboxAdapter
        });

        assert.strictEqual(res.passed, true);
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
