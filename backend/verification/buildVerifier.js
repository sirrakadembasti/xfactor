import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { executeInSandbox } from './sandboxRunner.js';

function computeDigest(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export async function verifyBuild(projectDir, contract = {}, options = {}) {
    const checks = [];

    // 1. Dependency Presence Check (Fail-closed)
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    const nodeModulesPresent = fsSync.existsSync(nodeModulesPath);

    const packageJsonPath = path.join(projectDir, 'package.json');
    let packageJson = null;
    try {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(content);
    } catch {}

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // 2. TypeScript Typecheck Gate
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    const hasTsconfig = fsSync.existsSync(tsconfigPath);

    if (hasTsconfig) {
        if (!nodeModulesPresent) {
            checks.push({
                name: 'typecheck',
                status: 'blocked',
                reason: 'node_modules directory is missing. Cannot run deterministic typecheck.'
            });
        } else {
            try {
                const tscRes = await executeInSandbox(npxCmd, ['tsc', '--noEmit'], {
                    workspace: projectDir,
                    timeoutMs: options.timeoutMs || 60000,
                    adapter: options.adapter,
                    allowHostExecution: options.allowHostExecution
                });

                checks.push({
                    name: 'typecheck',
                    status: tscRes.passed ? 'passed' : 'failed',
                    command: `${npxCmd} tsc --noEmit`,
                    exitCode: tscRes.exitCode,
                    stdout: tscRes.stdout,
                    stderr: tscRes.stderr,
                    stdoutDigest: computeDigest(tscRes.stdout),
                    stderrDigest: computeDigest(tscRes.stderr),
                    reason: tscRes.passed ? 'TypeScript compilation check passed with 0 errors.' : `TypeScript compilation failed: ${tscRes.stderr || tscRes.stdout}`
                });
            } catch (err) {
                checks.push({
                    name: 'typecheck',
                    status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                    reason: `TypeScript typecheck execution error: ${err.message}`
                });
            }
        }
    } else {
        checks.push({
            name: 'typecheck',
            status: 'skipped',
            reason: 'No tsconfig.json found in project root.'
        });
    }

    // 3. Prisma Schema Validation Gate
    const prismaSchemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
    const hasPrisma = fsSync.existsSync(prismaSchemaPath);

    if (hasPrisma) {
        if (!nodeModulesPresent) {
            checks.push({
                name: 'prisma_validate',
                status: 'blocked',
                reason: 'node_modules is missing. Cannot run Prisma schema validator.'
            });
        } else {
            try {
                const prismaRes = await executeInSandbox(npxCmd, ['prisma', 'validate'], {
                    workspace: projectDir,
                    timeoutMs: options.timeoutMs || 30000,
                    adapter: options.adapter,
                    allowHostExecution: options.allowHostExecution
                });

                checks.push({
                    name: 'prisma_validate',
                    status: prismaRes.passed ? 'passed' : 'failed',
                    command: `${npxCmd} prisma validate`,
                    exitCode: prismaRes.exitCode,
                    stdout: prismaRes.stdout,
                    stderr: prismaRes.stderr,
                    stdoutDigest: computeDigest(prismaRes.stdout),
                    stderrDigest: computeDigest(prismaRes.stderr),
                    reason: prismaRes.passed ? 'Prisma schema is semantically valid.' : `Prisma validation failed: ${prismaRes.stderr || prismaRes.stdout}`
                });
            } catch (err) {
                checks.push({
                    name: 'prisma_validate',
                    status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                    reason: `Prisma validation execution error: ${err.message}`
                });
            }
        }
    }

    // 4. Framework Build Gate
    const hasBuildScript = Boolean(packageJson?.scripts?.build);
    if (!hasBuildScript) {
        checks.push({
            name: 'framework_build',
            gateName: 'framework_build',
            applicability: 'MANDATORY',
            status: 'blocked',
            passed: false,
            reason: 'Missing build script or sandbox capability; mandatory framework build evidence was not produced.'
        });
    } else if (!nodeModulesPresent) {
        checks.push({
            name: 'framework_build',
            status: 'blocked',
            reason: 'node_modules directory is missing. Cannot execute framework build.'
        });
    } else {
        try {
            const buildRes = await executeInSandbox(npmCmd, ['run', 'build'], {
                workspace: projectDir,
                timeoutMs: options.timeoutMs || 60000,
                adapter: options.adapter,
                allowHostExecution: options.allowHostExecution
            });

            checks.push({
                name: 'framework_build',
                status: buildRes.passed ? 'passed' : 'failed',
                command: `${npmCmd} run build`,
                exitCode: buildRes.exitCode,
                stdout: buildRes.stdout,
                stderr: buildRes.stderr,
                stdoutDigest: computeDigest(buildRes.stdout),
                stderrDigest: computeDigest(buildRes.stderr),
                reason: buildRes.passed ? 'Framework build completed successfully.' : `Framework build failed: ${buildRes.stderr || buildRes.stdout}`
            });
        } catch (err) {
            checks.push({
                name: 'framework_build',
                status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                reason: `Build execution error: ${err.message}`
            });
        }
    }

    const hasFailedOrBlocked = checks.some(c => c.status === 'failed' || c.status === 'blocked');
    const allPassedOrSkipped = checks.every(c => c.status === 'passed' || c.status === 'skipped');

    return {
        passed: allPassedOrSkipped && !hasFailedOrBlocked,
        checks
    };
}
