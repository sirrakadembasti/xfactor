import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import EventEmitter from 'node:events';
import { createTestHarness } from './testHarness.js';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('p1-c-artifact-verifier');
process.env.DB_PATH = isolated.dbPath;

const { db } = await import('../db.js');
isolated.registerDatabase(db);

const { createArtifact, getArtifact, getLatestVerifiedArtifact } = await import('../repositories/artifactRepository.js');
const { verifyArtifact, hasMandatoryGateCoverage, isMandatoryArtifactCheck } = await import('../verification/artifactVerifier.js');
assert.equal(isMandatoryArtifactCheck('api_role_create_allowed', { management: { needed: true } }), true);
assert.equal(isMandatoryArtifactCheck('browser_management_interaction', { management: { needed: true } }), true);
assert.equal(isMandatoryArtifactCheck('management_demo_seed', { management: { needed: true } }), true);
assert.equal(isMandatoryArtifactCheck('management_role_login', { management: { needed: true } }), true);
assert.equal(isMandatoryArtifactCheck('api_role_create_allowed', { management: { needed: false } }), false);
const { RUNTIME_GATE_MEMBERS } = await import('../verification/qualityPolicy.js');
const { assertVerifiedArtifactEvidence, assertVerifiedArtifactRunEvidence } = await import('../projectRepository.js');
const { verifyProjectSmoke } = await import('../verification/smokeVerifier.js');
const { assertManagementCoverage } = await import('../verification/artifactEvidencePolicy.js');

const { runAsyncTest, finish } = createTestHarness();
let projectId = 'pipeline-proj-123';
let contractId = 'pipeline-contract-456';
let requirementId = 'req-pipeline-1';
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-artifact-verifier-test-'));

db.prepare("INSERT INTO projects (id, title, status) VALUES (?, 'Pipeline', 'implementation_finished')").run(projectId);
db.prepare(`
    INSERT INTO project_contracts (id, project_id, revision, contract_hash, status, contract_json)
    VALUES (?, ?, 1, 'hash', 'approved', '{"name":"test-contract"}')
`).run(contractId, projectId);
db.prepare(`
    INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
    VALUES (?, ?, 'REQ-PIPE-1', 'Core requirement', 'functional', 'high', 1, 'approved')
`).run(requirementId, contractId);
db.prepare(`
    INSERT INTO task_checkpoints (
        project_id, task_id, contract_id, plan_hash, task_spec_hash,
        input_hash, output_hash, gate_version, status
    ) VALUES (?, 'task-1', ?, 'plan', 'spec', 'input', 'output', 'v1', 'completed')
`).run(projectId, contractId);

async function createTestZip(fileName, files, options = {}) {
    const zip = new JSZip();
    for (const f of files) {
        zip.file(f.path, f.content, f.options);
    }
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: options.platform || 'UNIX' });
    const zipPath = path.join(tempDir, fileName);
    await fs.writeFile(zipPath, zipBuf);
    return zipPath;
}

async function registerArtifact(artifactId, zipPath) {
    const archiveBytes = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(archiveBytes);
    const manifest = [];
    for (const [entryPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const content = await entry.async('nodebuffer');
        const row = {
            path: entryPath.replace(/\\/g, '/'),
            sha256: crypto.createHash('sha256').update(content).digest('hex'),
            size: content.length
        };
        manifest.push(row);
    }
    const archiveHash = crypto.createHash('sha256').update(archiveBytes).digest('hex');
    createArtifact({
        id: artifactId, projectId, contractId, kind: 'zip', path: zipPath,
        sha256: archiveHash, size: archiveBytes.length,
        manifestJson: JSON.stringify(manifest), status: 'draft'
    });
    for (const row of manifest) {
        db.prepare('INSERT INTO artifact_files (contract_id, artifact_id, path, sha256, size) VALUES (?, ?, ?, ?, ?)')
            .run(contractId, artifactId, row.path, row.sha256, row.size);
    }
    return { archiveBytes, archiveHash };
}

function passingCheck(name) {
    const timestamp = new Date().toISOString();
    return {
        name,
        status: 'PASS',
        command: `verify ${name}`,
        exitCode: 0,
        startedAt: timestamp,
        endedAt: timestamp,
        stdoutDigest: crypto.createHash('sha256').update(`stdout-${name}`).digest('hex'),
        stderrDigest: crypto.createHash('sha256').update(`stderr-${name}`).digest('hex'),
        policyVersion: '2.0'
    };
}

function artifactIdentity(artifactId, runId, artifactHash) {
    return {
        version: 1,
        jobId: `job-${runId}`,
        operation: 'verify_artifact',
        projectId,
        contractId,
        contractHash: 'hash',
        revision: 1,
        artifactId,
        nonce: `nonce-${runId}`,
        inputSha256: artifactHash,
        runId
    };
}

function workerResponse(identity, checks = [], status = 'failed', error = 'worker rejection') {
    return {
        ...identity,
        status,
        error: status === 'completed' ? null : error,
        result: { ...identity, status, checks }
    };
}

const allGates = [
    'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
    'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
    'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
    'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
];

assert.equal(typeof hasMandatoryGateCoverage, 'function');
assert.equal(hasMandatoryGateCoverage(allGates.map(passingCheck)), true);
assert.equal(hasMandatoryGateCoverage(allGates.filter(name => name !== 'framework_build').map(passingCheck)), false,
    'a worker cannot verify an artifact while omitting a mandatory gate');

try {
    await runAsyncTest('controlled verification plan is recompiled from persisted authority and forwarded without changing contract', async () => {
        const { buildControlledVerificationPlan } = await import('../engine/controlledSemanticPlan.js');
        const { computeAssertionSourceHash } = await import('../contracts/requirementAssertionBindings.js');
        const files = [{ path: 'package.json', content: '{}' }, { path: 'package-lock.json', content: '{}' }];
        const zipPath = await createTestZip('controlled-semantic-forward.zip', files);
        const { archiveBytes, archiveHash } = await registerArtifact('controlled-semantic-forward', zipPath);
        const identity = artifactIdentity('controlled-semantic-forward', 'controlled-semantic-forward-run', archiveHash);
        const previous = db.prepare('SELECT workflow_state FROM projects WHERE id=?').get(projectId).workflow_state;
        const ledger = {phase:'patched',proposal:{contractId,planHash:'d'.repeat(64)},reviewedArtifactSourceHash:computeAssertionSourceHash(files),validations:[]};
        db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(JSON.stringify({controlledRepair:ledger}),projectId);
        const requirements = db.prepare('SELECT id,stable_key,statement,mandatory FROM requirements WHERE contract_id=? ORDER BY stable_key').all(contractId);
        const plan = buildControlledVerificationPlan({ledger,files,requirements,identity});let dispatched=0;
        try {
            await assert.rejects(verifyArtifact({projectId,contractId,artifactId:identity.artifactId},{runId:identity.runId,activeJob:identity,archiveBase64:archiveBytes.toString('base64'),
                verificationPlan:{...plan,sourceHash:'f'.repeat(64)},executionClient:{verifyArtifact:async()=>{dispatched++;throw Error('must not dispatch');}}}),/persisted authority/);
            assert.equal(dispatched,0);
            await verifyArtifact({projectId,contractId,artifactId:identity.artifactId},{runId:identity.runId,activeJob:identity,archiveBase64:archiveBytes.toString('base64'),verificationPlan:plan,
                executionClient:{verifyArtifact:async job=>{dispatched++;assert.deepEqual(job.verificationPlan,plan);assert.deepEqual(job.contract,{name:'test-contract'});return workerResponse(identity,[],'completed');}}});
            assert.equal(dispatched,1);
            const rows=db.prepare("SELECT gate_name,status FROM verification_checks WHERE run_id=? AND gate_name IN ('requirement_assertions','ui_language_evidence')").all(identity.runId);
            assert.equal(rows.length,2);assert.ok(rows.every(row=>row.status==='BLOCKED'));
        } finally { db.prepare('UPDATE projects SET workflow_state=? WHERE id=?').run(previous,projectId); }
    });
    await runAsyncTest('worker traceability PASS cannot authorize absent or foreign requirement ownership', async () => {
        for (const suffix of ['missing', 'foreign', 'unqualified', 'optional-unqualified', 'commandless']) {
            const zipPath = await createTestZip(`trace-claim-${suffix}.zip`, [{ path: 'package.json', content: '{}' }, { path: 'package-lock.json', content: '{}' }]);
            const artifactId = `artifact-trace-claim-${suffix}`, runId = `run-trace-claim-${suffix}`;
            const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
            const identity = artifactIdentity(artifactId, runId, archiveHash);
            const checks = [...new Set([...allGates, ...Object.values(RUNTIME_GATE_MEMBERS).flatMap(set => [...set])])].map(passingCheck);
            if (suffix === 'foreign') checks.find(c => c.name === 'typecheck').requirementIds = ['another-contract-requirement'];
            if (suffix === 'unqualified') {
                const claimed = checks.find(c => c.name === 'typecheck');
                claimed.requirementIds = [requirementId];
                delete claimed.startedAt; delete claimed.stdoutDigest;
            }
            if (suffix === 'optional-unqualified' || suffix === 'commandless') {
                const own = { ...passingCheck('independent_requirement_probe'), requirementIds: [requirementId] };
                if (suffix === 'optional-unqualified') { delete own.startedAt; delete own.stdoutDigest; }
                else { delete own.command; delete own.exitCode; }
                checks.push(own);
            }
            await verifyArtifact({ projectId, contractId, artifactId }, { runId, activeJob: identity,
                archiveBase64: archiveBytes.toString('base64'), executionClient: { verifyArtifact: async () => workerResponse(identity, checks, 'completed') } });
            const trace = db.prepare("SELECT status FROM verification_checks WHERE run_id=? AND gate_name='requirement_traceability'").get(runId);
            assert.equal(trace.status, 'BLOCKED');
            assert.equal(db.prepare('SELECT COUNT(*) n FROM requirement_check_links l JOIN verification_checks c ON c.id=l.verification_check_id WHERE c.run_id=?').get(runId).n, 0);
        }
    });
    await runAsyncTest('worker rejection durably preserves redacted observed logs and actual source diagnostics', async () => {
        const { verifyBuild } = await import('../verification/buildVerifier.js');
        const stdout = "src/price.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'. password=private-sentinel-123";
        const built = await verifyBuild('/unused', {}, { files: [{ path: 'package.json', content: '{"scripts":{"build":"vite build"}}' }, { path: 'tsconfig.json', content: '{}' }],
            adapter: { id: 'fake-worker', isAvailable: () => true, execute: async ({args}) => args[0] === 'tsc'
                ? { passed: false, exitCode: 2, stdout, stderr: '', signal: null, stdoutTruncated: false, stderrTruncated: false }
                : { passed: true, exitCode: 0, stdout: '', stderr: '' } } });
        const zipPath = await createTestZip('compiler-failure.zip', [{ path: 'package.json', content: '{}' }, { path: 'package-lock.json', content: '{}' }, { path: 'src/price.ts', content: 'export const price: number = "wrong";' }]);
        const artifactId = 'artifact-compiler-failure', runId = 'run-compiler-failure';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const checks = [...new Set([...allGates, ...Object.values(RUNTIME_GATE_MEMBERS).flatMap(set => [...set])])]
            .map(name => name === 'typecheck' ? built.checks.find(check => check.name === name) : passingCheck(name));
        const result = await verifyArtifact({ projectId, contractId, artifactId }, { runId, activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'), executionClient: { verifyArtifact: async () => workerResponse(identity, checks) } });
        assert.equal(result.passed, false);
        const check = db.prepare("SELECT * FROM verification_checks WHERE run_id=? AND gate_name='typecheck'").get(runId);
        assert.match(check.evidence_json, /TS2322/);
        assert.ok(!check.evidence_json.includes('private-sentinel-123'));
        const rows = db.prepare('SELECT * FROM repair_issues WHERE run_id=?').all(runId);
        assert.equal(rows.length, 1);
        const detail = JSON.parse(rows[0].detail_json);
        assert.equal(detail.kind, 'worker_product_failure');
        assert.equal(detail.filePath, 'src/price.ts');
        assert.equal(detail.authenticatedWorker, true);
        assert.equal(detail.checkId, check.id);
        assert.ok(!JSON.stringify(rows).includes('private-sentinel-123'));
    });
    await runAsyncTest('1. verifyArtifact fails closed and rejects artifact when package lockfile is missing', async () => {
        const zipPath = await createTestZip('broken-lock.zip', [
            { path: 'package.json', content: '{"name":"broken-app"}' },
            { path: 'src/index.js', content: 'console.log("no lock");' }
        ]);

        const artifactId = 'artifact-broken-lock';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const runId = 'run-broken-lock';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId,
            activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, [], 'failed', 'package-lock.json missing') }
        });
        assert.strictEqual(result.status, 'failed');
        assert.strictEqual(result.passed, false);
        assert.ok(result.runId);
        assert.ok(result.error);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'rejected');
        assert.strictEqual(artifact.verificationRunId, result.runId);

        const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(result.runId);
        assert.ok(run);
        assert.strictEqual(run.status, 'failed');
    });

    await runAsyncTest('2. verifyArtifact marks artifact verified when all clean-room gates pass', async () => {
        const zipPath = await createTestZip('valid-app.zip', [
            { path: 'package.json', content: '{"name":"valid-app","dependencies":{}}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'service-manifest.json', content: '{"version":"1.0","services":{}}' },
            { path: 'src/index.js', content: 'console.log("valid");' }
        ]);

        const artifactId = 'artifact-valid';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        db.prepare("UPDATE projects SET status = 'implementation_finished' WHERE id = ?").run(projectId);
        const runId = 'run-valid';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const checks = allGates.map(name => ({
            ...passingCheck(name),
            evidenceJson: name === 'domain_entity_check'
                ? { evidence: { kind: 'derived_gate', producer: 'quality-policy', sourceGateNames: ['domain_entity_check'], policyVersion: '2.0', computedAt: new Date().toISOString() } }
                : { evidence: { producer: 'quality-policy', policyVersion: '2.0' } }
        }));
        checks.push(...[...new Set(Object.values(RUNTIME_GATE_MEMBERS).flatMap(members => [...members]))].map(passingCheck));
        Object.assign(checks.find(check => check.name === 'typecheck'), {
            requirementIds: [requirementId], evidenceJson: { producer: 'typecheck-verifier', adapterId: 'fixture-worker' }
        });
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId,
            activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, checks, 'completed') }
        });

        assert.strictEqual(result.status, 'verified');
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.error, null);
        assert.ok(result.runId);

        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'verified');
        assert.strictEqual(artifact.verificationRunId, result.runId);

        const latest = getLatestVerifiedArtifact({ projectId, contractId });
        assert.strictEqual(latest.id, artifactId);
        assert.doesNotThrow(() => assertVerifiedArtifactRunEvidence({ projectId, contractId, artifactId }));

        const run = db.prepare('SELECT * FROM verification_runs WHERE id = ?').get(result.runId);
        assert.ok(run);
        assert.strictEqual(run.status, 'verified');
        const hardeningEvidence = db.prepare(`
            SELECT evidence_json FROM verification_checks
            WHERE run_id = ? AND gate_name = 'domain_entity_check'
        `).get(result.runId);
        const evidence = JSON.parse(hardeningEvidence.evidence_json).evidence;
        assert.deepStrictEqual(
            {
                kind: evidence.kind,
                producer: evidence.producer,
                sourceGateNames: evidence.sourceGateNames,
                policyVersion: evidence.policyVersion
            },
            {
                kind: 'derived_gate',
                producer: 'quality-policy',
                sourceGateNames: ['domain_entity_check'],
                policyVersion: '2.0'
            }
        );
        assert.ok(evidence.computedAt);
    });

    await runAsyncTest('2b. worker aggregate PASS cannot replace missing runtime member evidence', async () => {
        const zipPath = await createTestZip('aggregate-only.zip', [
            { path: 'package.json', content: '{"name":"aggregate-only"}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'service-manifest.json', content: '{"version":"1.0","services":{}}' }
        ]);
        const artifactId = 'artifact-aggregate-only';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const runId = 'run-aggregate-only';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId, activeJob: identity, archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, allGates.map(passingCheck), 'completed') }
        });
        assert.equal(result.passed, false);
        assert.equal(getArtifact({ projectId, contractId, artifactId }).status, 'rejected');
    });

    for (const scenario of ['contract replaced', 'contract hash changed', 'contract revision changed', 'contract changed before check commit', 'signal aborted', 'deadline expired', 'project paused', 'durable cancellation', 'lease replaced']) {
        await runAsyncTest(`late valid worker result cannot persist after ${scenario}`, async () => {
            const { acquireWorkflowLease, releaseWorkflowLease } = await import('../workflowAttempts.js');
            const { abortProjectExecution } = await import('../engine/cancellation.js');
            const artifactId = `artifact-late-${scenario.replaceAll(' ', '-')}`;
            const runId = `run-${artifactId}`;
            const zipPath = await createTestZip(`${artifactId}.zip`, [{ path: 'package.json', content: '{"name":"late-fixture"}' }]);
            const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
            const identity = { ...artifactIdentity(artifactId, runId, archiveHash), deadline: Date.now() + (scenario === 'deadline expired' ? 1000 : 60000) };
            const checks = [...allGates, ...new Set(Object.values(RUNTIME_GATE_MEMBERS).flatMap(members => [...members]))]
                .map(name => ({ ...passingCheck(name), evidence: { observed: true } }));
            const lease = acquireWorkflowLease(projectId, runId);
            const controller = new AbortController();
            const originalNow = Date.now;
            let workerCalled = false;
            const receiptsBefore = db.prepare('SELECT * FROM completion_receipts').all();
            try {
                await assert.rejects(verifyArtifact({ projectId, contractId, artifactId }, {
                    runId, activeJob: identity, archiveBase64: archiveBytes.toString('base64'),
                    attemptId: lease.attempt.id, leaseOwner: runId, signal: controller.signal,
                    executionClient: { verifyArtifact: async () => {
                        workerCalled = true;
                        if (scenario === 'contract replaced') {
                            db.prepare("UPDATE project_contracts SET status='superseded' WHERE id=?").run(contractId);
                            db.prepare(`INSERT INTO project_contracts (id,project_id,revision,status,contract_json,contract_hash)
                                VALUES ('late-replacement',?,2,'approved','{}','new-hash')`).run(projectId);
                        }
                        if (scenario === 'contract hash changed') db.prepare("UPDATE project_contracts SET contract_hash='new-hash' WHERE id=?").run(contractId);
                        if (scenario === 'contract revision changed') db.prepare('UPDATE project_contracts SET revision=2 WHERE id=?').run(contractId);
                        if (scenario === 'contract changed before check commit') Object.defineProperty(checks[0], 'command', {
                            enumerable: true, get() {
                                // Object materialization happens after the response-boundary assertion.
                                db.prepare("UPDATE project_contracts SET contract_hash='new-hash' WHERE id=?").run(contractId);
                                return 'verify package_json';
                            }
                        });
                        if (scenario === 'signal aborted') controller.abort('PAUSED');
                        if (scenario === 'deadline expired') Date.now = () => identity.deadline + 1;
                        if (scenario === 'project paused') db.prepare("UPDATE projects SET status='paused' WHERE id=?").run(projectId);
                        if (scenario === 'durable cancellation') abortProjectExecution(projectId, 'PAUSED');
                        if (scenario === 'lease replaced') {
                            releaseWorkflowLease(lease.attempt.id, 'aborted', { leaseOwner: runId });
                            acquireWorkflowLease(projectId, 'late-replacement-owner');
                        }
                        return workerResponse(identity, checks, 'completed');
                    } }
                }), /contract|cancel|abort|deadline|paused|lease|fenc/i);
                assert.equal(workerCalled, true, 'the negative case must reach an otherwise valid worker response');
                assert.equal(db.prepare('SELECT COUNT(*) AS count FROM verification_checks WHERE run_id=?').get(runId).count, 0);
                assert.notEqual(getArtifact({ projectId, contractId, artifactId }).status, 'verified');
                assert.notEqual(db.prepare('SELECT status FROM verification_runs WHERE id=?').get(runId).status, 'verified');
                assert.notEqual(db.prepare('SELECT status FROM projects WHERE id=?').get(projectId).status, 'completed');
                assert.deepEqual(db.prepare('SELECT * FROM completion_receipts').all(), receiptsBefore);
            } finally {
                Date.now = originalNow;
                db.prepare("DELETE FROM project_contracts WHERE id='late-replacement'").run();
                db.prepare("UPDATE project_contracts SET status='approved',contract_hash='hash',revision=1 WHERE id=?").run(contractId);
                db.prepare("UPDATE projects SET status='implementation_finished' WHERE id=?").run(projectId);
                db.prepare("UPDATE workflow_attempts SET status='aborted' WHERE project_id=? AND status='running'").run(projectId);
            }
        });
    }

    await runAsyncTest('contract changed during archive preparation cannot create the first verification run', async () => {
        const artifactId = 'artifact-archive-contract-race', runId = 'run-archive-contract-race';
        const zipPath = await createTestZip('archive-contract-race.zip', [{ path: 'package.json', content: '{}' }]);
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const loadZip = JSZip.loadAsync;
        JSZip.loadAsync = async (...args) => {
            const zip = await loadZip(...args);
            db.prepare("UPDATE project_contracts SET contract_hash='changed-during-archive' WHERE id=?").run(contractId);
            return zip;
        };
        try {
            await assert.rejects(verifyArtifact({ projectId, contractId, artifactId }, {
                runId, activeJob: artifactIdentity(artifactId, runId, archiveHash), archiveBase64: archiveBytes.toString('base64'),
                executionClient: { verifyArtifact: async () => { throw new Error('worker must not be dispatched'); } }
            }), /contract.*changed/i);
            assert.equal(db.prepare('SELECT COUNT(*) AS count FROM verification_runs WHERE id=?').get(runId).count, 0);
            assert.equal(getArtifact({ projectId, contractId, artifactId }).status, 'draft');
        } finally {
            JSZip.loadAsync = loadZip;
            db.prepare("UPDATE project_contracts SET contract_hash='hash' WHERE id=?").run(contractId);
        }
    });

    await runAsyncTest('3. verifyArtifact rejects malicious symlink before persistence', async () => {
        const zipPath = await createTestZip('symlink.zip', [
            { path: 'safe.txt', content: 'hello' },
            { path: 'link-out.js', content: '../target', options: { unixPermissions: 0o120777 } }
        ], { platform: 'UNIX' });

        const artifactId = 'artifact-symlink';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const runId = 'run-symlink';
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        await assert.rejects(
            verifyArtifact({ projectId, contractId, artifactId }, {
                runId,
                activeJob: identity,
                archiveBase64: archiveBytes.toString('base64'),
                executionClient: { verifyArtifact: async () => { throw new Error('must not execute'); } }
            }),
            /Symbolic link detected/i
        );
        const artifact = getArtifact({ projectId, contractId, artifactId });
        assert.strictEqual(artifact.status, 'draft');
        assert.strictEqual(artifact.verificationRunId, null);
        assert.strictEqual(
            db.prepare('SELECT COUNT(*) AS count FROM verification_runs WHERE id = ?').get(runId).count,
            0
        );
    });
    await runAsyncTest('4. verifyArtifact throws meaningful error when artifact is missing from DB', async () => {
        const runId = 'run-missing-artifact';
        const identity = artifactIdentity('non-existent-artifact', runId, '0'.repeat(64));
        await assert.rejects(
            async () => verifyArtifact({ projectId, contractId, artifactId: 'non-existent-artifact' }, {
                runId, activeJob: identity,
                executionClient: { verifyArtifact: async () => { throw new Error('must not execute'); } }
            }),
            /not found/i
        );
    });

    // Bridge the authenticated execution-client boundary to completion/download.
    // This is an isolated worker-response fixture, never a real app or final ZIP.
    let managementFixture;
    await runAsyncTest('5. identity-verified management worker evidence authorizes completion without downgrading details', async () => {
        // Earlier rejection cases now intentionally retain open repair history.
        // This independent passing fixture needs its own approved project scope.
        projectId = 'pipeline-management-project'; contractId = 'pipeline-management-contract'; requirementId = 'pipeline-management-requirement';
        db.prepare("INSERT INTO projects (id,title,status) VALUES (?,'Management fixture','implementation_finished')").run(projectId);
        db.prepare("INSERT INTO project_contracts (id,project_id,revision,contract_hash,status,contract_json) VALUES (?,?,1,'hash','approved','{}')").run(contractId, projectId);
        db.prepare("INSERT INTO requirements (id,contract_id,stable_key,statement,kind,priority,mandatory,status) VALUES (?,?,'REQ-MANAGEMENT','Management','functional','high',1,'approved')").run(requirementId, contractId);
        const management = {
            needed: true, authentication: { apiLogin: { path: '/api/auth/login' } },
            roles: [
                { name: 'manager', demoUser: { username: 'manager-fixture' }, permissions: [{ resource: 'rooms', operations: ['create', 'read', 'update', 'delete'] }] },
                { name: 'visitor', demoUser: { username: 'visitor-fixture' }, permissions: [] }
            ],
            resources: [{ name: 'rooms', apiPath: '/api/rooms', uiPath: '/rooms', operations: ['create', 'read', 'update', 'delete'],
                readAccess: 'authenticated', deletionPolicy: { relatedData: 'preserve', reason: 'Keep historical records' },
                verification: { itemPath: '/api/rooms/{id}', updateMethod: 'PATCH', deleteExpectation: { kind: 'absent' },
                    retention: { createPath: '/api/reservations', itemPath: '/api/reservations/{id}', parentField: 'roomId',
                        createBody: { roomId: '{parentId}', name: '{nonce}' } } } }]
        };
        const journeys = management.roles.flatMap(role => ['positive', 'negative'].map(kind => ({ role: role.name, kind,
            steps: [{ action: 'click', selector: '#fixture' }], expectedOutcome: { kind: kind === 'positive' ? 'success' : 'denied', text: 'fixture' } })));
        db.prepare('UPDATE project_contracts SET contract_json = ? WHERE id = ?')
            .run(JSON.stringify({ name: 'management fixture', management, browser: { roleJourneys: journeys } }), contractId);
        const zipPath = await createTestZip('management-bridge.zip', [
            { path: 'package.json', content: '{"name":"management-bridge"}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'service-manifest.json', content: '{"services":{"web":{"port":4173},"api":{"port":3001}}}' }
        ]);
        const artifactId = 'artifact-management-bridge', runId = 'run-management-bridge';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const runtimeNames = new Set(Object.keys(RUNTIME_GATE_MEMBERS));
        const baseChecks = allGates.filter(name => !runtimeNames.has(name)).map(name => ({ ...passingCheck(name),
            requirementIds: [], evidence: { adapterId: 'local-worker', policyVersion: '2.0' } }));
        const members = [...new Set(Object.values(RUNTIME_GATE_MEMBERS).flatMap(set => [...set]))].map(name => ({
            ...passingCheck(name), requirementIds: name === 'api_query_check' ? [requirementId] : [], evidence: { adapterId: 'local-worker', policyVersion: '2.0',
                ...(name === 'database_mutation_assertion' ? { resource: 'rooms', createdId: 'fixture-1', readback: true } : {}) }
        }));
        const detail = (name, evidence) => ({ name, status: 'passed', requirementIds: [],
            evidence: { adapterId: 'local-worker', runId, ...evidence } });
        const details = [
            detail('management_demo_seed', { roles: ['manager', 'visitor'] }),
            ...management.roles.map(role => detail('management_role_login', { role: role.name, authenticatedTargetStatus: 200 })),
            detail('api_anonymous_mutation_denied', { method: 'POST', url: 'http://127.0.0.1:3001/api/rooms' }),
            detail('api_anonymous_read_policy', { resource: 'rooms', policy: 'authenticated', statusCode: 401 }),
            ...['create', 'read', 'update', 'delete'].flatMap(operation => [
                detail(`api_role_${operation}_allowed`, { resource: 'rooms', role: 'manager', statusCode: 200, readback: true }),
                detail(`api_role_${operation}_denied`, { resource: 'rooms', role: 'visitor', statusCode: 403, persisted: false })
            ]),
            detail('api_anonymous_update_denied', { resource: 'rooms', statusCode: 401 }),
            detail('api_anonymous_delete_denied', { resource: 'rooms', statusCode: 401 }),
            ...['update', 'delete'].flatMap(operation => [
                detail(`api_${operation}_persistence`, { resource: 'rooms', recordId: 'fixture-1', readback: true }),
                detail(`api_${operation}_denial_persistence`, { resource: 'rooms', recordId: 'fixture-1' })
            ]),
            detail('api_delete_related_retention', { resource: 'rooms', policy: 'preserve', relatedId: 'reservation-fixture-1', statusCode: 200 }),
            detail('browser_management_interaction', { roles: ['manager', 'visitor'], journeyCount: journeys.length,
                journeys: journeys.map(journey => ({ role: journey.role, kind: journey.kind, passed: true })) })
        ];
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId, activeJob: identity, archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => {
                const response = workerResponse(identity, [...baseChecks, ...members, ...details], 'completed');
                response.result.runtime = { runtime: 'local', executionProfile: 'local-trusted', osIsolation: false };
                return response;
            } }
        });
        assert.equal(result.passed, true, JSON.stringify(result));
        managementFixture = { projectId, contractId, artifactId, runId, contract: { management, browser: { roleJourneys: journeys } } };
        assert.doesNotThrow(() => assertVerifiedArtifactEvidence(managementFixture));
        const rows = db.prepare('SELECT gate_name, applicability FROM verification_checks WHERE run_id = ?').all(runId);
        for (const name of allGates) assert.equal(rows.filter(row => row.gate_name === name && row.applicability === 'MANDATORY').length, 1,
            `one authoritative base aggregate required: ${name}`);
        for (const name of ['management_demo_seed', 'management_role_login', 'browser_management_interaction', 'api_role_create_allowed']) {
            assert.ok(rows.some(row => row.gate_name === name && row.applicability === 'MANDATORY'), `${name} must remain mandatory`);
        }
    });

    await runAsyncTest('5b. management coverage binds read and retention policy to the approved resource', async () => {
        const rows = db.prepare('SELECT * FROM verification_checks WHERE run_id = ?').all(managementFixture.runId);
        for (const name of ['api_anonymous_read_policy', 'api_delete_related_retention']) {
            const altered = rows.map(row => row.gate_name === name
                ? { ...row, evidence_json: JSON.stringify({ ...JSON.parse(row.evidence_json), policy: 'different-policy' }) } : row);
            assert.throws(() => assertManagementCoverage(altered, managementFixture.contract), /management evidence missing/);
        }
    });

    for (const scenario of ['missing', 'failed', 'downgraded', 'unproven', 'unknown extra', 'base provenance missing', 'missing persistence', 'failed persistence', 'wrong resource sibling', 'same-name failed sibling', 'stripped raw receipt', 'cyclic aggregate']) {
        await runAsyncTest(`6. management completion denies ${scenario} evidence`, async () => {
            assert.ok(managementFixture, 'management bridge fixture must exist');
            assert.doesNotThrow(() => assertVerifiedArtifactEvidence(managementFixture), 'negative case must begin with valid worker evidence');
            const row = db.prepare("SELECT * FROM verification_checks WHERE run_id = ? AND gate_name = ? LIMIT 1")
                .get(managementFixture.runId, scenario === 'base provenance missing' ? 'clean_install'
                    : scenario === 'stripped raw receipt' ? 'clean_install' : scenario === 'cyclic aggregate' ? 'api_contract'
                        : scenario.includes('persistence') ? 'api_update_persistence' : 'api_role_create_allowed');
            db.exec('SAVEPOINT management_negative');
            try {
                if (scenario === 'missing' || scenario === 'missing persistence') db.prepare('DELETE FROM verification_checks WHERE id = ?').run(row.id);
                if (scenario === 'failed' || scenario === 'failed persistence') db.prepare("UPDATE verification_checks SET status='FAIL' WHERE id = ?").run(row.id);
                if (scenario === 'downgraded') db.prepare("UPDATE verification_checks SET applicability='OPTIONAL' WHERE id = ?").run(row.id);
                if (scenario === 'unproven') db.prepare('UPDATE verification_checks SET evidence_json = ? WHERE id = ?')
                    .run(JSON.stringify({ adapterId: 'local-worker', resource: 'rooms', role: 'manager' }), row.id);
                if (scenario === 'base provenance missing') db.prepare('UPDATE verification_checks SET command=NULL, evidence_json=? WHERE id = ?')
                    .run(JSON.stringify({ claimed: true }), row.id);
                if (scenario === 'stripped raw receipt') {
                    const evidence = JSON.parse(row.evidence_json); delete evidence.workerReceipt;
                    db.prepare('UPDATE verification_checks SET evidence_json=? WHERE id=?').run(JSON.stringify(evidence), row.id);
                }
                if (scenario === 'cyclic aggregate') db.prepare('UPDATE verification_checks SET evidence_json=? WHERE id=?')
                    .run(JSON.stringify({ ...JSON.parse(row.evidence_json), sourceCheckIds: [row.id] }), row.id);
                if (scenario === 'wrong resource sibling') db.prepare('UPDATE verification_checks SET evidence_json = ? WHERE id = ?')
                    .run(JSON.stringify({ ...JSON.parse(row.evidence_json), resource: 'different-resource', role: 'different-role' }), row.id);
                if (scenario === 'same-name failed sibling') db.prepare(`INSERT INTO verification_checks
                    (id,contract_id,run_id,gate_name,applicability,status,started_at,ended_at,stdout_digest,stderr_digest,evidence_json)
                    VALUES (?,?,?,?,'MANDATORY','FAIL',?,?,?,?,?)`)
                    .run('same-name-failed-check', contractId, managementFixture.runId, row.gate_name,
                        row.started_at, row.ended_at, row.stdout_digest, row.stderr_digest, row.evidence_json);
                if (scenario === 'unknown extra') db.prepare(`INSERT INTO verification_checks
                    (id,contract_id,run_id,gate_name,applicability,status,command,exit_code,started_at,ended_at,stdout_digest,stderr_digest,evidence_json)
                    VALUES (?,?,?,'unknown_management_gate','MANDATORY','PASS','node fake',0,?,?,?,?,?)`)
                    .run('unknown-management-check', contractId, managementFixture.runId, new Date().toISOString(), new Date().toISOString(), 'stdout', 'stderr', '{"ok":true}');
                assert.throws(() => assertVerifiedArtifactEvidence(managementFixture), `${scenario} must block completion/download`);
            } finally { db.exec('ROLLBACK TO management_negative; RELEASE management_negative'); }
        });
    }
    await runAsyncTest('7. fresh smoke/API/browser emitter payloads authorize management completion and require public role read evidence', async () => {
        const management = { needed: true, authentication: { apiLogin: { path: '/api/auth/login' } },
            roles: [
                { name: 'manager', demoUser: { username: 'manager-fixture' }, permissions: [{ resource: 'rooms', operations: ['create', 'read'] }] },
                { name: 'viewer', demoUser: { username: 'viewer-fixture' }, permissions: [{ resource: 'rooms', operations: ['read'] }] }
            ], resources: [{ name: 'rooms', apiPath: '/api/rooms', uiPath: '/rooms', readAccess: 'public', operations: ['create', 'read'] }] };
        const roleJourneys = management.roles.flatMap(role => ['positive', 'negative'].map(kind => ({ role: role.name, kind,
            steps: [{ action: 'click', selector: '#fixture' }], expectedOutcome: { kind: kind === 'positive' ? 'success' : 'denied', text: kind } })));
        const contract = { management, browser: { roleJourneys } };
        db.prepare('UPDATE project_contracts SET contract_json = ? WHERE id = ?').run(JSON.stringify(contract), contractId);
        const files = [
            { path: 'package.json', content: JSON.stringify({ name: 'fresh-smoke', scripts: { test: 'node --test test.js' } }) },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'prisma/schema.prisma', content: 'datasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel Room { id String @id }' },
            { path: 'service-manifest.json', content: JSON.stringify({ services: {
                web: { type: 'vite', port: 4173, command: 'npm', args: ['run', 'preview'] },
                api: { type: 'express', port: 3001, command: 'npm', args: ['run', 'start:api'], healthEndpoint: '/api/health' }
            } }) }
        ];
        let created;
        const adapter = { id: 'local-worker', getCapabilities: () => ({ available: true, isolation: true }),
            async spawn(request) { const child = new EventEmitter(); child.pid = request.port; return child; },
            async kill() {},
            async request(request) {
                if (request.method === 'POST') return { statusCode: 403, data: {} };
                return { statusCode: 200, html: '<main>Rooms</main>', rawBody: '<main>Rooms</main>', data: created ? [created] : [] };
            },
            async execute(request) {
                let stdout = '# tests 1\n# pass 1';
                if (request.args?.[1]?.includes('Role login')) {
                    const method = request.args[4], username = request.args[5];
                    let response = { statusCode: 200, data: created ? [created] : [] };
                    if (method === 'POST' && username === 'viewer-fixture') response = { statusCode: 403, data: {} };
                    else if (method === 'POST') {
                        created = { id: 'room-fixture-1', name: JSON.parse(request.args[9]).name };
                        response = { statusCode: 201, data: created };
                    }
                    stdout = JSON.stringify(response);
                } else if (request.args?.[1]?.includes('DatabaseSync')) stdout = JSON.stringify({ schemaExists: true, databaseExists: true, writeSucceeded: true });
                return { passed: true, exitCode: 0, stdout, stderr: '' };
            },
            async interact(request) { return { passed: true, session: { authenticatedRole: request.role },
                actions: request.steps.map((step, index) => ({ index, action: step.action, target: step.selector, completed: true, accessibleName: 'Fixture', keyboardReachable: true })),
                outcome: { ...request.expectedOutcome, visible: true }, viewport: { width: 375, horizontalOverflow: false } }; }
        };
        const smoke = await verifyProjectSmoke('/workspace', contract, { adapter, files });
        assert.equal(smoke.passed, true, JSON.stringify(smoke));
        const coverageRows = smoke.checks.map(check => ({ gateName: check.name, status: check.status === 'passed' ? 'PASS' : 'FAIL',
            applicability: 'MANDATORY', evidenceJson: check.evidence }));
        assert.throws(() => assertManagementCoverage(coverageRows.filter(check => check.gateName !== 'api_role_read_allowed'), contract), /read.*missing|missing.*read/i);
        const anonymous = smoke.checks.find(check => check.name === 'api_anonymous_mutation_denied');
        assert.equal(anonymous.evidence.resource, undefined, 'exercise the actual URL-only anonymous emitter');
        const zipPath = await createTestZip('fresh-smoke-bridge.zip', files);
        const artifactId = 'artifact-fresh-smoke', runId = 'run-fresh-smoke';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        const identity = artifactIdentity(artifactId, runId, archiveHash);
        const runtimeNames = new Set(Object.keys(RUNTIME_GATE_MEMBERS));
        const prerequisiteChecks = allGates.filter(name => !runtimeNames.has(name)).map(name => ({
            ...passingCheck(name), requirementIds: [requirementId], evidence: { adapterId: 'local-worker', policyVersion: '2.0' }
        }));
        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId, activeJob: identity, archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity,
                [...prerequisiteChecks, passingCheck('prisma_db_push'), ...smoke.checks].map(check => ({ ...check,
                    requirementIds: check.name === 'typecheck' ? [requirementId] : [] })), 'completed') }
        });
        assert.equal(result.passed, true, JSON.stringify({ ...result, failed: db.prepare("SELECT gate_name,status,evidence_json FROM verification_checks WHERE run_id=? AND status!='PASS'").all(runId) }));
        assert.doesNotThrow(() => assertVerifiedArtifactEvidence({ projectId, contractId, artifactId }));
        db.exec('SAVEPOINT public_reader');
        try {
            db.prepare("DELETE FROM verification_checks WHERE run_id = ? AND gate_name = 'api_role_read_allowed'").run(runId);
            assert.throws(() => assertVerifiedArtifactEvidence({ projectId, contractId, artifactId }), /management.*read|read.*missing|receipt check is missing/i);
        } finally { db.exec('ROLLBACK TO public_reader; RELEASE public_reader'); }
    });

    await runAsyncTest('5. runWorkerChecks fails requirement_traceability when a check fails with requirementIds', async () => {
        const { runVerificationChecks } = await import('../verification/runChecks.js');
        const fakeAdapter = {
            workspaceRoot: '/test-workspace',
            execute: async () => ({ code: 0, stdout: '', stderr: '' })
        };
        const failedCheck = {
            name: 'api_contract',
            status: 'failed',
            exitCode: 1,
            requirementIds: ['REQ-1'],
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            stdoutDigest: 'abc',
            stderrDigest: 'def'
        };
        const result = await runVerificationChecks({
            workspace: '/test-workspace',
            contract: { requirements: [{ id: 'REQ-1', mandatory: true }] },
            requirementIds: ['REQ-1'],
            adapter: fakeAdapter,
            files: [],
            verifiers: {
                dependencies: async () => ({ checks: [] }),
                build: async () => ({ checks: [] }),
                readme: async () => ({ passed: true, checks: [] }),
                smoke: async () => ({ checks: [failedCheck] })
            }
        });
        const traceCheck = result.checks.find(c => (c.name || c.gateName) === 'requirement_traceability');
        assert.ok(traceCheck, 'requirement_traceability check must be present');
        assert.strictEqual(traceCheck.status, 'blocked', 'failed requirement-linked checks cannot supply passing coverage');
    });

    await runAsyncTest('6. verifyArtifact overrides spoofed security_baseline and marks missing evidence as BLOCKED', async () => {
        const zipPath = await createTestZip('spoof-test.zip', [
            { path: 'package.json', content: '{"name":"spoof-app","dependencies":{}}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: '.env', content: 'SECRET=malicious-secret' },
            { path: 'src/index.js', content: 'console.log("hello");' }
        ]);
        const artifactId = 'artifact-spoof-test';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        db.prepare("UPDATE projects SET status = 'implementation_finished' WHERE id = ?").run(projectId);
        const runId = 'run-spoof-test';
        const identity = artifactIdentity(artifactId, runId, archiveHash);

        const spoofedWorkerChecks = [
            { name: 'security_baseline', status: 'passed', exitCode: 0, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), stdoutDigest: 'fake', stderrDigest: 'fake' },
            { name: 'clean_install', status: 'passed', exitCode: 0, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), stderrDigest: 'has-stderr-only' }
        ];

        const result = await verifyArtifact({ projectId, contractId, artifactId }, {
            runId,
            activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, spoofedWorkerChecks, 'completed') }
        });

        assert.strictEqual(result.passed, false, 'Spoofed artifact must not pass verification');

        const secRow = db.prepare("SELECT * FROM verification_checks WHERE run_id = ? AND gate_name = 'security_baseline'").get(runId);
        assert.ok(secRow, 'security_baseline must exist');
        assert.strictEqual(secRow.status, 'FAIL', 'Backend authoritative security_baseline must fail eval');

        const installRow = db.prepare("SELECT * FROM verification_checks WHERE run_id = ? AND gate_name = 'clean_install'").get(runId);
        assert.ok(installRow, 'clean_install check must exist');
        assert.strictEqual(installRow.status, 'BLOCKED', 'Check with missing digest must be BLOCKED');
        assert.strictEqual(installRow.exit_code, -1);
    });

    await runAsyncTest('7. verifyArtifact failure invalidates task_checkpoints atomically', async () => {
        db.prepare(`
            INSERT OR REPLACE INTO task_checkpoints (
                project_id, task_id, contract_id, plan_hash, task_spec_hash,
                input_hash, output_hash, gate_version, status
            ) VALUES (?, 'task-atomic-fail', ?, 'plan', 'spec', 'input', 'output', 'v1', 'completed')
        `).run(projectId, contractId);

        const zipPath = await createTestZip('fail-cp-invalidation.zip', [
            { path: 'package.json', content: '{"name":"fail-cp","dependencies":{}}' },
            { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
            { path: 'src/index.js', content: 'console.log("fail");' }
        ]);
        const artifactId = 'artifact-fail-cp';
        const { archiveBytes, archiveHash } = await registerArtifact(artifactId, zipPath);
        db.prepare("UPDATE projects SET status = 'implementation_finished' WHERE id = ?").run(projectId);
        const runId = 'run-fail-cp';
        const identity = artifactIdentity(artifactId, runId, archiveHash);

        const failingWorkerChecks = [
            { name: 'clean_install', status: 'failed', exitCode: 1, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), stdoutDigest: 'abc', stderrDigest: 'def' },
            { id:'actual-locale-action', name:'ui_language_evidence',status:'blocked',evidence:{inventory:{version:1,snapshots:[]},advisory:true} }
        ];

        await verifyArtifact({ projectId, contractId, artifactId }, {
            runId,
            activeJob: identity,
            archiveBase64: archiveBytes.toString('base64'),
            executionClient: { verifyArtifact: async () => workerResponse(identity, failingWorkerChecks, 'failed', 'clean install failed') }
        });

        const cpRow = db.prepare("SELECT status, invalidation_reason FROM task_checkpoints WHERE project_id = ? AND contract_id = ? AND task_id = 'task-atomic-fail'").get(projectId, contractId);
        assert.ok(cpRow, 'Checkpoint must exist');
        assert.strictEqual(cpRow.status, 'invalidated', 'Verification failure must have invalidated task_checkpoints');
        assert.strictEqual(cpRow.invalidation_reason, 'VERIFICATION_FAILED');
        const locale=db.prepare("SELECT * FROM verification_checks WHERE run_id=? AND gate_name='ui_language_evidence'").get(runId);
        const receipt=JSON.parse(locale.evidence_json).workerReceipt;
        assert.equal(receipt?.kind,'worker_action_receipt','Failed product diagnostic still authenticates the observed semantic action.');
        assert.equal(locale.status,'BLOCKED');
        assert.equal(db.prepare("SELECT count(*) n FROM verification_checks WHERE run_id=? AND gate_name='worker_verification_receipt' AND status='PASS'").get(runId).n,0,'No failed diagnostic can become aggregate acceptance.');
    });
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    finish();
    await isolated.cleanup();
}
