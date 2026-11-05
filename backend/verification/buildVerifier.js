import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { executeInSandbox } from './sandboxRunner.js';
import { buildManagementPrismaSeedRequest } from './roleSessionAdapter.js';

function computeDigest(text) {
    return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}

function executionEvidence(result = {}, { startedAt, endedAt, error, signal } = {}) {
    const stdout = result.stdout ?? error?.stdout ?? '';
    const stderr = result.stderr ?? error?.stderr ?? error?.message ?? '';
    const timedOut = result.timedOut === true || error?.timedOut === true;
    const cancelled = result.cancelled === true || result.aborted === true || error?.cancelled === true || signal?.aborted === true;
    const exitCode = result.exitCode ?? error?.exitCode ?? null;
    return {
        exitCode, stdout, stderr,
        startedAt: result.startedAt ?? startedAt, endedAt: result.endedAt ?? endedAt,
        stdoutDigest: result.stdoutDigest ?? result.stdoutSha256 ?? computeDigest(stdout),
        stderrDigest: result.stderrDigest ?? result.stderrSha256 ?? computeDigest(stderr),
        ...(result.stdoutBytes !== undefined ? { stdoutBytes: result.stdoutBytes } : {}),
        ...(result.stderrBytes !== undefined ? { stderrBytes: result.stderrBytes } : {}),
        ...(result.stdoutTruncated !== undefined ? { stdoutTruncated: result.stdoutTruncated } : {}),
        ...(result.stderrTruncated !== undefined ? { stderrTruncated: result.stderrTruncated } : {}),
        timedOut, cancelled, signal: result.signal ?? error?.signal ?? null,
        executionObservation: {
            normalExit: Number.isInteger(exitCode) && exitCode >= 0 && result.signal === null
                && !timedOut && !cancelled && result.executionFailed !== true,
            cancelled
        }
    };
}

function executionPassed(result, signal) {
    return result?.passed === true && result.exitCode === 0 && result.timedOut !== true
        && result.cancelled !== true && result.aborted !== true && !result.signal
        && result.executionFailed !== true && result.stdoutTruncated !== true && result.stderrTruncated !== true
        && !signal?.aborted;
}

function isPrismaValidationTransportReset(failure, signal) {
    const result = failure?.result;
    if (signal?.aborted || failure?.timedOut || result?.timedOut || failure?.cancelled || result?.cancelled
        || failure?.aborted || result?.aborted || failure?.signal || result?.signal || failure?.name === 'AbortError') return false;
    const text = [failure?.code, failure?.message, failure?.stderr, failure?.stdout,
        result?.code, result?.stderr, result?.stdout].filter(Boolean).join('\n');
    if (/\b(?:[A-Z_]*CERT[A-Z_]*|UNABLE_TO_VERIFY_LEAF_SIGNATURE)\b/.test(text)) return false;
    if (/\b(?:PAUSED|LEASE_LOST|ABORT_ERR|ERR_CANCELED|cancel(?:led|ed)?|deadline|P10\d{2}|CERT_[A-Z_]+|ERR_TLS_CERT[A-Z_]*|ERR_SSL[A-Z_]*)\b|schema\s+validation|validation\s+error|certificate.*(?:verification|verify|expired|invalid)|(?:user|operator).*(?:abort|cancel)|checksum\s+(?:mismatch|verification\s+failed)|integrity\s+(?:mismatch|failed)|unauthori[sz]ed|forbidden|\b(?:401|403)\b/i.test(text)) return false;
    const engineUrl = /https?:\/\/[^\s"']+\/(?:[^\s"']*\/)?(?:schema-engine|query[_-]engine|libquery_engine)[^\s"']*/i.test(text);
    // The real Prisma transport failure can omit its URL. This is network-reset
    // evidence during validate, not a claim that an engine URL was observed.
    const prismaTransport = /\bTLSSocket\.socketCloseListener\b/.test(text)
        && /\battemptNumber\s*:\s*\d+/.test(text) && /\bretriesLeft\s*:\s*\d+/.test(text);
    return /\bECONNRESET\b/.test(text) && (engineUrl || prismaTransport);
}

async function executePrismaValidation(command, args, options) {
    const phaseDeadline = Date.now() + Math.min(options.timeoutMs, 300000);
    const priorTransientCodes = [];
    let last, attemptCount = 0;
    while (attemptCount < 2) {
        const remaining = phaseDeadline - Date.now();
        if (remaining <= 0 || options.signal?.aborted) break;
        attemptCount++;
        try { last = { result: await executeInSandbox(command, args, { ...options, timeoutMs: remaining }) }; }
        catch (error) { last = { error }; }
        const failure = last.error || last.result;
        if (last.result?.passed || attemptCount === 2 || !isPrismaValidationTransportReset(failure, options.signal)
            || Date.now() >= phaseDeadline) break;
        priorTransientCodes.push('ECONNRESET');
    }
    if (!last) throw new Error(options.signal?.aborted ? 'Prisma validation cancelled.' : 'Prisma validation phase deadline exceeded.');
    return { ...last, advisory: { attemptCount, priorTransientCodes } };
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
    input,
    signal,
    successReason,
    failurePrefix
}) {
    let advisory;
    const startedAt = new Date().toISOString();
    try {
        const executionOptions = {
            workspace,
            timeoutMs,
            adapter,
            env,
            ...(input !== undefined ? { input } : {}),
            signal
        };
        const execution = name === 'prisma_validate'
            ? await executePrismaValidation(command, args, executionOptions)
            : { result: await executeInSandbox(command, args, executionOptions) };
        const endedAt = new Date().toISOString();
        advisory = execution.advisory;
        if (execution.error) throw execution.error;
        const result = execution.result;
        const passed = executionPassed(result, signal);
        checks.push({
            name,
            status: passed ? 'passed' : 'failed',
            command: `${command} ${args.join(' ')}`,
            ...executionEvidence(result, { startedAt, endedAt, signal }),
            ...(advisory ? { advisory } : {}),
            reason: passed ? successReason : `${failurePrefix}: ${result.stderr || result.stdout}`
        });
        return passed;
    } catch (error) {
        checks.push({
            name,
            status: error.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
            command: `${command} ${args.join(' ')}`,
            ...executionEvidence(error.result, { startedAt, endedAt: new Date().toISOString(), error, signal }),
            ...(advisory ? { advisory } : {}),
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
                timeoutMs: options.timeoutMs ?? 300000,
                adapter: options.adapter,
                signal: options.signal,
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
                const seedRequest = contract.management?.needed === true
                    ? buildManagementPrismaSeedRequest(contract.management, prismaEnv)
                    : { command: npxCmd, args: ['prisma', 'db', 'seed'], env: { ...prismaEnv, NODE_ENV: 'test' } };
                const seeded = await runSandboxCheck(checks, {
                    name: 'prisma_seed',
                    ...seedRequest,
                    workspace,
                    signal: options.signal,
                    timeoutMs: options.timeoutMs || 120000,
                    adapter: options.adapter,
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
            const startedAt = new Date().toISOString();
            try {
                let tscRes;
                try { tscRes = await executeInSandbox(npxCmd, ['tsc', '--noEmit'], {
                    workspace: options.workspace || projectDir,
                    timeoutMs: options.timeoutMs || 120000,
                    adapter: options.adapter,
                    env: options.env,
                    signal: options.signal,
                }); } catch (error) {
                    if (!error.result || options.signal?.aborted) throw error;
                    tscRes = error.result;
                }
                const endedAt = new Date().toISOString();

                checks.push({
                    name: 'typecheck',
                    status: executionPassed(tscRes, options.signal) ? 'passed' : 'failed',
                    command: `${npxCmd} tsc --noEmit`,
                    ...executionEvidence(tscRes, { startedAt, endedAt, signal: options.signal }),
                    reason: executionPassed(tscRes, options.signal) ? 'TypeScript compilation check passed with 0 errors.' : `TypeScript compilation failed: ${tscRes.stderr || tscRes.stdout}`
                });
            } catch (err) {
                checks.push({
                    name: 'typecheck',
                    status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                    command: `${npxCmd} tsc --noEmit`,
                    ...executionEvidence(err.result, { startedAt, endedAt: new Date().toISOString(), error: err, signal: options.signal }),
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
        const buildStartedAt = new Date().toISOString();
        try {
            const buildRes = await executeInSandbox(npmCmd, ['run', 'build'], {
                workspace: options.workspace || projectDir,
                timeoutMs: options.timeoutMs || 300000,
                adapter: options.adapter,
                signal: options.signal,
                env: {
                    DATABASE_URL: options.env?.DATABASE_URL || 'file:./dev.db',
                    AUTH_SECRET: options.env?.AUTH_SECRET || 'verification-only-ephemeral-secret-not-for-production',
                    NEXTAUTH_SECRET: options.env?.NEXTAUTH_SECRET || 'verification-only-ephemeral-secret-not-for-production',
                    NEXTAUTH_URL: options.env?.NEXTAUTH_URL || 'http://localhost:3000',
                    ...(options.env || {})
                },
            });
            const buildEndedAt = new Date().toISOString();

            checks.push({
                name: 'framework_build',
                status: executionPassed(buildRes, options.signal) ? 'passed' : 'failed',
                command: `${npmCmd} run build`,
                ...executionEvidence(buildRes, { startedAt: buildStartedAt, endedAt: buildEndedAt, signal: options.signal }),
                reason: executionPassed(buildRes, options.signal) ? 'Framework build completed successfully.' : `Framework build failed: ${buildRes.stderr || buildRes.stdout}`
            });
        } catch (err) {
            checks.push({
                name: 'framework_build',
                status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                command: `${npmCmd} run build`,
                ...executionEvidence(err.result, { startedAt: buildStartedAt, endedAt: new Date().toISOString(), error: err, signal: options.signal }),
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
