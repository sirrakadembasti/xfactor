import { verifyServiceManifest } from './serviceManifestVerifier.js';
import { verifyDatabase } from './databaseVerifier.js';
import { spawnService, killService } from './processVerifier.js';
import { probeServiceHealth } from './healthProber.js';
import { verifyAPIContract } from './apiVerifier.js';
import { verifyBrowserJourney } from './browserVerifier.js';
import { verifyTestInfrastructure } from './testInfrastructureVerifier.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
import { createRoleSessionAdapter, prepareManagementDemoUsers } from './roleSessionAdapter.js';

function inferRuntimeChecks(contract, service, files = []) {
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
    return {
        api: contract.api?.baseUrl ? contract.api : (baseUrl && routeName ? { baseUrl, domains: [{ prefix: routeName }] } : null),
        browser: contract.browser?.url ? contract.browser : (baseUrl && page && /<main(?:\s|>)/.test(String(page.content || ''))
            ? { url: `${baseUrl}/`, journey: { steps: [{ action: 'assert_element', selector: 'main' }] },
                ...(contract.browser || {}) }
            : null)
    };
}
export async function verifyProjectSmoke(projectDir, contract = {}, options = {}) {
    const checks = [];
    const issues = [];
    const handles = [];
    const runtimeEnv = { DATABASE_URL: 'file:./dev.db', ...(options.env || {}) };
    const common = { ...options, management: contract.management, env: runtimeEnv, workspace: options.workspace || projectDir };
    const manifest = await verifyServiceManifest(projectDir, contract, common);
    checks.push(...(manifest.checks || []));
    issues.push(...(manifest.issues || []));

    const declaredService = Object.entries(manifest.manifest?.services || {})[0] || [];
    const serviceId = contract.process?.id || contract.service?.id || declaredService[0] || 'web';
    const service = contract.process || contract.service || declaredService[1] || null;
    const healthUrl = contract.healthUrl
        || (service?.port ? `http://127.0.0.1:${service.port}${service.healthEndpoint || '/'}` : null)
        || (contract.api?.baseUrl ? `${contract.api.baseUrl}/health` : null);
    const runtimeChecks = inferRuntimeChecks(contract, service, options.files);
    if (contract.management?.needed === true && (!runtimeChecks.api?.baseUrl || !runtimeChecks.browser?.url)) {
        checks.push({ name: 'management_runtime_contract', status: 'blocked',
            reason: 'Management verification needs explicit or inferable API and browser endpoints.' });
        issues.push('Management API or browser endpoint is missing from runtime verification.');
    }

    let apiAdapter = options.adapter;
    try {
        if (contract.management?.needed === true) {
            try {
                if (!runtimeChecks.api?.baseUrl || !contract.management.authentication?.apiLogin?.path) {
                    throw new Error('Management verification requires a declared API login path and API base URL.');
                }
                const passwords = await prepareManagementDemoUsers(options.adapter, contract.management, runtimeEnv,
                    { signal: options.signal });
                apiAdapter = createRoleSessionAdapter(options.adapter, runtimeChecks.api.baseUrl,
                    contract.management, passwords);
                checks.push({ name: 'management_demo_seed', status: 'passed',
                    evidence: { adapterId: options.adapter?.id, roles: contract.management.roles.map(role => role.name) } });
            } catch (error) {
                checks.push({ name: 'management_demo_seed', status: 'blocked', reason: error.message });
                issues.push(`Management role setup failed: ${error.message}`);
            }
        }
        if (service && !options.skipSpawnForLiveServer) {
            const handle = await spawnService(serviceId, service, runtimeEnv, common);
            handles.push(handle);
            checks.push({
                name: 'service_spawn',
                status: 'passed',
                evidence: { adapterId: options.adapter?.id, pid: handle.pid }
            });
        }
        if (healthUrl) {
            const health = await probeServiceHealth(healthUrl, options.startupTimeoutMs ?? 90000, common);
            checks.push({
                name: 'smoke_liveness_probe',
                status: health.responsive ? 'passed' : 'failed',
                reason: health.error,
                evidence: { adapterId: options.adapter?.id }
            });
            if (!health.responsive) issues.push(health.error);
        }
        if (contract.database) {
            const db = await verifyDatabase(projectDir, contract, runtimeEnv, common);
            checks.push(...db.checks);
            issues.push(...db.issues);
        }
        if (runtimeChecks.api?.baseUrl) {
            const api = await verifyAPIContract(runtimeChecks.api.baseUrl, null,
                { ...runtimeChecks.api, management: contract.management }, { ...common, adapter: apiAdapter });
            checks.push(...api.checks);
            issues.push(...api.issues);
        }
        if (runtimeChecks.browser?.url) {
            const browser = await verifyBrowserJourney(runtimeChecks.browser.url, runtimeChecks.browser.journey || {}, {
                ...common, roleJourneys: runtimeChecks.browser.roleJourneys || options.roleJourneys
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
        for (const handle of handles) await killService(handle);
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
    return { passed, checks, issues };
}
