import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { executeInSandbox } from './sandboxRunner.js';

function computeDigest(text) {
    return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}

export async function verifyTestInfrastructure(projectDir, contract = {}, options = {}) {
    const checks = [];
    const issues = [];

    const packageJsonPath = path.join(projectDir, 'package.json');
    let packageJson = null;
    const packageFile = options.files?.find(file => String(file.path || '').replace(/\\/g, '/').toLowerCase().endsWith('/package.json') || String(file.path || '').toLowerCase() === 'package.json');
    try {
        const content = packageFile ? String(packageFile.content || '') : await fs.readFile(packageJsonPath, 'utf8');
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
    const shellComposition = typeof testScript === 'string' && /[;&|<>`\r\n]|\$\(/.test(testScript);
    const placeholder = typeof testScript === 'string'
        && (/(?:no\s+tests?\s+(?:specified|found)|echo\s+["']?test\s+not\s+implemented)/i.test(testScript)
            || shellComposition
            || !/^(?:(?:npx|pnpm exec)\s+)?(?:node(?:\.exe)?\s+--test(?:\s|$)|(?:vitest|jest|mocha|ava|tap)\b|playwright\s+test\b|bun\s+test\b)/i.test(testScript.trim()));
    if (!testScript || typeof testScript !== 'string' || testScript.trim().length === 0 || placeholder) {
        checks.push({
            name: 'test_script_presence',
            status: 'failed',
            reason: placeholder ? 'The test script is a non-testing placeholder.' : 'No "test" script declared in package.json scripts.'
        });
        issues.push(placeholder ? 'The test script is a non-testing placeholder.' : 'No "test" script declared in package.json scripts.');
        return { passed: false, checks, issues };
    }

    checks.push({
        name: 'test_script_presence',
        status: 'passed',
        reason: `Test script found: "${testScript}"`
    });

    // 2. Sandboxed Test Suite Execution
    const isDocker = options.adapter?.id === 'docker-worker' || options.adapter?.getCapabilities?.().adapterId === 'docker-worker';
    const npmCmd = isDocker ? 'npm' : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    try {
        const testRes = await executeInSandbox(npmCmd, ['test'], {
            workspace: options.workspace || projectDir,
            timeoutMs: options.timeoutMs || 60000,
            adapter: options.adapter,
            signal: options.signal,
            env: options.env
        });

        const testOutput = `${testRes.stdout || ''}\n${testRes.stderr || ''}`;
        const emptySuite = /(?:\b0\s+(?:passing|passed|tests?)\b|#\s*(?:tests|pass)\s+0\b)/i.test(testOutput);
        const executedTests = /(?:#\s*(?:tests|pass)\s+[1-9]\d*\b|\b[1-9]\d*\s+(?:passing|passed|tests?|başarılı)\b)/i.test(testOutput);
        if (testRes.passed && !emptySuite && executedTests) {
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
                reason: emptySuite || !executedTests ? 'Test runner did not prove that any test executed.' : `Test suite execution failed: ${testRes.stderr || testRes.stdout}`
            });
            issues.push(emptySuite || !executedTests ? 'Test runner did not prove that any test executed.' : `Test suite failed (exit ${testRes.exitCode}): ${testRes.stderr || testRes.stdout}`);
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
