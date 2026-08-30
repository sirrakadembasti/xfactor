import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { verifyPlaceholders } from '../verification/placeholderVerifier.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (!filteredTest || filteredTest === 'mock-handlers') {
    await runAsyncTest('P2.2.1: verifyPlaceholders rejects static mock array responses', async () => {
        const files = [
            {
                path: 'src/routes/todos.js',
                content: `
                    import express from 'express';
                    const router = express.Router();

                    router.get('/api/todos', (req, res) => {
                        res.json([
                            { id: 1, title: 'Static Mock Todo 1' },
                            { id: 2, title: 'Static Mock Todo 2' }
                        ]);
                    });

                    export default router;
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(
            result.passed,
            false,
            'Expected placeholder check to fail on hardcoded array response'
        );
        assert.ok(
            result.issues.some(issue => issue.includes('/api/todos')),
            'Issues must identify static mock handler for /api/todos'
        );
    });

    await runAsyncTest('P2.2.1: verifyPlaceholders rejects static mock object responses and return statements', async () => {
        const files = [
            {
                path: 'src/routes/profile.js',
                content: `
                    import express from 'express';
                    const router = express.Router();

                    router.get('/api/profile', (req, res) => {
                        return res.json({ id: 'mock-1', name: 'Mock User' });
                    });

                    router.post('/api/feedback', (req, res) => {
                        return res.send("feedback received mock");
                    });

                    export default router;
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(result.passed, false);
        assert.strictEqual(result.issues.length, 2);
    });

    await runAsyncTest('P2.2.1: verifyPlaceholders passes when route handlers use dynamic queries or service logic', async () => {
        const files = [
            {
                path: 'src/routes/todos.js',
                content: `
                    import express from 'express';
                    import { prisma } from '../lib/prisma.js';
                    const router = express.Router();

                    router.get('/api/todos', async (req, res) => {
                        const items = await prisma.todo.findMany();
                        res.json(items);
                    });

                    router.post('/api/feedback', async (req, res) => {
                        const userFeedback = req.body.text;
                        const saved = await prisma.feedback.create({ data: { text: userFeedback } });
                        return res.json(saved);
                    });

                    export default router;
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

finish();
