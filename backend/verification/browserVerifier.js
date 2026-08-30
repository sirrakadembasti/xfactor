import http from 'http';
import https from 'https';
import { URL } from 'url';

async function fetchHtml(targetUrl, timeoutMs = 5000) {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.get(targetUrl, { timeout: timeoutMs }, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode || 0,
                    headers: res.headers,
                    html: body
                });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`HTML fetch timed out after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

function matchElementInHtml(html, selector) {
    if (!html || typeof html !== 'string' || !selector || typeof selector !== 'string') {
        return false;
    }

    const trimmed = selector.trim();

    // 1. ID selector: #app, #item-input
    if (trimmed.startsWith('#')) {
        const id = trimmed.slice(1);
        const idRegex = new RegExp(`id=["']${id}["']`, 'i');
        return idRegex.test(html);
    }

    // 2. Class selector: .btn, .header
    if (trimmed.startsWith('.')) {
        const className = trimmed.slice(1);
        const classRegex = new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["']`, 'i');
        return classRegex.test(html);
    }

    // 3. Tag selector: h1, button, input, div
    const tagRegex = new RegExp(`<${trimmed}\\b[^>]*>`, 'i');
    return tagRegex.test(html);
}

function matchTextInHtml(html, expectedText, selector = null) {
    if (!html || typeof html !== 'string' || !expectedText) {
        return false;
    }

    if (!html.includes(expectedText)) {
        return false;
    }

    if (selector) {
        return matchElementInHtml(html, selector);
    }

    return true;
}

export async function verifyBrowserJourney(frontendUrl, journeySpec = {}, options = {}) {
    const checks = [];
    const issues = [];

    let currentHtml = '';
    const timeoutMs = options.timeoutMs || 5000;

    // 1. Sayfa Yükleme Denetimi
    try {
        const response = await fetchHtml(frontendUrl, timeoutMs);
        if (response.statusCode >= 200 && response.statusCode < 300) {
            currentHtml = response.html;
            checks.push({
                name: 'browser_page_load',
                status: 'passed',
                reason: `Loaded frontend page at ${frontendUrl} (HTTP ${response.statusCode}).`,
                statusCode: response.statusCode
            });
        } else {
            checks.push({
                name: 'browser_page_load',
                status: 'failed',
                reason: `Frontend page responded with HTTP ${response.statusCode}.`,
                statusCode: response.statusCode
            });
            issues.push(`Frontend page responded with HTTP ${response.statusCode}.`);
            return { passed: false, checks, issues };
        }
    } catch (err) {
        checks.push({
            name: 'browser_page_load',
            status: 'failed',
            reason: `Failed to load frontend at ${frontendUrl}: ${err.message}`
        });
        issues.push(`Failed to load frontend at ${frontendUrl}: ${err.message}`);
        return { passed: false, checks, issues };
    }

    // 2. Journey Adımları Yürütme ve DOM Doğrulama
    const steps = Array.isArray(journeySpec.steps) ? journeySpec.steps : [];
    let allStepsPassed = true;

    for (let idx = 0; idx < steps.length; idx++) {
        const step = steps[idx];
        const stepName = `step_${idx + 1}_${step.action || 'action'}`;

        if (step.action === 'navigate' || step.action === 'reload') {
            try {
                const targetUrl = step.url || frontendUrl;
                const reloadRes = await fetchHtml(targetUrl, timeoutMs);
                if (reloadRes.statusCode >= 200 && reloadRes.statusCode < 300) {
                    currentHtml = reloadRes.html;
                } else {
                    allStepsPassed = false;
                    issues.push(`Step ${idx + 1} (${step.action}) failed with HTTP ${reloadRes.statusCode}.`);
                }
            } catch (navErr) {
                allStepsPassed = false;
                issues.push(`Step ${idx + 1} (${step.action}) network error: ${navErr.message}`);
            }
        } else if (step.action === 'assert_element') {
            const exists = matchElementInHtml(currentHtml, step.selector);
            if (!exists) {
                allStepsPassed = false;
                issues.push(`Step ${idx + 1} (assert_element): Element matching selector "${step.selector}" not found in DOM.`);
            }
        } else if (step.action === 'assert_text') {
            const hasText = matchTextInHtml(currentHtml, step.expectedText, step.selector);
            if (!hasText) {
                allStepsPassed = false;
                issues.push(`Step ${idx + 1} (assert_text): Expected text "${step.expectedText}" not found in DOM.`);
            }
        }
    }

    if (allStepsPassed) {
        checks.push({
            name: 'browser_journey_steps',
            status: 'passed',
            reason: `All ${steps.length} browser journey DOM assertions and flow steps passed.`
        });
    } else {
        checks.push({
            name: 'browser_journey_steps',
            status: 'failed',
            reason: `Browser journey failed with ${issues.length} issue(s).`
        });
    }

    const allPassed = checks.every(c => c.status === 'passed');
    return {
        passed: allPassed && issues.length === 0,
        checks,
        issues
    };
}
