import { evaluateRequirementAssertionExecution } from '../contracts/requirementAssertionBindings.js';
import { evaluateUiLanguageEvidence, hashUiLanguageCatalogue } from '../contracts/uiLanguageEvidence.js';
import { computeAssertionSourceHash } from '../contracts/requirementAssertionBindings.js';

const checkName = check => check.gateName || check.gate_name || check.name;
const evidenceFor = check => check.evidence || check.evidenceJson || check.evidence_json;
const requireThat = (condition, message) => { if (!condition) throw Error(message); };

// Pure checker used twice: authenticated live worker response, then canonical
// persisted worker receipts inside the final synchronous completion transaction.
export function inspectControlledSemanticEvidence({ plan, files, checks, identity, authenticateReservation, authenticateReceipt }) {
    try {
        requireThat(plan?.assertionReview && plan?.uiLanguageReview, 'Both authoritative reviewed semantics are required.');
        requireThat(plan.sourceHash === computeAssertionSourceHash(files) && plan.contractId === identity.contractId
            && plan.runId === identity.runId && plan.artifactHash === identity.inputSha256, 'Semantic artifact identity changed.');
        const one = name => {
            const rows = checks.filter(check => checkName(check) === name);
            requireThat(rows.length === 1 && ['PASS', 'passed'].includes(rows[0].status), `Exactly one passing ${name} proof required.`);
            requireThat(authenticateReceipt(rows[0]) === true, 'Canonical worker receipt authentication required.');
            return rows[0];
        };
        const assertion = one('requirement_assertions'), assertionEvidence = evidenceFor(assertion);
        const execution = assertionEvidence?.assertionExecution;
        const expectedExecution = { jobId: identity.jobId, runId: identity.runId, artifactId: identity.artifactId,
            artifactHash: identity.inputSha256, contractId: identity.contractId,
            checkId: assertionEvidence?.workerSourceCheckId || assertion.id, sourceHash: plan.sourceHash,
            ...(identity.authorizedWindow ? { authorizedWindow: identity.authorizedWindow } : {}) };
        const evaluated = evaluateRequirementAssertionExecution({ ...plan.assertionReview, files, execution, expectedExecution }, {
            authenticateReservation, authenticateReceipt: () => true });
        requireThat(evaluated.status === 'passed', evaluated.issues.join('; '));
        const locale = one('ui_language_evidence'), localeEvidence = evidenceFor(locale), review = plan.uiLanguageReview;
        const expectedBinding = { sourceHash: plan.sourceHash, artifactHash: plan.artifactHash,
            contractId: identity.contractId, runId: identity.runId, catalogueHash: hashUiLanguageCatalogue(review.catalogue) };
        requireThat(Object.entries(expectedBinding).every(([key, value]) => value && localeEvidence?.binding?.[key] === value
            && review.binding?.[key] === value), 'Locale catalogue/source/run binding changed.');
        requireThat(localeEvidence.advisory !== true && localeEvidence.needsReview !== true, 'Advisory locale observation cannot authorize acceptance.');
        const language = evaluateUiLanguageEvidence(review.catalogue, localeEvidence.inventory);
        requireThat(language.status === 'passed', 'Fresh runtime locale inventory did not pass reviewed catalogue.');
        return { passed: true, controlledAcceptancePolicy: 'controlled-acceptance-v1', sourceHash: plan.sourceHash,
            artifactHash: plan.artifactHash, contractId: identity.contractId, runId: identity.runId,
            assertionBindingHash: evaluated.bindingHash, localeCatalogueHash: expectedBinding.catalogueHash };
    } catch (error) { return { passed: false, reason: error.message }; }
}
