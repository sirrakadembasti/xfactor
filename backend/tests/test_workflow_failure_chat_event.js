import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('workflow-failure-chat-event');
process.env.PROJECTS_ROOT = path.join(path.dirname(isolated.dbPath), 'projects');
const { db } = await import('../db.js');
const { createProject, getProject } = await import('../projectRepository.js');
const { acquireWorkflowLease } = await import('../workflowAttempts.js');
const { executeProjectTasks, computePlanHash, resolveStaticAuditRepairIssues } = await import('../engine/workflow.js');
const { normalizeManagerPlan } = await import('../agents/schemas.js');
const { formatVerificationFailure } = await import('../verification/verificationCli.js');

try {
    assert.match(formatVerificationFailure([
        { gate_name: 'typecheck', status: 'FAIL', evidence_json: '{}' },
        { gate_name: 'smoke_gate', status: 'FAIL', evidence_json: '{"issues":["Readiness probe timed out"]}' },
        { gate_name: 'api_contract', status: 'BLOCKED', evidence_json: '{}' }
    ]), /typecheck.*smoke_gate.*Readiness probe timed out/);
    assert.match(formatVerificationFailure([
        { gate_name: 'api_contract', status: 'BLOCKED', evidence_json: '{}' },
        { gate_name: 'browser_journey', status: 'BLOCKED', evidence_json: '{}' }
    ], 'Worker status: completed'), /api_contract.*browser_journey/);
    const project = await createProject({ title: 'Failure event test' });
    const plan = normalizeManagerPlan({
        summary: 'Test plan',
        talimatname: '# Test plan',
        domains: ['backend'],
        requirements: [{ id: 'REQ-1', statement: 'One task' }]
    });
    const contractId = 'contract-failure-event-test';
    db.prepare(`INSERT INTO project_contracts
        (id, project_id, revision, status, contract_json, contract_hash)
        VALUES (?, ?, 1, 'approved', ?, ?)`)
        .run(contractId, project.id, JSON.stringify(plan), 'test-hash');
    db.prepare("INSERT INTO workflow_attempts (id, project_id, status, lease_owner) VALUES ('attempt-static-old', ?, 'failed', 'old-owner')").run(project.id);
    const addIssue = db.prepare(`INSERT INTO repair_issues (id, project_id, contract_id, run_id, fingerprint, severity, status, detail_json)
        VALUES (?, ?, ?, ?, ?, 'critical', 'open', ?)`);
    addIssue.run('static-repair-old', project.id, contractId, 'attempt-static-old', 'static-old', JSON.stringify({ issue: 'Old static issue' }));
    addIssue.run('runtime-repair-old', project.id, contractId, 'verification-old', 'runtime-old', JSON.stringify({ issue: 'Runtime issue' }));
    assert.strictEqual(resolveStaticAuditRepairIssues(db, project.id, contractId), 1);
    assert.strictEqual(db.prepare("SELECT status FROM repair_issues WHERE id = 'static-repair-old'").get().status, 'resolved');
    assert.strictEqual(db.prepare("SELECT status FROM repair_issues WHERE id = 'runtime-repair-old'").get().status, 'open');
    db.prepare('UPDATE projects SET status = ?, workflow_state = ? WHERE id = ?').run(
        'implementing',
        JSON.stringify({
            planHash: computePlanHash(plan),
            directorSpecs: { backend: {
                domain: 'backend',
                altTalimatname: '# Backend specification',
                teamleaders: [{ name: 'domain.teamleader', prefix: 'domain', mission: 'Backend' }]
            } },
            teamleaderPlans: { 'backend.domain': { tasks: [{
                id: 'backend-prisma-schema',
                title: 'Prisma schema',
                description: 'Schema task',
                dependencies: [],
                targetFiles: ['prisma/schema.prisma'],
                requirementIds: ['REQ-1']
            }] } }
        }),
        project.id
    );

    const leaseOwner = 'workflow-failure-chat-event-test';
    const lease = acquireWorkflowLease(project.id, leaseOwner);
    assert.strictEqual(lease.acquired, true);
    let notificationState = null;
    let taskFailureInjected = false;
    const wsHub = { publish(event) {
        if (event.type === 'project_state_updated') notificationState = getProject(project.id);
        // Fail at the real task boundary before any provider call. An invalid
        // cached plan is replanned now, so an empty target list cannot provide
        // a deterministic task failure for this notification regression.
        if (event.action === 'delegate' && event.node_id?.endsWith('.backend-prisma-schema')) {
            taskFailureInjected = true;
            throw new Error('Controlled task failure: backend-prisma-schema');
        }
    } };
    await executeProjectTasks(project.id, wsHub, lease.attempt.id, leaseOwner);

    assert.ok(taskFailureInjected, 'fixture must reach the intended task failure without an LLM call');
    assert.ok(notificationState, 'workflow must publish a project state update');
    assert.strictEqual(notificationState.status, 'paused');
    assert.match(notificationState.last_error, /backend-prisma-schema/);
    assert.match(notificationState.chatHistory.at(-1).parts[0].text, /backend-prisma-schema/);
    assert.strictEqual(db.prepare('SELECT status FROM workflow_attempts WHERE id = ?').get(lease.attempt.id).status, 'failed');
    console.log('workflow failure chat event test passed');
} finally {
    await isolated.cleanup();
    await fs.rm(process.env.PROJECTS_ROOT, { recursive: true, force: true });
}
