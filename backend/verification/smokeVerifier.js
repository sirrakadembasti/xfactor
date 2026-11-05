import { verifyServiceManifest } from './serviceManifestVerifier.js';
import { verifyDatabase } from './databaseVerifier.js';
import { spawnService, killService } from './processVerifier.js';
import { probeServiceHealth } from './healthProber.js';
import { verifyAPIContract } from './apiVerifier.js';
import { verifyBrowserJourney } from './browserVerifier.js';
import { verifyTestInfrastructure } from './testInfrastructureVerifier.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
import { randomBytes } from 'node:crypto';
import { createRoleSessionAdapter, prepareManagementDemoUsers } from './roleSessionAdapter.js';

function inferRuntimeChecks(contract, service, files = [], services = []) {
    const baseUrl = service?.port ? `http://127.0.0.1:${service.port}` : null;
    const sourceFiles = Array.isArray(files) ? files : [];
    const route = sourceFiles.map(file => ({
        path: String(file.path || '').replace(/\\/g, '/'),
        content: String(file.content || '')
    })).find(file => /(?:^|\/)src\/app\/api\/[^/]+\/route\.[jt]s$/.test(file.path)
        && /export\s+(?:async\s+function|const)\s+GET\b/.test(file.content)
        && /export\s+(?:async\s+function|const)\s+POST\b/.test(file.content));
    const routeName = route?.path.match(/\/api\/([^/]+)\/route\.[jt]s$/)?.[1];
    const page = sourceFiles.find(file => /(?:^|\/)src\/app\/page\.tsx$/.test(String(file.path || '').replace(/\\/g, '/')));
    const apiService = services.find(([id, value]) => ['api', 'backend'].includes(id)
        || value?.type === 'express')?.[1];
    const apiBaseUrl = apiService?.port ? `http://127.0.0.1:${apiService.port}` : null;
    // Manager domains describe work ownership (frontend/backend), not API routes.
    const apiDomains = Array.isArray(contract.api?.domains) && contract.api.domains.length
        ? contract.api.domains : routeName ? [{ prefix: routeName }] : null;
    const inferredApi = apiBaseUrl && (services.length > 1 || contract.management?.needed === true)
        ? { ...(contract.api || {}), baseUrl: apiBaseUrl, ...(apiDomains ? { domains: apiDomains } : {}) }
        : baseUrl && routeName ? { ...(contract.api || {}), baseUrl, domains: [{ prefix: routeName }] } : null;
    const hasMainElement = Boolean(page && /<main(?:\s|>)/.test(String(page.content || '')));
    const hasBrowserService = ['vite', 'nextjs'].includes(service?.type) || hasMainElement;
    const schema = sourceFiles.find(file => /(?:^|\/)schema\.prisma$/.test(file.path)
        && /datasource\s+\w+\s*\{[^}]*\bprovider\s*=\s*["']sqlite["']/s.test(file.content));
    return {
        api: contract.api?.baseUrl ? contract.api : inferredApi,
        missingApiContract: Boolean(inferredApi && !contract.api?.baseUrl
            && contract.management?.needed !== true && !apiDomains),
        browser: contract.browser?.url ? contract.browser : (baseUrl && hasBrowserService
            ? { journey: { steps: hasMainElement ? [{ action: 'assert_element', selector: 'main' }] : [] },
                ...(contract.browser || {}), url: `${baseUrl}/` }
            : null),
        database: contract.database || schema ? { ...contract, ...(typeof contract.database === 'object' ? contract.database : {}),
            schemaPath: contract.database?.schemaPath || contract.schemaPath || schema?.path || 'prisma/schema.prisma' } : null
    };
}
export async function verifyProjectSmoke(projectDir, contract = {}, options = {}) {
    const checks = [];
    const issues = [];
    const handles = [];
    // Test-only application secrets belong to this run, never the host or ZIP.
    const runSecret = randomBytes(32).toString('hex');
    const runtimeEnv = { DATABASE_URL: 'file:./dev.db', ...(options.env || {}) };
    const common = { ...options, applicationTestSecret: runSecret, management: contract.management,
        env: runtimeEnv, workspace: options.workspace || projectDir };
    const manifest = await verifyServiceManifest(projectDir, contract, common);
    checks.push(...(manifest.checks || []));
    issues.push(...(manifest.issues || []));

    const services = Object.entries(manifest.manifest?.services || {});
    const explicitService = contract.process || contract.service;
    if (explicitService) {
        const id = explicitService.id || services[0]?.[0] || 'web';
        const index = services.findIndex(([name]) => name === id);
        if (index >= 0) services[index] = [id, explicitService];
        else services.push([id, explicitService]);
    }
    const primary = services.find(([id]) => id === 'web')
        || services.find(([, value]) => ['vite', 'nextjs'].includes(value?.type)) || services[0] || [];
    const [serviceId, service] = primary;
    const baseUrl = service?.port ? `http://127.0.0.1:${service.port}` : null;
    const runtimeChecks = inferRuntimeChecks(contract, service, options.files, services);
    if (contract.management?.needed === true && (!runtimeChecks.api?.baseUrl || !runtimeChecks.browser?.url)) {
        checks.push({ name: 'management_runtime_contract', status: 'blocked',
            reason: 'Management verification needs explicit or inferable API and browser endpoints.' });
        issues.push('Management API or browser endpoint is missing from runtime verification.');
    }

    let apiAdapter = options.adapter;
    try {
        if (!manifest.passed) throw new Error('Service manifest validation failed; runtime startup refused.');
        const ports = services.map(([, value]) => Number(value?.port));
        if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535)
            || new Set(ports).size !== ports.length) throw new Error('Runtime services require distinct valid ports.');
        if (contract.management?.needed === true) {
            try {
                if (!runtimeChecks.api?.baseUrl || !contract.management.authentication?.apiLogin?.path) {
                    throw new Error('Management verification requires a declared API login path and API base URL.');
                }
                const passwords = await prepareManagementDemoUsers(options.adapter, contract.management, runtimeEnv,
                    { signal: options.signal });
                apiAdapter = createRoleSessionAdapter(options.adapter, runtimeChecks.api.baseUrl,
                    contract.management, passwords, { browserUrl: runtimeChecks.browser?.url || runtimeChecks.api.baseUrl });
                checks.push({ name: 'management_demo_seed', status: 'passed',
                    evidence: { adapterId: options.adapter?.id, roles: contract.management.roles.map(role => role.name) } });
            } catch (error) {
                checks.push({ name: 'management_demo_seed', status: 'blocked', reason: error.message });
                issues.push(`Management role setup failed: ${error.message}`);
            }
        }
        if (!options.skipSpawnForLiveServer) {
            for (const [id, config] of services) {
                if (options.signal?.aborted) throw options.signal.reason || new Error('Cancelled by user');
                const handle = await spawnService(id, config, { ...runtimeEnv, PORT: String(config.port) }, common);
                handles.push(handle);
                checks.push({ name: 'service_spawn', status: 'passed',
                    evidence: { adapterId: options.adapter?.id, serviceId: id, port: config.port, pid: handle.pid } });
            }
        }
        for (const [id, config] of services) {
            const healthUrl = (id === serviceId && contract.healthUrl)
                || `http://127.0.0.1:${config.port}${config.healthEndpoint || '/'}`;
            const health = await probeServiceHealth(healthUrl, options.startupTimeoutMs ?? 90000, common);
            checks.push({
                name: 'smoke_liveness_probe',
                status: health.responsive ? 'passed' : 'failed',
                reason: health.error,
                evidence: { adapterId: options.adapter?.id, serviceId: id, port: config.port, url: healthUrl }
            });
            if (!health.responsive) {
                issues.push(`Service ${id}: ${health.error}`);
                throw new Error(`Service ${id} did not become ready.`);
            }
        }
        if (contract.management?.needed === true) {
            for (const role of contract.management.roles || []) {
                try {
                    if (!runtimeChecks.api?.baseUrl || typeof apiAdapter?.requestAsRole !== 'function') {
                        throw new Error('An isolated authenticated role session is unavailable.');
                    }
                    const target = new URL('/', runtimeChecks.api.baseUrl).href;
                    const response = await apiAdapter.requestAsRole({ role: role.name, method: 'GET', url: target,
                        signal: options.signal });
                    checks.push({ name: 'management_role_login', status: 'passed',
                        evidence: { adapterId: options.adapter?.id, role: role.name,
                            authenticatedTargetStatus: response.statusCode } });
                } catch (error) {
                    checks.push({ name: 'management_role_login', status: 'blocked',
                        reason: error.message, evidence: { role: role.name } });
                    issues.push(`Management login failed for role ${role.name}: ${error.message}`);
                }
            }
        }
        if (runtimeChecks.database) {
            const db = await verifyDatabase(projectDir, runtimeChecks.database, runtimeEnv, common);
            checks.push(...db.checks);
            issues.push(...db.issues);
        }
        if (runtimeChecks.missingApiContract) {
            const reason = 'API service was found, but no API resource contract or inferable route metadata was supplied.';
            checks.push({ name: 'api_runtime_contract', status: 'blocked', reason });
            issues.push(reason);
        } else if (runtimeChecks.api?.baseUrl) {
            const api = await verifyAPIContract(runtimeChecks.api.baseUrl, null,
                { ...runtimeChecks.api, management: contract.management }, { ...common, adapter: apiAdapter });
            checks.push(...api.checks);
            issues.push(...api.issues);
        }
        if (runtimeChecks.browser?.url) {
            const browser = await verifyBrowserJourney(runtimeChecks.browser.url, runtimeChecks.browser.journey || {}, {
                ...common, adapter: apiAdapter, roleJourneys: runtimeChecks.browser.roleJourneys || options.roleJourneys
            });
            checks.push(...browser.checks);
            issues.push(...browser.issues);
        }
        const tests = await verifyTestInfrastructure(projectDir, contract, common);
        checks.push(...tests.checks);
        issues.push(...tests.issues);
    } catch (error) {
        checks.push({
            name: 'smoke_runtime',
            status: error.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
            reason: error.message
        });
        issues.push(error.message);
    } finally {
        // Observe before operator cleanup so our own termination never becomes
        // a product crash. Retain only bounded diagnostic tails.
        for (const handle of handles) {
            const observation=handle.getObservation?.();
            const check=checks.find(row=>row.name==='service_spawn' && row.evidence?.serviceId===handle.serviceId);
            if (!check || !observation) continue;
            check.evidence.processObservation=observation;
            if (observation.exited) {
                check.status='failed';check.reason=`Service ${handle.serviceId} exited before runtime validation completed (exit ${observation.exitCode ?? 'unknown'}, signal ${observation.signal || 'none'}).`;
                Object.assign(check,{stdout:observation.stdout,stderr:observation.stderr,stdoutTruncated:observation.stdoutTruncated,stderrTruncated:observation.stderrTruncated});
                issues.push(check.reason);
            }
        }
        const cleanup = await Promise.allSettled([...handles].reverse().map(handle => killService(handle)));
        for (const result of cleanup) {
            if (result.status === 'rejected') {
                issues.push(`Service cleanup failed: ${result.reason?.message || 'unknown error'}`);
                checks.push({ name: 'service_cleanup', status: 'failed', reason: result.reason?.message || 'Service cleanup failed.' });
            }
        }
    }

    const passed = !issues.length && checks.every(check => ['passed', 'skipped'].includes(check.status));
    checks.push({
        name: 'smoke_gate',
        status: passed ? 'passed' : 'failed',
        evidence: passed ? {
            kind: 'derived_gate',
            producer: 'aggregate-verification',
            sourceGateNames: checks.filter(check => check.status === 'passed').map(check => `detail:${check.name}`),
            computedAt: new Date().toISOString(),
            policyVersion: ACTIVE_POLICY_VERSION
        } : { issues }
    });
    return { passed, checks, issues, baseUrl,
        serviceBaseUrls: Object.fromEntries(services.map(([id, config]) => [id, `http://127.0.0.1:${config.port}`])) };
}
