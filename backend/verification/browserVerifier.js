function matchElement(html, selector) { if (!html || !selector) return false; const s = selector.trim(); if (s.startsWith('#')) return new RegExp(`id=["']${s.slice(1)}["']`, 'i').test(html); if (s.startsWith('.')) return new RegExp(`class=["'][^"']*\\b${s.slice(1)}\\b`, 'i').test(html); return new RegExp(`<${s}\\b`, 'i').test(html); }
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

    const request = async url => {
        if (typeof adapter?.request === 'function') {
            return adapter.request({ url, method: 'GET', timeoutMs: opts.timeoutMs || 5000, signal: opts.signal });
        }
        if (typeof adapter?.execute === 'function') {
            const result = await adapter.execute({ command: 'node', args: ['-e', `fetch(${JSON.stringify(url)}).then(async r=>process.stdout.write(JSON.stringify({statusCode:r.status,html:await r.text()}))).catch(e=>{console.error(e.message);process.exit(1)})`], workspace: opts.workspace || '/workspace', timeoutMs: opts.timeoutMs || 5000, signal: opts.signal });
            if (result.exitCode && result.exitCode !== 0) throw new Error(result.stderr || 'Sandbox browser request failed');
            return JSON.parse(result.stdout || '{}');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort('TIMEOUT'), opts.timeoutMs || 5000);
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
        }
    }

    checks.push({ name: 'browser_journey_steps', status: issues.length ? 'failed' : 'passed', evidence: { adapterId, stepCount: journeySpec.steps?.length || 0 } });
    return { passed: checks.every(c => c.status === 'passed'), checks, issues };
}
