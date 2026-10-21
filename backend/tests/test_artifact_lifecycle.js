import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { auditArtifacts, quarantineCandidates, recoverArtifactMaintenance, queueProjectArtifacts } from '../services/artifactLifecycle.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-artifact-lifecycle-'));
const artifactsRoot = path.join(root, 'artifacts');
const projectsRoot = path.join(root, 'projects');
fs.mkdirSync(artifactsRoot); fs.mkdirSync(projectsRoot);
const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE artifacts(id TEXT PRIMARY KEY, project_id TEXT, contract_id TEXT, path TEXT, sha256 TEXT, size INTEGER, status TEXT, created_at TEXT);
CREATE TABLE completion_receipts(id TEXT, artifact_id TEXT, project_id TEXT);
CREATE TABLE workflow_attempts(id TEXT, project_id TEXT, status TEXT);
CREATE TABLE artifact_maintenance(id TEXT PRIMARY KEY, project_id TEXT, artifact_id TEXT, source_path TEXT NOT NULL, quarantine_path TEXT NOT NULL, sha256 TEXT NOT NULL, reason TEXT NOT NULL, phase TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
const env = { ARTIFACTS_ROOT: artifactsRoot, PROJECTS_ROOT: projectsRoot };
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const old = new Date(Date.now() - 10 * 86400000).toISOString();
function file(name, contents = name) {
    const p = path.join(artifactsRoot, name); fs.writeFileSync(p, contents);
    fs.utimesSync(p, new Date(old), new Date(old)); return p;
}
function artifact(id, status = 'rejected', contents = id) {
    const p = file(`${id}.zip`, contents);
    database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)').run(id, 'project-one', 'contract-one', p, sha(contents), contents.length, status, old);
    return p;
}
try {
    database.prepare('INSERT INTO projects VALUES (?,?)').run('project-one', 'paused');
    fs.mkdirSync(path.join(projectsRoot, 'project-one'));
    const accepted = artifact('accepted', 'verified');
    if (process.platform === 'win32') database.prepare('UPDATE artifacts SET path=? WHERE id=?').run(accepted.toUpperCase(), 'accepted');
    database.prepare('INSERT INTO completion_receipts VALUES (?,?,?)').run('receipt', 'accepted', 'project-one');
    const rejected = artifact('rejected');
    const missing = artifact('missing', 'verified'); fs.unlinkSync(missing);
    const corrupt = artifact('corrupt', 'verified'); fs.writeFileSync(corrupt, 'wrong');
    const orphan = file('unregistered.zip');
    const report = auditArtifacts({ database, env });
    assert.equal(report.success, true);
    assert.equal(report.artifacts.find(a => a.id === 'accepted').availability, 'available');
    assert.equal(report.artifacts.find(a => a.id === 'missing').availability, 'missing');
    assert.equal(report.artifacts.find(a => a.id === 'corrupt').availability, 'hash_mismatch');
    assert.equal(report.orphans.length, 1);
    assert.equal(report.projects[0].sourceAvailability, 'available');
    assert.deepEqual(report.candidates.map(c => c.sourcePath).sort(), [orphan, rejected].sort());
    assert.equal(auditArtifacts({ database, env: { ...env, PROJECTS_ROOT: path.join(root, 'offline') } }).success, false);
    assert.equal(quarantineCandidates({ database, env, candidates: [{ sourcePath: accepted }] }).quarantined.length, 0);
    // Stale inventory cannot delete an artifact that has since gained a receipt.
    database.prepare('INSERT INTO completion_receipts VALUES (?,?,?)').run('late-receipt', 'rejected', 'project-one');
    const stale = quarantineCandidates({ database, env, candidates: report.candidates });
    assert.equal(stale.quarantined.length, 1, JSON.stringify(stale));
    assert.ok(fs.existsSync(rejected)); assert.ok(!fs.existsSync(orphan));
    assert.ok(fs.existsSync(accepted));
    database.prepare('DELETE FROM completion_receipts WHERE artifact_id = ?').run('rejected');
    // Missing source folder is a diagnostic, never an implicit delete request.
    fs.rmdirSync(path.join(projectsRoot, 'project-one'));
    assert.equal(auditArtifacts({ database, env }).projects[0].sourceAvailability, 'missing');
    assert.ok(fs.existsSync(rejected));
    // Deletion queue survives loss of the project and artifact rows.
    database.prepare("DELETE FROM artifacts WHERE status = 'verified'").run();
    queueProjectArtifacts({ database, env, projectId: 'project-one' });
    database.prepare('DELETE FROM artifacts').run(); database.prepare('DELETE FROM projects').run();
    const recovery = recoverArtifactMaintenance({ database, env });
    assert.equal(recovery.quarantined.length, 1);
    assert.ok(!fs.existsSync(rejected));
    assert.equal(recoverArtifactMaintenance({ database, env }).quarantined.length, 0);
    // An unknown path / symlink must never be moved by maintenance.
    const outside = path.join(root, 'outside.zip'); fs.writeFileSync(outside, 'outside');
    const denied = quarantineCandidates({ database, env, candidates: [{ sourcePath: outside }] });
    assert.equal(denied.quarantined.length, 0); assert.ok(fs.existsSync(outside));
    // A crash after moving bytes but before committing metadata is recoverable.
    const interrupted = file('interrupted.zip');
    const qroot = path.join(artifactsRoot, '.quarantine');
    const target = path.join(qroot, 'interrupted.zip');
    database.prepare('INSERT INTO artifact_maintenance VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('interrupted', null, null, interrupted, target, sha('interrupted.zip'), 'unregistered', 'pending', null, old, old);
    fs.renameSync(interrupted, target);
    database.prepare('INSERT INTO workflow_attempts VALUES (?,?,?)').run('active', 'another-project', 'running');
    assert.equal(recoverArtifactMaintenance({ database, env }).quarantined.length, 0, 'orphan recovery must wait for production');
    const liveOrphan = file('live-orphan.zip');
    assert.equal(auditArtifacts({ database, env }).candidates.some(c => c.sourcePath === liveOrphan), false);
    database.prepare('DELETE FROM workflow_attempts').run();
    assert.equal(recoverArtifactMaintenance({ database, env }).quarantined.length, 1);
    // Delivered copies quarantine on their own volume, without cross-device rename.
    database.prepare('INSERT INTO projects VALUES (?,?)').run('delivery-one', 'paused');
    const deliveredArtifact = file('delivery-source.zip');
    database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)').run('delivery-art', 'delivery-one', 'delivery-contract', deliveredArtifact, sha('delivery-source.zip'), 19, 'rejected', old);
    const deliveredCopy = path.join(projectsRoot, 'delivery-one.zip');
    fs.copyFileSync(deliveredArtifact, deliveredCopy);
    queueProjectArtifacts({ database, env, projectId: 'delivery-one' });
    const copyIntent = database.prepare("SELECT * FROM artifact_maintenance WHERE reason='delivery_copy_deleted'").get();
    assert.equal(path.dirname(copyIntent.quarantine_path), path.join(projectsRoot, '.artifact-quarantine'));
    database.prepare('DELETE FROM artifacts').run(); database.prepare('DELETE FROM projects').run();
    assert.equal(recoverArtifactMaintenance({ database, env }).quarantined.length, 2);
    assert.ok(!fs.existsSync(deliveredCopy));
    file('duplicate-one.zip', 'identical bytes'); file('duplicate-two.zip', 'identical bytes');
    assert.equal(auditArtifacts({ database, env }).duplicateContent.find(g => g.sha256 === sha('identical bytes')).files.length, 2);
    const unsafeRoot = path.join(root, 'unsafe-artifacts');
    fs.symlinkSync(artifactsRoot, unsafeRoot, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(auditArtifacts({ database, env: { ...env, ARTIFACTS_ROOT: unsafeRoot } }).success, false);
    // Re-registering a queued orphan cancels its eligibility, even if rejected.
    const registeredLater = file('registered-later.zip');
    database.prepare('INSERT INTO artifact_maintenance VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('registered-later', null, null, registeredLater, path.join(qroot, 'registered-later.zip'), sha('registered-later.zip'), 'unregistered', 'pending', null, old, old);
    database.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?)').run('new-owner', 'new-project', 'new-contract', registeredLater, sha('registered-later.zip'), 20, 'rejected', old);
    assert.equal(recoverArtifactMaintenance({ database, env }).quarantined.length, 0);
    assert.ok(fs.existsSync(registeredLater));
    assert.throws(() => queueProjectArtifacts({ database, env: { ...env, ARTIFACTS_ROOT: path.join(root, 'offline') }, projectId: 'new-project' }));
    console.log('PASS artifact lifecycle: audit, receipt protection, stale plan, missing source, durable recovery, containment');
} finally { database.close(); fs.rmSync(root, { recursive: true, force: true }); }
