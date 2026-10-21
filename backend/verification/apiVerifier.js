import { URL } from 'url';
import { executeInSandbox } from './sandboxRunner.js';
import { isDeepStrictEqual } from 'node:util';
import { randomBytes } from 'node:crypto';

// Correlation values must also fit bounded domain fields, including fixture suffixes.
function probeNonce() { return randomBytes(9).toString('base64url'); }

function containsCreatedRecord(value, createdId, nonce, identityField = null) {
    if (Array.isArray(value)) return value.some(item => containsCreatedRecord(item, createdId, nonce, identityField));
    if (!value || typeof value !== 'object') return false;
    if ((identityField ? value[identityField] === nonce : value.name === nonce || value.title === nonce)
        && (createdId == null || String(value.id ?? '') === String(createdId))) return true;
    return Object.values(value).some(item => typeof item === 'object' && containsCreatedRecord(item, createdId, nonce, identityField));
}
function findRecordById(value, id) {
    if (Array.isArray(value)) return value.map(item => findRecordById(item, id)).find(Boolean) || null;
    if (!value || typeof value !== 'object') return null;
    if (String(value.id ?? '') === String(id)) return value;
    return Object.values(value).map(item => typeof item === 'object' ? findRecordById(item, id) : null).find(Boolean) || null;
}
function findRecordByNonce(value, nonce, identityField = null) {
    if (Array.isArray(value)) return value.map(item => findRecordByNonce(item, nonce, identityField)).find(Boolean) || null;
    if (!value || typeof value !== 'object') return null;
    if ((identityField ? value[identityField] === nonce : value.name === nonce || value.title === nonce) && value.id != null) return value;
    return Object.values(value).map(item => typeof item === 'object' ? findRecordByNonce(item, nonce, identityField) : null).find(Boolean) || null;
}
function renderBody(template, nonce, fallback, parentId = null, ids = new Map(), now = new Date()) {
    if (!template) return fallback;
    const render = value => {
        if (typeof value === 'string') {
            const reference = /^\{fixture:([A-Za-z][A-Za-z0-9_]{0,31})\.id\}$/.exec(value);
            if (reference) {
                if (!ids.has(reference[1])) throw new Error(`Unresolved fixture reference: ${reference[1]}`);
                return ids.get(reference[1]);
            }
            const date = /^\{date:([+-]?\d{1,4})d\}$/.exec(value);
            if (date) {
                const days = Number(date[1]);
                if (Math.abs(days) > 3650) throw new Error('Fixture date offset exceeds 3650 days.');
                return new Date(now.getTime() + days * 86400000).toISOString();
            }
            const rendered = value.replaceAll('{nonce}', nonce)
                .replaceAll('{parentId}', parentId == null ? '{parentId}' : String(parentId));
            if (/\{[^{}]*\}/.test(rendered)) throw new Error('Unknown or embedded fixture reference/template.');
            return rendered;
        }
        if (Array.isArray(value)) return value.map(render);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, render(part)]));
        return value;
    };
    return render(template);
}

function safeFixturePath(value, apiBaseUrl) {
    if (typeof value !== 'string' || !/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(value)) return false;
    try { return new URL(value, apiBaseUrl).origin === new URL(apiBaseUrl).origin; } catch { return false; }
}

function validateFixtureBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
        || Buffer.byteLength(JSON.stringify(body), 'utf8') > 32768) throw new Error('Fixture body must be a bounded nonempty object.');
    let nodes = 0;
    const visit = (value, depth) => {
        if (++nodes > 2048 || depth > 20) throw new Error('Fixture body complexity limit exceeded.');
        if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe fixture body key.');
            visit(child, depth + 1);
        }
    };
    visit(body, 0);
}

// All prerequisite paths, roles and references are validated before any request.
// Only declared create endpoints may receive authenticated setup mutations.
export async function prepareAPIFixture({ fixture = {}, management, apiBaseUrl, nonce, roleRequest,
    parentId = null, now = new Date() }) {
    const setup = fixture.setup === undefined ? [] : fixture.setup;
    if (!Array.isArray(setup) || setup.length > 8) throw new Error('Fixture setup must contain at most 8 prerequisites.');
    const validatedIds = new Map();
    const steps = [];
    for (const step of setup) {
        if (!step || typeof step !== 'object' || Array.isArray(step)
            || Object.keys(step).some(key => !['name', 'resource', 'role', 'createPath', 'createBody'].includes(key))
            || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(step.name || '') || validatedIds.has(step.name)) {
            throw new Error('Invalid or duplicate fixture setup name.');
        }
        const resource = management?.resources?.find(resource => resource.name === step.resource);
        if (!resource?.operations?.includes('create') || resource.apiPath !== step.createPath
            || !safeFixturePath(step.createPath, apiBaseUrl)) throw new Error('Fixture path/resource is not a declared local create endpoint.');
        const role = management?.roles?.find(role => (step.role === undefined || role.name === step.role)
            && role.permissions?.some(permission => permission.resource === step.resource && permission.operations?.includes('create')));
        if (!role) throw new Error('Fixture setup role has no declared create permission.');
        validateFixtureBody(step.createBody);
        renderBody(step.createBody, nonce, null, parentId, validatedIds, now);
        steps.push({ ...step, role: role.name });
        validatedIds.set(step.name, 'validated-reference');
    }
    for (const body of [fixture.createBody, fixture.updateBody].filter(body => body !== undefined)) {
        validateFixtureBody(body);
        renderBody(body, nonce, null, parentId, validatedIds, now);
    }
    if (steps.length && typeof roleRequest !== 'function') throw new Error('Fixture setup requires an authenticated role adapter.');
    const ids = new Map();
    for (const step of steps) {
        const response = await roleRequest({ url: new URL(step.createPath, apiBaseUrl).href, method: 'POST', role: step.role,
            data: renderBody(step.createBody, nonce, null, parentId, ids, now) });
        const id = response.data?.id ?? response.data?.data?.id;
        if (!(response.statusCode >= 200 && response.statusCode < 300)
            || !((typeof id === 'string' && id.length > 0 && id.length <= 256) || (typeof id === 'number' && Number.isFinite(id)))) {
            throw new Error(`Fixture setup failed to create ${step.name} with an actual ID.`);
        }
        ids.set(step.name, id);
    }
    return { ids, now,
        createBody: renderBody(fixture.createBody, nonce, null, parentId, ids, now),
        updateBody: renderBody(fixture.updateBody, nonce, null, parentId, ids, now) };
}
function validRetentionFixture(fixture) {
    return fixture && typeof fixture.createPath === 'string'
        && safeFixturePath(fixture.createPath, 'http://service')
        && typeof fixture.itemPath === 'string' && /^\/(?!\/)/.test(fixture.itemPath)
        && !/\.\.|[?#\\]/.test(fixture.itemPath)
        && (fixture.itemPath.match(/\{id\}/g) || []).length === 1
        && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fixture.parentField || '')
        && fixture.createBody && typeof fixture.createBody === 'object'
        && !Array.isArray(fixture.createBody)
        && JSON.stringify(fixture.createBody).includes('{parentId}')
        && (!fixture.beforeDelete || (['POST', 'PATCH', 'PUT'].includes(fixture.beforeDelete.method)
            && typeof fixture.beforeDelete.path === 'string'
            && /^\/(?!\/)/.test(fixture.beforeDelete.path)
            && !/\.\.|[?#\\]/.test(fixture.beforeDelete.path)
            && (fixture.beforeDelete.path.match(/\{id\}/g) || []).length === 1
            && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fixture.beforeDelete.expectedField || '')
            && Object.hasOwn(fixture.beforeDelete, 'expectedValue')));
}
function validItemFixture(fixture, operations) {
    if (!fixture || typeof fixture.itemPath !== 'string'
        || !/^\/(?!\/)/.test(fixture.itemPath) || /\.\.|[?#\\]/.test(fixture.itemPath)
        || (fixture.itemPath.match(/\{id\}/g) || []).length !== 1) return false;
    if (operations.includes('update') && !['PATCH', 'PUT'].includes(fixture.updateMethod)) return false;
    if (operations.includes('delete') && !['absent', 'field'].includes(fixture.deleteExpectation?.kind)) return false;
    if (fixture.deleteExpectation?.kind === 'field' && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fixture.deleteExpectation.field || '')) return false;
    if (fixture.deleteExpectation?.kind === 'field' && !Object.hasOwn(fixture.deleteExpectation, 'equals')) return false;
    if (fixture.identityField !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fixture.identityField)) return false;
    for (const body of [fixture.createBody, fixture.updateBody].filter(Boolean)) {
        if (!body || typeof body !== 'object' || Array.isArray(body) || !JSON.stringify(body).includes('{nonce}')) return false;
    }
    return true;
}

async function verifyItemMutations({ apiBaseUrl, collectionUrl, resource, management, recordId,
    readerRole, roleRequest, options, adapterId, fixtureContext }) {
    const checks = [], issues = [];
    const operations = ['update', 'delete'].filter(operation => resource.operations.includes(operation));
    if (!operations.length) return { checks, issues };
    if (recordId == null || !roleRequest) {
        for (const operation of operations) checks.push({ name: `api_role_${operation}_allowed`, status: 'blocked',
            reason: 'A created record ID and authenticated role adapter are required.' });
        issues.push(`Cannot verify item mutations for ${resource.name} without a created record ID.`);
        return { checks, issues };
    }
    const fixture = resource.verification;
    const identityField = fixture.identityField || null;
    const itemPath = fixture.itemPath.replace('{id}', encodeURIComponent(String(recordId)));
    const itemUrl = new URL(itemPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
    const read = () => roleRequest({ url: collectionUrl, method: 'GET', role: readerRole });
    for (const operation of operations) {
        const method = operation === 'update' ? fixture.updateMethod : 'DELETE';
        const allowed = management.roles.filter(role => role.permissions?.some(permission =>
            permission.resource === resource.name && permission.operations?.includes(operation)));
        const denied = management.roles.filter(role => !allowed.includes(role));
        if (!allowed.length) {
            checks.push({ name: `api_role_${operation}_allowed`, status: 'blocked', reason: 'No role may perform this operation.' });
            issues.push(`No allowed ${operation} role for ${resource.name}.`);
            continue;
        }
        const forbiddenNonce = probeNonce();
        const deniedBody = operation === 'update'
            ? renderBody(fixture.updateBody, forbiddenNonce, { name: forbiddenNonce, title: forbiddenNonce }, null, fixtureContext?.ids, fixtureContext?.now) : null;
        try {
            const baseline = await read();
            const baselineRecord = findRecordById(baseline.data, recordId);
            const original = baselineRecord ? structuredClone(baselineRecord) : null;
            for (const role of denied) {
                const response = await roleRequest({ url: itemUrl, method, role: role.name, data: deniedBody });
                const deniedStatus = response.statusCode === 401 || response.statusCode === 403;
                checks.push({ name: `api_role_${operation}_denied`, status: deniedStatus ? 'passed' : 'failed',
                    statusCode: response.statusCode, evidence: { adapterId, role: role.name, resource: resource.name } });
                if (!deniedStatus) issues.push(`Forbidden role ${role.name} performed ${operation} on ${resource.name}.`);
            }
            const anonymous = await sendHttpRequest(itemUrl, method, deniedBody, options.timeoutMs || 5000, options);
            const anonymousDenied = anonymous.statusCode === 401 || anonymous.statusCode === 403;
            checks.push({ name: `api_anonymous_${operation}_denied`, status: anonymousDenied ? 'passed' : 'failed',
                statusCode: anonymous.statusCode, evidence: { adapterId, resource: resource.name } });
            if (!anonymousDenied) issues.push(`Anonymous ${operation} was accepted for ${resource.name}.`);
            const before = await read();
            const existing = findRecordById(before.data, recordId);
            const unchanged = baseline.statusCode >= 200 && baseline.statusCode < 300
                && before.statusCode >= 200 && before.statusCode < 300
                && original && existing && isDeepStrictEqual(existing, original);
            checks.push({ name: `api_${operation}_denial_persistence`, status: unchanged ? 'passed' : 'failed',
                evidence: { adapterId, resource: resource.name, recordId } });
            if (!unchanged) issues.push(`Denied ${operation} changed or removed ${resource.name}.`);
            const updatedNonce = probeNonce();
            const body = operation === 'update'
                ? renderBody(fixture.updateBody, updatedNonce, { name: updatedNonce, title: updatedNonce }, null, fixtureContext?.ids, fixtureContext?.now) : null;
            let related = null;
            const relatedPolicy = operation === 'delete' ? resource.deletionPolicy?.relatedData : null;
            if (relatedPolicy === 'preserve' || relatedPolicy === 'cascade') {
                const retention = fixture.retention;
                if (!validRetentionFixture(retention)) {
                    checks.push({ name: 'api_delete_related_retention', status: 'blocked',
                        reason: `${resource.name} needs an executable related-record retention fixture.` });
                    issues.push(`Related-record retention could not be verified for ${resource.name}.`);
                    continue;
                }
                const relatedNonce = probeNonce();
                const retentionContext = await prepareAPIFixture({ fixture: retention, management, apiBaseUrl,
                    nonce: relatedNonce, parentId: recordId, roleRequest });
                const createUrl = new URL(retention.createPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
                const createdRelated = await roleRequest({ url: createUrl, method: 'POST', role: allowed[0].name,
                    data: retentionContext.createBody });
                const relatedId = createdRelated.data?.id ?? createdRelated.data?.data?.id;
                const relatedPath = retention.itemPath.replace('{id}', encodeURIComponent(String(relatedId)));
                const relatedUrl = new URL(relatedPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
                const beforeRelated = relatedId == null ? null
                    : await roleRequest({ url: relatedUrl, method: 'GET', role: allowed[0].name });
                const relatedRecord = beforeRelated ? findRecordById(beforeRelated.data, relatedId) : null;
                if (!(createdRelated.statusCode >= 200 && createdRelated.statusCode < 300)
                    || relatedId == null || !(beforeRelated?.statusCode >= 200 && beforeRelated.statusCode < 300)
                    || !relatedRecord || String(relatedRecord[retention.parentField] ?? '') !== String(recordId)) {
                    checks.push({ name: 'api_delete_related_retention', status: 'blocked',
                        reason: `A test record linked to ${resource.name} could not be created and read before deletion.` });
                    issues.push(`Related-record setup failed for ${resource.name}.`);
                    continue;
                }
                if (retention.beforeDelete) {
                    const transition = retention.beforeDelete;
                    const transitionPath = transition.path.replace('{id}', encodeURIComponent(String(relatedId)));
                    const transitionUrl = new URL(transitionPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
                    const transitioned = await roleRequest({ url: transitionUrl, method: transition.method,
                        role: allowed[0].name, data: transition.body || null });
                    const settled = await roleRequest({ url: relatedUrl, method: 'GET', role: allowed[0].name });
                    const settledRecord = findRecordById(settled.data, relatedId);
                    if (!(transitioned.statusCode >= 200 && transitioned.statusCode < 300)
                        || !(settled.statusCode >= 200 && settled.statusCode < 300)
                        || settledRecord?.[transition.expectedField] !== transition.expectedValue) {
                        checks.push({ name: 'api_delete_related_retention', status: 'blocked',
                            reason: `The declared related-record transition did not reach its expected state.` });
                        issues.push(`Related-record transition failed for ${resource.name}.`);
                        continue;
                    }
                }
                related = { url: relatedUrl, id: relatedId };
            }
            const changed = await roleRequest({ url: itemUrl, method, role: allowed[0].name, data: body });
            const changedStatus = changed.statusCode >= 200 && changed.statusCode < 300;
            checks.push({ name: `api_role_${operation}_allowed`, status: changedStatus ? 'passed' : 'failed',
                statusCode: changed.statusCode, evidence: { adapterId, role: allowed[0].name, resource: resource.name } });
            if (!changedStatus) issues.push(`Allowed ${operation} failed for ${resource.name}.`);
            const after = operation === 'delete' && fixture.deleteExpectation.kind === 'field'
                ? await roleRequest({ url: itemUrl, method: 'GET', role: readerRole })
                : await read();
            const record = findRecordById(after.data, recordId);
            const persisted = operation === 'update'
                ? after.statusCode >= 200 && after.statusCode < 300
                    && containsCreatedRecord(after.data, recordId, updatedNonce, identityField)
                : after.statusCode >= 200 && after.statusCode < 300
                    && (fixture.deleteExpectation.kind === 'absent' ? !record
                        : existing?.[fixture.deleteExpectation.field] !== fixture.deleteExpectation.equals
                            && record?.[fixture.deleteExpectation.field] === fixture.deleteExpectation.equals);
            checks.push({ name: `api_${operation}_persistence`, status: persisted ? 'passed' : 'failed',
                evidence: { adapterId, resource: resource.name, recordId, readback: persisted } });
            if (!persisted) issues.push(`Allowed ${operation} lacked expected readback for ${resource.name}.`);
            if (related) {
                const afterRelated = await roleRequest({ url: related.url, method: 'GET', role: allowed[0].name });
                const retained = relatedPolicy === 'preserve'
                    ? afterRelated.statusCode >= 200 && afterRelated.statusCode < 300
                        && Boolean(findRecordById(afterRelated.data, related.id))
                    : afterRelated.statusCode === 404 || afterRelated.statusCode === 410;
                checks.push({ name: 'api_delete_related_retention', status: retained ? 'passed' : 'failed',
                    statusCode: afterRelated.statusCode,
                    evidence: { adapterId, resource: resource.name, policy: relatedPolicy, relatedId: related.id } });
                if (!retained) issues.push(`Deleting ${resource.name} violated the ${relatedPolicy} related-record policy.`);
            }
        } catch (error) {
            checks.push({ name: `api_role_${operation}_allowed`, status: 'blocked', reason: error.message });
            issues.push(`Could not verify ${operation} for ${resource.name}: ${error.message}`);
        }
    }
    return { checks, issues };
}

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
    const roleRequest = typeof adapter?.requestAsRole === 'function'
        ? request => adapter.requestAsRole({ ...request, timeoutMs: opts.timeoutMs || 5000, signal: opts.signal })
        : null;
    const domains = Array.isArray(contract.domains) && contract.domains.length ? contract.domains : [{ name: 'items', prefix: 'items' }];
    if (contract.management?.needed === true) {
        for (const resource of contract.management.resources || []) {
            if (!resource?.apiPath || !(resource.operations || []).some(operation => ['create', 'update', 'delete'].includes(operation))) continue;
            if (!resource.operations.includes('create')) {
                checks.push({ name: 'api_anonymous_mutation_denied', status: 'blocked',
                    reason: `No create operation for ${resource.name}; a contract-specific update/delete fixture is required.` });
                issues.push(`Role mutation fixture is missing for ${resource.name}.`);
                continue;
            }
            if (!/^\/(?!\/)/.test(resource.apiPath) || /\.\.|[?#\\]/.test(resource.apiPath)) {
                checks.push({ name: 'api_anonymous_mutation_denied', status: 'blocked', reason: 'Management API path must be local.' });
                issues.push('Management API path is not a safe local path.');
                continue;
            }
            const mutationUrl = new URL(resource.apiPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
            try {
                const anonymousNonce = probeNonce();
                const fixtureContext = await prepareAPIFixture({ fixture: resource.verification, management: contract.management,
                    apiBaseUrl, nonce: anonymousNonce, roleRequest });
                const response = await sendHttpRequest(mutationUrl, 'POST',
                    fixtureContext.createBody || { name: anonymousNonce, title: anonymousNonce },
                    opts.timeoutMs || 5000, { ...opts, headers: {} });
                const denied = response.statusCode === 401 || response.statusCode === 403;
                checks.push({ name: 'api_anonymous_mutation_denied', status: denied ? 'passed' : 'failed',
                    statusCode: response.statusCode, evidence: { adapterId, method: 'POST', url: mutationUrl } });
                if (!denied) issues.push(`Anonymous mutation was not denied by ${mutationUrl}`);
            } catch (error) {
                checks.push({ name: 'api_anonymous_mutation_denied', status: 'blocked', reason: error.message,
                    evidence: { adapterId, method: 'POST', url: mutationUrl } });
                issues.push(`Anonymous mutation could not be checked at ${mutationUrl}: ${error.message}`);
            }
        }
    }
    if (contract.management?.needed === true) {
        const management = contract.management;
        for (const resource of management.resources || []) {
            if (!safeFixturePath(resource.apiPath, apiBaseUrl)) {
                checks.push({ name: 'api_status_check', status: 'blocked', reason: 'Management API path must be a safe local path.' });
                issues.push(`Invalid local API path for ${resource.name}.`);
                continue;
            }
            if (resource.operations?.includes('read') && resource.readAccess !== undefined) {
                const policy = resource.readAccess;
                if (!['public', 'authenticated'].includes(policy)
                    || !/^\/(?!\/)/.test(resource.apiPath || '') || /\.\.|[?#\\]/.test(resource.apiPath)) {
                    checks.push({ name: 'api_anonymous_read_policy', status: 'blocked',
                        reason: `${resource.name} needs a valid readAccess policy and local API path.` });
                    issues.push(`Read access contract is invalid for ${resource.name}.`);
                } else {
                    const readUrl = new URL(resource.apiPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
                    try {
                        const response = await sendHttpRequest(readUrl, 'GET', null, opts.timeoutMs || 5000, opts);
                        const matchesPolicy = policy === 'public'
                            ? response.statusCode >= 200 && response.statusCode < 300
                            : response.statusCode === 401 || response.statusCode === 403;
                        checks.push({ name: 'api_anonymous_read_policy', status: matchesPolicy ? 'passed' : 'failed',
                            statusCode: response.statusCode, evidence: { adapterId, resource: resource.name, policy } });
                        if (!matchesPolicy) issues.push(`Anonymous read of ${resource.name} violates ${policy} policy.`);
                    } catch (error) {
                        checks.push({ name: 'api_anonymous_read_policy', status: 'blocked', reason: error.message });
                        issues.push(`Anonymous read of ${resource.name} could not be checked: ${error.message}`);
                    }
                    const readers = management.roles.filter(role => role.permissions?.some(permission =>
                        permission.resource === resource.name && permission.operations?.includes('read')));
                    if (!roleRequest || !readers.length) {
                        checks.push({ name: 'api_role_read_allowed', status: 'blocked',
                            reason: 'An authenticated reader role and role adapter are required.' });
                        issues.push(`Authorized read evidence is missing for ${resource.name}.`);
                    } else {
                        try {
                            const response = await roleRequest({ url: readUrl, method: 'GET', role: readers[0].name });
                            const allowed = response.statusCode >= 200 && response.statusCode < 300;
                            checks.push({ name: 'api_role_read_allowed', status: allowed ? 'passed' : 'failed',
                                statusCode: response.statusCode, evidence: { adapterId, resource: resource.name, role: readers[0].name } });
                            if (!allowed) issues.push(`Authorized role could not read ${resource.name}.`);
                        } catch (error) {
                            checks.push({ name: 'api_role_read_allowed', status: 'blocked', reason: error.message });
                            issues.push(`Authorized read of ${resource.name} could not be checked: ${error.message}`);
                        }
                        if (policy === 'authenticated') {
                            const forbiddenReaders = management.roles.filter(role => !readers.includes(role));
                            for (const role of forbiddenReaders) {
                                try {
                                    const response = await roleRequest({ url: readUrl, method: 'GET', role: role.name });
                                    const denied = response.statusCode === 401 || response.statusCode === 403;
                                    checks.push({ name: 'api_role_read_denied', status: denied ? 'passed' : 'failed',
                                        statusCode: response.statusCode,
                                        evidence: { adapterId, resource: resource.name, role: role.name } });
                                    if (!denied) issues.push(`Role ${role.name} read protected ${resource.name}.`);
                                } catch (error) {
                                    checks.push({ name: 'api_role_read_denied', status: 'blocked', reason: error.message });
                                    issues.push(`Forbidden read of ${resource.name} could not be checked: ${error.message}`);
                                }
                            }
                        }
                    }
                }
            }
            const itemFixtureReady = validItemFixture(resource.verification, resource.operations || []);
            for (const operation of ['update', 'delete']) {
                if (resource.operations?.includes(operation) && !itemFixtureReady) {
                    checks.push({ name: 'api_unverified_mutation_operation', status: 'blocked',
                        reason: `${resource.name}.${operation} requires a safe itemPath, method and deletion expectation fixture.`,
                        evidence: { adapterId, resource: resource.name, operation } });
                    issues.push(`Management ${operation} operation is not yet verified for ${resource.name}.`);
                }
            }
            if (!resource.operations?.includes('create')) continue;
            const url = new URL(resource.apiPath, `${String(apiBaseUrl).replace(/\/+$/, '')}/`).href;
            const allowed = (management.roles || []).filter(role => role.permissions?.some(permission =>
                permission.resource === resource.name && permission.operations?.includes('create')));
            const denied = (management.roles || []).filter(role => !allowed.includes(role));
            const readers = (management.roles || []).filter(role => role.permissions?.some(permission =>
                permission.resource === resource.name && permission.operations?.includes('read')));
            if (!roleRequest || !allowed.length || !readers.length) {
                checks.push({ name: 'api_role_create_allowed', status: 'blocked',
                    reason: 'A trusted authenticated role adapter and create/read role permissions are required.',
                    evidence: { adapterId, resource: resource.name } });
                issues.push(`Authenticated create/read evidence is missing for ${resource.name}.`);
                continue;
            }
            const nonce = probeNonce();
            const identityField = resource.verification?.identityField || null;
            let created;
            let recordId = null;
            let fixtureContext;
            try {
                fixtureContext = await prepareAPIFixture({ fixture: resource.verification, management,
                    apiBaseUrl, nonce, roleRequest });
                created = await roleRequest({ url, method: 'POST', role: allowed[0].name,
                    data: fixtureContext.createBody || { name: nonce, title: nonce, description: 'Created by XFactor API Verifier' } });
                const ok = created.statusCode >= 200 && created.statusCode < 300;
                checks.push({ name: 'api_role_create_allowed', status: ok ? 'passed' : 'failed',
                    statusCode: created.statusCode, evidence: { adapterId, role: allowed[0].name, resource: resource.name } });
                checks.push({ name: 'api_status_check', status: ok ? 'passed' : 'failed',
                    statusCode: created.statusCode, evidence: { adapterId, role: allowed[0].name, url } });
                if (!ok) issues.push(`Permitted role ${allowed[0].name} could not create ${resource.name}.`);
            } catch (error) {
                checks.push({ name: 'api_role_create_allowed', status: 'blocked', reason: error.message });
                issues.push(`Authenticated create failed for ${resource.name}: ${error.message}`);
                if (!fixtureContext) continue;
            }
            const deniedProbes = [];
            for (const role of denied) {
                try {
                    const deniedNonce = probeNonce();
                    const response = await roleRequest({ url, method: 'POST', role: role.name,
                        data: renderBody(resource.verification?.createBody, deniedNonce, { name: deniedNonce, title: deniedNonce }, null, fixtureContext.ids, fixtureContext.now) });
                    const blocked = response.statusCode === 401 || response.statusCode === 403;
                    const check = { name: 'api_role_create_denied', status: blocked ? 'passed' : 'failed',
                        statusCode: response.statusCode, evidence: { adapterId, role: role.name, resource: resource.name } };
                    checks.push(check);
                    deniedProbes.push({ check, nonce: deniedNonce, role: role.name });
                    if (!blocked) issues.push(`Forbidden role ${role.name} could create ${resource.name}.`);
                } catch (error) {
                    checks.push({ name: 'api_role_create_denied', status: 'blocked', reason: error.message });
                    issues.push(`Forbidden-role check failed for ${role.name}: ${error.message}`);
                }
            }
            try {
                const read = await roleRequest({ url, method: 'GET', role: readers[0].name });
                const ok = read.statusCode >= 200 && read.statusCode < 300;
                for (const probe of deniedProbes) {
                    if (containsCreatedRecord(read.data, null, probe.nonce, identityField)) {
                        probe.check.status = 'failed';
                        probe.check.reason = 'Forbidden mutation persisted despite denial response.';
                        issues.push(`Forbidden role ${probe.role} persisted ${resource.name} despite denial.`);
                    }
                }
                checks.push({ name: 'api_query_check', status: ok ? 'passed' : 'failed',
                    statusCode: read.statusCode, evidence: { adapterId, role: readers[0].name, url } });
                const createdId = created?.data && typeof created.data === 'object' ? created.data.id : null;
                recordId = createdId ?? findRecordByNonce(read.data, nonce, identityField)?.id ?? null;
                const persisted = ok && created?.statusCode >= 200 && created.statusCode < 300
                    && containsCreatedRecord(read.data, createdId, nonce, identityField);
                checks.push({ name: 'database_mutation_assertion', status: persisted ? 'passed' : 'failed',
                    reason: persisted ? 'Created record was found by an authorized API read.' : 'Authorized write was not corroborated by readback.',
                    evidence: { adapterId, resource: resource.name, createdId, nonce, readback: persisted } });
                if (!persisted) issues.push(`Authorized create was not found by GET ${url}.`);
            } catch (error) {
                checks.push({ name: 'api_query_check', status: 'blocked', reason: error.message });
                checks.push({ name: 'database_mutation_assertion', status: 'blocked', reason: error.message });
                issues.push(`Authorized readback failed for ${resource.name}: ${error.message}`);
            }
            if (itemFixtureReady && resource.operations.some(operation => operation === 'update' || operation === 'delete')) {
                const mutations = await verifyItemMutations({
                    apiBaseUrl, collectionUrl: url, resource, management, recordId,
                    readerRole: readers[0].name, roleRequest, options: opts, adapterId, fixtureContext
                });
                checks.push(...mutations.checks);
                issues.push(...mutations.issues);
            }
        }
        return { passed: checks.length > 0 && checks.every(check => check.status === 'passed') && !issues.length, checks, issues };
    }
    for (const domain of domains) {
        const prefix = typeof domain === 'string' ? domain : (domain.prefix || domain.name || 'items');
        const url = `${String(apiBaseUrl || '').replace(/\/+$/, '')}/api/${prefix}`;
        const name = `Verification Item ${Date.now()}`;
        let post;
        let get;
        try {
            post = await sendHttpRequest(url, 'POST', { name, title: name, description: 'Created by XFactor API Verifier' }, opts.timeoutMs || 5000, opts);
            const passed = post.statusCode >= 200 && post.statusCode < 300;
            checks.push({ name: 'api_status_check', status: passed ? 'passed' : 'failed', statusCode: post.statusCode, evidence: { adapterId, method: 'POST', url } });
            if (!passed) issues.push(`POST ${url} returned HTTP ${post.statusCode}`);
        } catch (error) { checks.push({ name: 'api_status_check', status: 'failed', reason: error.message, evidence: { adapterId, method: 'POST', url } }); issues.push(error.message); }
        try {
            get = await sendHttpRequest(url, 'GET', null, opts.timeoutMs || 5000, opts);
            const passed = get.statusCode >= 200 && get.statusCode < 300;
            checks.push({ name: 'api_query_check', status: passed ? 'passed' : 'failed', statusCode: get.statusCode, evidence: { adapterId, method: 'GET', url } });
            if (!passed) issues.push(`GET ${url} returned HTTP ${get.statusCode}`);
        } catch (error) { checks.push({ name: 'api_query_check', status: 'failed', reason: error.message, evidence: { adapterId, method: 'GET', url } }); issues.push(error.message); }
        const createdId = post?.data && typeof post.data === 'object' ? post.data.id : null;
        const persisted = post?.statusCode >= 200 && post.statusCode < 300
            && get?.statusCode >= 200 && get.statusCode < 300
            && containsCreatedRecord(get.data, createdId, name);
        checks.push({
            name: 'database_mutation_assertion',
            status: persisted ? 'passed' : (post?.statusCode >= 200 && post.statusCode < 300 ? 'failed' : 'blocked'),
            reason: persisted ? 'Created record was found by a subsequent API read.' : 'POST response was not corroborated by API readback.',
            evidence: { adapterId, createdId, nonce: name, readback: persisted }
        });
        if (!persisted) issues.push(`Created record was not found by GET ${url}`);
    }
    return { passed: checks.every(c => c.status === 'passed') && !issues.length, checks, issues };
}
