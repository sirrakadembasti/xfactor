import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { verifyServiceManifest } from './serviceManifestVerifier.js';
import { verifyDatabase, resolveDatabaseFilePath } from './databaseVerifier.js';
import { spawnService, killService } from './processVerifier.js';
import { probeServiceHealth } from './healthProber.js';
import { verifyAPIContract } from './apiVerifier.js';
import { verifyBrowserJourney } from './browserVerifier.js';
import { verifyTestInfrastructure } from './testInfrastructureVerifier.js';

export async function verifyProjectSmoke(projectDir, contract = {}, options = {}) {
    const allChecks = [];
    const allIssues = [];
    const spawnedHandles = [];

    try {
        // 1. Manifest Doğrulaması
        const manifestRes = await verifyServiceManifest(projectDir, contract);
        allChecks.push(...manifestRes.checks);
        allIssues.push(...manifestRes.issues);

        if (!manifestRes.passed) {
            allChecks.push({
                name: 'smoke_gate',
                status: 'failed',
                reason: 'Smoke gate failed at service manifest stage.'
            });
            return { passed: false, checks: allChecks, issues: allIssues };
        }

        // 2. Veritabanı Doğrulaması
        const dbRes = await verifyDatabase(projectDir, contract, options.env || {}, options);
        allChecks.push(...dbRes.checks);
        allIssues.push(...dbRes.issues);

        if (!dbRes.passed) {
            allChecks.push({
                name: 'smoke_gate',
                status: 'failed',
                reason: 'Smoke gate failed at database verification stage.'
            });
            return { passed: false, checks: allChecks, issues: allIssues };
        }

        const dbPath = dbRes.dbPath || resolveDatabaseFilePath(projectDir, options.env || {});

        // 3. Servis Başlatma & Port/Health Denetimi
        let manifest = {};
        try {
            manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'service-manifest.json'), 'utf8'));
        } catch {}

        const services = manifest.services || {};
        const backendService = services.backend;
        const frontendService = services.frontend;

        const baseUrl = options.baseUrl || (backendService ? `http://127.0.0.1:${backendService.port}` : null);
        const frontendUrl = options.frontendUrl || (frontendService ? `http://127.0.0.1:${frontendService.port}` : baseUrl);

        if (!options.skipSpawnForLiveServer && backendService) {
            try {
                const handle = await spawnService('backend', {
                    command: backendService.command || process.execPath,
                    args: backendService.args || ['server.js'],
                    cwd: projectDir,
                    port: backendService.port
                }, options.env || {}, options);
                spawnedHandles.push(handle.processTreeHandle);
            } catch (spawnErr) {
                allChecks.push({
                    name: 'service_spawn',
                    status: 'failed',
                    reason: `Failed to spawn backend service: ${spawnErr.message}`
                });
                allIssues.push(`Failed to spawn backend service: ${spawnErr.message}`);
            }
        }

        // 4. Liveness & Readiness Probing
        if (baseUrl) {
            const healthEndpoint = backendService?.healthEndpoint || '/health';
            const healthUrl = `${baseUrl.replace(/\/+$/, '')}${healthEndpoint}`;
            const probeRes = await probeServiceHealth(healthUrl, options.startupTimeoutMs || 5000, options);

            allChecks.push({
                name: 'smoke_liveness_probe',
                status: probeRes.responsive ? 'passed' : 'failed',
                reason: probeRes.responsive ? `Service responded on ${healthUrl}` : probeRes.error
            });

            if (!probeRes.responsive) {
                allIssues.push(`Service liveness probe failed: ${probeRes.error}`);
            }
        }

        // 5. API Sözleşme ve Veritabanı Mutasyon Denetimi
        if (baseUrl && dbPath) {
            const apiRes = await verifyAPIContract(baseUrl, dbPath, contract, options);
            allChecks.push(...apiRes.checks);
            allIssues.push(...apiRes.issues);
        }

        // 6. Tarayıcı / DOM Akışı Denetimi
        if (frontendUrl) {
            const browserRes = await verifyBrowserJourney(frontendUrl, {
                steps: [
                    { action: 'navigate', url: frontendUrl },
                    { action: 'assert_element', selector: 'body' }
                ]
            }, options);
            allChecks.push(...browserRes.checks);
            allIssues.push(...browserRes.issues);
        }

        // 7. Test Altyapı Denetimi
        const testInfraRes = await verifyTestInfrastructure(projectDir, contract, options);
        allChecks.push(...testInfraRes.checks);
        allIssues.push(...testInfraRes.issues);

        const hasFailures = allChecks.some(c => c.status === 'failed' || c.status === 'blocked');
        const smokePassed = !hasFailures && allIssues.length === 0;

        allChecks.push({
            name: 'smoke_gate',
            status: smokePassed ? 'passed' : 'failed',
            reason: smokePassed ? 'Unified runtime smoke verification passed all gates.' : 'Smoke verification encountered gate failures.'
        });

        return {
            passed: smokePassed,
            checks: allChecks,
            issues: allIssues
        };
    } finally {
        for (const handle of spawnedHandles) {
            try {
                await killService(handle);
            } catch {}
        }
    }
}
