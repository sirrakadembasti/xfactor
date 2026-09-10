/**
 * Exhaustive backend test runner.
 * Every test*.js file is classified in testInventory.js; support modules are
 * inventory-only and all real suites are executed in isolated roots.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCompleteTestInventory, getRunnableTestFiles } from './testInventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function selectedTestFiles() {
    const override = String(process.env.XFACTOR_TEST_RUNNER_FILES || '').trim();
    if (!override) return getRunnableTestFiles().map(entry => entry.file);
    return override.split(',').map(file => file.trim()).filter(Boolean);
}

export function runTestFile(file, env, timeoutMs = 120000) {
    return new Promise((resolve) => {
        const filePath = path.join(__dirname, file);
        let settled = false;
        let proc;
        try {
            proc = spawn(process.execPath, [
                '--import', path.join(__dirname, 'preloadDatabase.js'),
                filePath
            ], {
                stdio: 'inherit',
                env: { ...process.env, ...env }
            });
        } catch (error) {
            resolve({ file, passed: false, error: `STARTUP_ERROR: ${error.message}` });
            return;
        }

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            console.error(`\n[TIMEOUT] Test suite timed out (${timeoutMs / 1000}s): ${file}`);
            try { proc.kill('SIGKILL'); } catch {}
            resolve({ file, passed: false, error: 'TIMEOUT' });
        }, timeoutMs);

        proc.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            console.error(`\n[ERROR] Test suite failed to start (${file}): ${error.message}`);
            resolve({ file, passed: false, error: `STARTUP_ERROR: ${error.message}` });
        });
        proc.on('close', (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ file, passed: code === 0, exitCode: code, signal });
        });
    });
}

export async function runAllTests({ testsDir = __dirname, timeoutMs = 120000 } = {}) {
    const inventory = await assertCompleteTestInventory(testsDir);
    const files = selectedTestFiles();
    const listed = new Set(inventory.discovered);
    const missing = files.filter(file => !listed.has(file));
    if (missing.length) {
        throw new Error(`Requested test file does not exist: ${missing.join(', ')}`);
    }

    const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-test-runner-'));
    const results = [];
    const startTime = Date.now();
    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const testDbPath = path.join(testTempDir, `test-${i}.db`);
            const testProjectsRoot = path.join(testTempDir, `projects-${i}`);
            const testArtifactsRoot = path.join(testTempDir, `artifacts-${i}`);
            const testTrashRoot = path.join(testTempDir, `trash-${i}`);
            await fs.mkdir(testProjectsRoot, { recursive: true });
            const result = await runTestFile(file, {
                NODE_ENV: 'test',
                DB_PATH: testDbPath,
                PROJECTS_ROOT: testProjectsRoot,
                ARTIFACTS_ROOT: testArtifactsRoot,
                TRASH_ROOT: testTrashRoot,
                // Docker suites must fail explicitly when Docker is unavailable.
                P8_REQUIRE_DOCKER_LIMITS: '1'
            }, timeoutMs);
            results.push(result);
        }
    } finally {
        await fs.rm(testTempDir, { recursive: true, force: true }).catch(() => {});
    }

    const failed = results.filter(result => !result.passed);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nTest summary: ${results.length - failed.length} suites passed, ${failed.length} failed (${duration}s)`);
    if (failed.length) {
        console.error(`Failed suites: ${failed.map(result => result.file).join(', ')}`);
    }
    return { results, failed, duration };
}

export async function main() {
    try {
        const { failed } = await runAllTests();
        if (failed.length) process.exitCode = 1;
    } catch (error) {
        console.error(`Test runner failed: ${error.stack || error.message}`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    await main();
}
