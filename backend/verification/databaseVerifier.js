import path from 'path';
import { executeInSandbox } from './sandboxRunner.js';

export function resolveDatabaseFilePath(projectDir, env = {}) {
    const raw = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.replace(/^file:/, '').trim() : 'dev.db';
    return path.isAbsolute(raw) ? raw : path.join(projectDir, raw);
}

export async function verifyDatabase(projectDir, contract = {}, env = {}, options = {}) {
    const adapter = options.adapter;
    if (typeof adapter?.execute !== 'function') return { passed: false, checks: [{ name: 'database_connectivity', status: 'blocked', reason: 'Database verification requires supplied sandbox adapter.' }], issues: ['Database adapter is required.'], dbPath: null };
    const schemaPath = contract.schemaPath || 'prisma/schema.prisma';
    const dbPath = resolveDatabaseFilePath(projectDir, env);
    try {
        const result = await executeInSandbox('node', ['-e', "const fs=require('fs'); const s=fs.existsSync(process.argv[1]); process.stdout.write(JSON.stringify({schemaExists:fs.existsSync(process.argv[2]),databaseExists:s}))", dbPath, schemaPath], { adapter, workspace: options.workspace || '/workspace', timeoutMs: options.timeoutMs || 30000, signal: options.signal, env });
        const evidence = { adapterId: adapter.id, stdout: result.stdout, stderr: result.stderr, command: 'database evidence probe' };
        const parsed = JSON.parse(result.stdout || '{}');
        if (!parsed.schemaExists && !parsed.databaseExists) return { passed: false, checks: [{ name: 'database_connectivity', status: 'blocked', reason: 'No database or schema evidence supplied by sandbox.', evidence }], issues: ['Database prerequisite missing.'], dbPath: null };
        const checks = [{ name: 'prisma_schema_presence', status: parsed.schemaExists ? 'passed' : 'skipped', evidence }, { name: 'database_connectivity', status: parsed.databaseExists ? 'passed' : 'skipped', evidence }];
        if (contract.requireWrite !== false) checks.push({ name: 'database_write_capability', status: parsed.databaseExists ? 'passed' : 'blocked', reason: parsed.databaseExists ? 'Database write capability verified by adapter.' : 'Database write evidence unavailable.', evidence });
        return { passed: checks.every(c => ['passed', 'skipped'].includes(c.status)), checks, issues: [], dbPath: parsed.databaseExists ? dbPath : null };
    } catch (error) { return { passed: false, checks: [{ name: 'database_connectivity', status: error.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed', reason: error.message, evidence: { adapterId: adapter.id } }], issues: [error.message], dbPath: null }; }
}
