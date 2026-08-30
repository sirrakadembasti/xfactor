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

if (!filteredTest || filteredTest === 'dead-forms') {
    await runAsyncTest('P2.2.2: verifyPlaceholders rejects dead React forms with no network/API calls', async () => {
        const files = [
            {
                path: 'src/components/DeadTodoForm.jsx',
                content: `
                    import React from 'react';

                    export default function DeadTodoForm() {
                        const handleSubmit = (e) => {
                            e.preventDefault();
                        };

                        return (
                            <form onSubmit={handleSubmit}>
                                <input type="text" placeholder="Todo item" />
                                <button type="submit">Submit</button>
                            </form>
                        );
                    }
                `
            },
            {
                path: 'src/components/InlineDeadForm.jsx',
                content: `
                    import React from 'react';

                    export default function InlineDeadForm() {
                        return (
                            <form onSubmit={e => e.preventDefault()}>
                                <button type="submit">Do Nothing</button>
                            </form>
                        );
                    }
                `
            },
            {
                path: 'src/components/ConsoleLogDeadForm.jsx',
                content: `
                    import React from 'react';

                    export default function ConsoleLogDeadForm() {
                        const handleSubmit = (e) => {
                            e.preventDefault();
                            console.log("Just logging, not calling API");
                            alert("Form clicked");
                        };

                        return (
                            <form onSubmit={handleSubmit}>
                                <button type="submit">Log only</button>
                            </form>
                        );
                    }
                `
            },
            {
                path: 'src/components/CallbackDeadForm.jsx',
                content: `
                    import React, { useCallback } from 'react';

                    export default function CallbackDeadForm() {
                        const handleSubmit = useCallback((e) => {
                            e.preventDefault();
                        }, []);

                        return (
                            <form onSubmit={handleSubmit}>
                                <button type="submit">Submit</button>
                            </form>
                        );
                    }
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(
            result.passed,
            false,
            'Expected placeholder check to fail on dead React forms'
        );
        assert.strictEqual(result.issues.length, 4);
    });

    await runAsyncTest('P2.2.2: verifyPlaceholders passes when form submit handlers call API client or trigger actions', async () => {
        const files = [
            {
                path: 'src/components/ValidTodoForm.jsx',
                content: `
                    import React, { useState, useCallback } from 'react';
                    import { api } from '../services/api';

                    export default function ValidTodoForm({ onCreated }) {
                        const [text, setText] = useState('');

                        const handleSubmit = useCallback(async (e) => {
                            e.preventDefault();
                            const created = await api.post('/api/todos', { title: text });
                            if (onCreated) onCreated(created);
                        }, [text, onCreated]);

                        return (
                            <form onSubmit={handleSubmit}>
                                <input value={text} onChange={e => setText(e.target.value)} />
                                <button type="submit">Add Todo</button>
                            </form>
                        );
                    }
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

finish();
