const interactiveActions = new Set(['click', 'fill', 'submit']);

export function isValidRoleJourney(journey, role, kind) {
    return journey?.role === role && journey.kind === kind
        && (journey.authState === undefined || journey.authState === 'authenticated'
            || (kind === 'negative' && journey.authState === 'anonymous'))
        && Array.isArray(journey.steps)
        && journey.steps.some(step => interactiveActions.has(step.action))
        && journey.steps.filter(step => interactiveActions.has(step.action))
            .every(step => typeof (step.selector || step.target) === 'string' && Boolean((step.selector || step.target).trim()))
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
