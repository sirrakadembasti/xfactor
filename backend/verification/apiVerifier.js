import { URL } from 'url';
import { executeInSandbox } from './sandboxRunner.js';

export async function sendHttpRequest(targetUrl, method = 'GET', data = null, timeoutMs = 5000, options = {}) {
    const adapter = options.adapter;
    if (typeof adapter?.request === 'function') {
        return adapter.request({ url: targetUrl, method, data, timeoutMs, signal: options.signal, env: options.env });
    }
    if (typeof adapter?.execute === 'function') {
        const parsed = new URL(targetUrl);
        const script = "const [url,method,body]=process.argv.slice(1); fetch(url,{method,headers:{'content-type':'application/json','accept':'application/json'},...(body?{body}: {})}).then(async r=>{const text=await r.text();let data=text;try{data=JSON.parse(text)}catch{};process.stdout.write(JSON.stringify({statusCode:r.status,headers:Object.fromEntries(r.headers),rawBody:text,data}))}).catch(e=>{process.stderr.write(e.message);process.exit(1)})";
        const result = await executeInSandbox('node', ['-e', script, parsed.href, method, data == null ? '' : JSON.stringify(data)], { adapter, workspace: options.workspace || '/workspace', timeoutMs, signal: options.signal, env: options.env });
        if (result.passed === false && result.exitCode !== 0) throw new Error(result.stderr || 'Sandbox request failed');
        return JSON.parse(result.stdout || '{}');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('TIMEOUT'), timeoutMs);
    try {
        const res = await fetch(targetUrl, {
            method,
            headers: { 'content-type': 'application/json', 'accept': 'application/json' },
            body: data ? JSON.stringify(data) : undefined,
            signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
        });
        const text = await res.text();
        let parsedData = text;
        try { parsedData = JSON.parse(text); } catch {}
        return {
            statusCode: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            rawBody: text,
            data: parsedData
        };
    } finally {
        clearTimeout(timer);
    }
}

export async function verifyAPIContract(apiBaseUrl, dbPath, contract = {}, options = undefined) {
    if (options !== undefined && options !== null && !options.adapter) {
        return {
            passed: false,
            checks: [{
                name: 'api_status_check',
                status: 'blocked',
                reason: 'API verification requires supplied sandbox adapter.',
                evidence: { adapterId: 'none' }
            }],
            issues: ['API adapter is required.']
        };
    }
    const opts = options || {};
    const checks = [], issues = [];
    const adapter = opts.adapter;
    const adapterId = adapter?.id || 'direct-fetch';
    const domains = Array.isArray(contract.domains) && contract.domains.length ? contract.domains : [{ name: 'items', prefix: 'items' }];
    for (const domain of domains) {
        const prefix = typeof domain === 'string' ? domain : (domain.prefix || domain.name || 'items');
        const url = `${String(apiBaseUrl || '').replace(/\/+$/, '')}/api/${prefix}`;
        const name = `Verification Item ${Date.now()}`;
        let post;
        try {
            post = await sendHttpRequest(url, 'POST', { name, title: name, description: 'Created by XFactor API Verifier' }, opts.timeoutMs || 5000, opts);
            const passed = post.statusCode >= 200 && post.statusCode < 300;
            checks.push({ name: 'api_status_check', status: passed ? 'passed' : 'failed', statusCode: post.statusCode, evidence: { adapterId, method: 'POST', url } });
            if (!passed) issues.push(`POST ${url} returned HTTP ${post.statusCode}`);
        } catch (error) { checks.push({ name: 'api_status_check', status: 'failed', reason: error.message, evidence: { adapterId, method: 'POST', url } }); issues.push(error.message); }
        try {
            const get = await sendHttpRequest(url, 'GET', null, opts.timeoutMs || 5000, opts);
            const passed = get.statusCode >= 200 && get.statusCode < 300;
            checks.push({ name: 'api_query_check', status: passed ? 'passed' : 'failed', statusCode: get.statusCode, evidence: { adapterId, method: 'GET', url } });
            if (!passed) issues.push(`GET ${url} returned HTTP ${get.statusCode}`);
        } catch (error) { checks.push({ name: 'api_query_check', status: 'failed', reason: error.message, evidence: { adapterId, method: 'GET', url } }); issues.push(error.message); }
        if (post?.statusCode >= 200 && post.statusCode < 300) checks.push({ name: 'database_mutation_assertion', status: 'passed', reason: 'Mutation evidence supplied by API adapter response.', evidence: { adapterId, response: post.data ?? post.rawBody } });
        else checks.push({ name: 'database_mutation_assertion', status: 'blocked', reason: 'Mutation assertion requires successful adapter API evidence.' });
    }
    return { passed: checks.every(c => c.status === 'passed') && !issues.length, checks, issues };
}
