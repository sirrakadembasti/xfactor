import { URL } from 'url';
import { executeInSandbox } from './sandboxRunner.js';

export async function sendHttpRequest(targetUrl, method = 'GET', data = null, timeoutMs = 5000, options = {}) {
    const adapter = options.adapter;
    if (typeof adapter?.request === 'function') {
        return adapter.request({ url: targetUrl, method, data, timeoutMs, signal: options.signal, env: options.env });
    }
    if (typeof adapter?.execute !== 'function') throw Object.assign(new Error('SANDBOX_UNAVAILABLE: API adapter is required.'), { code: 'SANDBOX_UNAVAILABLE' });
    const parsed = new URL(targetUrl);
    const script = "const [url,method,body]=process.argv.slice(1); fetch(url,{method,headers:{'content-type':'application/json','accept':'application/json'},...(body?{body}: {})}).then(async r=>{const text=await r.text();let data=text;try{data=JSON.parse(text)}catch{};process.stdout.write(JSON.stringify({statusCode:r.status,headers:Object.fromEntries(r.headers),rawBody:text,data}))}).catch(e=>{process.stderr.write(e.message);process.exit(1)})";
    const result = await executeInSandbox('node', ['-e', script, parsed.href, method, data == null ? '' : JSON.stringify(data)], { adapter, workspace: options.workspace || '/workspace', timeoutMs, signal: options.signal, env: options.env });
    if (result.passed === false && result.exitCode !== 0) throw new Error(result.stderr || 'Sandbox request failed');
    return JSON.parse(result.stdout || '{}');
}

export async function verifyAPIContract(apiBaseUrl, dbPath, contract = {}, options = {}) {
    const checks = [], issues = [];
    const adapter = options.adapter;
    if (!adapter || (typeof adapter.request !== 'function' && typeof adapter.execute !== 'function')) {
        return { passed: false, checks: [{ name: 'api_adapter', status: 'blocked', reason: 'API verification requires supplied sandbox adapter evidence.' }], issues: ['API adapter is required.'] };
    }
    const domains = Array.isArray(contract.domains) && contract.domains.length ? contract.domains : [{ name: 'items', prefix: 'items' }];
    for (const domain of domains) {
        const prefix = typeof domain === 'string' ? domain : (domain.prefix || domain.name || 'items');
        const url = `${String(apiBaseUrl || '').replace(/\/+$/, '')}/api/${prefix}`;
        const name = `Verification Item ${Date.now()}`;
        let post;
        try {
            post = await sendHttpRequest(url, 'POST', { name, title: name, description: 'Created by XFactor API Verifier' }, options.timeoutMs || 5000, options);
            const passed = post.statusCode >= 200 && post.statusCode < 300;
            checks.push({ name: 'api_status_check', status: passed ? 'passed' : 'failed', statusCode: post.statusCode, evidence: { adapterId: adapter.id, method: 'POST', url } });
            if (!passed) issues.push(`POST ${url} returned HTTP ${post.statusCode}`);
        } catch (error) { checks.push({ name: 'api_status_check', status: 'failed', reason: error.message, evidence: { adapterId: adapter.id, method: 'POST', url } }); issues.push(error.message); }
        try {
            const get = await sendHttpRequest(url, 'GET', null, options.timeoutMs || 5000, options);
            const passed = get.statusCode >= 200 && get.statusCode < 300;
            checks.push({ name: 'api_query_check', status: passed ? 'passed' : 'failed', statusCode: get.statusCode, evidence: { adapterId: adapter.id, method: 'GET', url } });
            if (!passed) issues.push(`GET ${url} returned HTTP ${get.statusCode}`);
        } catch (error) { checks.push({ name: 'api_query_check', status: 'failed', reason: error.message, evidence: { adapterId: adapter.id, method: 'GET', url } }); issues.push(error.message); }
        if (post?.statusCode >= 200 && post.statusCode < 300) checks.push({ name: 'database_mutation_assertion', status: 'passed', reason: 'Mutation evidence supplied by API adapter response.', evidence: { adapterId: adapter.id, response: post.data ?? post.rawBody } });
        else checks.push({ name: 'database_mutation_assertion', status: 'blocked', reason: 'Mutation assertion requires successful adapter API evidence.' });
    }
    return { passed: checks.every(c => c.status === 'passed') && !issues.length, checks, issues };
}
