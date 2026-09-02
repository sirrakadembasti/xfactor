/**
 * Sub-project 3.2: Subprocess Sandbox, Environment Scrubbing & Granular Validation
 * Test Suite
 */

import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import {
    executeSafeCommand,
    getSanitizedSubprocessEnv,
    killProcessTree,
    validateProjectBuild
} from '../engine/buildValidator.js';
import { createProject, deleteProject, getProjectDir } from '../projectRepository.js';

let testProjectId = null;
let projectDir = null;

async function setup() {
    const project = await createProject({
        title: 'Subprocess Sandbox Test Project',
        description: 'Testing subprocess isolation and environment sanitization'
    });
    testProjectId = project.id;
    projectDir = getProjectDir(project.id);
}

async function teardown() {
    if (testProjectId) {
        try {
            await deleteProject(testProjectId);
        } catch {}
    }
}

async function runTests() {
    console.log('==================================================');
    console.log('⚡ Sub-project 3.2: Subprocess Sandbox & Validation');
    console.log('==================================================');

    let passed = 0;
    let failed = 0;

    await setup();

    try {
        // Test 1: Environment variable sanitization (scrub host secrets)
        try {
            const dirtyEnv = {
                PATH: process.env.PATH || '',
                NODE_ENV: 'production',
                GEMINI_API_KEY: 'secret-gemini-key-12345',
                OPENAI_API_KEY: 'sk-test-openai-secret',
                JWT_SECRET: 'my-super-jwt-secret',
                SESSION_SECRET: 'session-secret-xyz',
                DB_PASSWORD: 'admin_password_123',
                CUSTOM_SAFE_VAR: 'hello-world'
            };

            const cleanEnv = getSanitizedSubprocessEnv(dirtyEnv);

            // Host secrets must be completely stripped
            assert.strictEqual(cleanEnv.GEMINI_API_KEY, undefined, 'GEMINI_API_KEY must be scrubbed');
            assert.strictEqual(cleanEnv.OPENAI_API_KEY, undefined, 'OPENAI_API_KEY must be scrubbed');
            assert.strictEqual(cleanEnv.JWT_SECRET, undefined, 'JWT_SECRET must be scrubbed');
            assert.strictEqual(cleanEnv.SESSION_SECRET, undefined, 'SESSION_SECRET must be scrubbed');
            assert.strictEqual(cleanEnv.DB_PASSWORD, undefined, 'DB_PASSWORD must be scrubbed');

            // Safe environment variables must remain
            assert(cleanEnv.PATH, 'PATH must be preserved');
            assert.strictEqual(cleanEnv.CI, 'true', 'CI must be set to true');
            assert.strictEqual(cleanEnv.NODE_ENV, 'test', 'NODE_ENV must be forced to test');
            assert.strictEqual(cleanEnv.CUSTOM_SAFE_VAR, 'hello-world', 'Safe custom vars must be preserved');

            console.log('  [PASS] 1. Environment variable sanitization and secret scrubbing');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 1. Environment sanitization:', err.message);
            failed++;
        }

        // Test 2: executeSafeCommand strips host secrets during real subprocess execution
        try {
            process.env.TEST_HOST_SECRET_TOKEN = 'SUPER_SECRET_HOST_VAL_999';

            // Run node command printing environment variable
            const result = await executeSafeCommand('node', ['-e', 'console.log(JSON.stringify({ secret: process.env.TEST_HOST_SECRET_TOKEN, ci: process.env.CI }))'], {
                cwd: projectDir
            });

            if (result.status === 'BLOCKED' || result.code === 'SANDBOX_UNAVAILABLE') {
                assert.match(result.reason || result.stderr || '', /sandbox|isolation|unavailable/i);
            } else {
                assert.strictEqual(result.passed, true, 'Command should pass');
                const parsed = JSON.parse(result.stdout);
                assert.strictEqual(parsed.secret, undefined, 'Host secret must not be visible in subprocess');
                assert.strictEqual(parsed.ci, 'true', 'CI flag must be present');
            }

            delete process.env.TEST_HOST_SECRET_TOKEN;
            console.log('  [PASS] 2. Subprocess execution is isolated or fail-closed when sandbox unavailable');
            passed++;
        } catch (err) {
            if (err.code === 'SANDBOX_UNAVAILABLE') {
                delete process.env.TEST_HOST_SECRET_TOKEN;
                console.log('  [PASS] 2. Subprocess execution blocked without sandbox capability');
                passed++;
            } else {
                console.log('  [FAIL] 2. Subprocess execution secret isolation:', err.message);
                failed++;
            }

        }
        // Test 3: Process tree kill on timeout
        try {
            // Spawn an infinite loop subprocess with short timeout
            const start = Date.now();
            const result = await executeSafeCommand('node', ['-e', 'setInterval(() => {}, 1000)'], {
                cwd: projectDir,
                timeoutMs: 500
            });
            const duration = Date.now() - start;

            assert.strictEqual(result.passed, false, 'Timed out process must not pass');
            assert.strictEqual(result.timedOut, true, 'Result must report timedOut = true');
            assert(duration < 8000, `Process should be killed promptly, took ${duration}ms`);

            console.log('  [PASS] 3. Process tree termination and hard kill on timeout');
            passed++;
        } catch (err) {
            if (err.code === 'SANDBOX_UNAVAILABLE') {
                console.log('  [PASS] 3. Timeout command blocked without sandbox capability');
                passed++;
            } else {
                console.log('  [FAIL] 3. Process tree termination on timeout:', err.message);
                failed++;
            }
        }

        // Test 4: Granular validation checks report distinct status: passed, failed, skipped
        try {
            // Project with no Prisma and no TS -> Prisma and TS checks must report status: "skipped"
            const buildRes = await validateProjectBuild(projectDir, {}, {});

            assert.strictEqual(typeof buildRes.passed, 'boolean');
            assert(Array.isArray(buildRes.checks), 'Checks must be an array');

            const skippedPrisma = buildRes.checks.find(c => c.name === 'prisma_semantic_validation');
            assert(skippedPrisma, 'Should include prisma check entry');
            assert.strictEqual(skippedPrisma.status, 'skipped', 'Prisma check should have status="skipped"');
            assert(skippedPrisma.reason, 'Skipped check should provide reason');

            const skippedTs = buildRes.checks.find(c => c.name === 'typescript_typecheck');
            assert(skippedTs, 'Should include typescript check entry');
            assert.strictEqual(skippedTs.status, 'skipped', 'TypeScript check should have status="skipped"');
            assert(skippedTs.reason, 'Skipped check should provide reason');

            console.log('  [PASS] 4. Granular validation reports distinct passed/failed/skipped statuses');
            passed++;
        } catch (err) {
            console.log('  [FAIL] 4. Granular validation check status:', err.message);
            failed++;
        }

    } finally {
        await teardown();
    }

    console.log('==================================================');
    console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
