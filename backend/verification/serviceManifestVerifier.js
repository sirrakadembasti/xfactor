import fs from 'fs/promises';
import path from 'path';

export async function verifyServiceManifest(projectDir, contract = {}) {
    const checks = [];
    const issues = [];

    const manifestPath = path.join(projectDir, 'service-manifest.json');
    let manifest = null;

    // 1. Manifest Varlık ve JSON Geçerlilik Kontrolü
    try {
        const content = await fs.readFile(manifestPath, 'utf8');
        manifest = JSON.parse(content);
        checks.push({
            name: 'manifest_presence',
            status: 'passed',
            reason: 'service-manifest.json exists and is valid JSON.'
        });
    } catch (err) {
        checks.push({
            name: 'manifest_presence',
            status: 'failed',
            reason: `service-manifest.json is missing or invalid: ${err.message}`
        });
        issues.push(`service-manifest.json is missing or invalid: ${err.message}`);
        return {
            passed: false,
            checks,
            issues
        };
    }

    // 2. Servis Tanımları ve Port Benzersizliği Kontrolü
    const services = manifest.services && typeof manifest.services === 'object' ? manifest.services : {};
    const serviceNames = Object.keys(services);

    if (serviceNames.length === 0) {
        checks.push({
            name: 'service_definitions',
            status: 'failed',
            reason: 'No services declared in service-manifest.json.'
        });
        issues.push('No services declared in service-manifest.json.');
    } else {
        checks.push({
            name: 'service_definitions',
            status: 'passed',
            reason: `${serviceNames.length} service(s) declared.`
        });
    }

    const seenPorts = new Map();
    let portCollision = false;

    for (const [svcName, svcConfig] of Object.entries(services)) {
        if (!svcConfig || typeof svcConfig !== 'object') {
            issues.push(`Service "${svcName}" configuration must be an object.`);
            continue;
        }

        const port = Number(svcConfig.port);
        if (!port || isNaN(port) || port < 1024 || port > 65535) {
            issues.push(`Service "${svcName}" declared an invalid port: ${svcConfig.port}. Must be between 1024 and 65535.`);
            continue;
        }

        if (seenPorts.has(port)) {
            portCollision = true;
            const conflictSvc = seenPorts.get(port);
            issues.push(`Port collision detected: Port ${port} is declared by both "${conflictSvc}" and "${svcName}".`);
        } else {
            seenPorts.set(port, svcName);
        }
    }

    if (portCollision) {
        checks.push({
            name: 'port_uniqueness',
            status: 'failed',
            reason: 'One or more services have conflicting port assignments.'
        });
    } else if (serviceNames.length > 0) {
        checks.push({
            name: 'port_uniqueness',
            status: 'passed',
            reason: 'All declared services have unique valid loopback ports.'
        });
    }

    const allPassed = checks.every(c => c.status === 'passed');
    return {
        passed: allPassed && issues.length === 0,
        checks,
        issues
    };
}
