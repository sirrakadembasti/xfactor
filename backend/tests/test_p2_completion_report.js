import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { db } from '../db.js';
import { listProjectTree } from '../engine/codeGenerator.js';
import { createProjectRouter } from '../routes/projectRoutes.js';
import { runProjectVerification } from '../verification/qualityPolicy.js';
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


if (!filteredTest || filteredTest === 'overwrite-dod') {
    await runAsyncTest('P2.8.2: completion report overwrites manual DoD markers from database evidence', async () => {
        const fixture = seedEvidenceFixture();
        const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-dod-report-'));
        const dodPath = path.join(projectDir, 'DEFINITION_OF_DONE.md');
        try {
            await fs.writeFile(
                dodPath,
                '# Definition of Done\n\n- [x] MANUAL OVERRIDE: everything passes\n',
                'utf8'
            );

            await reportModule.generateCompletionReport({ ...fixture, projectDir });
            const rendered = await fs.readFile(dodPath, 'utf8');

            assert.ok(
                !rendered.includes('MANUAL OVERRIDE'),
                'Expected manually edited DoD markers to be overwritten by database evidence'
            );
            assert.match(rendered, /- \[x\] `package_json` — PASS/);
            assert.match(rendered, /- \[ \] `api_contract` — FAIL/);
            assert.match(rendered, /- \[ \] `lockfile` — BLOCKED/);
            assert.match(rendered, /- \[ \] `REQ-CORE` — FAIL — Core Todo behavior/);
            assert.ok(rendered.includes('- [ ] `artifacts/app.zip` — rejected'));
        } finally {
            db.prepare('DELETE FROM projects WHERE id = ?').run(fixture.projectId);
            await fs.rm(projectDir, { recursive: true, force: true });
        }
    });

    await runAsyncTest('P2.8.2: completion report replaces linked DoD targets without modifying external files', async () => {
        const fixture = seedEvidenceFixture();
        const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-dod-link-'));
        const projectDir = path.join(baseDir, 'project');
        const externalPath = path.join(baseDir, 'external.md');
        const dodPath = path.join(projectDir, 'DEFINITION_OF_DONE.md');
        try {
            await fs.mkdir(projectDir);
            await fs.writeFile(externalPath, 'EXTERNAL SENTINEL', 'utf8');
            await fs.link(externalPath, dodPath);

            await reportModule.generateCompletionReport({ ...fixture, projectDir });

            assert.strictEqual(
                await fs.readFile(externalPath, 'utf8'),
                'EXTERNAL SENTINEL',
                'Expected DoD replacement not to follow a linked target outside the project'
            );
            assert.match(
                await fs.readFile(dodPath, 'utf8'),
                /Generated from immutable verification evidence/
            );
        } finally {
            db.prepare('DELETE FROM projects WHERE id = ?').run(fixture.projectId);
            await fs.rm(baseDir, { recursive: true, force: true });
        }
    });
}

if (!filteredTest || filteredTest === 'hardening-integration') {
    await runAsyncTest('P2 unit: production verification persists mandatory hardening gate failures', async () => {
        const fixture = seedEvidenceFixture();
        try {
            const passing = checks => async () => ({ passed: true, checks });
            const result = await runProjectVerification({
                projectId: fixture.projectId,
                projectDir: 'unused-with-injected-verifiers',
                options: {
                    files: [],
                    verifiers: {
                        dependencies: passing([
                            { name: 'package_json', status: 'passed' },
                            { name: 'lockfile', status: 'passed' },
                            { name: 'ast_import_inventory', status: 'passed' },
                            { name: 'clean_install', status: 'passed' }
                        ]),
                        build: passing([
                            { name: 'typecheck', status: 'passed' },
                            { name: 'framework_build', status: 'passed' }
                        ]),
                        smoke: passing([
                            { name: 'manifest_presence', status: 'passed' },
                            { name: 'database_connectivity', status: 'passed' },
                            { name: 'api_status_check', status: 'passed' },
                            { name: 'browser_page_load', status: 'passed' },
                            { name: 'smoke_gate', status: 'passed' },
                            { name: 'test_script_presence', status: 'passed' }
                        ]),
                        domain: async () => ({
                            passed: false,
                            issues: ['Required entity Todo is missing']
                        }),
                        placeholders: async files => {
                            assert.ok(Array.isArray(files));
                            return { passed: true, issues: [] };
                        },
                        contamination: async () => ({ passed: true, issues: [] }),
                        security: async () => ({ passed: true, issues: [] }),
                        readme: async () => ({ passed: true, issues: [] })
                    }
                }
            });

            assert.strictEqual(
                result.passed,
                false,
                'Expected production verification to persist failing P2 hardening gate'
            );
            const checks = db.prepare(`
                SELECT gate_name, applicability, status
                FROM verification_checks
                WHERE run_id = ?
                  AND gate_name IN (
                    'domain_entity_check',
                    'placeholder_check',
                    'contamination_check',
                    'security_baseline',
                    'readme_check'
                  )
                ORDER BY gate_name
            `).all(result.runId);
            assert.strictEqual(checks.length, 5);
            assert.ok(checks.every(check => check.applicability === 'MANDATORY'));
            assert.strictEqual(
                checks.find(check => check.gate_name === 'domain_entity_check').status,
                'FAIL'
            );
            assert.strictEqual(
                checks.find(check => check.gate_name === 'placeholder_check').status,
                'PASS'
            );
        } finally {
            db.prepare('DELETE FROM projects WHERE id = ?').run(fixture.projectId);
        }
    });

    await runAsyncTest('P2 unit: strict hardening tree collection rejects incomplete evidence', async () => {
        const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-hardening-tree-'));
        try {
            await fs.writeFile(path.join(projectDir, 'first.js'), 'export const first = true;\n');
            await fs.writeFile(path.join(projectDir, 'second.js'), 'export const second = true;\n');
            await assert.rejects(
                listProjectTree(projectDir, { maxFiles: 1, strict: true }),
                error => error?.code === 'PROJECT_TREE_INCOMPLETE'
            );
        } finally {
            await fs.rm(projectDir, { recursive: true, force: true });
        }
    });
}
finish();
