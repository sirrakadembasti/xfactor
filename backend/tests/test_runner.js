/**
 * ⚡ XFactor Master Test Runner
 * Tüm backend test süitlerini sırayla çalıştırır ve tek bir özet raporlar.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
    'test_test_harness.js',
    'test_http_integration.js',
    'test_websocket_integration.js',
    'test_backend.js',
    'test_admin_cli.js',
    'test_project_repository.js',
    'test_workflow_attempts.js',
    'test_cancellation_and_deadlines.js',
    'test_generation_isolation.js',
    'test_subprocess_sandbox.js',
    'test_agent_contract_schemas.js',
    'test_database_migrations.js',
    'test_health_and_lifecycle.js',
    'test_concurrency_pool.js',
    'test_build_validator.js',
    'test_quality_gate.js',
    'test_docs_agent_sync.js',
    'test_deep_verification.js',
    'test_tur2_edge_cases.js',
    'test_runtime_verification.js',
    'test_e2e_simulation.js',
    'test_disk_sync_and_isolation.js',
    'test_p2_frontend.js',
    'test_p2_security_auth.js',
    'test_p3_observability.js'
];

async function runTestFile(file, env, timeoutMs = 60000) {
    return new Promise((resolve) => {
        const filePath = path.join(__dirname, file);
        const proc = spawn(process.execPath, [filePath], {
            stdio: 'inherit',
            env: {
                ...process.env,
                ...env
            }
        });

        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                console.error(`\n[TIMEOUT] Test süiti zaman aşımına uğradı (${timeoutMs / 1000} sn): ${file}`);
                try {
                    proc.kill('SIGKILL');
                } catch {}
                resolve({ file, passed: false, error: 'TIMEOUT' });
            }
        }, timeoutMs);

        proc.on('error', (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                console.error(`\n[ERROR] Alt süreç başlatma hatası (${file}):`, err.message);
                resolve({ file, passed: false, error: err.message });
            }
        });

        proc.on('close', (code) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ file, passed: code === 0 });
            }
        });
    });
}

async function main() {
    console.log("==================================================");
    console.log("🚀 XFactor Tüm Test Süitleri Çalıştırılıyor...");
    console.log("==================================================\n");

    const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-test-runner-'));

    const startTime = Date.now();
    const results = [];

    try {
        for (let i = 0; i < testFiles.length; i++) {
            const file = testFiles[i];
            const testDbPath = path.join(testTempDir, `test-${i}.db`);
            const testProjectsRoot = path.join(testTempDir, `projects-${i}`);
            await fs.mkdir(testProjectsRoot, { recursive: true });

            const testEnv = {
                NODE_ENV: 'test',
                DB_PATH: testDbPath,
                PROJECTS_ROOT: testProjectsRoot
            };

            const res = await runTestFile(file, testEnv);
            results.push(res);
        }
    } finally {
        await fs.rm(testTempDir, { recursive: true, force: true }).catch(() => {});
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const failedFiles = results.filter(r => !r.passed).map(r => r.file);
    const failedCount = failedFiles.length;
    const passedCount = results.filter(r => r.passed).length;

    if (failedFiles.length > 0) {
        console.log("\n❌ Başarısız Süitler:");
        for (const f of failedFiles) {
            console.log(`  - ${f}`);
        }
    }

    console.log("\n==================================================");
    console.log(`📊 Test Özeti: ${passedCount} Süit Başarılı, ${failedCount} Süit Hatalı (${duration} sn)`);
    console.log("==================================================");

    if (failedCount > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
