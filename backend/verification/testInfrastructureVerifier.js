import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { executeInSandbox } from './sandboxRunner.js';

function computeDigest(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export async function verifyTestInfrastructure(projectDir, contract = {}, options = {}) {
    const checks = [];
    const issues = [];

    const packageJsonPath = path.join(projectDir, 'package.json');
    let packageJson = null;

    // 1. package.json and test script check
    try {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(content);
    } catch (err) {
        checks.push({
            name: 'test_script_presence',
            status: 'failed',
            reason: `package.json is missing or invalid: ${err.message}`
        });
        issues.push(`package.json is missing or invalid: ${err.message}`);
        return { passed: false, checks, issues };
    }

    const testScript = packageJson?.scripts?.test;
    if (!testScript || typeof testScript !== 'string' || testScript.trim().length === 0) {
        checks.push({
            name: 'test_script_presence',
            status: 'failed',
            reason: 'No "test" script declared in package.json scripts.'
        });
        issues.push('No "test" script declared in package.json scripts.');
        return { passed: false, checks, issues };
    }

    checks.push({
        name: 'test_script_presence',
        status: 'passed',
        reason: `Test script found: "${testScript}"`
    });

    // 2. Sandboxed Test Suite Execution
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    try {
        const testRes = await executeInSandbox(npmCmd, ['test'], {
            workspace: projectDir,
            timeoutMs: options.timeoutMs || 60000,
            adapter: options.adapter
        });

        if (testRes.passed) {
            checks.push({
                name: 'test_suite_execution',
                status: 'passed',
                command: `${npmCmd} test`,
                exitCode: testRes.exitCode,
                stdout: testRes.stdout,
                stderr: testRes.stderr,
                stdoutDigest: computeDigest(testRes.stdout),
                stderrDigest: computeDigest(testRes.stderr),
                reason: 'Test suite executed and passed with 0 errors.'
            });
        } else {
            checks.push({
                name: 'test_suite_execution',
                status: 'failed',
                command: `${npmCmd} test`,
                exitCode: testRes.exitCode,
                stdout: testRes.stdout,
                stderr: testRes.stderr,
                stdoutDigest: computeDigest(testRes.stdout),
                stderrDigest: computeDigest(testRes.stderr),
                reason: `Test suite execution failed: ${testRes.stderr || testRes.stdout}`
            });
            issues.push(`Test suite failed (exit ${testRes.exitCode}): ${testRes.stderr || testRes.stdout}`);
        }
    } catch (err) {
        checks.push({
            name: 'test_suite_execution',
            status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
            reason: `Test execution sandbox error: ${err.message}`
        });
        issues.push(`Test execution sandbox error: ${err.message}`);
    }

    const allPassed = checks.every(c => c.status === 'passed');
    return {
        passed: allPassed && issues.length === 0,
        checks,
        issues
    };
}
