import path from 'path';
import { executeInSandbox } from './sandboxRunner.js';

export function resolveDatabaseFilePath(projectDir, env = {}, schemaPath = 'prisma/schema.prisma') {
    const raw = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.replace(/^file:/, '').trim() : 'dev.db';
    if (projectDir.startsWith('/')) return path.posix.isAbsolute(raw) ? raw : path.posix.resolve(projectDir, path.posix.dirname(schemaPath.replaceAll('\\', '/')), raw);
    return path.isAbsolute(raw) ? raw : path.resolve(projectDir, path.dirname(schemaPath), raw);
}

export async function verifyDatabase(projectDir, contract = {}, env = {}, options = {}) {
    const adapter = options.adapter;
    if (typeof adapter?.execute !== 'function') return { passed: false, checks: [{ name: 'database_connectivity', status: 'blocked', reason: 'Database verification requires supplied sandbox adapter.' }], issues: ['Database adapter is required.'], dbPath: null };
    const schemaPath = contract.schemaPath || 'prisma/schema.prisma';
    const dbPath = resolveDatabaseFilePath(options.workspace || projectDir, env, schemaPath);
    try {
        const probe = `const [dbPath,schemaPath]=process.argv.slice(1); const fs=require('node:fs'); const {DatabaseSync}=require('node:sqlite'); const {randomUUID}=require('node:crypto');
const result={schemaExists:fs.existsSync(schemaPath),databaseExists:fs.existsSync(dbPath),writeSucceeded:false};
if(result.databaseExists){let db;const nonce=randomUUID();try{db=new DatabaseSync(dbPath);const existed=Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__xfactor_verifier_probe'").get());db.exec('CREATE TABLE IF NOT EXISTS __xfactor_verifier_probe (nonce TEXT PRIMARY KEY)');db.prepare('INSERT INTO __xfactor_verifier_probe (nonce) VALUES (?)').run(nonce);db.close();db=new DatabaseSync(dbPath);result.writeSucceeded=Boolean(db.prepare('SELECT nonce FROM __xfactor_verifier_probe WHERE nonce = ?').get(nonce));db.prepare('DELETE FROM __xfactor_verifier_probe WHERE nonce = ?').run(nonce);if(!existed)db.exec('DROP TABLE __xfactor_verifier_probe');}catch(error){result.error=error.message;}finally{try{db?.close()}catch{}}}
process.stdout.write(JSON.stringify(result));`;
        const result = await executeInSandbox('node', ['-e', probe, dbPath, schemaPath], { adapter, workspace: options.workspace || '/workspace', timeoutMs: options.timeoutMs || 30000, signal: options.signal, env });
        const evidence = { adapterId: adapter.id, stdout: result.stdout, stderr: result.stderr, command: 'database evidence probe' };
        let parsed = {};
        try { parsed = JSON.parse(result.stdout || '{}'); } catch {}
        if (!parsed.schemaExists && !parsed.databaseExists) return { passed: false, checks: [{ name: 'database_connectivity', status: 'blocked', reason: 'No database or schema evidence supplied by sandbox.', evidence }], issues: ['Database prerequisite missing.'], dbPath: null };
        const checks = [{ name: 'prisma_schema_presence', status: parsed.schemaExists ? 'passed' : 'blocked', evidence }, { name: 'database_connectivity', status: parsed.databaseExists ? 'passed' : 'blocked', evidence }];
        if (contract.requireWrite !== false) checks.push({ name: 'database_write_capability', status: parsed.writeSucceeded === true ? 'passed' : 'blocked', reason: parsed.writeSucceeded === true ? 'SQLite write persisted across reopen.' : (parsed.error || 'Database write/readback evidence unavailable.'), evidence });
        const passed = checks.every(check => check.status === 'passed');
        return { passed, checks, issues: passed ? [] : [parsed.error || 'Database schema, connectivity, or write/readback evidence is missing.'], dbPath: parsed.databaseExists ? dbPath : null };
    } catch (error) { return { passed: false, checks: [{ name: 'database_connectivity', status: error.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed', reason: error.message, evidence: { adapterId: adapter.id } }], issues: [error.message], dbPath: null }; }
}
