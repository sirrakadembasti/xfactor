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
                try {
                    const result = await adapter.interact({ url: frontendUrl, role: journey.role, kind: journey.kind,
                        authState: journey.authState || 'authenticated', steps: journey.steps,
                        viewportWidth: 375, signal: opts.signal });
                    observed = validInteractionEvidence(journey, result);
                } catch (error) {
                    journeyEvidence.push({ role: journey.role, kind: journey.kind, passed: false, reason: error.message });
                }
                if (!observed) allPassed = false;
                if (!journeyEvidence.some(item => item.role === journey.role && item.kind === journey.kind)) {
                    journeyEvidence.push({ role: journey.role, kind: journey.kind, passed: observed });
                }
            }
            checks.push({ name: 'browser_management_interaction', status: allPassed ? 'passed' : 'failed',
                evidence: { adapterId, roles, journeyCount: roleJourneys.length, journeys: journeyEvidence } });
            if (!allPassed) issues.push('At least one role browser journey failed or lacked visible/accessibility evidence.');
        }
    }
    return { passed: checks.every(c => c.status === 'passed'), checks, issues };
}
