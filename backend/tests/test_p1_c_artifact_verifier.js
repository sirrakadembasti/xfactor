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
const { assertVerifiedArtifactEvidence } = await import('../projectRepository.js');
const { verifyProjectSmoke } = await import('../verification/smokeVerifier.js');
const { assertManagementCoverage } = await import('../verification/artifactEvidencePolicy.js');

const { runAsyncTest, finish } = createTestHarness();
const projectId = 'pipeline-proj-123';
const contractId = 'pipeline-contract-456';
const requirementId = 'req-pipeline-1';
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
        stdoutDigest: `stdout-${name}`,
        stderrDigest: `stderr-${name}`,
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
            requirementIds: [requirementId], evidence: { adapterId: 'local-worker', policyVersion: '2.0' } }));
        const members = [...new Set(Object.values(RUNTIME_GATE_MEMBERS).flatMap(set => [...set]))].map(name => ({
            ...passingCheck(name), requirementIds: [requirementId], evidence: { adapterId: 'local-worker', policyVersion: '2.0',
                ...(name === 'database_mutation_assertion' ? { resource: 'rooms', createdId: 'fixture-1', readback: true } : {}) }
        }));
        const detail = (name, evidence) => ({ name, status: 'passed', requirementIds: [requirementId],
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
                [...prerequisiteChecks, passingCheck('prisma_db_push'), ...smoke.checks].map(check => ({ ...check, requirementIds: [requirementId] })), 'completed') }
        });
        assert.equal(result.passed, true, JSON.stringify({ ...result, failed: db.prepare("SELECT gate_name,status,evidence_json FROM verification_checks WHERE run_id=? AND status!='PASS'").all(runId) }));
        assert.doesNotThrow(() => assertVerifiedArtifactEvidence({ projectId, contractId, artifactId }));
        db.exec('SAVEPOINT public_reader');
        try {
            db.prepare("DELETE FROM verification_checks WHERE run_id = ? AND gate_name = 'api_role_read_allowed'").run(runId);
            assert.throws(() => assertVerifiedArtifactEvidence({ projectId, contractId, artifactId }), /management.*read|read.*missing|receipt check is missing/i);
        } finally { db.exec('ROLLBACK TO public_reader; RELEASE public_reader'); }
    });
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    finish();
    await isolated.cleanup();
}
