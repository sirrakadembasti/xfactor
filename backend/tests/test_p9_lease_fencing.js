import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p9-lease-fencing');
process.env.DB_PATH = isolated.dbPath;
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { runAsyncTest, finish } = createTestHarness();

const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createProject, deleteProject, getProject, saveProjectState, projectStateTransitionInTransaction } = await import('../projectRepository.js');
const { verifyArtifactAndProject } = await import('../verification/verificationCli.js');
const {
    acquireWorkflowLease,
    getActiveWorkflowAttempt,
    updateAttemptHeartbeat,
    releaseWorkflowLease,
    reconcileStaleWorkflowAttempts
} = await import('../workflowAttempts.js');

function sqlUtcTimestamp(epochMs) {
    return new Date(epochMs).toISOString().slice(0, 19).replace('T', ' ');
}

async function withProject(title, fn) {
    const project = await createProject({ title });
    try {
        return await fn(project);
    } finally {
        await deleteProject(project.id).catch(() => {});
    }
}

function runLeaseProcess(projectId, leaseOwner) {
    const moduleUrl = new URL('../workflowAttempts.js', import.meta.url).href;
    const source = `
        const { acquireWorkflowLease } = await import(${JSON.stringify(moduleUrl)});
        const lease = acquireWorkflowLease(${JSON.stringify(projectId)}, ${JSON.stringify(leaseOwner)});
        console.log(JSON.stringify({ acquired: lease.acquired, attemptId: lease.attempt?.id ?? null, owner: lease.attempt?.lease_owner ?? null }));
    `;
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
            env: { ...process.env, DB_PATH: isolated.dbPath },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject);
        child.once('close', code => {
            if (code !== 0) {
                reject(new Error(`lease child exited ${code}: ${stderr || stdout}`));
                return;
            }
            const line = stdout.trim().split(/\r?\n/).at(-1);
            try {
                resolve(JSON.parse(line));
            } catch (error) {
                reject(new Error(`invalid lease child output: ${stdout || stderr}: ${error.message}`));
            }
        });
    });
}

await runAsyncTest('1. SQL UTC timestamps remain fresh against an ISO-time cutoff', async () => {
    await withProject('SQL UTC lease timestamp', async project => {
        const lease = acquireWorkflowLease(project.id, 'sql-owner');
        const secondConnection = new DatabaseSync(isolated.dbPath);
        try {
            secondConnection.prepare('UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?')
                .run(sqlUtcTimestamp(Date.now() - 1000), lease.attempt.id);
        } finally {
            secondConnection.close();
        }
        const active = getActiveWorkflowAttempt(project.id);
        assert.equal(active?.id, lease.attempt.id, 'A recent SQL-form UTC timestamp must be treated as fresh');
        assert.equal(releaseWorkflowLease(lease.attempt.id, 'completed', { leaseOwner: 'sql-owner' }), true);
    });
});

await runAsyncTest('2. stale recovery terminalizes and acquires the next lease atomically', async () => {
    await withProject('Atomic stale recovery', async project => {
        const oldLease = acquireWorkflowLease(project.id, 'old-owner');
        db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
        db.prepare('UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?')
            .run(sqlUtcTimestamp(Date.now() - 60000), oldLease.attempt.id);

        const newLease = acquireWorkflowLease(project.id, 'new-owner');
        assert.equal(newLease.acquired, true, 'A stale running row must not block a new lease');
        assert.notEqual(newLease.attempt.id, oldLease.attempt.id);

        const oldRow = db.prepare('SELECT status, ended_at FROM workflow_attempts WHERE id = ?').get(oldLease.attempt.id);
        assert.equal(oldRow.status, 'stale_terminated');
        assert.ok(oldRow.ended_at);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM workflow_attempts WHERE project_id = ? AND status = 'running'").get(project.id).count, 1);
        assert.equal(releaseWorkflowLease(newLease.attempt.id, 'completed', { leaseOwner: 'new-owner' }), true);
    });
});

await runAsyncTest('3. delayed old owner cannot heartbeat or release the newer attempt', async () => {
    await withProject('Late owner fencing', async project => {
        const oldLease = acquireWorkflowLease(project.id, 'old-owner');
        db.prepare('UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?')
            .run(sqlUtcTimestamp(Date.now() - 60000), oldLease.attempt.id);
        const newLease = acquireWorkflowLease(project.id, 'new-owner');
        assert.equal(newLease.acquired, true);

        assert.equal(updateAttemptHeartbeat(oldLease.attempt.id, 'old-owner'), false);
        assert.equal(releaseWorkflowLease(oldLease.attempt.id, 'completed', { leaseOwner: 'old-owner' }), false);
        assert.equal(releaseWorkflowLease(newLease.attempt.id, 'completed', { leaseOwner: 'old-owner' }), false);
        assert.equal(getActiveWorkflowAttempt(project.id)?.id, newLease.attempt.id);
        assert.equal(releaseWorkflowLease(newLease.attempt.id, 'completed', { leaseOwner: 'new-owner' }), true);
    });
});

await runAsyncTest('4. numeric heartbeat TTL accepts fresh values and rejects expired values', async () => {
    await withProject('Numeric TTL edges', async project => {
        const lease = acquireWorkflowLease(project.id, 'ttl-owner');
        db.prepare('UPDATE workflow_attempts SET heartbeat_at = ?, heartbeat_epoch = ? WHERE id = ?')
            .run(sqlUtcTimestamp(Date.now() - 60000), Date.now() - 5000, lease.attempt.id);
        assert.equal(getActiveWorkflowAttempt(project.id)?.id, lease.attempt.id);

        db.prepare('UPDATE workflow_attempts SET heartbeat_at = ?, heartbeat_epoch = ? WHERE id = ?')
            .run(sqlUtcTimestamp(Date.now() - 60000), Date.now() - 31000, lease.attempt.id);
        assert.equal(getActiveWorkflowAttempt(project.id), null);
        assert.equal(releaseWorkflowLease(lease.attempt.id, 'aborted', { leaseOwner: 'ttl-owner' }), true);
    });
});

await runAsyncTest('5. active workflow state writes require matching attempt identity and lease owner', async () => {
    await withProject('State mutation fencing', async project => {
        const lease = acquireWorkflowLease(project.id, 'state-owner');
        const state = getProject(project.id);
        state.status = 'planning';
        await saveProjectState(state, { attemptId: lease.attempt.id, leaseOwner: 'state-owner' });

        const before = getProject(project.id);
        const staleState = { ...before, status: 'planning' };
        await assert.rejects(
            () => saveProjectState(staleState, { attemptId: lease.attempt.id, leaseOwner: 'wrong-owner' }),
            /lease|fenc|owner/i
        );
        assert.equal(getProject(project.id).revision, before.revision);
        assert.equal(releaseWorkflowLease(lease.attempt.id, 'completed', { leaseOwner: 'state-owner' }), true);
    });
});

await runAsyncTest('6. two independent SQLite processes grant one fresh lease', async () => {
    await withProject('Two process lease race', async project => {
        const results = await Promise.all([
            runLeaseProcess(project.id, 'process-a'),
            runLeaseProcess(project.id, 'process-b')
        ]);
        assert.equal(results.filter(result => result.acquired).length, 1);
        const winner = results.find(result => result.acquired);
        const loser = results.find(result => !result.acquired);
        assert.ok(winner?.attemptId);
        assert.equal(loser?.attemptId, winner.attemptId);
        assert.equal(releaseWorkflowLease(winner.attemptId, 'completed', { leaseOwner: winner.owner }), true);
    });
});

await runAsyncTest('7. restart recovery pauses only an interrupted active execution, not historical completed state', async () => {
    await withProject('Restart recovery status', async project => {
        const lease = acquireWorkflowLease(project.id, 'crashed-owner');
        db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
        db.prepare('UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?')
            .run(sqlUtcTimestamp(Date.now() - 60000), lease.attempt.id);
        const recovered = reconcileStaleWorkflowAttempts({ staleThresholdSeconds: 30 });
        assert.ok(recovered.recoveredProjectIds.includes(project.id));
        assert.equal(getProject(project.id).status, 'paused');

        const completedProject = await createProject({ title: 'Historical completed status' });
        try {
            const historical = acquireWorkflowLease(completedProject.id, 'historical-owner');
            db.prepare("UPDATE projects SET status = 'completed' WHERE id = ?").run(completedProject.id);
            db.prepare('UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?')
                .run(sqlUtcTimestamp(Date.now() - 60000), historical.attempt.id);
            reconcileStaleWorkflowAttempts({ staleThresholdSeconds: 30 });
            assert.equal(getProject(completedProject.id).status, 'completed');
        } finally {
            await deleteProject(completedProject.id).catch(() => {});
        }
    });
});
await runAsyncTest('8. project transition rejects a replacement lease racing between assertion and CAS update', async () => {
    await withProject('Transition fencing race', async project => {
        const oldLease = acquireWorkflowLease(project.id, 'transition-old-owner');
        const secondConnection = new DatabaseSync(isolated.dbPath);
        const persistedBefore = db.prepare(
            'SELECT status, revision FROM projects WHERE id = ?'
        ).get(project.id);
        const originalPrepare = db.prepare.bind(db);
        let injected = false;
        let replacementLease = null;

        db.prepare = sql => {
            const statement = originalPrepare(sql);
            if (injected || !String(sql).includes('SELECT status, revision FROM projects')) {
                return statement;
            }
            return new Proxy(statement, {
                get(target, property) {
                    if (property !== 'get') return Reflect.get(target, property, target);
                    return (...args) => {
                        injected = true;
                        secondConnection.prepare(
                            'UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?'
                        ).run(sqlUtcTimestamp(Date.now() - 60000), oldLease.attempt.id);
                        replacementLease = acquireWorkflowLease(project.id, 'transition-new-owner', {
                            database: secondConnection
                        });
                        return target.get(...args);
                    };
                }
            });
        };

        try {
            let transitionError = null;
            try {
                projectStateTransitionInTransaction({
                    projectId: project.id,
                    expectedRevision: persistedBefore.revision,
                    statuses: ['pending_approval'],
                    attemptId: oldLease.attempt.id,
                    leaseOwner: 'transition-old-owner'
                });
            } catch (error) {
                transitionError = error;
            }
            assert.equal(injected, true);
            assert.ok(transitionError, 'A replacement lease must prevent the stale CAS mutation');
            assert.match(String(transitionError.message), /busy|locked|lease|fenc/i);
            assert.equal(
                getActiveWorkflowAttempt(project.id)?.lease_owner,
                replacementLease?.acquired ? 'transition-new-owner' : 'transition-old-owner'
            );
            assert.equal(getProject(project.id).status, persistedBefore.status);
            assert.equal(getProject(project.id).revision, persistedBefore.revision);
        } finally {
            db.prepare = originalPrepare;
            if (replacementLease?.acquired) {
                releaseWorkflowLease(replacementLease.attempt.id, 'completed', {
                    leaseOwner: 'transition-new-owner',
                    database: secondConnection
                });
            }
            secondConnection.close();
        }
    });
});

await runAsyncTest('9. verification persistence rejects after the worker lease is replaced', async () => {
    await withProject('Verification persistence fencing', async project => {
        db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
        const oldLease = acquireWorkflowLease(project.id, 'verification-old-owner');
        const replacementConnection = new DatabaseSync(isolated.dbPath);
        let runnerSawLease = false;
        let replacementLease = null;

        try {
            await assert.rejects(
                () => verifyArtifactAndProject({
                    projectId: project.id,
                    contractId: 'missing-contract',
                    artifactId: 'missing-artifact',
                    expectedRevision: project.revision,
                    attemptId: oldLease.attempt.id,
                    leaseOwner: 'verification-old-owner',
                    verificationRunner: async (_input, runnerOptions) => {
                        runnerSawLease = runnerOptions?.attemptId === oldLease.attempt.id
                            && runnerOptions?.leaseOwner === 'verification-old-owner';
                        replacementConnection.prepare(
                            'UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?'
                        ).run(sqlUtcTimestamp(Date.now() - 60000), oldLease.attempt.id);
                        replacementLease = acquireWorkflowLease(project.id, 'verification-new-owner', {
                            database: replacementConnection
                        });
                        return { runId: 'run-replaced-owner', passed: false, status: 'failed' };
                    }
                }),
                /lease|fenc|owner/i
            );
            assert.equal(runnerSawLease, true, 'Verification runner must receive the lease identity');
            assert.equal(replacementLease?.acquired, true);
        } finally {
            if (replacementLease?.acquired) {
                releaseWorkflowLease(replacementLease.attempt.id, 'completed', {
                    leaseOwner: 'verification-new-owner',
                    database: replacementConnection
                });
            }
            replacementConnection.close();
        }
    });
});

await runAsyncTest('10. startup stale recovery increments project revision with its paused transition', async () => {
    await withProject('Recovery revision fencing', async project => {
        const lease = acquireWorkflowLease(project.id, 'recovery-owner');
        db.prepare("UPDATE projects SET status = 'implementing' WHERE id = ?").run(project.id);
        db.prepare('UPDATE workflow_attempts SET heartbeat_epoch = NULL, heartbeat_at = ? WHERE id = ?')
            .run(sqlUtcTimestamp(Date.now() - 60000), lease.attempt.id);
        const before = getProject(project.id);

        const recovered = reconcileStaleWorkflowAttempts({ staleThresholdSeconds: 30 });

        assert.ok(recovered.recoveredProjectIds.includes(project.id));
        const after = getProject(project.id);
        assert.equal(after.status, 'paused');
        assert.equal(after.revision, before.revision + 1);
    });
});


finish();
await isolated.cleanup();
