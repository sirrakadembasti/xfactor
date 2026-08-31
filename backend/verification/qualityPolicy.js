import crypto from 'crypto';
import { verifyDomainCompliance } from '../contracts/domainPolicy.js';
import { listProjectTree } from '../engine/codeGenerator.js';
import { db, dbEvents } from '../db.js';
import {
    getProject,
    getProjectDir,
    projectStateTransitionInTransaction,
    saveProjectState
} from '../projectRepository.js';
import { createRun } from '../repositories/verificationRepository.js';
import { verifyDependencies } from './packageVerifier.js';
import { verifyBuild } from './buildVerifier.js';
import { verifyProjectSmoke } from './smokeVerifier.js';
import { verifyContamination } from './contaminationVerifier.js';
import { verifyPlaceholders } from './placeholderVerifier.js';
import { verifyReadmeCommands } from './readmeVerifier.js';
import { verifySecurityBaseline } from './securityVerifier.js';

export const MANDATORY_GATES = [
    'package_json',
    'lockfile',
    'ast_import_inventory',
    'clean_install',
    'typecheck',
    'framework_build',
    'requirement_traceability',
    'service_manifest',
    'database_verification',
    'api_contract',
    'browser_journey',
    'smoke_gate',
    'test_infrastructure',
    'domain_entity_check',
    'placeholder_check',
    'contamination_check',
    'security_baseline',
    'readme_check'
];

export const OPTIONAL_GATES = [
    'prisma_validate'
];

const STATUS_PRIORITY = {
    NOT_APPLICABLE: 0,
    PASS: 1,
    BLOCKED: 2,
    FAIL: 3
};

const RUNTIME_GATE_MEMBERS = {
    service_manifest: new Set([
        'manifest_presence',
        'service_definitions',
        'port_uniqueness'
    ]),
    database_verification: new Set([
        'prisma_schema_presence',
        'prisma_db_push',
        'database_connectivity',
        'database_write_capability'
    ]),
    api_contract: new Set([
        'database_file_accessible',
        'api_status_check',
        'api_query_check',
        'database_mutation_assertion'
    ]),
    browser_journey: new Set([
        'browser_page_load',
        'browser_journey_steps'
    ]),
    smoke_gate: new Set([
        'service_spawn',
        'smoke_liveness_probe',
        'smoke_gate'
    ]),
    test_infrastructure: new Set([
        'test_script_presence',
        'test_suite_execution'
    ])
};

function normalizeGateStatus(status) {
    if (!status) return 'BLOCKED';
    const normalized = String(status).toUpperCase();
    if (normalized === 'PASSED' || normalized === 'PASS') return 'PASS';
    if (normalized === 'FAILED' || normalized === 'FAIL') return 'FAIL';
    if (normalized === 'BLOCKED') return 'BLOCKED';
    if (normalized === 'SKIPPED') return 'BLOCKED';
    if (normalized === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
    return 'BLOCKED';
}

function computeDigest(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function normalizeCheck(check, index) {
    const name = check?.gateName || check?.name;
    if (!name) {
        throw new Error(`Verification check at index ${index} has no gate name.`);
    }

    const mandatory = MANDATORY_GATES.includes(name);
    const applicability = mandatory
        ? 'MANDATORY'
        : String(check.applicability || 'OPTIONAL').toUpperCase();
    let status = normalizeGateStatus(check.status);
    if (mandatory && status === 'NOT_APPLICABLE') {
        status = 'BLOCKED';
    }
    if (check.timedOut && status === 'PASS') {
        status = 'BLOCKED';
    }

    return {
        ...check,
        name,
        gateName: name,
        status,
        applicability,
        requirementIds: Array.isArray(check.requirementIds)
            ? [...new Set(check.requirementIds.map(String))]
            : [],
        reason: check.reason || check.stderr || '',
        command: check.command || null,
        cwd: check.cwd || null,
        exitCode: check.exitCode ?? null,
        stdout: check.stdout || '',
        stderr: check.stderr || '',
        stdoutDigest: check.stdoutDigest || computeDigest(check.stdout),
        stderrDigest: check.stderrDigest || computeDigest(check.stderr),
        timedOut: Boolean(check.timedOut)
    };
}

export function evaluateVerificationRun({
    checks = [],
    gates = [],
    agentApproved = null,
    agentSummary = '',
    requiredGates = MANDATORY_GATES
} = {}) {
    const rawList = Array.isArray(checks) && checks.length > 0
        ? checks
        : (Array.isArray(gates) ? gates : []);
    const normalizedChecks = rawList.map(normalizeCheck);
    const checksByName = new Map();

    for (const check of normalizedChecks) {
        const existing = checksByName.get(check.name);
        if (!existing || STATUS_PRIORITY[check.status] > STATUS_PRIORITY[existing.status]) {
            checksByName.set(check.name, check);
        }
    }

    const failedGates = [];
    const blockedGates = [];
    const missingGates = [];
    const passedGates = [];

    for (const requiredGate of requiredGates) {
        const check = checksByName.get(requiredGate);
        if (!check) {
            missingGates.push(requiredGate);
        } else if (check.status === 'FAIL') {
            failedGates.push(requiredGate);
        } else if (check.status === 'BLOCKED' || check.status === 'NOT_APPLICABLE') {
            blockedGates.push(requiredGate);
        } else if (check.status === 'PASS') {
            passedGates.push(requiredGate);
        }
    }

    for (const [name, check] of checksByName.entries()) {
        if (!requiredGates.includes(name) && check.status === 'FAIL') {
            failedGates.push(name);
        }
    }

    let status = 'PASS';
    if (failedGates.length > 0) {
        status = 'FAIL';
    } else if (blockedGates.length > 0 || missingGates.length > 0) {
        status = 'BLOCKED';
    }

    return {
        passed: status === 'PASS',
        status,
        failedGates,
        blockedGates,
        missingGates,
        passedGates,
        checkMap: checksByName,
        normalizedChecks,
        rawChecks: rawList,
        advisory: {
            agentApproved: Boolean(agentApproved),
            agentSummary: String(agentSummary || '')
        }
    };
}

function getProjectTransition(project, passed) {
    const successPaths = {
        implementing: [
            'implementation_finished',
            'verification_pending',
            'verification_running',
            'build_verified',
            'runtime_verified'
        ],
        implementation_finished: [
            'verification_pending',
            'verification_running',
            'build_verified',
            'runtime_verified'
        ],
        verification_pending: [
            'verification_running',
            'build_verified',
            'runtime_verified'
        ],
        verification_running: [
            'build_verified',
            'runtime_verified'
        ]
    };
    const failurePaths = {
        implementing: [
            'implementation_finished',
            'verification_pending',
            'verification_running',
            'verification_failed'
        ],
        implementation_finished: [
            'verification_pending',
            'verification_running',
            'verification_failed'
        ],
        verification_pending: [
            'verification_running',
            'verification_failed'
        ],
        verification_running: [
            'verification_failed'
        ]
    };
    const path = (passed ? successPaths : failurePaths)[project.status];
    if (!path) {
        throw new Error(
            `Project ${project.id} cannot aggregate verification from state ${project.status}.`
        );
    }
    return path;
}

async function applyProjectTransition(project, path) {
    for (const status of path) {
        project.status = status;
        await saveProjectState(project);
    }
}

function makeCheckId(runId, index, gateName) {
    const digest = crypto.createHash('sha256')
        .update(`${runId}\0${index}\0${gateName}`)
        .digest('hex')
        .slice(0, 32);
    return `check-${digest}`;
}

function evaluateVerificationRunWithTraceability(contractId, checks) {
    const machineChecks = checks.filter(check => (
        (check?.gateName || check?.name) !== 'requirement_traceability'
    ));
    const mandatoryRequirementIds = db.prepare(`
        SELECT id
        FROM requirements
        WHERE contract_id = ? AND mandatory = 1
        ORDER BY stable_key
    `).all(contractId).map(row => row.id);
    const passingRequirementIds = new Set();

    for (const check of machineChecks) {
        if (normalizeGateStatus(check.status) !== 'PASS' || check.timedOut) {
            continue;
        }
        for (const requirementId of Array.isArray(check.requirementIds)
            ? check.requirementIds
            : []) {
            passingRequirementIds.add(String(requirementId));
        }
    }

    const missingRequirementIds = mandatoryRequirementIds.filter(
        requirementId => !passingRequirementIds.has(requirementId)
    );
    const traceabilityPassed = missingRequirementIds.length === 0;
    const traceabilityCheck = {
        gateName: 'requirement_traceability',
        applicability: 'MANDATORY',
        status: traceabilityPassed ? 'PASS' : 'BLOCKED',
        requirementIds: [],
        reason: traceabilityPassed
            ? `${mandatoryRequirementIds.length} mandatory requirement(s) have passing machine evidence.`
            : `${missingRequirementIds.length} mandatory requirement(s) lack passing machine evidence.`,
        evidence: { missingRequirementIds }
    };

    return evaluateVerificationRun({
        checks: [...machineChecks, traceabilityCheck]
    });
}

export async function aggregateVerificationRun(projectId, contractId, runId, checks) {
    if (!projectId || !contractId || !runId) {
        throw new Error('projectId, contractId, and runId are required.');
    }
    if (!Array.isArray(checks)) {
        throw new Error('checks must be an array.');
    }

    const evaluation = evaluateVerificationRunWithTraceability(contractId, checks);
    const runStatus = evaluation.passed ? 'verified' : 'failed';
    const project = getProject(projectId);
    if (!project) {
        throw new Error(`Project ${projectId} does not exist.`);
    }
    const existingRun = db.prepare(`
        SELECT id, project_id, contract_id, status, ended_at
        FROM verification_runs
        WHERE id = ?
    `).get(runId);
    if (!existingRun) {
        throw new Error(`Verification run ${runId} does not exist.`);
    }
    if (existingRun.project_id !== projectId || existingRun.contract_id !== contractId) {
        throw new Error(`Verification run ${runId} ownership does not match project and contract.`);
    }
    if (!['queued', 'running'].includes(existingRun.status) || existingRun.ended_at) {
        throw new Error(`Verification run ${runId} is already finalized.`);
    }
    const transitionPath = getProjectTransition(project, evaluation.passed);

    const now = new Date().toISOString();
    let finalProjectStatus;
    db.exec('BEGIN IMMEDIATE;');
    try {
        const lockedRun = db.prepare(`
            SELECT status, ended_at
            FROM verification_runs
            WHERE id = ? AND project_id = ? AND contract_id = ?
        `).get(runId, projectId, contractId);
        const existingCheckCount = db.prepare(`
            SELECT COUNT(*) AS count
            FROM verification_checks
            WHERE contract_id = ? AND run_id = ?
        `).get(contractId, runId).count;
        if (
            !lockedRun ||
            !['queued', 'running'].includes(lockedRun.status) ||
            lockedRun.ended_at ||
            existingCheckCount > 0
        ) {
            throw new Error(`Verification run ${runId} is already aggregated.`);
        }

        const insertCheck = db.prepare(`
            INSERT INTO verification_checks (
                id, contract_id, run_id, gate_name, applicability, status,
                command, cwd, exit_code, started_at, ended_at, timed_out,
                stdout_digest, stderr_digest, evidence_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertRequirementLink = db.prepare(`
            INSERT INTO requirement_check_links (
                contract_id, requirement_id, verification_check_id
            ) VALUES (?, ?, ?)
        `);

        for (let index = 0; index < evaluation.normalizedChecks.length; index++) {
            const check = evaluation.normalizedChecks[index];
            const checkId = makeCheckId(runId, index, check.name);
            insertCheck.run(
                checkId,
                contractId,
                runId,
                check.name,
                check.applicability,
                check.status,
                check.command,
                check.cwd,
                check.exitCode ?? (check.status === 'PASS' ? 0 : 1),
                check.startedAt || now,
                check.endedAt || now,
                check.timedOut ? 1 : 0,
                check.stdoutDigest,
                check.stderrDigest,
                JSON.stringify({
                    reason: check.reason,
                    requirementIds: check.requirementIds,
                    evidence: (() => {
                        const base = check.evidence && typeof check.evidence === 'object' && !Array.isArray(check.evidence) ? { ...check.evidence } : {};
                        base.stdout = check.stdout || '';
                        base.stderr = check.stderr || '';
                        if (check.evidence !== undefined && check.evidence !== null && typeof check.evidence !== 'object') {
                            base.value = check.evidence;
                        }
                        return base;
                    })()
                })
            );
            for (const requirementId of check.requirementIds) {
                insertRequirementLink.run(contractId, requirementId, checkId);
            }
        }

        if (!evaluation.passed) {
            db.prepare(`
                UPDATE task_checkpoints
                SET status = 'invalidated',
                    invalidated_at = ?,
                    invalidation_reason = ?
                WHERE project_id = ? AND contract_id = ? AND invalidated_at IS NULL
            `).run(
                now,
                `Verification run ${runId} failed.`,
                projectId,
                contractId
            );
        }
        const projectedState = projectStateTransitionInTransaction({
            projectId,
            expectedRevision: project.revision,
            statuses: transitionPath
        });
        finalProjectStatus = projectedState.status;

        const update = db.prepare(`
            UPDATE verification_runs
            SET status = ?, ended_at = ?
            WHERE id = ? AND project_id = ? AND contract_id = ?
              AND status IN ('queued', 'running') AND ended_at IS NULL
        `).run(runStatus, now, runId, projectId, contractId);
        if (update.changes !== 1) {
            throw new Error(`Verification run ${runId} could not be finalized.`);
        }
        db.exec('COMMIT;');
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }

    dbEvents.emit(`stateChange:${projectId}`, finalProjectStatus);
    return { passed: evaluation.passed, runStatus };
}

function combineRuntimeGate(gateName, checks, mandatoryRequirementIds = []) {
    const members = checks.filter(check => RUNTIME_GATE_MEMBERS[gateName].has(check.name));
    const requirementIds = new Set(members.flatMap(check => (
        Array.isArray(check.requirementIds) ? check.requirementIds.map(String) : []
    )));
    let status = 'PASS';
    if (members.length === 0) {
        status = 'BLOCKED';
    } else if (members.some(check => normalizeGateStatus(check.status) === 'FAIL')) {
        status = 'FAIL';
    } else if (members.some(check => {
        const normalized = normalizeGateStatus(check.status);
        return normalized === 'BLOCKED' || normalized === 'NOT_APPLICABLE';
    })) {
        status = 'BLOCKED';
    }
    if (gateName === 'smoke_gate' && status === 'PASS') {
        for (const requirementId of mandatoryRequirementIds) {
            requirementIds.add(requirementId);
        }
    }

    return {
        gateName,
        applicability: 'MANDATORY',
        status,
        requirementIds: [...requirementIds],
        reason: members.length === 0
            ? `No machine evidence was produced for ${gateName}.`
            : `${members.length} machine check(s) aggregated for ${gateName}.`,
        evidence: {
            checks: members.map(check => ({
                name: check.name,
                status: normalizeGateStatus(check.status),
                reason: check.reason || ''
            }))
        }
    };
}

async function captureVerifier(run, fallbackGate) {
    try {
        return await run();
    } catch (error) {
        return {
            passed: false,
            checks: [{
                name: fallbackGate,
                status: error?.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                reason: error?.message || String(error)
            }]
        };
    }
}

async function captureHardeningGate(name, run) {
    try {
        const result = await run();
        const issues = Array.isArray(result?.issues) ? result.issues : [];
        return {
            gateName: name,
            applicability: 'MANDATORY',
            status: result?.passed === true ? 'PASS' : 'FAIL',
            reason: issues.join('; '),
            evidence: { issues }
        };
    } catch (error) {
        return {
            gateName: name,
            applicability: 'MANDATORY',
            status: error?.code === 'SANDBOX_UNAVAILABLE' ? 'BLOCKED' : 'FAIL',
            reason: error?.message || String(error),
            evidence: { error: error?.message || String(error) }
        };
    }
}

function stageVerificationRunning(project) {
    const paths = {
        implementation_finished: ['verification_pending', 'verification_running'],
        verification_pending: ['verification_running']
    };
    const path = paths[project.status];
    if (!path) {
        throw new Error(
            `Project ${project.id} cannot start verification from state ${project.status}.`
        );
    }
    return applyProjectTransition(project, path);
}

export async function runProjectVerification({
    projectId,
    projectDir = null,
    options = {}
} = {}) {
    const project = getProject(projectId);
    if (!project) {
        throw new Error(`Project ${projectId} does not exist.`);
    }
    const contractRow = db.prepare(`
        SELECT id, contract_json
        FROM project_contracts
        WHERE project_id = ? AND status = 'approved'
        ORDER BY revision DESC
        LIMIT 1
    `).get(projectId);
    if (!contractRow) {
        throw new Error(`Project ${projectId} has no approved contract.`);
    }

    let contract;
    try {
        contract = JSON.parse(contractRow.contract_json);
    } catch {
        throw new Error(`Approved contract ${contractRow.id} contains invalid JSON.`);
    }
    const mandatoryRequirementIds = db.prepare(`
        SELECT id
        FROM requirements
        WHERE contract_id = ? AND mandatory = 1
        ORDER BY stable_key
    `).all(contractRow.id).map(row => row.id);
    const injectedVerifiers = options.verifiers || {};
    const dependencyVerifier = injectedVerifiers.dependencies || verifyDependencies;
    const buildVerifier = injectedVerifiers.build || verifyBuild;
    const smokeVerifier = injectedVerifiers.smoke || verifyProjectSmoke;
    const domainVerifier = injectedVerifiers.domain || verifyDomainCompliance;
    const placeholderVerifier = injectedVerifiers.placeholders || verifyPlaceholders;
    const contaminationVerifier = injectedVerifiers.contamination || verifyContamination;
    const securityVerifier = injectedVerifiers.security || verifySecurityBaseline;
    const readmeVerifier = injectedVerifiers.readme || verifyReadmeCommands;
    const verifierOptions = { ...options };
    delete verifierOptions.verifiers;

    await stageVerificationRunning(project);
    const runId = `verification-${crypto.randomUUID()}`;
    createRun({
        id: runId,
        projectId,
        contractId: contractRow.id,
        status: 'running',
        policyVersion: '1.0'
    });

    const workspace = projectDir || getProjectDir(projectId);
    let projectFiles;
    let projectFilesError = null;
    try {
        projectFiles = Array.isArray(options.files)
            ? options.files
            : await listProjectTree(workspace, { strict: true });
    } catch (error) {
        projectFiles = [];
        projectFilesError = error;
    }
    const sandboxAdapter = verifierOptions.adapter ?? null;
    const hardeningRuns = [
        ['domain_entity_check', () => domainVerifier(contract, projectFiles)],
        ['placeholder_check', () => placeholderVerifier(projectFiles)],
        ['contamination_check', () => contaminationVerifier(contract, projectFiles)],
        ['security_baseline', () => securityVerifier(contract, projectFiles, sandboxAdapter)],
        ['readme_check', () => readmeVerifier(contract, projectFiles, sandboxAdapter)]
    ];
    const hardeningChecks = await Promise.all(hardeningRuns.map(([name, run]) =>
        captureHardeningGate(name, () => {
            if (projectFilesError) throw projectFilesError;
            return run();
        })
    ));
    const dependencyResult = await captureVerifier(
        () => dependencyVerifier(workspace, contract, verifierOptions),
        'package_json'
    );
    const buildResult = dependencyResult.passed
        ? await captureVerifier(
            () => buildVerifier(workspace, contract, verifierOptions),
            'framework_build'
        )
        : { passed: false, checks: [] };
    const smokeResult = dependencyResult.passed && buildResult.passed
        ? await captureVerifier(
            () => smokeVerifier(workspace, contract, verifierOptions),
            'smoke_gate'
        )
        : { passed: false, checks: [] };

    const dependencyChecks = Array.isArray(dependencyResult.checks)
        ? dependencyResult.checks
        : [];
    const buildChecks = Array.isArray(buildResult.checks) ? buildResult.checks : [];
    const smokeChecks = Array.isArray(smokeResult.checks) ? smokeResult.checks : [];
    const policyChecks = [
        ...dependencyChecks,
        ...buildChecks,
        ...hardeningChecks,
        ...Object.keys(RUNTIME_GATE_MEMBERS).map(gateName => (
            combineRuntimeGate(
                gateName,
                smokeChecks,
                gateName === 'smoke_gate' ? mandatoryRequirementIds : []
            )
        )),
        ...smokeChecks.map(check => ({
            ...check,
            gateName: `detail:${check.name}`,
            applicability: 'OPTIONAL'
        }))
    ];

    const result = await aggregateVerificationRun(
        projectId,
        contractRow.id,
        runId,
        policyChecks
    );
    return { ...result, runId };
}
