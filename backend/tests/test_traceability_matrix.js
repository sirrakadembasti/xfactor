import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';
import { TraceabilityMatrix, linkRequirementToFile, linkRequirementToCheck, linkRequirementToArtifact } from '../contracts/traceability.js';

const isolated = await setupIsolatedTestDb('p1-a-matrix');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { runAsyncTest, finish } = createTestHarness();

await runAsyncTest('1. TraceabilityMatrix should build requirement coverage rows and enforce coverage policy', async () => {
    const projectId = 'proj-matrix-1';
    const contractId = 'contract-matrix-1';

    // 1. Setup project & contract
    db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Matrix Proj', 'implementing')").run(projectId);
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash
        ) VALUES (?, ?, 1, 'approved', '{}', 'hash-mat-1')
    `).run(contractId, projectId);

    // 2. Setup requirements (1 mandatory, 1 optional)
    db.prepare(`
        INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
        VALUES 
            ('req-auth', ?, 'REQ-AUTH', 'User Auth', 'functional', 'high', 1, 'approved'),
            ('req-analytics', ?, 'REQ-ANALYTICS', 'Analytics Tracker', 'non-functional', 'low', 0, 'approved')
    `).run(contractId, contractId);

    // 3. Setup tasks and link
    db.prepare(`
        INSERT INTO contract_tasks (id, contract_id, stable_key, task_spec_json)
        VALUES ('task-auth', ?, 'TASK-AUTH', '{"targetFiles":["src/auth.js"]}')
    `).run(contractId);
    db.prepare(`
        INSERT INTO requirement_task_links (contract_id, requirement_id, task_id)
        VALUES (?, 'req-auth', 'task-auth')
    `).run(contractId);

    // 4. Setup artifact & files
    db.prepare(`
        INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status)
        VALUES ('art-dist', ?, ?, 'zip', 'dist.zip', 'sha-dist', 2048, 'verified')
    `).run(projectId, contractId);
    db.prepare(`
        INSERT INTO artifact_files (contract_id, artifact_id, path, sha256, size)
        VALUES (?, 'art-dist', 'src/auth.js', 'sha-auth-file', 512)
    `).run(contractId);

    // 5. Link requirement to file and artifact
    linkRequirementToFile({ contractId, requirementId: 'req-auth', artifactId: 'art-dist', path: 'src/auth.js' });
    linkRequirementToArtifact({ contractId, requirementId: 'req-auth', artifactId: 'art-dist' });

    // 6. Setup verification check & link
    db.prepare(`
        INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at)
        VALUES ('run-mat-1', ?, ?, 'verified', '1.0', datetime('now'))
    `).run(projectId, contractId);
    db.prepare(`
        INSERT INTO verification_checks (id, contract_id, run_id, gate_name, applicability, status, started_at)
        VALUES ('check-auth-test', ?, 'run-mat-1', 'typecheck', 'MANDATORY', 'PASS', datetime('now'))
    `).run(contractId);
    linkRequirementToCheck({ contractId, requirementId: 'req-auth', verificationCheckId: 'check-auth-test' });

    // 7. Build Matrix & Verify Coverage
    const matrixBuilder = new TraceabilityMatrix(contractId);
    const matrix = await matrixBuilder.buildMatrix();

    assert.strictEqual(matrix.length, 2);
    const authRow = matrix.find(r => r.requirementId === 'req-auth');
    assert.ok(authRow);
    assert.strictEqual(authRow.codeCell, true);
    assert.strictEqual(authRow.artifactCell, true);
    assert.strictEqual(authRow.testCell, true);
    assert.strictEqual(authRow.mandatory, true);
    assert.strictEqual(authRow.status, 'COVERED');

    const analyticsRow = matrix.find(r => r.requirementId === 'req-analytics');
    assert.ok(analyticsRow);
    assert.strictEqual(analyticsRow.codeCell, false);
    assert.strictEqual(analyticsRow.mandatory, false);
    assert.strictEqual(analyticsRow.status, 'OPTIONAL_UNCOVERED');

    const coveragePolicy = await matrixBuilder.verifyCoveragePolicy();
    assert.strictEqual(coveragePolicy.passed, true);
    assert.strictEqual(coveragePolicy.uncoveredMandatory.length, 0);

    db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
});

await runAsyncTest('2. linkRequirementToFile should reject cross-contract mismatch', async () => {
    assert.throws(() => {
        linkRequirementToFile({
            contractId: 'contract-a',
            requirementId: 'req-b-wrong-contract',
            artifactId: 'art-a',
            path: 'src/index.js'
        });
    }, /FOREIGN KEY/i);
});

finish();
await isolated.cleanup();
