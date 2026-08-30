export const MANDATORY_GATES = [
    'package_json',
    'lockfile',
    'ast_import_inventory',
    'clean_install',
    'typecheck',
    'framework_build'
];

export const OPTIONAL_GATES = [
    'prisma_validate'
];

function normalizeGateStatus(status) {
    if (!status) return 'BLOCKED';
    const s = String(status).toUpperCase();
    if (s === 'PASSED' || s === 'PASS') return 'PASS';
    if (s === 'FAILED' || s === 'FAIL') return 'FAIL';
    if (s === 'BLOCKED') return 'BLOCKED';
    if (s === 'SKIPPED' || s === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
    return 'BLOCKED';
}

export function evaluateVerificationRun({
    checks = [],
    gates = [],
    agentApproved = null,
    agentSummary = '',
    requiredGates = MANDATORY_GATES
} = {}) {
    const rawList = Array.isArray(checks) && checks.length > 0 ? checks : (Array.isArray(gates) ? gates : []);
    const checkMap = new Map();
    for (const check of rawList) {
        const name = check.gateName || check.name;
        if (name) {
            checkMap.set(name, {
                name,
                status: normalizeGateStatus(check.status),
                applicability: check.applicability || (MANDATORY_GATES.includes(name) ? 'MANDATORY' : 'OPTIONAL'),
                reason: check.reason || check.stderr || ''
            });
        }
    }

    const failedGates = [];
    const blockedGates = [];
    const missingGates = [];
    const passedGates = [];

    for (const reqGate of requiredGates) {
        const check = checkMap.get(reqGate);
        if (!check) {
            missingGates.push(reqGate);
            continue;
        }

        if (check.status === 'FAIL') {
            failedGates.push(reqGate);
        } else if (check.status === 'BLOCKED') {
            blockedGates.push(reqGate);
        } else if (check.status === 'PASS') {
            passedGates.push(reqGate);
        }
    }

    // Check optional gates for failures
    for (const [name, check] of checkMap.entries()) {
        if (!requiredGates.includes(name)) {
            if (check.status === 'FAIL') {
                failedGates.push(name);
            }
        }
    }

    let status = 'PASS';
    if (failedGates.length > 0) {
        status = 'FAIL';
    } else if (blockedGates.length > 0 || missingGates.length > 0) {
        status = 'BLOCKED';
    }

    const passed = status === 'PASS';

    return {
        passed,
        status,
        failedGates,
        blockedGates,
        missingGates,
        passedGates,
        advisory: {
            agentApproved: Boolean(agentApproved),
            agentSummary: String(agentSummary || '')
        }
    };
}
