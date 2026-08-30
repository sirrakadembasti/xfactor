import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { executeInSandbox } from './sandboxRunner.js';

export function resolveDatabaseFilePath(projectDir, env = {}) {
    const candidatePaths = [
        path.join(projectDir, 'dev.db'),
        path.join(projectDir, 'prisma', 'dev.db'),
        path.join(projectDir, 'database.sqlite'),
        path.join(projectDir, 'data.db')
    ];

    if (env.DATABASE_URL && typeof env.DATABASE_URL === 'string') {
        const raw = env.DATABASE_URL.replace(/^file:/, '').trim();
        const resolved = path.isAbsolute(raw) ? raw : path.join(projectDir, raw);
        candidatePaths.unshift(resolved);
    }

    for (const p of candidatePaths) {
        if (fsSync.existsSync(p)) {
            return p;
        }
    }

    // Default target path
    return path.join(projectDir, 'dev.db');
}

export async function verifyDatabase(projectDir, contract = {}, env = {}, options = {}) {
    const checks = [];
    const issues = [];

    const prismaSchemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
    const rootPrismaPath = path.join(projectDir, 'schema.prisma');
    const hasPrisma = fsSync.existsSync(prismaSchemaPath) || fsSync.existsSync(rootPrismaPath);

    if (hasPrisma) {
        checks.push({
            name: 'prisma_schema_presence',
            status: 'passed',
            reason: 'Prisma schema file exists in project.'
        });
    }

    const dbPath = resolveDatabaseFilePath(projectDir, env);
    const dbExists = fsSync.existsSync(dbPath);

    if (!dbExists && !hasPrisma) {
        checks.push({
            name: 'database_connectivity',
            status: 'failed',
            reason: 'No database file (dev.db/database.sqlite) or schema.prisma found.'
        });
        issues.push('No database file (dev.db/database.sqlite) or schema.prisma found.');
        return {
            passed: false,
            checks,
            issues
        };
    }

    // If prisma exists but db file does not, try running db push via sandbox if adapter provided
    if (hasPrisma && !dbExists && options.adapter) {
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        try {
            const pushRes = await executeInSandbox(npxCmd, ['prisma', 'db', 'push', '--skip-generate'], {
                workspace: projectDir,
                timeoutMs: options.timeoutMs || 30000,
                adapter: options.adapter
            });

            if (pushRes.passed) {
                checks.push({
                    name: 'prisma_db_push',
                    status: 'passed',
                    reason: 'Prisma db push applied schema to sandbox database.'
                });
            } else {
                checks.push({
                    name: 'prisma_db_push',
                    status: 'failed',
                    reason: `Prisma db push failed: ${pushRes.stderr || pushRes.stdout}`
                });
            }
        } catch (err) {
            checks.push({
                name: 'prisma_db_push',
                status: 'failed',
                reason: `Prisma db push execution error: ${err.message}`
            });
        }
    }

    // Verify SQLite Connectivity and Read/Write capability
    const targetDbPath = resolveDatabaseFilePath(projectDir, env);
    if (!fsSync.existsSync(targetDbPath)) {
        checks.push({
            name: 'database_connectivity',
            status: 'failed',
            reason: `Database file does not exist at: ${targetDbPath}`
        });
        issues.push(`Database file does not exist at: ${targetDbPath}`);
    } else {
        let sqliteDb = null;
        try {
            sqliteDb = new DatabaseSync(targetDbPath);
            checks.push({
                name: 'database_connectivity',
                status: 'passed',
                reason: 'Successfully opened SQLite database connection.'
            });

            // Write and Read test
            const testTableName = `_xfactor_write_test_${Date.now()}`;
            sqliteDb.exec(`CREATE TABLE ${testTableName} (id INTEGER PRIMARY KEY, test_val TEXT);`);
            sqliteDb.prepare(`INSERT INTO ${testTableName} (id, test_val) VALUES (1, 'verification_write_test');`).run();
            const row = sqliteDb.prepare(`SELECT test_val FROM ${testTableName} WHERE id = 1;`).get();
            sqliteDb.exec(`DROP TABLE ${testTableName};`);

            if (row && row.test_val === 'verification_write_test') {
                checks.push({
                    name: 'database_write_capability',
                    status: 'passed',
                    reason: 'Database write, read, and drop capability verified.'
                });
            } else {
                checks.push({
                    name: 'database_write_capability',
                    status: 'failed',
                    reason: 'Database read assertion returned unexpected payload.'
                });
                issues.push('Database read assertion returned unexpected payload.');
            }
        } catch (err) {
            checks.push({
                name: 'database_write_capability',
                status: 'failed',
                reason: `Database operation error: ${err.message}`
            });
            issues.push(`Database operation error: ${err.message}`);
        } finally {
            try {
                sqliteDb?.close();
            } catch {}
        }
    }

    const allPassed = checks.every(c => c.status === 'passed');
    return {
        passed: allPassed && issues.length === 0,
        checks,
        issues,
        dbPath: fsSync.existsSync(targetDbPath) ? targetDbPath : null
    };
}
