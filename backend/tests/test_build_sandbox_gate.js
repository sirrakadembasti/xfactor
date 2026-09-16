/**
 * P0.4 — Build Sandbox Gate Test Suite
 *
 * Üretilen projenin untrusted `npm run build` adımı host üzerinde
 * ÇALIŞTIRILMAZ. Sandbox capability yoksa build gate fail-closed kalır;
 * `XFACTOR_BUILD_SANDBOX=host` bu sınırı değiştirmez.
 */

import assert from 'assert';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { validateProjectBuild } from '../engine/buildValidator.js';

const TEST_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-build-sandbox-gate-'));

console.log("==================================================");
console.log("P0.4 Build Sandbox Gate Test Suite");
console.log("==================================================");

let passedCount = 0;
let failedCount = 0;

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         Hata: ${err.message}`);
        failedCount++;
    }
}

// (a) Varsayılan env (sandbox tanımsız): node_modules + build script varsa →
// framework_build 'skipped' üretilir VE sonuç 'passed' OLMAZ (fail-closed).
// Ayrıca untrusted build host'ta çalıştırılmaz (BUILD_RAN_MARKER oluşmamalı).
await runTest("A. Default (unsandboxed): framework_build blocked + passed=false (fail-closed); host build NOT executed", async () => {
    delete process.env.XFACTOR_BUILD_SANDBOX;

    const dir = path.join(TEST_DIR, 'default-unsandboxed');
    await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
        name: 'default-build-app',
        version: '1.0.0',
        scripts: {
            // Eğer host üzerinde çalıştırılırsa bir marker dosyası yazar (RED kanıtı).
            build: 'node -e "require(\'fs\').writeFileSync(\'BUILD_RAN_MARKER\',\'1\')"'
        }
    }, null, 2), 'utf8');


    const result = await validateProjectBuild(dir, { title: 'Default Unsandboxed' }, {});

    // 1) Fail-closed: toplam sonuç passed olmamalı.
    assert.strictEqual(result.passed, false, 'Sandbox runner yokken build gate fail-closed (passed=false) olmalı');

    // 2) framework_build is blocked with the refusal reason.
    const buildCheck = result.checks.find(c => c.name === 'framework_build');
    assert.ok(buildCheck, 'framework_build check mevcut olmalı');
    assert.strictEqual(buildCheck.status, 'blocked', 'framework_build status blocked olmalı');
    assert.ok(
        buildCheck.reason && /Sandboxed build runner unavailable|restricted-token and Job Object isolation|sandbox runtime is not available/.test(buildCheck.reason),
    );

    // 3) Build host'ta ÇALIŞTIRILMADI: marker dosyası oluşmamalı.
    assert.strictEqual(
        fsSync.existsSync(path.join(dir, 'BUILD_RAN_MARKER')),
        false,
        'Untrusted build host üzerinde çalıştırılmamalı (BUILD_RAN_MARKER oluşmamalı)'
    );

    // 4) Missing dependencies are also blocked and never authorize PASS.
    const noNodeModulesDir = path.join(TEST_DIR, 'no-node_modules');
    await fs.mkdir(noNodeModulesDir, { recursive: true });
    await fs.writeFile(path.join(noNodeModulesDir, 'package.json'), JSON.stringify({
        name: 'no-node-modules-app',
        version: '1.0.0',
        scripts: { build: 'node -e "process.exit(0)"' }
    }, null, 2), 'utf8');

    const noNmResult = await validateProjectBuild(noNodeModulesDir, { title: 'No Node Modules' }, {});
    const noNmBuildCheck = noNmResult.checks.find(c => c.name === 'framework_build');
    assert.ok(noNmBuildCheck, 'node_modules yokken framework_build check mevcut olmalı');
    assert.strictEqual(noNmBuildCheck.status, 'blocked', 'node_modules yokken framework_build blocked olmalı');
    assert.strictEqual(noNmResult.passed, false, 'node_modules yokken mandatory build PASS olmamalı');
});

// (b) Legacy host flag güven sınırını değiştirmez.
await runTest("B. XFACTOR_BUILD_SANDBOX=host: build remains blocked and host script does not run", async () => {
    process.env.XFACTOR_BUILD_SANDBOX = 'host';

    const dir = path.join(TEST_DIR, 'host-flag-ignored');
    await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
        name: 'host-flag-ignored-app',
        version: '1.0.0',
        scripts: {
            build: 'node -e "require(\'fs\').writeFileSync(\'BUILD_RAN_MARKER\',\'1\')"'
        }
    }, null, 2), 'utf8');

    const result = await validateProjectBuild(dir, { title: 'Host Flag Ignored' }, {});

    assert.strictEqual(result.passed, false);
    const buildCheck = result.checks.find(c => c.name === 'framework_build');
    assert.ok(buildCheck);
    assert.strictEqual(buildCheck.status, 'blocked');
    assert.strictEqual(
        fsSync.existsSync(path.join(dir, 'BUILD_RAN_MARKER')),
        false,
        'Legacy host flag must not execute generated build scripts'
    );
});

// Temizlik
try {
    delete process.env.XFACTOR_BUILD_SANDBOX;
    await fs.rm(TEST_DIR, { recursive: true, force: true });
} catch {}

console.log("==================================================");
console.log(`🎉 Build Sandbox Gate Testleri: ${passedCount} Başarılı, ${failedCount} Hatalı`);
console.log("==================================================");

if (failedCount > 0) {
    process.exit(1);
}
