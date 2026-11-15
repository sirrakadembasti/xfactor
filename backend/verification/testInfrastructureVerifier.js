import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { executeInSandbox } from './sandboxRunner.js';

const nativeNodeTest = /^(?:(?:npx|pnpm exec)\s+)?node(?:\.exe)?\s+(?:--import\s+tsx\s+)?--test(?:\s|$)/i;
// Real suites seed a database, start HTTP servers and compile TypeScript on the fly; give them the
// same five minutes as installation and build steps. The worker job keeps its own overall cap.
export const TEST_SUITE_TIMEOUT_MS = 300000;

function computeDigest(text) {
    return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}

export function hasExecutedTests(output, { testScript = '', files = [] } = {}) {
    if (/(?:^\s*0\s+(?:passing|passed|tests?)\b|^\s*#\s*(?:tests|pass)\s+0\b)/im.test(output)) return false;
    const counted = /(?:#\s*(?:tests|pass)\s+[1-9]\d*\b|\b[1-9]\d*\s+(?:passing|passed|tests?|başarılı)\b)/i.test(output);
    if (!counted) return false;
    if (nativeNodeTest.test(testScript.trim()) && /TAP version 13/.test(output)) {
        const names = [...output.matchAll(/^\s*ok\s+\d+\s+-\s+(.+)$/gm)].filter(match => !/\s+#\s*(?:SKIP|TODO)\b/i.test(match[1])).map(match => match[1].trim().replace(/\\/g, '/'));
        const paths = files.map(file => String(file.path || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase());
        // Node wraps an empty file in a successful file-level subtest. That wrapper
        // counts as one in TAP but contains no actual test declaration.
        return names.some(name => !paths.some(file => name.toLowerCase() === file || name.toLowerCase().endsWith('/' + file)) && !/^(?:[A-Za-z]:\/|\.\/|tests?\/).*\.[cm]?[jt]sx?$/i.test(name));
    }
    return true;
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
            || (!nativeNodeTest.test(testScript.trim())
                && !/^(?:(?:npx|pnpm exec)\s+)?(?:(?:vitest|jest|mocha|ava|tap)\b|playwright\s+test\b|bun\s+test\b)/i.test(testScript.trim())));
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
    let testRes = null;
    try {
        testRes = await executeInSandbox(npmCmd, ['test'], {
            workspace: options.workspace || projectDir,
            timeoutMs: options.timeoutMs || TEST_SUITE_TIMEOUT_MS,
            adapter: options.adapter,
            signal: options.signal,
            env: options.env,
            ...(options.ephemeralEnv ? { ephemeralEnv: options.ephemeralEnv } : {})
        });
    } catch (err) {
        // Adapters that reject on a non-zero exit still attach the command result. Keep the
        // suite's own output so failing tests stay diagnosable; it can never count as a pass.
        if (err?.code !== 'SANDBOX_UNAVAILABLE' && err?.result && typeof err.result === 'object'
            && (typeof err.result.stdout === 'string' || typeof err.result.stderr === 'string')) {
            testRes = { ...err.result, passed: false, failureMessage: err.message };
        } else {
            checks.push({
                name: 'test_suite_execution',
                status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                reason: `Test execution sandbox error: ${err.message}`
            });
            issues.push(`Test execution sandbox error: ${err.message}`);
        }
    }

    if (testRes) {
        const testOutput = `${testRes.stdout || ''}\n${testRes.stderr || ''}`;
        const emptySuite = /(?:^\s*0\s+(?:passing|passed|tests?)\b|^\s*#\s*(?:tests|pass)\s+0\b)/im.test(testOutput);
        const executedTests = hasExecutedTests(testOutput, { testScript, files: options.files || [] });
        const startedAt = testRes.startedAt || new Date().toISOString();
        const endedAt = testRes.endedAt || new Date().toISOString();
        if (testRes.passed && !emptySuite && executedTests) {
            checks.push({
                name: 'test_suite_execution',
                status: 'passed',
                command: `${npmCmd} test`,
                exitCode: testRes.exitCode,
                stdout: testRes.stdout,
                stderr: testRes.stderr,
                startedAt,
                endedAt,
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
                startedAt,
                endedAt,
                stdoutDigest: computeDigest(testRes.stdout),
                stderrDigest: computeDigest(testRes.stderr),
                reason: testRes.timedOut ? `Test suite timed out: ${testRes.failureMessage || 'deadline exceeded'}`
                    : emptySuite || !executedTests ? 'Test runner did not prove that any test executed.' : `Test suite execution failed: ${testRes.stderr || testRes.stdout}`
            });
            issues.push(emptySuite || !executedTests ? 'Test runner did not prove that any test executed.' : `Test suite failed (exit ${testRes.exitCode}): ${testRes.stderr || testRes.stdout}`);
        }
    }

    const allPassed = checks.every(c => c.status === 'passed');
    return {
        passed: allPassed && issues.length === 0,
        checks,
        issues
    };
}
