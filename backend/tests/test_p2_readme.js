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


if (!filteredTest || filteredTest === 'readme-ports') {
    await runAsyncTest('P2.5.2: verifyReadmeCommands rejects README port mismatches', async () => {
        const files = [
            {
                path: 'README.md',
                content: 'Open the application at http://localhost:8080 after startup.'
            },
            {
                path: 'src/server.js',
                content: `
                    const port = process.env.PORT || 3000;
                    app.listen(port);
                `
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.strictEqual(
            result.passed,
            false,
            'Expected README validation to fail on port mismatch'
        );
        assert.deepStrictEqual(result.issues, [
            'Documented port 8080 does not match application port 3000'
        ]);
    });

    await runAsyncTest('P2.5.2: verifyReadmeCommands passes matching backend and frontend ports', async () => {
        const files = [
            {
                path: 'README.md',
                content: 'Backend runs on port 3000. Frontend: http://localhost:5173.'
            },
            {
                path: 'src/server.js',
                content: 'const port = process.env.PORT || 3000; app.listen(port);'
            },
            {
                path: 'vite.config.js',
                content: 'export default { server: { port: 5173 } };'
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });

    await runAsyncTest('P2.5.2: verifyReadmeCommands ignores port-like source comments', async () => {
        const files = [
            {
                path: 'README.md',
                content: 'Open http://localhost:3000.'
            },
            {
                path: 'src/server.js',
                content: `
                    // Legacy port: 3000
                    const port = process.env.PORT || 5173;
                    app.listen(port);
                `
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.deepStrictEqual(result.issues, [
            'Documented port 3000 does not match application port 5173'
        ]);
    });

    await runAsyncTest('P2.5.2: verifyReadmeCommands validates one-digit ports', async () => {
        const files = [
            {
                path: 'README.md',
                content: 'Development endpoint: http://localhost:1.'
            },
            {
                path: 'src/server.js',
                content: 'const port = process.env.PORT || 2; app.listen(port);'
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.deepStrictEqual(result.issues, [
            'Documented port 1 does not match application port 2'
        ]);
    });

    await runAsyncTest('P2.5.2: verifyReadmeCommands ignores invalid overlong port numbers', async () => {
        const files = [
            {
                path: 'README.md',
                content: 'Invalid example URL: http://localhost:300000.'
            },
            {
                path: 'src/server.js',
                content: 'const port = process.env.PORT || 3000; app.listen(port);'
            }
        ];

        const result = await verifyReadmeCommands({}, files, null);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

if (!filteredTest || filteredTest === 'readme-sandboxed-commands') {
    await runAsyncTest('P2.5.3: verifyReadmeCommands rejects a failed sandboxed build command', async () => {
        const calls = [];
        const sandbox = {
            id: 'fixture',
            isAvailable() { return true; },
            async execute(request) {
                calls.push(request);
                return {
                    exitCode: 1,
                    timedOut: false,
                    stdout: '',
                    stderr: 'Build failed'
                };
            }
        };
        const files = [
            {
                path: 'README.md',
                content: '```sh\nnpm run build\n```'
            },
            {
                path: 'package.json',
                content: JSON.stringify({ scripts: { build: 'vite build' } })
            }
        ];

        const result = await verifyReadmeCommands({}, files, sandbox);
        assert.strictEqual(
            result.passed,
            false,
            'Expected README validation to fail on sandboxed build command exit code'
        );
        assert.deepStrictEqual(result.issues, [
            'Documented build command failed to execute'
        ]);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].command, process.platform === 'win32' ? 'npm.cmd' : 'npm');
        assert.deepStrictEqual(calls[0].args, ['run', 'build']);
    });

    await runAsyncTest('P2.5.3: verifyReadmeCommands rejects a timed-out sandboxed build command', async () => {
        const sandbox = {
            id: 'fixture',
            isAvailable() { return true; },
            async execute() {
                return {
                    exitCode: null,
                    timedOut: true,
                    stdout: '',
                    stderr: 'Timed out'
                };
            }
        };
        const files = [
            {
                path: 'README.md',
                content: '```bash\nnpm run build\n```'
            },
            {
                path: 'package.json',
                content: JSON.stringify({ scripts: { build: 'vite build' } })
            }
        ];

        const result = await verifyReadmeCommands({}, files, sandbox);
        assert.deepStrictEqual(result.issues, [
            'Documented build command failed to execute'
        ]);
    });

    await runAsyncTest('P2.5.3: verifyReadmeCommands rejects sandbox execution errors', async () => {
        const sandbox = {
            id: 'fixture',
            isAvailable() { return true; },
            async execute() {
                throw new Error('Sandbox unavailable');
            }
        };
        const files = [
            {
                path: 'README.md',
                content: '```sh\nnpm run build\n```'
            },
            {
                path: 'package.json',
                content: JSON.stringify({ scripts: { build: 'vite build' } })
            }
        ];

        const result = await verifyReadmeCommands({}, files, sandbox);
        assert.deepStrictEqual(result.issues, [
            'Documented build command failed to execute'
        ]);
    });

    await runAsyncTest('P2.5.3: verifyReadmeCommands passes a successful sandboxed build command', async () => {
        const sandbox = {
            id: 'fixture',
            isAvailable() { return true; },
            async execute() {
                return {
                    exitCode: 0,
                    timedOut: false,
                    stdout: 'Built',
                    stderr: ''
                };
            }
        };
        const files = [
            {
                path: 'README.md',
                content: '```zsh\nnpm run build -- --mode production\n```'
            },
            {
                path: 'package.json',
                content: JSON.stringify({ scripts: { build: 'vite build' } })
            }
        ];

        const result = await verifyReadmeCommands({}, files, sandbox);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}
finish();
