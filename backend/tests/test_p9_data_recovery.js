import assert from 'assert';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { createTestHarness } from './testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const dbModuleUrl = pathToFileURL(path.join(backendDir, 'db.js')).href;
const repositoryModuleUrl = pathToFileURL(path.join(backendDir, 'projectRepository.js')).href;

const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-p9-data-recovery-'));
const dbPath = path.join(isolatedRoot, 'database', 'projects.db');
const projectsRoot = path.join(isolatedRoot, 'projects');
const artifactsRoot = path.join(isolatedRoot, 'artifacts');
const trashRoot = path.join(isolatedRoot, 'trash');
const env = {
    ...process.env,
    DB_PATH: dbPath,
    PROJECTS_ROOT: projectsRoot,
    ARTIFACTS_ROOT: artifactsRoot,
    TRASH_ROOT: trashRoot,
    NODE_ENV: 'test'
};

const { runAsyncTest, finish } = createTestHarness();
let dbModule;
let repository;
let reconciliation;
let observability;
let maintenance;

function exists(target) {
    return fsSync.existsSync(target);
}

async function waitForFile(filePath, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (exists(filePath)) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for child-process marker: ${filePath}`);
}

function runChild(source, childEnv = env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
            cwd: backendDir,
            env: { ...childEnv },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
    });
}

async function remove(target) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
}

function isolatedChildImportSource() {
    return `
        import fsSync from 'node:fs';
        await import(${JSON.stringify(dbModuleUrl)});
        process.stdout.write(JSON.stringify({
            db: ${JSON.stringify(dbPath)},
            databaseExists: fsSync.existsSync(${JSON.stringify(dbPath)}),
            databaseParentExists: fsSync.existsSync(${JSON.stringify(path.dirname(dbPath))}),
            projectsExists: fsSync.existsSync(${JSON.stringify(projectsRoot)}),
            artifactsExists: fsSync.existsSync(${JSON.stringify(artifactsRoot)}),
            trashExists: fsSync.existsSync(${JSON.stringify(trashRoot)})
        }));
    `;
}

async function projectFilesRecoverable(projectId) {
    const candidates = [path.join(projectsRoot, projectId)];
    for (const root of [projectsRoot, trashRoot]) {
        const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.includes(projectId)) {
                candidates.push(path.join(root, entry.name));
            }
        }
    }
    for (const candidate of new Set(candidates)) {
        if (exists(path.join(candidate, 'payload.txt'))) return true;
        const nested = await fs.readdir(candidate, { withFileTypes: true }).catch(() => []);
        if (nested.some(entry => entry.isFile() && entry.name === 'payload.txt')) return true;
    }
    return false;
}

async function createProjectWithData(title) {
    const project = await repository.createProject({ title, env });
    const projectDir = repository.getProjectDir(project.id, env);
    await fs.writeFile(path.join(projectDir, 'payload.txt'), `recoverable:${project.id}`);
    return { project, projectDir };
}

function seedReceiptEvidence(projectId, tag) {
    const now = new Date().toISOString();
    const contractId = `p9-contract-${tag}`;
    const runId = `p9-run-${tag}`;
    const artifactId = `p9-artifact-${tag}`;
    const receiptId = `p9-receipt-${tag}`;
    const archivePath = path.join(artifactsRoot, `${tag}.zip`);
    const seed = (stage, callback) => {
        try {
            callback();
        } catch (error) {
            throw new Error(`receipt fixture ${stage} failed: ${error.message}`, { cause: error });
        }
    };
    seed('contract', () => dbModule.db.prepare(
        `INSERT INTO project_contracts
            (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at)
         VALUES (?, ?, 1, 'approved', '{}', ?, ?, ?)`
    ).run(contractId, projectId, `contract-hash-${tag}`, now, now));
    seed('verification run', () => dbModule.db.prepare(
        `INSERT INTO verification_runs
            (id, project_id, contract_id, status, policy_version, started_at, ended_at)
         VALUES (?, ?, ?, 'verified', '1.0', ?, ?)`
    ).run(runId, projectId, contractId, now, now));
    seed('artifact', () => dbModule.db.prepare(
        `INSERT INTO artifacts
            (id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id)
         VALUES (?, ?, ?, 'zip', ?, ?, 8, 'verified', NULL)`
    ).run(artifactId, projectId, contractId, path.relative(artifactsRoot, archivePath), 'a'.repeat(64)));
    return { contractId, runId, artifactId, receiptId, archivePath };
}

await runAsyncTest('importing db.js in a child has no isolated database or data-root side effects', async () => {
    const child = await runChild(isolatedChildImportSource(), env);
    assert.strictEqual(child.code, 0, child.stderr || child.stdout);
    const observation = JSON.parse(child.stdout);
    assert.strictEqual(observation.databaseExists, false);
    assert.strictEqual(observation.databaseParentExists, false);
    assert.strictEqual(observation.projectsExists, false);
    assert.strictEqual(observation.artifactsExists, false);
    assert.strictEqual(observation.trashExists, false);
});

// Direct the legacy module at the isolated path before importing it. The RED
// lifecycle assertion below requires the implementation to defer opening until
// initializeDatabase(), rather than merely changing the path used at import.
process.env.DB_PATH = dbPath;
process.env.PROJECTS_ROOT = projectsRoot;
process.env.ARTIFACTS_ROOT = artifactsRoot;
process.env.TRASH_ROOT = trashRoot;
dbModule = await import('../db.js');
dbModule.closeDatabase();

await runAsyncTest('database lifecycle is explicit, live-bound, and closeable', async () => {
    assert.strictEqual(typeof dbModule.initializeDatabase, 'function');
    assert.strictEqual(typeof dbModule.closeDatabase, 'function');
    assert.strictEqual(dbModule.db, null);
    assert.strictEqual(exists(dbPath), false);

    dbModule.initializeDatabase({ path: dbPath });
    assert.ok(dbModule.db, 'initializeDatabase must publish the current connection');
    assert.ok(exists(dbPath), 'explicit initialization must create the isolated database');

    dbModule.closeDatabase();
    assert.strictEqual(dbModule.db, null, 'closeDatabase must clear the current binding');
    assert.ok(exists(dbPath), 'closeDatabase must not remove persisted data');

    dbModule.initializeDatabase({ path: dbPath });
});

repository = await import('../projectRepository.js');
reconciliation = await import('../services/reconciliationService.js');
observability = await import('../observability.js');
maintenance = await import('../maintenance.js');

await runAsyncTest('rename failure leaves project data recoverable and records a resumable operation', async () => {
    const { project, projectDir } = await createProjectWithData('P9 rename failure');
    const renameError = new Error('injected rename failure');
    await assert.rejects(
        repository.deleteProject(project.id, {
            env,
            fsOps: {
                rename: async () => { throw renameError; }
            }
        }),
        /rename|injected/i
    );
    assert.ok(dbModule.db.prepare('SELECT id FROM projects WHERE id = ?').get(project.id));
    assert.strictEqual(await projectFilesRecoverable(project.id), true);
    assert.ok(exists(projectDir) || await projectFilesRecoverable(project.id));
});

await runAsyncTest('transaction failure rolls back destructive state and leaves data for restart recovery', async () => {
    const { project } = await createProjectWithData('P9 transaction failure');
    dbModule.db.exec(`
        CREATE TRIGGER p9_injected_delete_failure
        BEFORE DELETE ON projects
        WHEN OLD.id = '${project.id.replaceAll("'", "''")}'
        BEGIN SELECT RAISE(ABORT, 'p9 injected transaction failure'); END;
    `);

    await assert.rejects(
        repository.deleteProject(project.id, { env }),
        /p9 injected transaction failure|delete|transaction/i
    );
    assert.ok(dbModule.db.prepare('SELECT id FROM projects WHERE id = ?').get(project.id));
    assert.strictEqual(await projectFilesRecoverable(project.id), true);
    dbModule.db.exec('DROP TRIGGER p9_injected_delete_failure');

    dbModule.closeDatabase();
    const recoverySource = `
        import fs from 'node:fs/promises';
        const dbModule = await import(${JSON.stringify(dbModuleUrl)});
        const repo = await import(${JSON.stringify(repositoryModuleUrl)});
        dbModule.initializeDatabase({ path: process.env.DB_PATH });
        if (typeof repo.recoverPendingProjectDeletions !== 'function') {
            throw new Error('recoverPendingProjectDeletions export is required');
        }
        await repo.recoverPendingProjectDeletions({ env: process.env });
        await repo.recoverPendingProjectDeletions({ env: process.env });
        const remaining = dbModule.db.prepare('SELECT id FROM projects WHERE id = ?').get(${JSON.stringify(project.id)});
        process.stdout.write(JSON.stringify({ remaining: Boolean(remaining) }));
        dbModule.closeDatabase();
    `;
    const child = await runChild(recoverySource, env);
    assert.strictEqual(child.code, 0, child.stderr || child.stdout);
    assert.deepStrictEqual(JSON.parse(child.stdout), { remaining: false });
    dbModule.initializeDatabase({ path: dbPath });
    assert.strictEqual(await projectFilesRecoverable(project.id), false);
});

await runAsyncTest('receipt insertion racing with rename protects project data and archive', async () => {
    const { project } = await createProjectWithData('P9 receipt race');
    await fs.mkdir(artifactsRoot, { recursive: true });
    const evidence = seedReceiptEvidence(project.id, 'race');
    await fs.writeFile(evidence.archivePath, 'archive-data');
    dbModule.closeDatabase();

    const gate = path.join(isolatedRoot, 'rename-ready');
    const release = path.join(isolatedRoot, 'rename-release');
    const deleteSource = `
        import fs from 'node:fs/promises';
        import fsSync from 'node:fs';
        const dbModule = await import(${JSON.stringify(dbModuleUrl)});
        const repo = await import(${JSON.stringify(repositoryModuleUrl)});
        dbModule.initializeDatabase({ path: process.env.DB_PATH });
        const fsOps = {
            rename: async (source, target) => {
                await fs.writeFile(${JSON.stringify(gate)}, 'ready');
                while (!fsSync.existsSync(${JSON.stringify(release)})) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
                return fs.rename(source, target);
            }
        };
        let result = { ok: false };
        try {
            await repo.deleteProject(${JSON.stringify(project.id)}, { env: process.env, fsOps });
            result = { ok: true };
        } catch (error) {
            result = { ok: false, code: error.code || null, message: error.message };
        }
        process.stdout.write(JSON.stringify(result));
        dbModule.closeDatabase();
    `;
    const deleter = runChild(deleteSource, env);
    await waitForFile(gate);

    const receiptSource = `
        const dbModule = await import(${JSON.stringify(dbModuleUrl)});
        dbModule.initializeDatabase({ path: process.env.DB_PATH });
        const now = new Date().toISOString();
        const sql = \`INSERT INTO completion_receipts (id, project_id, contract_id, contract_hash, artifact_id, artifact_hash, run_id, policy_version, mandatory_gate_digests, previous_revision, next_revision, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, '1.0', '[]', 1, 2, ?)\`;
        dbModule.db.prepare(sql).run(${JSON.stringify(evidence.receiptId)}, ${JSON.stringify(project.id)}, ${JSON.stringify(evidence.contractId)}, 'contract-hash-race', ${JSON.stringify(evidence.artifactId)}, 'b'.repeat(64), ${JSON.stringify(evidence.runId)}, now);
        dbModule.closeDatabase();
    `;
    const receiptWriter = await runChild(receiptSource, env);
    assert.strictEqual(receiptWriter.code, 0, receiptWriter.stderr || receiptWriter.stdout);
    await fs.writeFile(release, 'release');
    const deleterResult = await deleter;
    assert.strictEqual(deleterResult.code, 0, deleterResult.stderr || deleterResult.stdout);
    const deleteOutcome = JSON.parse(deleterResult.stdout);
    assert.notStrictEqual(deleteOutcome.ok, true, 'receipt race must not report successful deletion');

    dbModule.initializeDatabase({ path: dbPath });
    assert.ok(dbModule.db.prepare('SELECT id FROM projects WHERE id = ?').get(project.id));
    assert.ok(dbModule.db.prepare('SELECT id FROM completion_receipts WHERE id = ?').get(evidence.receiptId));
    assert.strictEqual(await projectFilesRecoverable(project.id), true);
    assert.strictEqual(exists(evidence.archivePath), true);
});

await runAsyncTest('reconciliation reports unknown and missing directories without fabricating or deleting records', async () => {
    const { project: missingProject, projectDir } = await createProjectWithData('P9 missing directory');
    await remove(projectDir);
    const unknownId = 'project-p9-unverified';
    await fs.mkdir(path.join(projectsRoot, unknownId), { recursive: true });
    await fs.writeFile(path.join(projectsRoot, unknownId, 'payload.txt'), 'unverified');

    const result = await reconciliation.reconcileProjectsWithDisk({ env });
    assert.strictEqual(result.success, true);
    assert.ok(result.missingOnDisk.includes(missingProject.id));
    assert.ok(dbModule.db.prepare('SELECT id FROM projects WHERE id = ?').get(missingProject.id));
    assert.strictEqual(dbModule.db.prepare('SELECT id FROM projects WHERE id = ?').get(unknownId), undefined);
    const unverified = result.unverified || result.unverifiedDiscoveries || result.discovery?.unverified || [];
    assert.ok(
        unverified.some(entry => (entry.id || entry.name || entry.projectId) === unknownId),
        'unknown disk directories must be explicitly marked unverified'
    );
});

await runAsyncTest('reconciliation read failure returns explicit failure with zero database mutations', async () => {
    const before = dbModule.db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
    const unreadableRoot = path.join(isolatedRoot, 'not-a-directory');
    await fs.writeFile(unreadableRoot, 'not a directory');
    const result = await Promise.resolve()
        .then(() => reconciliation.reconcileProjectsWithDisk({ env, projectsRoot: unreadableRoot }))
        .catch(error => ({ thrown: error }));
    assert.strictEqual(result.thrown, undefined, result.thrown?.message);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    const after = dbModule.db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
    assert.strictEqual(after, before);
});

await runAsyncTest('log retention removes only old rows by created_at and retains recent rows', async () => {
    const { project } = await createProjectWithData('P9 log retention');
    const oldCreatedAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const recentCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    dbModule.db.prepare('INSERT INTO project_logs (project_id, agent, action, message, created_at) VALUES (?, ?, ?, ?, ?)').run(project.id, 'p9', 'old', 'old log', oldCreatedAt);
    dbModule.db.prepare('INSERT INTO project_logs (project_id, agent, action, message, created_at) VALUES (?, ?, ?, ?, ?)').run(project.id, 'p9', 'recent', 'recent log', recentCreatedAt);

    assert.strictEqual(typeof observability.cleanupStaleLogs, 'function');
    const removed = observability.cleanupStaleLogs(dbModule.db, 30);
    assert.strictEqual(removed, 1);
    const rows = dbModule.db.prepare('SELECT action, created_at FROM project_logs WHERE project_id = ? ORDER BY id').all(project.id);
    assert.deepStrictEqual(rows.map(row => row.action), ['recent']);
    assert.strictEqual(rows[0].created_at, recentCreatedAt);
});

await runAsyncTest('maintenance executes log retention and surfaces retention failures', async () => {
    const { project } = await createProjectWithData('P9 maintenance retention');
    const oldCreatedAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    dbModule.db.prepare('INSERT INTO project_logs (project_id, agent, action, message, created_at) VALUES (?, ?, ?, ?, ?)').run(project.id, 'p9', 'maintenance-old', 'old log', oldCreatedAt);

    let startupSweep;
    const scheduler = maintenance.createMaintenanceScheduler({
        database: dbModule.db,
        setTimeoutFn: callback => { startupSweep = callback; return { unref() {} }; },
        setIntervalFn: () => ({ unref() {} }),
        clearTimeoutFn: () => {},
        clearIntervalFn: () => {}
    });
    assert.strictEqual(typeof startupSweep, 'function');
    startupSweep();
    scheduler.stop();
    assert.strictEqual(
        dbModule.db.prepare("SELECT COUNT(*) AS count FROM project_logs WHERE project_id = ? AND action = 'maintenance-old'").get(project.id).count,
        0
    );

    dbModule.db.prepare('INSERT INTO project_logs (project_id, agent, action, message, created_at) VALUES (?, ?, ?, ?, ?)').run(project.id, 'p9', 'failure', 'must surface', oldCreatedAt);
    dbModule.db.exec(`
        CREATE TRIGGER p9_retention_failure
        BEFORE DELETE ON project_logs
        WHEN OLD.action = 'failure'
        BEGIN SELECT RAISE(ABORT, 'p9 retention failure'); END;
    `);
    assert.throws(() => observability.cleanupStaleLogs(dbModule.db, 30), /p9 retention failure|retention/i);
    dbModule.db.exec('DROP TRIGGER p9_retention_failure');
});

finish();
await remove(isolatedRoot);
