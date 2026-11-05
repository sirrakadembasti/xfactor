import { evaluateUiLanguageEvidence, hashUiLanguageCatalogue } from '../contracts/uiLanguageEvidence.js';
import { hasRoleJourneyCoverage, interactiveJourneySteps } from '../contracts/browserJourneyContract.js';
function matchElement(html, selector) { if (!html || !selector) return false; const s = selector.trim(); if (s.startsWith('#')) return new RegExp(`id=["']${s.slice(1)}["']`, 'i').test(html); if (s.startsWith('.')) return new RegExp(`class=["'][^"']*\\b${s.slice(1)}\\b`, 'i').test(html); return new RegExp(`<${s}\\b`, 'i').test(html); }
function validInteractionEvidence(journey, result) {
    const sessionObserved = journey.authState === 'anonymous'
        ? result?.session?.anonymous === true && result.session.authenticatedRole == null
        : result?.session?.authenticatedRole === journey.role;
    if (result?.passed !== true || !sessionObserved) return false;
    const actions = interactiveJourneySteps(journey);
    if (!Array.isArray(result.actions) || result.actions.length !== actions.length) return false;
    if (!actions.every((step, index) => {
        const observed = result.actions[index];
        return observed?.index === index && observed.action === step.action
            && observed.target === (step.selector || step.target) && observed.completed === true
            && typeof observed.accessibleName === 'string' && Boolean(observed.accessibleName.trim())
            && observed.keyboardReachable === true;
    })) return false;
    return result.outcome?.kind === journey.expectedOutcome.kind
        && result.outcome?.visible === true
        && typeof result.outcome.text === 'string'
        && result.outcome.text.includes(journey.expectedOutcome.text)
        && Number.isFinite(result.viewport?.width) && result.viewport.width <= 390
        && result.viewport.width >= 320 && result.viewport.horizontalOverflow === false;
}
export async function verifyBrowserJourney(frontendUrl, journeySpec = {}, options = undefined) {
    if (options !== undefined && options !== null && !options.adapter) {
        return {
            passed: false,
            checks: [{
                name: 'browser_page_load',
                status: 'blocked',
                reason: 'Browser verification requires supplied sandbox adapter.',
                evidence: { adapterId: 'none' }
            }],
            issues: ['Browser adapter is required.']
        };
    }
    const opts = options || {};
    const adapter = opts.adapter;
    const adapterId = adapter?.id || 'direct-fetch';
    const checks = [], issues = [];
    const languageRequired = opts.uiLanguageRequired === true || opts.uiLanguageReview !== undefined || opts.uiLanguageObservation !== undefined;
    const review = opts.uiLanguageReview;
    const expectedBinding = opts.uiLanguageBinding;
    const bindingFields = ['sourceHash', 'artifactHash', 'contractId', 'runId', 'catalogueHash'];
    const boundReview = languageRequired && review?.catalogue?.reviewed === true
        && bindingFields.every(field => typeof expectedBinding?.[field] === 'string' && expectedBinding[field].length > 0 && expectedBinding[field].length <= 200
            && review?.binding?.[field] === expectedBinding[field])
        && ['sourceHash', 'artifactHash', 'catalogueHash'].every(field => /^[a-f0-9]{64}$/.test(expectedBinding[field]))
        && hashUiLanguageCatalogue(review.catalogue) === expectedBinding.catalogueHash;
    const observation = opts.uiLanguageObservation;
    const observationBinding = opts.uiLanguageObservationBinding;
    const observationFields = ['sourceHash', 'artifactHash', 'contractId', 'runId'];
    const templates = observation?.routeTemplates;
    const validTemplates = Array.isArray(templates) && templates.length > 0 && templates.length <= 100
        && new Set(templates).size === templates.length && templates.every(route => typeof route === 'string' && route.length <= 300
            && route.startsWith('/') && !route.includes('//') && (route === '/' || route.slice(1).split('/').every(segment =>
                /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment) || (/^[A-Za-z0-9_~.-]+$/.test(segment) && !['.', '..'].includes(segment)))));
    const boundObservation = !boundReview && validTemplates && observationFields.every(field =>
        typeof observationBinding?.[field] === 'string' && observationBinding[field].length > 0 && observationBinding[field].length <= 200
        && observation?.binding?.[field] === observationBinding[field])
        && ['sourceHash', 'artifactHash'].every(field => /^[a-f0-9]{64}$/.test(observationBinding[field]));
    const captureLanguage = boundReview || boundObservation;
    const routeTemplates = boundReview ? [...new Set(Array.isArray(review.catalogue.surfaces) ? review.catalogue.surfaces.map(surface => surface?.route) : [])] : boundObservation ? [...templates] : [];
    const languageInventory = { version: 1, truncated: false, snapshots: [] };
    let languageBytes = 64;
    const retainLanguage = (result, journey) => {
        const inventory = result?.uiLanguageEvidence;
        if (!inventory || inventory.version !== 1 || !Array.isArray(inventory.snapshots)) { languageInventory.truncated = true; return; }
        if (inventory.truncated !== false || result.passed !== true || inventory.snapshots.length > 100) languageInventory.truncated = true;
        const role = journey.authState === 'anonymous' ? 'anonymous' : journey.role;
        for (const raw of inventory.snapshots.slice(0, 100)) {
            if (languageInventory.snapshots.length >= 200) { languageInventory.truncated = true; break; }
            // Operator worker fields only: never retain arbitrary metadata, DOM IDs,
            // actual URL parameters, source text, or exception messages.
            const snapshot = { route: '<unavailable>', role, state: 'unavailable', entries: [], truncated: true };
            if (raw && routeTemplates.includes(raw.route) && raw.role === role && typeof raw.state === 'string'
                && /^(?:initial|outcome|(?:before|after):[0-9]{1,4})$/.test(raw.state) && Array.isArray(raw.entries)) {
                snapshot.route = raw.route; snapshot.state = raw.state;
                snapshot.truncated = raw.truncated !== false || raw.entries.length > 400;
                snapshot.redacted = raw.redacted === true;
                if (raw.error) { snapshot.error = 'inventory_unavailable'; snapshot.truncated = true; }
                for (const entry of raw.entries.slice(0, 400)) {
                    if (!entry || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 500
                        || !['text', 'aria-label', 'aria-labelledby', 'alt', 'title', 'placeholder', 'label', 'button-value'].includes(entry.kind)) { snapshot.truncated = true; continue; }
                    if (/\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(entry.text)) { snapshot.redacted = true; continue; }
                    const projected = { kind: entry.kind, text: entry.text };
                    if (entry.anchor !== undefined) {
                        if (typeof entry.anchor !== 'string' || entry.anchor.length > 2048 || !/^[a-z][a-z0-9-]*:nth-child\([1-9]\d*\)(?:>[a-z][a-z0-9-]*:nth-child\([1-9]\d*\))*$/.test(entry.anchor)) { snapshot.truncated = true; continue; }
                        projected.anchor = entry.anchor;
                    }
                    snapshot.entries.push(projected);
                }
            } else snapshot.error = 'inventory_unavailable';
            const size = Buffer.byteLength(JSON.stringify(snapshot), 'utf8') + 1;
            if (languageBytes + size > 262144) { languageInventory.truncated = true; break; }
            languageBytes += size;
            if (snapshot.truncated || snapshot.redacted) languageInventory.truncated = true;
            languageInventory.snapshots.push(snapshot);
        }
    };
    let html = '';
    const requestTimeoutMs = opts.timeoutMs || 60000;

    const request = async url => {
        if (typeof adapter?.request === 'function') {
            return adapter.request({ url, method: 'GET', timeoutMs: requestTimeoutMs, signal: opts.signal });
        }
        if (typeof adapter?.execute === 'function') {
            const result = await adapter.execute({ command: 'node', args: ['-e', `fetch(${JSON.stringify(url)}).then(async r=>process.stdout.write(JSON.stringify({statusCode:r.status,html:await r.text()}))).catch(e=>{console.error(e.message);process.exit(1)})`], workspace: opts.workspace || '/workspace', timeoutMs: requestTimeoutMs, signal: opts.signal });
            if (result.exitCode && result.exitCode !== 0) throw new Error(result.stderr || 'Sandbox browser request failed');
            return JSON.parse(result.stdout || '{}');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort('TIMEOUT'), requestTimeoutMs);
        try {
            const res = await fetch(url, {
                signal: opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal
            });
            const text = await res.text();
            return { statusCode: res.status, html: text, body: text };
        } finally {
            clearTimeout(timer);
        }
    };

    try {
        const r = await request(frontendUrl);
        html = r.html || r.body || r.rawBody || '';
        const ok = (r.statusCode || 0) >= 200 && (r.statusCode || 0) < 300;
        checks.push({ name: 'browser_page_load', status: ok ? 'passed' : 'failed', statusCode: r.statusCode, evidence: { adapterId, url: frontendUrl } });
        if (!ok) issues.push(`Frontend page responded with HTTP ${r.statusCode}`);
    } catch (e) {
        checks.push({ name: 'browser_page_load', status: 'failed', reason: e.message, evidence: { adapterId } });
        issues.push(e.message);
    }

    for (const [idx, step] of (Array.isArray(journeySpec.steps) ? journeySpec.steps : []).entries()) {
        if (step.action === 'navigate' || step.action === 'reload') {
            try {
                const r = await request(step.url || frontendUrl);
                html = r.html || r.body || r.rawBody || '';
                if (!(r.statusCode >= 200 && r.statusCode < 300)) issues.push(`Step ${idx + 1} failed with HTTP ${r.statusCode}`);
            } catch (e) {
                issues.push(`Step ${idx + 1}: ${e.message}`);
            }
        } else if (step.action === 'assert_element' && !matchElement(html, step.selector)) {
            issues.push(`Element ${step.selector} not found`);
        } else if (step.action === 'assert_text' && (!html.includes(step.expectedText) || (step.selector && !matchElement(html, step.selector)))) {
            issues.push(`Expected text ${step.expectedText} not found`);
        } else if (!['navigate', 'reload', 'assert_element', 'assert_text'].includes(step.action)) {
            issues.push(`Unsupported browser action ${step.action}; an interactive browser adapter is required.`);
        }
    }

    checks.push({ name: 'browser_journey_steps', status: issues.length ? 'failed' : 'passed', evidence: { adapterId, stepCount: journeySpec.steps?.length || 0 } });
    if (opts.management?.needed === true) {
        const roleJourneys = Array.isArray(opts.roleJourneys) ? opts.roleJourneys : [];
        const roles = Array.isArray(opts.management.roles) ? opts.management.roles.map(role => role.name) : [];
        const hasCoverage = hasRoleJourneyCoverage(roleJourneys, roles);
        if (!hasCoverage || typeof adapter?.interact !== 'function') {
            checks.push({ name: 'browser_management_interaction', status: 'blocked',
                reason: 'Every role needs positive and negative interactive journeys and an interactive sandbox browser adapter.',
                evidence: { adapterId, roles, journeyCount: roleJourneys.length } });
            issues.push('Management browser journeys lack interactive role evidence.');
        } else {
            let allPassed = true;
            const journeyEvidence = [];
            for (const journey of roleJourneys) {
                let observed = false;
                let displayProfile;
                try {
                    const result = await adapter.interact({ url: frontendUrl, role: journey.role, kind: journey.kind,
                        authState: journey.authState || 'authenticated', steps: journey.steps,
                        expectedOutcome: journey.expectedOutcome,
                        viewportWidth: 375, signal: opts.signal,
                        ...(captureLanguage ? { uiLanguageEvidence: { enabled: true,
                            routeTemplates,
                            maxTotalBytes: 131072, maxSnapshots: 100, maxEntries: 400, maxTextLength: 500 } } : {}) });
                    observed = validInteractionEvidence(journey, result);
                    if (observed && result.session?.displayProfile) {
                        const fields = {};
                        for (const field of ['displayName', 'roleDisplayName']) {
                            const value = result.session.displayProfile[field];
                            if (typeof value === 'string' && value.trim() && value.length <= 120
                                && !/[\u0000-\u001f\u007f]|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) fields[field] = value;
                        }
                        if (Object.keys(fields).length) displayProfile = fields;
                    }
                    if (captureLanguage) {
                        if (!observed) languageInventory.truncated = true;
                        retainLanguage(result, journey);
                    }
                } catch (error) {
                    if (captureLanguage) languageInventory.truncated = true;
                    journeyEvidence.push({ role: journey.role, kind: journey.kind, passed: false, reason: error.message });
                }
                if (!observed) allPassed = false;
                if (!journeyEvidence.some(item => item.role === journey.role && item.kind === journey.kind)) {
                    journeyEvidence.push({ role: journey.role, kind: journey.kind, passed: observed, ...(displayProfile ? { displayProfile } : {}) });
                }
            }
            checks.push({ name: 'browser_management_interaction', status: allPassed ? 'passed' : 'failed',
                evidence: { adapterId, roles, journeyCount: roleJourneys.length, journeys: journeyEvidence } });
            if (!allPassed) issues.push('At least one role browser journey failed or lacked visible/accessibility evidence.');
        }
    }
    if (languageRequired) {
        const evaluation = boundReview ? evaluateUiLanguageEvidence(review.catalogue, languageInventory)
            : { status: 'blocked', failures: [], blockers: ['Independent catalogue review bound to the current source, artifact, contract and run is required.'], scope: 'declared-surfaces' };
        checks.push({ name: 'ui_language_evidence', status: evaluation.status,
            evidence: { adapterId, ...evaluation, fullProductProof: false,
                ...(boundReview ? { binding: { ...expectedBinding }, inventory: languageInventory }
                    : boundObservation ? { advisory: true, needsReview: true,
                        observationBinding: Object.fromEntries(observationFields.map(field => [field, observationBinding[field]])), inventory: languageInventory } : {}) } });
        if (evaluation.status !== 'passed') issues.push('Turkish interface evidence is incomplete or failed for the declared surfaces.');
    }
    return { passed: checks.every(c => c.status === 'passed'), checks, issues };
}
