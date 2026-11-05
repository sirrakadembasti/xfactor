import test from 'node:test';
import assert from 'node:assert/strict';
import { setupIsolatedTestDb } from './isolatedDb.js';
const isolated = await setupIsolatedTestDb('completion-atomic-hook');
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { completeVerifiedProject } = await import('../projectRepository.js');
let index = 0;
function fixture() {
    const projectId = `atomic-hook-${++index}`;
    db.prepare("INSERT INTO projects(id,title,status,revision) VALUES (?, 'Original', 'artifact_verified', 1)").run(projectId);
    return { projectId, contractId: 'contract', artifactId: 'artifact', expectedRevision: 1 };
}
test('acceptance hook participates in the completion transaction and rolls back with its failure', () => {
    const f = fixture(); const failure = new Error('Source changed before acceptance');
    assert.throws(() => completeVerifiedProject({ ...f, beforeAccept: context => {
        assert.equal(db.isTransaction, true); assert.equal(context.projectId, f.projectId);
        db.prepare("UPDATE projects SET title='Tentative' WHERE id=?").run(f.projectId);
        throw failure;
    } }), error => error === failure);
    assert.equal(db.prepare('SELECT title FROM projects WHERE id=?').get(f.projectId).title, 'Original');
    assert.equal(db.prepare('SELECT count(*) n FROM completion_receipts WHERE project_id=?').get(f.projectId).n, 0);
});
test('hook changes roll back when canonical artifact acceptance later fails', () => {
    const f = fixture(); let calls = 0;
    assert.throws(() => completeVerifiedProject({ ...f, beforeAccept: () => {
        calls++; db.prepare("UPDATE projects SET title='Tentative' WHERE id=?").run(f.projectId);
    } }), /Artifact|contract/i);
    assert.equal(calls, 1);
    assert.equal(db.prepare('SELECT title FROM projects WHERE id=?').get(f.projectId).title, 'Original');
});
test('an asynchronous or non-function acceptance hook cannot be dispatched', () => {
    for (const beforeAccept of ['client input', async () => { throw Error('Must not run'); }]) {
        assert.throws(() => completeVerifiedProject({ ...fixture(), beforeAccept }), /synchronous/i);
    }
});
test.after(async () => { await isolated.cleanup(); });
