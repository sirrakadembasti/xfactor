const interactiveActions = new Set(['click', 'fill', 'submit', 'select']);
const supportedActions = new Set([...interactiveActions, 'navigate', 'reload', 'assert_text', 'assert_element']);

function validInteractiveStep(step) {
    if (typeof (step.selector || step.target) !== 'string' || !(step.selector || step.target).trim()) return false;
    if (step.action === 'select') {
        const label = Object.prototype.hasOwnProperty.call(step, 'optionLabel');
        const index = Object.prototype.hasOwnProperty.call(step, 'optionIndex');
        return label !== index && (label
            ? typeof step.optionLabel === 'string' && Boolean(step.optionLabel.trim())
            : Number.isInteger(step.optionIndex) && step.optionIndex >= 0 && step.optionIndex <= 1000);
    }
    if (step.action === 'fill') {
        const value = step.value ?? step.text;
        if (typeof value !== 'string') return false;
        if (value === '{nonce}') return true;
        const date = /^\{date:([+-])(\d{1,4})d\}$/.exec(value);
        return date ? Number(date[2]) <= 3650 : !/[{}]/.test(value);
    }
    return true;
}

export function isValidRoleJourney(journey, role, kind) {
    return journey?.role === role && journey.kind === kind
        && (journey.authState === undefined || journey.authState === 'authenticated'
            || (kind === 'negative' && journey.authState === 'anonymous'))
        && Array.isArray(journey.steps)
        && journey.steps.every(step => step && supportedActions.has(step.action))
        && journey.steps.some(step => interactiveActions.has(step.action))
        && journey.steps.filter(step => interactiveActions.has(step.action))
            .every(validInteractiveStep)
        && journey.expectedOutcome?.kind === (kind === 'negative' ? 'denied' : 'success')
        && typeof journey.expectedOutcome.text === 'string' && Boolean(journey.expectedOutcome.text.trim());
}

export function hasRoleJourneyCoverage(journeys, roles) {
    return Array.isArray(journeys) && Array.isArray(roles) && roles.length > 0
        && roles.every(role => ['positive', 'negative'].every(kind =>
            journeys.some(journey => isValidRoleJourney(journey, role, kind))));
}

export function interactiveJourneySteps(journey) {
    return journey.steps.filter(step => interactiveActions.has(step.action));
}
