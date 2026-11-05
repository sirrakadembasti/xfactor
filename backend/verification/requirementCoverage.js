const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const validId = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const DERIVED_GATE_NAMES = new Set(['requirement_traceability', 'smoke_gate']);
const DERIVED_KINDS = new Set(['derived_gate', 'derived', 'aggregate', 'aggregate_gate', 'invalid_evidence']);
const DERIVED_PRODUCERS = new Set(['aggregate-verification', 'quality-policy']);
const EVIDENCE_ALIASES = ['evidence', 'evidenceJson', 'evidence_json'];

function isDerived(check) {
    if ([check.name, check.gateName, check.gate_name].some(name => DERIVED_GATE_NAMES.has(name))) return true;
    // Inspect every alias together. Choosing one "canonical" alias could hide a
    // conflicting derived or opaque claim in another alias. Presence, including
    // explicit undefined, is different from absence. Do not parse opaque JSON.
    const pending = [{ evidence: check, depth: 0 }];
    const seen = new Set();
    let inspected = 0;
    while (pending.length) {
        const { evidence, depth } = pending.pop();
        if (++inspected > 128 || depth > 32 || !evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return true;
        if (seen.has(evidence)) return true;
        seen.add(evidence);
        if (DERIVED_KINDS.has(evidence.kind) || DERIVED_PRODUCERS.has(evidence.producer)
            || hasOwn(evidence, 'sourceCheckIds') || hasOwn(evidence, 'sourceGateNames')
            || evidence.derived === true || evidence.aggregate === true || evidence.invalidEvidenceShape === true) return true;
        for (const alias of EVIDENCE_ALIASES) {
            if (hasOwn(evidence, alias)) pending.push({ evidence: evidence[alias], depth: depth + 1 });
        }
    }
    return false;
}

/**
 * Pure fail-closed ownership calculation over authoritative DB requirement IDs.
 * Caller must authenticate check identities/status and execution evidence first;
 * this helper cannot prove that a supplied check really executed. It never
 * infers ownership from contract prose, filenames, success, or aggregate gates.
 */
export function evaluateRequirementCoverage(input = {}) {
    const result = {
        status: 'BLOCKED', passed: false,
        coveredRequirementIds: [], missingRequirementIds: [], unknownRequirementIds: [],
        sources: [], ignoredChecks: [], issues: []
    };
    const mandatoryRequirementIds = input?.mandatoryRequirementIds;
    const checks = input?.checks;
    if (!Array.isArray(mandatoryRequirementIds) || mandatoryRequirementIds.length === 0) {
        result.issues.push({ code: 'missing-authoritative-scope' });
        return result;
    }
    const authoritative = new Set();
    for (const id of mandatoryRequirementIds) {
        if (!validId(id)) result.issues.push({ code: 'malformed-authoritative-id' });
        else if (authoritative.has(id)) result.issues.push({ code: 'duplicate-authoritative-id', requirementId: id });
        else authoritative.add(id);
    }
    result.missingRequirementIds = [...authoritative].sort();
    if (result.issues.length) return result;
    if (!Array.isArray(checks)) {
        result.issues.push({ code: 'malformed-check-list' });
        return result;
    }
    const checkIds = new Set();
    const sources = new Map();
    const unknown = new Set();
    for (const check of checks) {
        if (!check || typeof check !== 'object' || Array.isArray(check)) {
            result.issues.push({ code: 'malformed-check' });
            continue;
        }
        const id = validId(check.id) ? check.id : null;
        let valid = true;
        if (!id) {
            valid = false;
            result.issues.push({ code: 'missing-check-id' });
        } else if (checkIds.has(id)) {
            valid = false;
            result.issues.push({ code: 'duplicate-check-id', checkId: id });
        } else checkIds.add(id);
        if (![check.name, check.gateName, check.gate_name].some(validId)) {
            valid = false;
            result.issues.push({ code: 'missing-check-name', checkId: id });
        }
        const claimed = new Set();
        if (hasOwn(check, 'requirementIds')) {
            if (!Array.isArray(check.requirementIds)) {
                valid = false;
                result.issues.push({ code: 'malformed-check-requirement-list', checkId: id });
            } else for (const requirementId of check.requirementIds) {
                if (!validId(requirementId)) {
                    valid = false;
                    result.issues.push({ code: 'malformed-check-requirement-id', checkId: id });
                } else if (claimed.has(requirementId)) {
                    valid = false;
                    result.issues.push({ code: 'duplicate-check-requirement-id', checkId: id, requirementId });
                } else {
                    claimed.add(requirementId);
                    if (!authoritative.has(requirementId)) {
                        valid = false;
                        unknown.add(requirementId);
                        result.issues.push({ code: 'unknown-requirement-id', checkId: id, requirementId });
                    }
                }
            }
        }
        let ignoredReason = null;
        if (!valid) ignoredReason = 'invalid-claim';
        else if (!['PASS', 'passed'].includes(check.status)) ignoredReason = 'not-passing';
        else if (check.timedOut || check.timed_out || (check.exitCode != null && check.exitCode !== 0)
            || (check.exit_code != null && check.exit_code !== 0)) ignoredReason = 'contradictory-execution';
        else if (isDerived(check)) ignoredReason = 'derived-or-opaque-evidence';
        else if (!claimed.size) ignoredReason = 'no-explicit-ownership';
        if (ignoredReason) {
            result.ignoredChecks.push({ checkId: id, reason: ignoredReason });
            continue;
        }
        for (const requirementId of claimed) {
            if (!sources.has(requirementId)) sources.set(requirementId, new Set());
            sources.get(requirementId).add(id);
        }
    }
    result.coveredRequirementIds = [...sources.keys()].sort();
    result.missingRequirementIds = [...authoritative].filter(id => !sources.has(id)).sort();
    result.unknownRequirementIds = [...unknown].sort();
    result.sources = result.coveredRequirementIds.map(requirementId => ({ requirementId, checkIds: [...sources.get(requirementId)].sort() }));
    result.passed = result.issues.length === 0 && result.missingRequirementIds.length === 0;
    result.status = result.passed ? 'PASS' : 'BLOCKED';
    return result;
}
