import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import { db } from '../db.js';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { createTestHarness } from './testHarness.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];
let reportModule = {};
try {
    reportModule = await import('../verification/reportGenerator.js');
} catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

function seedEvidenceFixture() {
    const suffix = crypto.randomUUID();
    const projectId = `project-report-${suffix}`;
    const contractId = `contract-report-${suffix}`;
    const runId = `run-report-${suffix}`;
    const requirementId = `requirement-report-${suffix}`;
    const failedCheckId = `check-api-${suffix}`;
    const artifactId = `artifact-report-${suffix}`;

    db.prepare(`
        INSERT INTO projects (id, title, status)
        VALUES (?, 'Evidence Report Fixture', 'verification_pending')
    `).run(projectId);
    db.prepare(`
        INSERT INTO project_contracts (
            id, project_id, revision, status, contract_json, contract_hash, approved_at
        ) VALUES (?, ?, 1, 'approved', '{}', ?, CURRENT_TIMESTAMP)
    `).run(contractId, projectId, `hash-${suffix}`);
    db.prepare(`
        INSERT INTO requirements (
            id, contract_id, stable_key, statement, kind, priority, mandatory, status
        ) VALUES (?, ?, 'REQ-CORE', 'Core Todo behavior', 'functional', 'high', 1, 'approved')
    `).run(requirementId, contractId);
    db.prepare(`
        INSERT INTO verification_runs (
            id, project_id, contract_id, status, policy_version, started_at, ended_at
        ) VALUES (?, ?, ?, 'failed', 'p2-test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(runId, projectId, contractId);
    db.prepare(`
        INSERT INTO verification_checks (
            id, contract_id, run_id, gate_name, applicability, status,
            started_at, ended_at, timed_out, evidence_json
        ) VALUES (?, ?, ?, 'package_json', 'MANDATORY', 'PASS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, '{}')
    `).run(`check-package-${suffix}`, contractId, runId);
    db.prepare(`
        INSERT INTO verification_checks (
            id, contract_id, run_id, gate_name, applicability, status,
            started_at, ended_at, timed_out, evidence_json
        ) VALUES (?, ?, ?, 'api_contract', 'MANDATORY', 'FAIL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, '{"reason":"route missing"}')
    `).run(failedCheckId, contractId, runId);
    db.prepare(`
        INSERT INTO artifacts (
            id, project_id, contract_id, kind, path, sha256, size, status, verification_run_id
        ) VALUES (?, ?, ?, 'zip', 'artifacts/app.zip', ?, 10, 'rejected', ?)
    `).run(artifactId, projectId, contractId, `sha-${suffix}`, runId);
    db.prepare(`
        INSERT INTO requirement_check_links (contract_id, requirement_id, verification_check_id)
        VALUES (?, ?, ?)
    `).run(contractId, requirementId, failedCheckId);
    db.prepare(`
        INSERT INTO requirement_artifact_links (contract_id, requirement_id, artifact_id)
        VALUES (?, ?, ?)
    `).run(contractId, requirementId, artifactId);

    return { projectId, contractId, runId };
}

if (!filteredTest || filteredTest === 'evidence-query') {
    await runAsyncTest('P2.8.1: completion report renders missing evidence without changing project status', async () => {
        const fixture = seedEvidenceFixture();
        try {
            const statusBefore = db.prepare('SELECT status FROM projects WHERE id = ?')
                .get(fixture.projectId).status;
            const report = typeof reportModule.generateCompletionReport === 'function'
                ? await reportModule.generateCompletionReport(fixture)
                : { status: 'PASS', checks: [], requirements: [], artifacts: [] };
            const statusAfter = db.prepare('SELECT status FROM projects WHERE id = ?')
                .get(fixture.projectId).status;

            assert.strictEqual(
                report.status,
                'FAIL',
                'Expected report to show missing evidence without changing project status'
            );
            assert.strictEqual(statusBefore, 'verification_pending');
            assert.strictEqual(statusAfter, statusBefore);
            assert.strictEqual(
                report.checks.find(check => check.gateName === 'api_contract').status,
                'FAIL'
            );
            assert.strictEqual(
                report.checks.find(check => check.gateName === 'lockfile').status,
                'BLOCKED'
            );
            assert.strictEqual(report.requirements[0].evidenceStatus, 'FAIL');
            assert.deepStrictEqual(report.requirements[0].artifactIds, [report.artifacts[0].id]);
        } finally {
            db.prepare('DELETE FROM projects WHERE id = ?').run(fixture.projectId);
        }
    });

    await runAsyncTest('P2.8.1: project router exposes read-only verification summary only', async () => {
        const passThrough = (req, res, next) => next();
        const router = createProjectRouter({
            requireAuth: passThrough,
            projectAccess: () => passThrough,
            wsHub: null
        });
        const routes = router.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods)
            }));

        assert.ok(routes.some(route =>
            route.path === '/:id/verification-summary' && route.methods.includes('get')
        ));
        assert.ok(!routes.some(route =>
            route.path === '/:id/complete' && route.methods.includes('post')
        ));
    });

    await runAsyncTest('P2.8.1: verification summary rejects repeated query parameters', async () => {
        const passThrough = (req, res, next) => next();
        const app = express();
        app.use('/api/projects', createProjectRouter({
            requireAuth: passThrough,
            projectAccess: () => passThrough,
            wsHub: null
        }));
        app.use((error, req, res, next) => {
            res.status(500).json({ error: error.message });
        });
        const server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        try {
            const { port } = server.address();
            const response = await fetch(
                `http://127.0.0.1:${port}/api/projects/project-id/verification-summary?contractId=a&contractId=b&runId=run-id`
            );
            assert.strictEqual(response.status, 400);
        } finally {
            await new Promise((resolve, reject) =>
                server.close(error => error ? reject(error) : resolve())
            );
        }
    });
}

finish();
