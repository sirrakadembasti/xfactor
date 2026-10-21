import crypto from 'node:crypto';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';

export const WORKER_RECEIPT_GATE = 'worker_verification_receipt';
const DETAIL = /^(?:api_role_(?:create|read|update|delete)_(?:allowed|denied)|api_anonymous_(?:mutation_denied|read_policy|update_denied|delete_denied)|api_(?:update|delete)_(?:persistence|denial_persistence)|api_delete_related_retention|api_unverified_mutation_operation|management_(?:runtime_contract|demo_seed|role_login)|browser_management_interaction|database_mutation_assertion)$/;
const IDENTITY = ['version', 'jobId', 'operation', 'projectId', 'contractId', 'contractHash', 'revision', 'artifactId', 'nonce', 'inputSha256', 'runId'];
const stable = value => JSON.stringify(value, (_, part) => part && typeof part === 'object' && !Array.isArray(part)
    ? Object.fromEntries(Object.keys(part).sort().map(key => [key, part[key]])) : part);
const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex');

export function evidencePayload(value) {
    let parsed = value;
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { return {}; } }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function isManagementArtifactDetail(name, contract) {
    return contract?.management?.needed === true && DETAIL.test(name);
}

function checkBody(row, evidence) {
    return { id: row.id, gateName: row.gateName ?? row.gate_name, status: row.status,
        applicability: row.applicability, command: row.command || null, cwd: row.cwd || null,
        exitCode: row.exitCode ?? row.exit_code ?? null, startedAt: row.startedAt ?? row.started_at,
        endedAt: row.endedAt ?? row.ended_at, timedOut: Boolean(row.timedOut ?? row.timed_out),
        stdoutDigest: row.stdoutDigest ?? row.stdout_digest, stderrDigest: row.stderrDigest ?? row.stderr_digest,
        evidence };
}

// Called only after the authenticated worker response identity has been checked.
// This receipt attests to the received action result; it never invents a command
// or process exit code for an HTTP/browser action.
export function bindWorkerCheck(record, identity) {
    const { workerReceipt: _untrustedReceipt, ...evidence } = evidencePayload(record.evidenceJson);
    const receipt = { kind: 'worker_action_receipt', producer: 'artifact-verifier', policyVersion: ACTIVE_POLICY_VERSION,
        ...Object.fromEntries(IDENTITY.map(key => [key, identity[key]])),
        status: 'completed', checkId: record.id, checkDigest: digest(checkBody(record, evidence)) };
    return { ...record, evidenceJson: { ...evidence, workerReceipt: receipt } };
}

export function createWorkerReceipt(identity, records) {
    return { kind: 'worker_verification_receipt', producer: 'artifact-verifier', policyVersion: ACTIVE_POLICY_VERSION,
        ...Object.fromEntries(IDENTITY.map(key => [key, identity[key]])), status: 'completed',
        checkDigests: Object.fromEntries(records.map(record => [record.id, record.evidenceJson.workerReceipt.checkDigest])) };
}

export function assertWorkerReceipt(receipt, expected) {
    if (receipt?.kind !== 'worker_verification_receipt' || receipt.producer !== 'artifact-verifier'
        || receipt.policyVersion !== ACTIVE_POLICY_VERSION || receipt.status !== 'completed'
        || receipt.version !== 1 || receipt.operation !== 'verify_artifact'
        || typeof receipt.jobId !== 'string' || !receipt.jobId || typeof receipt.nonce !== 'string' || !receipt.nonce
        || !receipt.checkDigests || typeof receipt.checkDigests !== 'object') throw new Error('Worker verification receipt is missing or unproven.');
    for (const [key, value] of Object.entries(expected)) {
        if (receipt[key] !== value) throw new Error(`Worker verification receipt identity mismatch: ${key}.`);
    }
}

export function assertWorkerCheck(row, anchor) {
    const { workerReceipt: receipt, ...evidence } = evidencePayload(row.evidence_json ?? row.evidenceJson);
    if (!receipt || receipt.kind !== 'worker_action_receipt' || receipt.producer !== 'artifact-verifier'
        || receipt.policyVersion !== ACTIVE_POLICY_VERSION || receipt.status !== 'completed'
        || receipt.checkId !== row.id || receipt.checkDigest !== anchor?.checkDigests?.[row.id]
        || receipt.checkDigest !== digest(checkBody(row, evidence))
        || Boolean(row.timed_out ?? row.timedOut)) throw new Error(`Check ${row.gate_name ?? row.gateName} lacks bound worker action evidence.`);
    for (const key of IDENTITY) {
        if (receipt[key] !== anchor[key]) throw new Error(`Check ${row.gate_name ?? row.gateName} worker identity mismatch: ${key}.`);
    }
    return evidence;
}

/** Contract coverage is checked by resource/role, never by gate name alone. */
export function assertManagementCoverage(rows, contract) {
    if (contract?.management?.needed !== true) return;
    const management = contract.management;
    const payload = row => {
        const evidence = evidencePayload(row.evidence_json ?? row.evidenceJson);
        return evidence.evidence && typeof evidence.evidence === 'object' ? { ...evidence, ...evidence.evidence } : evidence;
    };
    const requireCheck = (name, match = () => true, context = '') => {
        if (!rows.some(row => (row.gate_name ?? row.gateName) === name && row.status === 'PASS'
            && row.applicability === 'MANDATORY' && match(payload(row)))) {
            throw new Error(`Mandatory management evidence missing: ${name}${context ? ` (${context})` : ''}.`);
        }
    };
    const roles = Array.isArray(management.roles) ? management.roles : [];
    if (!roles.length) throw new Error('Mandatory management role contract is missing.');
    requireCheck('management_demo_seed', evidence => roles.every(role => evidence.roles?.includes(role.name)));
    for (const role of roles) requireCheck('management_role_login', evidence => evidence.role === role.name, role.name);
    requireCheck('browser_management_interaction', evidence => roles.every(role => ['positive', 'negative'].every(kind =>
        evidence.journeys?.some(journey => journey.role === role.name && journey.kind === kind && journey.passed === true))));
    for (const resource of management.resources || []) {
        const operations = resource.operations || [];
        const resourceMatch = evidence => evidence.resource === resource.name;
        const anonymousCreateMatch = evidence => {
            if (evidence.resource !== undefined) return resourceMatch(evidence);
            // The anonymous POST emitter records its exact request URL rather
            // than a resource label. Only a bound local request for this exact
            // approved path can supply that resource's evidence.
            try {
                const target = new URL(evidence.url);
                return evidence.method === 'POST' && target.protocol === 'http:'
                    && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
                    && !target.username && !target.password && !target.search && !target.hash
                    && target.pathname === resource.apiPath
                    && (!contract.api?.baseUrl || target.origin === new URL(contract.api.baseUrl).origin);
            } catch { return false; }
        };
        const required = (name, match = resourceMatch) => requireCheck(name, match, resource.name);
        if (operations.includes('read')) {
            required('api_anonymous_read_policy', evidence => resourceMatch(evidence) && evidence.policy === resource.readAccess);
            const readers = roles.filter(role => role.permissions?.some(permission => permission.resource === resource.name && permission.operations?.includes('read')));
            if (!readers.length) throw new Error(`Mandatory read role is missing for ${resource.name}.`);
            required('api_role_read_allowed', evidence => resourceMatch(evidence) && readers.some(role => evidence.role === role.name));
            if (resource.readAccess !== 'public') {
                for (const role of roles.filter(role => !readers.includes(role))) required('api_role_read_denied', evidence => resourceMatch(evidence) && evidence.role === role.name);
            }
        }
        for (const operation of ['create', 'update', 'delete'].filter(operation => operations.includes(operation))) {
            const allowed = roles.filter(role => role.permissions?.some(permission => permission.resource === resource.name && permission.operations?.includes(operation)));
            if (!allowed.length) throw new Error(`Mandatory ${operation} role is missing for ${resource.name}.`);
            required(`api_role_${operation}_allowed`, evidence => resourceMatch(evidence) && allowed.some(role => evidence.role === role.name));
            for (const role of roles.filter(role => !allowed.includes(role))) required(`api_role_${operation}_denied`, evidence => resourceMatch(evidence) && evidence.role === role.name);
            if (operation === 'create') { required('api_anonymous_mutation_denied', anonymousCreateMatch); required('database_mutation_assertion'); }
            else {
                required(`api_anonymous_${operation}_denied`);
                required(`api_${operation}_denial_persistence`);
                required(`api_${operation}_persistence`);
            }
        }
        if (operations.includes('delete') && ['preserve', 'cascade'].includes(resource.deletionPolicy?.relatedData)) {
            required('api_delete_related_retention', evidence => resourceMatch(evidence) && evidence.policy === resource.deletionPolicy.relatedData);
        }
    }
}
