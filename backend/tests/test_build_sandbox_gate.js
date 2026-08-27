/**
 * P0.4 — Build Sandbox Gate Test Suite
 *
 * Varsayılan yapılandırmada üretilen projenin untrusted `npm run build` adımı
 * host üzerinde ÇALIŞTIRILMAZ; gerçek sandbox runner yoksa build gate
 * fail-closed'dur. Host modu yalnız açık opt-in (XFACTOR_BUILD_SANDBOX=host)
 * ile devreye girer ve mevcut executeSafeCommand yolunu kullanır.
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import { validateProjectBuild, resolveBuildSandboxMode } from '../engine/buildValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '../data', `test-build-sandbox-gate-${Date.now()}`);

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
await runTest("A. Default (unsandboxed): framework_build skipped + passed=false (fail-closed); host build NOT executed", async () => {
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

    // Sözleşme: resolveBuildSandboxMode varsayılanında 'sandboxed' dönmeli.
    assert.strictEqual(resolveBuildSandboxMode(), 'sandboxed', 'Varsayılan mod sandboxed olmalı');

    const result = await validateProjectBuild(dir, { title: 'Default Unsandboxed' }, {});

    // 1) Fail-closed: toplam sonuç passed olmamalı.
    assert.strictEqual(result.passed, false, 'Sandbox runner yokken build gate fail-closed (passed=false) olmalı');

    // 2) framework_build check'i skipped ve reddedilme sebebiyle işaretlenmeli.
    const buildCheck = result.checks.find(c => c.name === 'framework_build');
    assert.ok(buildCheck, 'framework_build check mevcut olmalı');
    assert.strictEqual(buildCheck.status, 'skipped', 'framework_build status skipped olmalı');
    assert.ok(
        buildCheck.reason && buildCheck.reason.includes('refusing to run untrusted build on host'),
        `framework_build reddedilme sebebi içermeli (aldı: ${buildCheck.reason})`
    );

    // 3) Build host'ta ÇALIŞTIRILMADI: marker dosyası oluşmamalı.
    assert.strictEqual(
        fsSync.existsSync(path.join(dir, 'BUILD_RAN_MARKER')),
        false,
        'Untrusted build host üzerinde çalıştırılmamalı (BUILD_RAN_MARKER oluşmamalı)'
    );

    // 4) AYRIM (distinction): node_modules YOKSA eski 'skipped' davranışı korunur;
    //    build gate fail-closed DEĞİL → passed etkilenmez (true olabilir).
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
    assert.strictEqual(noNmBuildCheck.status, 'skipped', 'node_modules yokken build skipped olmalı');
    assert.strictEqual(
        noNmBuildCheck.reason,
        'No build script or node_modules found',
        'node_modules yokken eski skipped sebebi korunmalı'
    );
    assert.strictEqual(
        noNmResult.passed,
        true,
        'node_modules yokken build gate fail-closed OLMAMALI (passed=true korunmalı)'
    );
});

// (b) XFACTOR_BUILD_SANDBOX=host: mevcut host build yolu çalışır;
// bilinen FAIL fixture (build exit 1) failed döner.
await runTest("B. XFACTOR_BUILD_SANDBOX=host: host build path runs; failing build script returns failed", async () => {
    process.env.XFACTOR_BUILD_SANDBOX = 'host';

    const dir = path.join(TEST_DIR, 'host-fail');
    await fs.mkdir(path.join(dir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({
        name: 'host-fail-app',
        version: '1.0.0',
        scripts: {
            build: 'node -e "console.error(\'Critical build failure!\'); process.exit(1);"'
        }
    }, null, 2), 'utf8');

    assert.strictEqual(resolveBuildSandboxMode(), 'host', 'XFACTOR_BUILD_SANDBOX=host iken mod host olmalı');

    const result = await validateProjectBuild(dir, { title: 'Host Fail' }, {});

    assert.strictEqual(result.passed, false, 'Host modunda başarısız build passed=false olmalı');
    const buildCheck = result.checks.find(c => c.name === 'framework_build');
    assert.ok(buildCheck, 'framework_build check mevcut olmalı');
    assert.strictEqual(buildCheck.status, 'failed', 'Host modunda başarısız build status failed olmalı');
    assert.ok(result.issues.some(i => i.includes('Framework Build Hatası')), 'Build hatası detayı raporlanmalı');
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
