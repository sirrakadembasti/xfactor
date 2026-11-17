/**
 * Exhaustive backend test runner.
 * Every test*.js file is classified in testInventory.js; support modules are
 * inventory-only and all real suites are executed in isolated roots.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { db, initializeDatabase, checkpointWAL, closeDatabase } from '../db.js';
import { assertCompleteTestInventory, getRunnableTestFiles } from './testInventory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function selectedTestFiles() {
    const override = String(process.env.XFACTOR_TEST_RUNNER_FILES || '').trim();
    if (!override) return getRunnableTestFiles().map(entry => entry.file);
    return override.split(',').map(file => file.trim()).filter(Boolean);
}

export function runTestFile(file, env, timeoutMs = 120000, testsDir = __dirname) {
    return new Promise((resolve) => {
        const filePath = path.join(testsDir, file);
        let settled = false;
        let proc;
        try {
            proc = spawn(process.execPath, [
                '--import', pathToFileURL(path.join(__dirname, 'preloadDatabase.js')).href,
                filePath
            ], {
                stdio: 'inherit',
                env: { ...process.env, ...env }
            });
        } catch (error) {
            resolve({ file, passed: false, reason: 'startup', error: `STARTUP_ERROR: ${error.message}` });
            return;
        }

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            console.error(`\n[TIMEOUT] Test suite timed out (${timeoutMs / 1000}s): ${file}`);
            try { proc.kill('SIGKILL'); } catch {}
            resolve({ file, passed: false, reason: 'timeout', error: 'TIMEOUT' });
        }, timeoutMs);

        proc.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            console.error(`\n[ERROR] Test suite failed to start (${file}): ${error.message}`);
            resolve({ file, passed: false, reason: 'startup', error: `STARTUP_ERROR: ${error.message}` });
        });
        proc.on('close', (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(code === 0
                ? { file, passed: true, exitCode: code, signal }
                : { file, passed: false, reason: 'exit', exitCode: code, signal });
        });
    });
}

export function formatFailedSuites(failed, timeoutMs = 120000) {
    const describe = (result) => {
        if (result.reason === 'timeout') return `timeout ${timeoutMs / 1000}s`;
        if (result.reason === 'startup') return 'startup';
        return `exit ${result.exitCode ?? result.signal ?? 'unknown'}`;
    };
    const line = `Failed suites: ${failed.map(result => `${result.file} (${describe(result)})`).join(', ')}`;
    const warning = failed.some(result => result.reason === 'timeout')
        ? 'Zaman aşımı yük kaynaklı olabilir; bu süitleri tek başına yeniden koşun.'
        : null;
    return { line, warning };
}

export async function runAllTests({ testsDir = __dirname, timeoutMs = 120000, concurrency } = {}) {
    const inventory = await assertCompleteTestInventory(testsDir);
    const files = selectedTestFiles();
    const listed = new Set(inventory.discovered);
    const missing = files.filter(file => !listed.has(file));
    if (missing.length) {
        throw new Error(`Requested test file does not exist: ${missing.join(', ')}`);
    }

    const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-test-runner-'));
    const templateDbPath = path.join(testTempDir, 'template.db');
    const results = new Array(files.length);
    const startTime = Date.now();
    const configuredConcurrency = Number.parseInt(concurrency ?? process.env.XFACTOR_TEST_CONCURRENCY ?? '', 10);
    const defaultConcurrency = Math.min(2, Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
    const workerCount = Math.max(1, Math.min(files.length || 1, Number.isFinite(configuredConcurrency) && configuredConcurrency > 0 ? configuredConcurrency : defaultConcurrency));
    try {
        if (!db) {
            initializeDatabase({ path: templateDbPath });
            checkpointWAL();
            db.exec('PRAGMA journal_mode = DELETE;');
            closeDatabase();
        }
        let nextIndex = 0;
        const runWorker = async () => {
            while (true) {
                const i = nextIndex++;
                if (i >= files.length) break;
                const file = files[i];
                const testDbPath = path.join(testTempDir, `test-${i}.db`);
                const testProjectsRoot = path.join(testTempDir, `projects-${i}`);
                const testArtifactsRoot = path.join(testTempDir, `artifacts-${i}`);
                const testTrashRoot = path.join(testTempDir, `trash-${i}`);
                await fs.mkdir(testProjectsRoot, { recursive: true });
                await fs.copyFile(templateDbPath, testDbPath).catch(() => {});
                results[i] = await runTestFile(file, {
                    NODE_ENV: 'test',
                    DB_PATH: testDbPath,
                    XFACTOR_TEMPLATE_DB_PATH: templateDbPath,
                    PROJECTS_ROOT: testProjectsRoot,
                    ARTIFACTS_ROOT: testArtifactsRoot,
                    TRASH_ROOT: testTrashRoot,
                    // Tests must never select or mutate the operator's active LLM
                    // profiles while exercising a real workflow with fake agents.
                    LLM_CONFIG_PATH: path.join(testTempDir, `llm-profiles-${i}.json`),
                    // dotenv must not reintroduce operator credentials into a
                    // workflow fixture. Tests needing transport use explicit fake
                    // options/profiles and intercepted requests.
                    GOOGLE_API_KEY: '', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '',
                    DEEPSEEK_API_KEY: '', QWEN_API_KEY: '', MINIMAX_API_KEY: '',
                    KIMI_API_KEY: '', XIAOMI_MIMO_API_KEY: '', ANTHROPIC_API_KEY: '',
                    // Docker suites must fail explicitly when Docker is unavailable in CI.
                    ...(process.env.P8_REQUIRE_DOCKER_LIMITS !== undefined
                        ? { P8_REQUIRE_DOCKER_LIMITS: process.env.P8_REQUIRE_DOCKER_LIMITS }
                        : (process.platform === 'linux' ? { P8_REQUIRE_DOCKER_LIMITS: '1' } : {}))
                }, timeoutMs);
            }
        };
        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    } finally {
        await fs.rm(testTempDir, { recursive: true, force: true }).catch(() => {});
    }

    const failed = results.filter(result => !result.passed);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nTest summary: ${results.length - failed.length} suites passed, ${failed.length} failed (${duration}s)`);
    if (failed.length) {
        const summary = formatFailedSuites(failed, timeoutMs);
        console.error(summary.line);
        if (summary.warning) console.error(summary.warning);
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
