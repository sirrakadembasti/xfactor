import { verifyServiceManifest } from './serviceManifestVerifier.js';
import { verifyDatabase } from './databaseVerifier.js';
import { spawnService, killService } from './processVerifier.js';
import { probeServiceHealth } from './healthProber.js';
import { verifyAPIContract } from './apiVerifier.js';
import { verifyBrowserJourney } from './browserVerifier.js';
import { verifyTestInfrastructure } from './testInfrastructureVerifier.js';
export async function verifyProjectSmoke(projectDir, contract = {}, options = {}) {
    const checks = [], issues = [], handles = []; const common = { ...options, workspace: options.workspace || projectDir };
    const manifest = await verifyServiceManifest(projectDir, contract, common); checks.push(...(manifest.checks || [])); issues.push(...(manifest.issues || []));
    if (!manifest.passed) return { passed: false, checks, issues };
    try {
        if (contract.database) { const db = await verifyDatabase(projectDir, contract, options.env || {}, common); checks.push(...db.checks); issues.push(...db.issues); }
        const service = contract.process || contract.service;
        if (service && !options.skipSpawnForLiveServer) { const h = await spawnService(service.id || 'backend', service, options.env || {}, common); handles.push(h); checks.push({ name: 'service_spawn', status: 'passed', evidence: { adapterId: options.adapter?.id, pid: h.pid } }); }
        if (contract.healthUrl || contract.api?.baseUrl) { const health = await probeServiceHealth(contract.healthUrl || `${contract.api.baseUrl}/health`, options.startupTimeoutMs || 5000, common); checks.push({ name: 'smoke_liveness_probe', status: health.responsive ? 'passed' : 'failed', reason: health.error, evidence: { adapterId: options.adapter?.id } }); if (!health.responsive) issues.push(health.error); }
        if (contract.api?.baseUrl) { const api = await verifyAPIContract(contract.api.baseUrl, null, contract.api, common); checks.push(...api.checks); issues.push(...api.issues); }
        if (contract.browser?.url) { const browser = await verifyBrowserJourney(contract.browser.url, contract.browser.journey || {}, common); checks.push(...browser.checks); issues.push(...browser.issues); }
        const tests = await verifyTestInfrastructure(projectDir, contract, common); checks.push(...tests.checks); issues.push(...tests.issues);
    } catch (error) { checks.push({ name: 'smoke_runtime', status: error.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed', reason: error.message }); issues.push(error.message); }
    finally { for (const h of handles) await killService(h); }
    const passed = !issues.length && checks.every(c => ['passed', 'skipped'].includes(c.status)); checks.push({ name: 'smoke_gate', status: passed ? 'passed' : 'failed' }); return { passed, checks, issues };
}
