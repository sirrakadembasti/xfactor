/**
 * ⚡ XFactor Master Test Runner
 * Tüm backend test süitlerini sırayla çalıştırır ve tek bir özet raporlar.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
    'test_backend.js',
    'test_quality_gate.js',
    'test_deep_verification.js',
    'test_tur2_edge_cases.js',
    'test_runtime_verification.js',
    'test_e2e_simulation.js'
];

async function runTestFile(file) {
    return new Promise((resolve) => {
        const filePath = path.join(__dirname, file);
        const proc = spawn(process.execPath, [filePath], { stdio: 'inherit' });
        proc.on('close', (code) => {
            resolve({ file, passed: code === 0 });
        });
    });
}

async function main() {
    console.log("==================================================");
    console.log("🚀 XFactor Tüm Test Süitleri Çalıştırılıyor...");
    console.log("==================================================\n");

    const startTime = Date.now();
    const results = [];

    for (const file of testFiles) {
        const res = await runTestFile(file);
        results.push(res);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const failedCount = results.filter(r => !r.passed).length;
    const passedCount = results.filter(r => r.passed).length;

    console.log("\n==================================================");
    console.log(`📊 Test Özeti: ${passedCount} Süit Başarılı, ${failedCount} Süit Hatalı (${duration} sn)`);
    console.log("==================================================");

    if (failedCount > 0) {
        process.exit(1);
    }
}

main().catch(console.error);
