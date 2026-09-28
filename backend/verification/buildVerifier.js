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

async function runSandboxCheck(checks, {
    name,
    command,
    args,
    workspace,
    timeoutMs,
    adapter,
    env,
    successReason,
    failurePrefix
}) {
    try {
        const result = await executeInSandbox(command, args, {
            workspace,
            timeoutMs,
            adapter,
            env
        });
        const passed = Boolean(result.passed);
        checks.push({
            name,
            status: passed ? 'passed' : 'failed',
            command: `${command} ${args.join(' ')}`,
            exitCode: result.exitCode,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            stdoutDigest: computeDigest(result.stdout),
            stderrDigest: computeDigest(result.stderr),
            reason: passed ? successReason : `${failurePrefix}: ${result.stderr || result.stdout}`
        });
        return passed;
    } catch (error) {
        checks.push({
            name,
            status: error.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
            command: `${command} ${args.join(' ')}`,
            exitCode: error.exitCode ?? null,
            stdout: error.stdout || '',
            stderr: error.stderr || error.message || '',
            stdoutDigest: computeDigest(error.stdout),
            stderrDigest: computeDigest(error.stderr || error.message),
            reason: `${failurePrefix}: ${error.message}`
        });
        return false;
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
    const isDocker = options.adapter?.id === 'docker-worker' || options.adapter?.getCapabilities?.().adapterId === 'docker-worker';
    const npmCmd = isDocker ? 'npm' : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const npxCmd = isDocker ? 'npx' : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
    const hasTsconfig = suppliedFiles ? hasFile('tsconfig.json') : fsSync.existsSync(path.join(projectDir, 'tsconfig.json'));
    // Prisma kontrolleri (validate, generate, db push, seed) typecheck'ten ÖNCE çalıştırılmalıdır,
    // çünkü kod Prisma modellerini import eder ve prisma generate olmadan typecheck TS2305 verir.
    let prismaPushed = false;
    const prismaSchemaPath = path.join(projectDir, 'prisma', 'schema.prisma');
    const hasPrisma = suppliedFiles ? hasFile('prisma/schema.prisma') || hasFile('schema.prisma') : fsSync.existsSync(prismaSchemaPath);
    const prismaSchema = hasPrisma
        ? String(suppliedFiles ? fileContent('prisma/schema.prisma') ?? fileContent('schema.prisma') ?? '' : await fs.readFile(prismaSchemaPath, 'utf8'))
        : '';
    const requiresSeededAccounts = /^\s*model\s+User\s*\{/m.test(prismaSchema);
    const workspace = options.workspace || projectDir;
    const hasSeedFile = suppliedFiles ? hasFile('prisma/seed.ts') : fsSync.existsSync(path.join(projectDir, 'prisma', 'seed.ts'));
    const seedCommand = packageJson?.prisma?.seed;
    const seedScript = packageJson?.scripts?.['prisma:seed'];
    const seedConfigured = typeof seedCommand === 'string'
        && seedCommand.trim().length > 0
        && typeof seedScript === 'string'
        && seedScript.trim() === 'prisma db seed';

    if (hasPrisma) {
        const prismaEnv = {
            DATABASE_URL: options.env?.DATABASE_URL || 'file:./dev.db',
            ...(options.env || {})
        };
        if (!nodeModulesPresent) {
            for (const name of ['prisma_validate', 'prisma_generate', 'prisma_db_push', 'prisma_seed', 'prisma_seed_accounts']) {
                checks.push({
                    name,
                    status: 'blocked',
                    reason: 'node_modules directory is missing. Cannot run Prisma commands.'
                });
            }
        } else {
            const validated = await runSandboxCheck(checks, {
                name: 'prisma_validate',
                command: npxCmd,
                args: ['prisma', 'validate'],
                workspace,
                timeoutMs: options.timeoutMs || 120000,
                adapter: options.adapter,
                env: prismaEnv,
                successReason: 'Prisma schema is semantically valid.',
                failurePrefix: 'Prisma validation failed'
            });
            const generated = validated && await runSandboxCheck(checks, {
                name: 'prisma_generate',
                command: npxCmd,
                args: ['prisma', 'generate'],
                workspace,
                timeoutMs: options.timeoutMs || 120000,
                adapter: options.adapter,
                env: prismaEnv,
                successReason: 'Prisma client generation completed in the isolated worker.',
                failurePrefix: 'Prisma client generation failed'
            });
            prismaPushed = generated && await runSandboxCheck(checks, {
                name: 'prisma_db_push',
                command: npxCmd,
                args: ['prisma', 'db', 'push', '--skip-generate'],
                workspace,
                timeoutMs: options.timeoutMs || 120000,
                adapter: options.adapter,
                env: prismaEnv,
                successReason: 'Prisma database push completed in the isolated worker.',
                failurePrefix: 'Prisma database push failed'
            });

            if (!seedConfigured || !hasSeedFile) {
                checks.push({
                    name: 'prisma_seed',
                    status: 'failed',
                    reason: !seedConfigured
                        ? 'Prisma seed is not explicitly configured with prisma.seed and scripts.prisma:seed.'
                        : 'Prisma seed is configured but prisma/seed.ts is missing.'
                });
                checks.push({
                    name: 'prisma_seed_accounts',
                    status: 'blocked',
                    reason: 'Seeded-account verification is blocked until a runnable Prisma seed exists.'
                });
            } else if (!prismaPushed) {
                checks.push({
                    name: 'prisma_seed',
                    status: 'blocked',
                    reason: 'Prisma seed is blocked by a failed Prisma validation, generation, or database push.'
                });
                checks.push({
                    name: 'prisma_seed_accounts',
                    status: 'blocked',
                    reason: 'Seeded-account verification is blocked by a failed Prisma setup gate.'
                });
            } else {
                const seeded = await runSandboxCheck(checks, {
                    name: 'prisma_seed',
                    command: npxCmd,
                    args: ['prisma', 'db', 'seed'],
                    workspace,
                    timeoutMs: options.timeoutMs || 120000,
                    adapter: options.adapter,
                    env: prismaEnv,
                    successReason: 'Prisma database seed executed successfully.',
                    failurePrefix: 'Prisma database seed failed'
                });
                if (seeded && !requiresSeededAccounts) {
                    checks.push({
                        name: 'prisma_seed_accounts',
                        status: 'skipped',
                        reason: 'Prisma schema has no User model; seeded accounts are not applicable.'
                    });
                } else if (seeded) {
                    try {
                        const countScript = "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.user.count().then(c => { console.log(JSON.stringify({ userCount: c })); return prisma.$disconnect(); }).catch(() => process.exit(1));";
                        const res = await executeInSandbox('node', ['-e', countScript], {
                            workspace,
                            timeoutMs: options.timeoutMs || 60000,
                            adapter: options.adapter,
                            env: prismaEnv
                        });
                        let parsed = {};
                        try { parsed = JSON.parse(res.stdout || '{}'); } catch {}
                        const userCount = Number(parsed.userCount ?? 0);
                        checks.push({
                            name: 'prisma_seed_accounts',
                            status: (res.passed && userCount > 0) ? 'passed' : 'failed',
                            command: 'node -e ...seed-account-count',
                            exitCode: res.exitCode ?? (userCount > 0 ? 0 : 1),
                            reason: userCount > 0 ? `Prisma seed created ${userCount} user accounts.` : 'Prisma seed created 0 user accounts.'
                        });
                    } catch (err) {
                        checks.push({
                            name: 'prisma_seed_accounts',
                            status: 'failed',
                            reason: `Prisma seed accounts audit failed: ${err.message}`
                        });
                    }
                } else {
                    checks.push({
                        name: 'prisma_seed_accounts',
                        status: 'blocked',
                        reason: 'Seeded-account verification is blocked by a failed Prisma seed command.'
                    });
                }
            }
        }
    }

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
                    timeoutMs: options.timeoutMs || 120000,
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
                timeoutMs: options.timeoutMs || 300000,
                adapter: options.adapter,
                env: {
                    DATABASE_URL: options.env?.DATABASE_URL || 'file:./dev.db',
                    AUTH_SECRET: options.env?.AUTH_SECRET || 'verification-only-secret-minimum-32-characters',
                    NEXTAUTH_SECRET: options.env?.NEXTAUTH_SECRET || 'verification-only-secret-minimum-32-characters',
                    NEXTAUTH_URL: options.env?.NEXTAUTH_URL || 'http://127.0.0.1:3000',
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
                reason: err.code === 'SANDBOX_UNAVAILABLE'
                    ? `Sandboxed build runner unavailable: ${err.message}`
                    : `Build execution error: ${err.message}`
            });
        }
    }

    if (packageJson?.scripts?.lint) {
        await runSandboxCheck(checks, {
            name: 'lint', command: npmCmd, args: ['run', 'lint'],
            workspace: options.workspace || projectDir, timeoutMs: options.timeoutMs || 120000,
            adapter: options.adapter, env: options.env,
            successReason: 'Declared lint script passed in the sandbox.', failurePrefix: 'Lint failed'
        });
    } else if (packageJson?.dependencies?.next) {
        checks.push({ name: 'lint', status: 'blocked', reason: 'Next.js project has no lint script.' });
    }

    const hasFailedOrBlocked = checks.some(c => c.status === 'failed' || c.status === 'blocked');
    const allPassedOrSkipped = checks.every(c => c.status === 'passed' || c.status === 'skipped');

    return {
        passed: allPassedOrSkipped && !hasFailedOrBlocked,
        checks
    };
}
