import { verifyServiceManifest } from './serviceManifestVerifier.js';
import { verifyDatabase } from './databaseVerifier.js';
import { spawnService, killService } from './processVerifier.js';
import { probeServiceHealth } from './healthProber.js';
import { verifyAPIContract } from './apiVerifier.js';
import { verifyBrowserJourney } from './browserVerifier.js';
import { verifyTestInfrastructure } from './testInfrastructureVerifier.js';
import { ACTIVE_POLICY_VERSION } from './policyVersion.js';
export async function verifyProjectSmoke(projectDir, contract = {}, options = {}) {
    const checks = [];
    const issues = [];
    const handles = [];
    const runtimeEnv = { DATABASE_URL: 'file:./dev.db', ...(options.env || {}) };
    const common = { ...options, env: runtimeEnv, workspace: options.workspace || projectDir };
    const manifest = await verifyServiceManifest(projectDir, contract, common);
    checks.push(...(manifest.checks || []));
    issues.push(...(manifest.issues || []));

    const declaredService = Object.entries(manifest.manifest?.services || {})[0] || [];
    const serviceId = contract.process?.id || contract.service?.id || declaredService[0] || 'web';
    const service = contract.process || contract.service || declaredService[1] || null;
    const healthUrl = contract.healthUrl
        || (service?.port ? `http://127.0.0.1:${service.port}${service.healthEndpoint || '/'}` : null)
        || (contract.api?.baseUrl ? `${contract.api.baseUrl}/health` : null);

    try {
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
        if (contract.api?.baseUrl) {
            const api = await verifyAPIContract(contract.api.baseUrl, null, contract.api, common);
            checks.push(...api.checks);
            issues.push(...api.issues);
        }
        if (contract.browser?.url) {
            const browser = await verifyBrowserJourney(contract.browser.url, contract.browser.journey || {}, common);
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
