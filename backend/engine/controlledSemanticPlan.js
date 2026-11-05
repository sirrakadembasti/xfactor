import { computeAssertionSourceHash, computeAssertionBindingHash, reviewRequirementAssertionBindings } from '../contracts/requirementAssertionBindings.js';
import { digest } from '../verification/workerFailures.js';
import { hashUiLanguageCatalogue, evaluateUiLanguageEvidence } from '../contracts/uiLanguageEvidence.js';

const bindingsFor = (rows, submitted) => {
    if (!Array.isArray(submitted) || !submitted.length || submitted.length > 256) throw Error('Explicit bounded assertion bindings required.');
    const known = new Map(rows.map(row => [row.stable_key, row.id]));
    if (known.size !== rows.length) throw Error('Ambiguous authoritative requirement keys.');
    return submitted.map(binding => {
        if (!binding || !known.has(binding.requirementId)) throw Error('Unknown approved requirement key.');
        return { requirementId: known.get(binding.requirementId), testFile: binding.testFile, testName: binding.testName,
            assertionLine: binding.assertionLine, expectation: binding.expectation };
    });
};

// Synchronous controller trust boundary: submitted reservation flags cannot
// authenticate themselves. Re-read the durable records at each use.
export function authenticateControlledAssertionReservation(ledger, requirements, reservation) {
    try {
        const rows = ledger.validations.filter(row => row.stage === reservation.role);
        if (rows.length !== 1) return false;
        const row = rows[0];
        return ['reviewer', 'tester'].includes(row.stage) && row.id === reservation.reservationId
            && row.role === reservation.role && row.phase === 'passed' && row.result?.approved === true
            && reservation.approved === true && row.sourceHash === reservation.sourceHash
            && row.sourceHash === ledger.reviewedArtifactSourceHash
            && row.planHash === reservation.planHash && row.planHash === ledger.proposal.planHash
            && computeAssertionBindingHash(bindingsFor(requirements, row.result.assertionBindings)) === reservation.bindingHash;
    } catch { return false; }
}

// Diagnostic plans remain useful when independent reviews are unavailable or
// unsupported; they never manufacture assertion ownership or locale approval.
export function controlledObservationRouteTemplates(contract = {}) {
    const candidates = ['/', ...(contract.management?.resources || []).map(resource => resource.uiPath)];
    const pathFor = value => {
        if (typeof value !== 'string') return null;
        if (value.startsWith('/') && !value.startsWith('//')) return value;
        try { const url = new URL(value); return !url.search && !url.hash && ['http:', 'https:'].includes(url.protocol) ? url.pathname : null; } catch { return null; }
    };
    candidates.push(pathFor(contract.management?.authentication?.login), pathFor(contract.browser?.url));
    for (const journey of [contract.browser?.journey, ...(contract.browser?.roleJourneys || [])]) {
        for (const step of journey?.steps || []) if (step.action === 'goto' || step.action === 'navigate') candidates.push(pathFor(step.url || step.path));
    }
    return [...new Set(candidates.filter(route => typeof route === 'string' && route.length <= 300 && route.startsWith('/') && !route.includes('//')
        && (route === '/' || route.slice(1).split('/').every(segment => /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment)
            || (/^[A-Za-z0-9_~.-]+$/.test(segment) && !['.', '..'].includes(segment))))))].sort().slice(0, 100);
}
export function buildControlledVerificationPlan({ ledger, files, requirements, identity, approvedContract = {}, routeTemplates = controlledObservationRouteTemplates(approvedContract), localeObservation = null, authenticateLocaleObservation }) {
    const sourceHash = computeAssertionSourceHash(files);
    const result = { version: 1, contractId: identity.contractId, runId: identity.runId,
        artifactHash: identity.inputSha256, sourceHash, planHash: ledger.proposal.planHash,
        uiLanguageObservation: { binding: { sourceHash, artifactHash: identity.inputSha256,
            contractId: identity.contractId, runId: identity.runId }, routeTemplates } };
    try {
        if (sourceHash !== ledger.reviewedArtifactSourceHash) throw Error('Final reviewed artifact source changed.');
        const rows = ['reviewer', 'tester'].map(role => {
            const matches = ledger.validations.filter(row => row.stage === role);
            if (matches.length !== 1) throw Error('Independent reservation missing or duplicated.');
            return matches[0];
        });
        const bindings = bindingsFor(requirements, rows[0].result?.assertionBindings);
        const bindingHash = computeAssertionBindingHash(bindings);
        const review = { sourceHash, planHash: result.planHash, bindings,
            requirements: requirements.map(row => ({ id: row.id, statement: row.statement,
                statementHash: digest(row.statement), mandatory: row.mandatory === 1 || row.mandatory === true })),
            reservations: rows.map(row => ({ role: row.stage, reservationId: row.id,
                sourceHash: row.sourceHash, planHash: row.planHash, bindingHash, approved: true })) };
        const checked = reviewRequirementAssertionBindings({ ...review, files }, {
            authenticateReservation: reservation => authenticateControlledAssertionReservation(ledger, requirements, reservation) });
        if (checked.status === 'ready') result.assertionReview = review;
    } catch { /* Missing semantics deliberately produces a diagnostic plan. */ }
    try {
        if (sourceHash !== ledger.reviewedArtifactSourceHash || localeObservation?.sourceHash !== sourceHash
            || localeObservation.observationHash !== digest(localeObservation.inventory)
            || authenticateLocaleObservation?.(localeObservation) !== true) throw Error('Authenticated current-source runtime observation required.');
        const rows = ['reviewer', 'tester'].map(role => {
            const matches = ledger.validations.filter(row => row.stage === role);
            if (matches.length !== 1 || matches[0].role !== role || !matches[0].id
                || matches[0].phase !== 'passed' || matches[0].sourceHash !== sourceHash
                || matches[0].planHash !== result.planHash || matches[0].result?.approved !== true
                || matches[0].result.uiLanguageObservationHash !== localeObservation.observationHash) throw Error('Independent locale reservation missing.');
            return matches[0];
        });
        const catalogue = rows[0].result.uiLanguageCatalogue, catalogueHash = hashUiLanguageCatalogue(catalogue);
        if (rows[0].id === rows[1].id || !catalogueHash || catalogueHash !== hashUiLanguageCatalogue(rows[1].result.uiLanguageCatalogue)
            || evaluateUiLanguageEvidence(catalogue, localeObservation.inventory).status !== 'passed') throw Error('Locale reviews disagree or observation is incomplete.');
        result.uiLanguageReview = { catalogue, binding: { sourceHash, artifactHash: identity.inputSha256,
            contractId: identity.contractId, runId: identity.runId, catalogueHash } };
        delete result.uiLanguageObservation;
    } catch { /* Observation remains explicitly advisory until reviewed. */ }
    if (Buffer.byteLength(JSON.stringify(result)) > 262144) {
        delete result.assertionReview;
        delete result.uiLanguageReview;
        result.uiLanguageObservation = { binding: { sourceHash, artifactHash: identity.inputSha256,
            contractId: identity.contractId, runId: identity.runId }, routeTemplates };
    }
    return result;
}
