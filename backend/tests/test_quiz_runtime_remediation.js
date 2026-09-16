import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';
import {
    createWorkflowLogEvent,
    mergeGeneratedProjectFiles,
    executeStaticRepairLoop,
    canonicalizeNextTaskPath,
    normalizeTeamleaderPlanForStack
} from '../engine/workflow.js';
import { ensureProjectScaffold } from '../engine/codeGenerator.js';
import { runLLMTaskWithRetry } from '../engine/llmTaskRetry.js';
import { verifyBuild } from '../verification/buildVerifier.js';
import {
    buildTesterPrompt,
    runDeterministicProjectAudit,
    groupAuditIssuesByFile
} from '../agents/tester.js';
import { validateTeamleaderTasks } from '../agents/schemas.js';
import { MANAGER_SYSTEM_PROMPT } from '../agents/manager.js';
import { DIRECTOR_SYSTEM_PROMPT } from '../agents/director.js';
import { TEAMLEADER_SYSTEM_PROMPT } from '../agents/teamleader.js';
import { CODER_SYSTEM_PROMPT } from '../agents/coder.js';

const { runAsyncTest, finish } = createTestHarness();
const tempDirs = [];

async function workspace(prefix) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('workflow logger keeps the lease in logEvent argument nine when parent node is omitted', async () => {
        const lease = { attemptId: 'attempt-lease', leaseOwner: 'worker-lease' };
        const calls = [];
        const workflowLogEvent = createWorkflowLogEvent(lease, async (...args) => calls.push(args));

        await workflowLogEvent(null, 'project-1', 'Coder', 'write', 'src/page.tsx', 'written', 'coder-node');

        assert.equal(calls.length, 1);
        assert.equal(calls[0][7], null);
        assert.deepEqual(calls[0][8], lease);
    });

    await runAsyncTest('scaffold leaves package-lock preparation to the isolated worker and declares a runnable Prisma TypeScript seed', async () => {
        const dir = await workspace('quiz-scaffold-');
        await ensureProjectScaffold(dir, { title: 'Quiz app' }, { summary: 'Next.js Prisma TypeScript application' });

        await assert.rejects(fs.stat(path.join(dir, 'package-lock.json')), /ENOENT/);
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
        assert.equal(pkg.prisma.seed, 'tsx prisma/seed.ts');
        assert.equal(pkg.scripts['prisma:seed'], 'prisma db seed');
        assert.ok(pkg.devDependencies.tsx);
        const serviceManifest = JSON.parse(await fs.readFile(path.join(dir, 'service-manifest.json'), 'utf8'));
        assert.deepEqual(serviceManifest, {
            version: '1.0',
            services: {
                web: {
                    type: 'nextjs',
                    command: 'npm',
                    args: ['run', 'start'],
                    port: 3000,
                    healthEndpoint: '/'
                }
            }
        });
    });

    await runAsyncTest('scaffold excludes unused optional packages and pins generated Zod 3 APIs to a compatible major', async () => {
        const dir = await workspace('quiz-scaffold-deps-');
        await fs.mkdir(path.join(dir, 'src', 'components'), { recursive: true });
        await fs.writeFile(
            path.join(dir, 'tailwind.config.ts'),
            "import type { Config } from 'tailwindcss';\nconst config: Config = { content: [] };\nexport default config;\n",
            'utf8'
        );
        await fs.writeFile(
            path.join(dir, 'src', 'components', 'QuizCard.tsx'),
            "import React from 'react';\nimport { motion } from 'framer-motion';\nimport { z } from 'zod';\nexport function QuizCard() { return <motion.div>Quiz</motion.div>; }\n",
            'utf8'
        );

        await ensureProjectScaffold(dir, { title: 'Quiz app' }, { summary: 'Next.js Prisma TypeScript application' });

        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));

        // Unused optional UI/form packages must not be in dependencies
        assert.equal(pkg.dependencies['@hookform/resolvers'], undefined, '@hookform/resolvers must not be added when not imported');
        assert.equal(pkg.dependencies['react-hook-form'], undefined, 'react-hook-form must not be added when not imported');
        assert.equal(pkg.dependencies['sonner'], undefined, 'sonner must not be added when not imported');

        // tailwindcss type-import from config must not become a runtime dependency
        assert.equal(pkg.dependencies['tailwindcss'], undefined, 'tailwindcss must not be in runtime dependencies');
        assert.equal(pkg.devDependencies['tailwindcss'], '^3.4.17', 'tailwindcss must remain in devDependencies');

        // Truly imported optional packages must be added with known version
        assert.equal(pkg.dependencies['framer-motion'], 'latest', 'imported framer-motion must be added with latest version');
        assert.equal(pkg.dependencies['zod'], '^3.24.1', 'generated Zod 3 APIs must not resolve to incompatible Zod 4');
        assert.equal(pkg.dependencies['react'], '^18.3.1');
        assert.equal(pkg.dependencies['react-dom'], '^18.3.1');
        assert.equal(pkg.dependencies['next'], 'latest');
        assert.equal(pkg.dependencies['@prisma/client'], '^6.4.0');
    });

    await runAsyncTest('scaffold disk mutations replace stale generated-file entries before deterministic audit', async () => {
        const merged = mergeGeneratedProjectFiles(
            [{ path: 'package.json', content: '{"dependencies":{}}' }],
            [
                { path: 'package.json', content: '{"dependencies":{"jose":"latest"}}' },
                { path: 'src/lib/prisma.ts', content: 'export const prisma = {};' }
            ]
        );

        assert.deepEqual(merged, [
            { path: 'package.json', content: '{"dependencies":{"jose":"latest"}}' },
            { path: 'src/lib/prisma.ts', content: 'export const prisma = {};' }
        ]);
    });

    await runAsyncTest('transient LLM timeout retries once and records retry and final diagnostics', async () => {
        const diagnostics = [];
        let calls = 0;
        const result = await runLLMTaskWithRetry({
            agentRole: 'coder',
            taskId: 'quiz-page',
            messages: [],
            maxAttempts: 2,
            retryDelayMs: 0,
            generate: async () => {
                calls += 1;
                if (calls === 1) {
                    const error = new Error('provider timeout');
                    error.name = 'TimeoutError';
                    throw error;
                }
                return 'generated';
            },
            onDiagnostic: async diagnostic => diagnostics.push(diagnostic)
        });

        assert.equal(result, 'generated');
        assert.equal(calls, 2);
        assert.deepEqual(diagnostics.map(diagnostic => diagnostic.disposition), ['retrying', 'succeeded']);
        assert.equal(diagnostics[0].taskId, 'quiz-page');
        assert.equal(diagnostics[1].attempt, 2);
    });

    await runAsyncTest('LLM lease loss never retries and records a terminal diagnostic', async () => {
        const diagnostics = [];
        let calls = 0;
        await assert.rejects(
            runLLMTaskWithRetry({
                agentRole: 'coder',
                taskId: 'quiz-page',
                messages: [],
                maxAttempts: 3,
                retryDelayMs: 0,
                generate: async () => {
                    calls += 1;
                    const error = new Error('LLM call aborted: LEASE_LOST');
                    error.name = 'AbortError';
                    throw error;
                },
                onDiagnostic: async diagnostic => diagnostics.push(diagnostic)
            }),
            /LEASE_LOST/
        );
        assert.equal(calls, 1);
        assert.equal(diagnostics.at(-1).disposition, 'failed');
        assert.equal(diagnostics.at(-1).retry, false);
    });

    await runAsyncTest('isolated build verification runs Prisma generation, database push, seed, and seeded-account check', async () => {
        const commands = [];
        const files = [
            {
                path: 'package.json',
                content: JSON.stringify({
                    scripts: { build: 'next build', 'prisma:seed': 'prisma db seed' },
                    prisma: { seed: 'tsx prisma/seed.ts' }
                })
            },
            { path: 'tsconfig.json', content: '{}' },
            { path: 'prisma/schema.prisma', content: 'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel User { id String @id }' },
            { path: 'prisma/seed.ts', content: 'export {};' }
        ];
        const adapter = {
            id: 'isolated-fixture',
            getCapabilities: () => ({ available: true, isolation: true }),
            execute: async command => {
                commands.push(command);
                const args = String(command.args || []);
                if (args.includes('// seed-account-count')) {
                    throw new Error('Command failed with code 9: node: bad option: --seed-account-count');
                }
                return {
                    passed: true,
                    exitCode: 0,
                    stdout: args.includes('prisma.user.count()') ? '{"userCount":1}' : '',
                    stderr: ''
                };
            }
        };

        const result = await verifyBuild('/workspace', {}, { files, adapter });

        assert.equal(result.passed, true);
        assert.ok(commands.some(command => command.args?.join(' ') === 'prisma generate'));
        assert.ok(commands.some(command => command.args?.join(' ') === 'prisma db push --skip-generate'));
        assert.ok(commands.some(command => command.args?.join(' ') === 'prisma db seed'));
        assert.equal(result.checks.find(check => check.name === 'prisma_seed_accounts')?.status, 'passed');
    });

    await runAsyncTest('generation QA labels deterministic checks as non-runtime evidence', async () => {
        const prompt = buildTesterPrompt('Quiz', 'Acceptance', [{ path: 'package.json', content: '{}' }]);
        assert.match(prompt, /izole worker/i);
        assert.match(prompt, /gerçek.*build.*kanıtı değildir/i);
    });

    await runAsyncTest('task contracts reject multi-file work and deterministic audit catches Zod-effects updates and component prop drift', async () => {
        assert.throws(
            () => validateTeamleaderTasks({
                tasks: [{ id: 'multi', title: 'bad', targetFiles: ['src/a.ts', 'src/b.ts'], requirementIds: ['REQ-1'] }]
            }),
            /tek dosya|single file/i
        );

        const audit = runDeterministicProjectAudit([
            { path: 'package.json', content: JSON.stringify({ dependencies: { zod: 'latest' } }) },
            {
                path: 'src/components/Button.tsx',
                content: 'export interface ButtonProps { isLoading?: boolean }\nexport function Button(props: ButtonProps) { return <button>{String(props.isLoading)}</button>; }'
            },
            {
                path: 'src/app/page.tsx',
                content: "import { Button } from '@/components/Button';\nimport { z } from 'zod';\nconst updateSchema = z.object({ title: z.string() }).refine(Boolean).partial();\nexport default function Page() { return <Button loading />; }"
            }
        ]);

        assert.equal(audit.passed, false);
        assert.ok(audit.issues.some(issue => /Zod.*partial/i.test(issue)));
        assert.ok(audit.issues.some(issue => /Bileşen prop/i.test(issue)));
    });
    await runAsyncTest('agent contracts require complete journeys, one-file tasks, Zod update correctness, and component API consistency', async () => {
        assert.match(MANAGER_SYSTEM_PROMPT, /uçtan uca rol yolculuk/i);
        assert.match(DIRECTOR_SYSTEM_PROMPT, /zod/i);
        assert.match(TEAMLEADER_SYSTEM_PROMPT, /tam olarak bir hedef dosya/i);
        assert.match(CODER_SYSTEM_PROMPT, /Bileşen prop sözleşmesi/i);
    });

    await runAsyncTest('deterministic audit produces path-aware structured details for secret fallback across multiple auth files', async () => {
        const files = [
            { path: 'package.json', content: JSON.stringify({ name: 'quiz-app', dependencies: { jose: 'latest' } }) },
            {
                path: 'src/lib/auth.ts',
                content: "export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';"
            },
            {
                path: 'src/actions/auth.ts',
                content: "export const AUTH_TOKEN = process.env.AUTH_TOKEN ?? 'fallback-token';"
            },
            {
                path: 'src/middleware.ts',
                content: "export const API_KEY = process.env.API_KEY || 'insecure-key';"
            }
        ];

        const audit = runDeterministicProjectAudit(files);
        assert.equal(audit.passed, false);
        assert.equal(audit.issues.length, 3);
        assert.ok(Array.isArray(audit.issueDetails), 'audit.issueDetails must be an array');
        assert.equal(audit.issueDetails.length, 3);

        const reportedPaths = audit.issueDetails.map(d => d.filePath).sort();
        assert.deepEqual(reportedPaths, ['src/actions/auth.ts', 'src/lib/auth.ts', 'src/middleware.ts']);

        for (const detail of audit.issueDetails) {
            assert.ok(detail.issue.includes(detail.filePath), `Issue "${detail.issue}" should mention filePath "${detail.filePath}"`);
            assert.equal(detail.code, 'SECRET_FALLBACK');
        }

        const { fileIssuesMap, generalIssues } = groupAuditIssuesByFile(audit);
        assert.equal(generalIssues.length, 0);
        assert.deepEqual(Array.from(fileIssuesMap.keys()).sort(), ['src/actions/auth.ts', 'src/lib/auth.ts', 'src/middleware.ts']);
    });

    await runAsyncTest('static repair loop sequentially targets each failing file with exact path, current content, and issues without leaving 3rd file behind', async () => {
        const dir = await workspace('quiz-repair-success-');
        const initialFiles = [
            { path: 'package.json', content: JSON.stringify({ name: 'quiz-app', dependencies: { jose: 'latest' } }) },
            { path: 'src/lib/auth.ts', content: "export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';" },
            { path: 'src/actions/auth.ts', content: "export const AUTH_TOKEN = process.env.AUTH_TOKEN ?? 'fallback-token';" },
            { path: 'src/middleware.ts', content: "export const API_KEY = process.env.API_KEY || 'insecure-key';" }
        ];

        for (const file of initialFiles) {
            const fullPath = path.join(dir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content, 'utf8');
        }

        const calls = [];
        const fixedContents = {
            'src/lib/auth.ts': 'export const JWT_SECRET = process.env.JWT_SECRET;',
            'src/actions/auth.ts': 'export const AUTH_TOKEN = process.env.AUTH_TOKEN;',
            'src/middleware.ts': 'export const API_KEY = process.env.API_KEY;'
        };

        const mockCallAgent = async (agentRole, prompt) => {
            calls.push({ agentRole, prompt });
            for (const [targetPath, fixedContent] of Object.entries(fixedContents)) {
                if (prompt.includes(targetPath)) {
                    assert.ok(prompt.includes(targetPath), `Prompt should include target path ${targetPath}`);
                    return {
                        files: [{ path: targetPath, content: fixedContent }]
                    };
                }
            }
            throw new Error(`Unexpected prompt: ${prompt}`);
        };

        const generatedFiles = initialFiles.map(f => ({ ...f }));
        const repairTargetFiles = ['package.json', 'src/lib/auth.ts', 'src/actions/auth.ts', 'src/middleware.ts'];

        const result = await executeStaticRepairLoop({
            projectId: 'test-proj-1',
            projectDir: dir,
            projectTitle: 'Quiz Master App',
            generatedProjectFiles: generatedFiles,
            repairTargetFiles,
            callAgent: mockCallAgent,
            workflowLog: async () => {},
            maxRounds: 5
        });

        assert.equal(result.success, true);
        assert.equal(calls.length, 3, 'All 3 files should be repaired across separate targeted calls');
        for (const call of calls) {
            assert.equal(call.agentRole, 'coder');
            assert.match(call.prompt, /HEDEF DOSYA STATİK ONARIM GÖREVİ/i);
            assert.match(call.prompt, /DOSYANIN MEVCUT İÇERİĞİ/i);
        }

        for (const [targetPath, expectedContent] of Object.entries(fixedContents)) {
            const diskContent = await fs.readFile(path.join(dir, targetPath), 'utf8');
            assert.equal(diskContent, expectedContent);
        }

        const finalAudit = runDeterministicProjectAudit(generatedFiles);
        assert.equal(finalAudit.passed, true);
    });

    await runAsyncTest('static repair loop rejects out-of-scope mutations and stops in a bounded manner when no progress is made', async () => {
        const dir = await workspace('quiz-repair-rejection-');
        const initialFiles = [
            { path: 'package.json', content: JSON.stringify({ name: 'quiz-app', dependencies: { jose: 'latest' } }) },
            { path: 'src/lib/auth.ts', content: "export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';" }
        ];

        for (const file of initialFiles) {
            const fullPath = path.join(dir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content, 'utf8');
        }

        let callCount = 0;
        const mockCallAgent = async () => {
            callCount++;
            return {
                files: [
                    { path: 'src/unauthorized.ts', content: 'export const unapproved = true;' },
                    { path: 'src/lib/auth.ts', content: "export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';" }
                ]
            };
        };

        const generatedFiles = initialFiles.map(f => ({ ...f }));
        const repairTargetFiles = ['package.json', 'src/lib/auth.ts'];

        const result = await executeStaticRepairLoop({
            projectId: 'test-proj-2',
            projectDir: dir,
            projectTitle: 'Quiz Master App',
            generatedProjectFiles: generatedFiles,
            repairTargetFiles,
            callAgent: mockCallAgent,
            workflowLog: async () => {},
            maxRounds: 3
        });

        assert.equal(result.success, false);
        await assert.rejects(fs.stat(path.join(dir, 'src/unauthorized.ts')), /ENOENT/);
        assert.ok(callCount <= 3, `Repair loop should terminate in a bounded manner without progress; called ${callCount} times`);
    });

    await runAsyncTest('Next task plan canonicalizes mixed targets to src root while preserving existing src, prisma, and root configs, leaving Express unchanged and state canonicalized', async () => {
        // Next.js individual path normalization
        assert.equal(canonicalizeNextTaskPath('app/api/x/route.ts'), 'src/app/api/x/route.ts');
        assert.equal(canonicalizeNextTaskPath('lib/auth.ts'), 'src/lib/auth.ts');
        assert.equal(canonicalizeNextTaskPath('components/X.tsx'), 'src/components/X.tsx');
        assert.equal(canonicalizeNextTaskPath('types/x.ts'), 'src/types/x.ts');
        assert.equal(canonicalizeNextTaskPath('hooks/x.ts'), 'src/hooks/x.ts');
        assert.equal(canonicalizeNextTaskPath('actions/x.ts'), 'src/actions/x.ts');
        assert.equal(canonicalizeNextTaskPath('middleware.ts'), 'src/middleware.ts');

        // Unchanged in Next.js (already src, prisma, public, or root configs)
        assert.equal(canonicalizeNextTaskPath('src/lib/auth.ts'), 'src/lib/auth.ts');
        assert.equal(canonicalizeNextTaskPath('src/components/Button.tsx'), 'src/components/Button.tsx');
        assert.equal(canonicalizeNextTaskPath('prisma/schema.prisma'), 'prisma/schema.prisma');
        assert.equal(canonicalizeNextTaskPath('prisma/seed.ts'), 'prisma/seed.ts');
        assert.equal(canonicalizeNextTaskPath('public/favicon.ico'), 'public/favicon.ico');
        assert.equal(canonicalizeNextTaskPath('package.json'), 'package.json');
        assert.equal(canonicalizeNextTaskPath('tsconfig.json'), 'tsconfig.json');
        assert.equal(canonicalizeNextTaskPath('next.config.js'), 'next.config.js');
        assert.equal(canonicalizeNextTaskPath('tailwind.config.ts'), 'tailwind.config.ts');
        assert.equal(canonicalizeNextTaskPath('README.md'), 'README.md');
        assert.equal(canonicalizeNextTaskPath('.env.example'), '.env.example');

        // Full task plan normalization for Next.js stack
        const nextPlan = {
            tasks: [
                { id: 't-api', title: 'Route', targetFiles: ['app/api/x/route.ts'], dependencies: [], requirementIds: ['REQ-1'] },
                { id: 't-lib', title: 'Auth', targetFiles: ['lib/auth.ts'], dependencies: ['t-api'], requirementIds: ['REQ-1'] },
                { id: 't-comp', title: 'Comp', targetFiles: ['components/X.tsx'], dependencies: ['t-lib'], requirementIds: ['REQ-2'] },
                { id: 't-types', title: 'Types', targetFiles: ['types/x.ts'], dependencies: [], requirementIds: ['REQ-1'] },
                { id: 't-hooks', title: 'Hooks', targetFiles: ['hooks/x.ts'], dependencies: ['t-types'], requirementIds: ['REQ-1'] },
                { id: 't-actions', title: 'Actions', targetFiles: ['actions/x.ts'], dependencies: ['t-lib'], requirementIds: ['REQ-2'] },
                { id: 't-mid', title: 'Mid', targetFiles: ['middleware.ts'], dependencies: ['t-lib'], requirementIds: ['REQ-1'] },
                { id: 't-exist', title: 'Exist', targetFiles: ['src/lib/auth.ts'], dependencies: [], requirementIds: ['REQ-1'] },
                { id: 't-prisma', title: 'Prisma', targetFiles: ['prisma/schema.prisma'], dependencies: [], requirementIds: ['REQ-1'] },
                { id: 't-pkg', title: 'Pkg', targetFiles: ['package.json'], dependencies: [], requirementIds: ['REQ-1'] }
            ]
        };

        const canonicalNextPlan = normalizeTeamleaderPlanForStack(nextPlan, { isNext: true, framework: 'nextjs' });
        assert.deepEqual(canonicalNextPlan.tasks.map(t => t.targetFiles), [
            ['src/app/api/x/route.ts'],
            ['src/lib/auth.ts'],
            ['src/components/X.tsx'],
            ['src/types/x.ts'],
            ['src/hooks/x.ts'],
            ['src/actions/x.ts'],
            ['src/middleware.ts'],
            ['src/lib/auth.ts'],
            ['prisma/schema.prisma'],
            ['package.json']
        ]);

        // Express stack remains unchanged
        const expressPlan = {
            tasks: [
                { id: 'e-main', title: 'App', targetFiles: ['app.js'], dependencies: [], requirementIds: ['REQ-1'] },
                { id: 'e-routes', title: 'Routes', targetFiles: ['routes/users.js'], dependencies: ['e-main'], requirementIds: ['REQ-1'] },
                { id: 'e-controllers', title: 'Controllers', targetFiles: ['controllers/auth.js'], dependencies: ['e-routes'], requirementIds: ['REQ-1'] },
                { id: 'e-lib', title: 'Lib', targetFiles: ['lib/db.js'], dependencies: [], requirementIds: ['REQ-1'] },
                { id: 'e-mid', title: 'Mid', targetFiles: ['middleware/auth.js'], dependencies: ['e-lib'], requirementIds: ['REQ-1'] },
                { id: 'e-pkg', title: 'Pkg', targetFiles: ['package.json'], dependencies: [], requirementIds: ['REQ-1'] }
            ]
        };

        const unchangedExpressPlan = normalizeTeamleaderPlanForStack(expressPlan, { isNext: false, framework: 'express' });
        assert.deepEqual(unchangedExpressPlan.tasks.map(t => t.targetFiles), [
            ['app.js'],
            ['routes/users.js'],
            ['controllers/auth.js'],
            ['lib/db.js'],
            ['middleware/auth.js'],
            ['package.json']
        ]);

        // Verify resume / state consistency: state holding normalized plan has no drift on re-normalization
        const state = {
            workflow: {
                teamleaderPlans: {
                    'backend.tl': canonicalNextPlan
                }
            }
        };
        const reNormalizedPlan = normalizeTeamleaderPlanForStack(state.workflow.teamleaderPlans['backend.tl'], { isNext: true });
        assert.deepEqual(reNormalizedPlan, canonicalNextPlan);
    });


    finish();
} finally {
    for (const dir of tempDirs) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
