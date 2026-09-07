import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { executeInSandbox } from './sandboxRunner.js';

function computeDigest(text) {
    return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}


export function ensureLocalBinShims(projectDir) {
    const nodeModulesDir = path.join(projectDir, 'node_modules');
    if (!fsSync.existsSync(nodeModulesDir)) return;

    const binDir = path.join(nodeModulesDir, '.bin');
    if (!fsSync.existsSync(binDir)) {
        fsSync.mkdirSync(binDir, { recursive: true });
    }

    const shims = [
        { name: 'next', target: '../next/dist/bin/next' },
        { name: 'prisma', target: '../prisma/build/index.js' }
    ];
    for (const { name, target } of shims) {
        if (!fsSync.existsSync(path.join(binDir, target))) continue;

        const cmdPath = path.join(binDir, `${name}.cmd`);
        const shPath = path.join(binDir, name);
        if (!fsSync.existsSync(cmdPath)) {
            fsSync.writeFileSync(cmdPath, `@node "%~dp0\\${target.replace(/\//g, '\\')}" %*\n`);
        }
        if (!fsSync.existsSync(shPath)) {
            fsSync.writeFileSync(shPath, `#!/bin/sh\nnode "$(dirname "$0")/${target}" "$@"\n`);
        }
    }
}

export async function verifyBuild(projectDir, contract = {}, options = {}) {
    const checks = [];
    const dependencyResult = options.dependencyResult;
    if (dependencyResult && dependencyResult.passed !== true) {
        return {
            passed: false,
            checks: [{ name: 'framework_build', status: 'blocked', reason: 'Build blocked because dependency verification did not pass.' }]
        };
    }

    const suppliedFiles = Array.isArray(options.files) ? options.files : null;
    const hasFile = name => suppliedFiles?.some(file => String(file.path || '').replace(/\\/g, '/').toLowerCase().endsWith(`/${name}`) || String(file.path || '').toLowerCase() === name);
    const fileContent = name => suppliedFiles?.find(file => String(file.path || '').replace(/\\/g, '/').toLowerCase().endsWith(`/${name}`) || String(file.path || '').toLowerCase() === name)?.content;
    const nodeModulesPresent = suppliedFiles ? true : fsSync.existsSync(path.join(projectDir, 'node_modules'));
    let packageJson = null;
    try { packageJson = JSON.parse(suppliedFiles ? String(fileContent('package.json') || '') : await fs.readFile(path.join(projectDir, 'package.json'), 'utf8')); } catch {}
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const hasTsconfig = suppliedFiles ? hasFile('tsconfig.json') : fsSync.existsSync(path.join(projectDir, 'tsconfig.json'));
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
                    workspace: options.workspace || projectDir,
                    timeoutMs: options.timeoutMs || 60000,
                    adapter: options.adapter,
                    env: options.env,
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
    const hasPrisma = suppliedFiles ? hasFile('prisma/schema.prisma') || hasFile('schema.prisma') : fsSync.existsSync(prismaSchemaPath);

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
                    workspace: options.workspace || projectDir,
                    timeoutMs: options.timeoutMs || 30000,
                    adapter: options.adapter,
                    env: {
                        DATABASE_URL: options.env?.DATABASE_URL || 'file:./dev.db',
                        ...(options.env || {})
                    },
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
                workspace: options.workspace || projectDir,
                timeoutMs: options.timeoutMs || 60000,
                adapter: options.adapter,
                env: {
                    DATABASE_URL: options.env?.DATABASE_URL || 'file:./dev.db',
                    ...(options.env || {})
                },
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
