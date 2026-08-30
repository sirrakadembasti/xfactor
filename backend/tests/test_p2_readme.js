import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { verifyReadmeCommands } from '../verification/readmeVerifier.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (!filteredTest || filteredTest === 'readme-scripts') {
    await runAsyncTest('P2.5.1: verifyReadmeCommands rejects documented npm scripts missing from package.json', async () => {
        const files = [
            {
                path: 'README.md',
                content: `
# Todo App

Run setup and build:

\`\`\`sh
npm run db:setup
npm run build
\`\`\`

\`\`\`zsh
npm run search:reindex
\`\`\`
                `
            },
            {
                path: 'package.json',
                content: JSON.stringify({
                    name: 'todo-app',
                    scripts: { build: 'vite build' }
                })
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.strictEqual(
            result.passed,
            false,
            'Expected README validation to fail on missing package script'
        );
        assert.deepStrictEqual(result.issues, [
            "Documented command 'npm run db:setup' is missing from package.json",
            "Documented command 'npm run search:reindex' is missing from package.json"
        ]);
    });

    await runAsyncTest('P2.5.1: verifyReadmeCommands passes when every documented npm script exists', async () => {
        const files = [
            {
                path: 'README.md',
                content: `
\`\`\`bash
npm run db:setup
npm run build -- --mode production
\`\`\`

\`\`\`zsh
npm run build#docs
\`\`\`
                `
            },
            {
                path: 'package.json',
                content: JSON.stringify({
                    scripts: {
                        'db:setup': 'prisma migrate deploy',
                        build: 'vite build',
                        'build#docs': 'vitepress build'
                    }
                })
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });

    await runAsyncTest('P2.5.1: verifyReadmeCommands preserves hash characters in npm script names', async () => {
        const files = [
            {
                path: 'README.md',
                content: `
\`\`\`sh
npm run build#docs
\`\`\`
                `
            },
            {
                path: 'package.json',
                content: JSON.stringify({
                    scripts: { 'build#docs': 'vitepress build' }
                })
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

finish();
