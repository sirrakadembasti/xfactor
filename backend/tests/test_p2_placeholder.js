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
            },
            {
                path: 'src/components/ReusableQuizForm.tsx',
                content: `
                    import React from 'react';
                    import { useForm } from 'react-hook-form';

                    export default function ReusableQuizForm({ onSubmit }) {
                        const { handleSubmit } = useForm();
                        return (
                            <form onSubmit={handleSubmit(onSubmit)}>
                                <button type="submit">Save</button>
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

if (!filteredTest || filteredTest === 'comments-bypasses') {
    await runAsyncTest('P2.2.3: verifyPlaceholders rejects placeholder comments and not-implemented bypasses', async () => {
        const files = [
            {
                path: 'src/services/auth.js',
                content: `
                    export function login(user) {
                        /*
                         * TODO: implement real authentication in multi-line block
                         */
                        throw Error("Not implemented");
                    }
                `
            },
            {
                path: 'src/utils/helpers.js',
                content: `
                    export function formatData(d) {
                        // FIXME: add edge case handling
                        return d;
                    }
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(
            result.passed,
            false,
            'Expected placeholder check to fail on comment-based placeholder bypasses'
        );
        assert.strictEqual(result.issues.length, 3);
        assert.ok(
            result.issues.some(issue => issue.includes('TODO: implement') && issue.includes('auth.js:')),
            'Issues must identify multi-line TODO comment with line number'
        );
        assert.ok(
            result.issues.some(issue => issue.includes('Not implemented') && issue.includes('auth.js:')),
            'Issues must identify Not implemented throw without new with line number'
        );
        assert.ok(
            result.issues.some(issue => issue.includes('FIXME') && issue.includes('helpers.js:')),
            'Issues must identify FIXME comment with line number'
        );
    });

    await runAsyncTest('P2.2.3: verifyPlaceholders passes when source code contains no placeholder comments or bypasses', async () => {
        const files = [
            {
                path: 'src/services/auth.js',
                content: `
                    import { db } from '../db.js';
                    export async function login(username, password) {
                        const user = await db.user.findUnique({ where: { username } });
                        return user;
                    }
                `
            }
        ];

        const result = verifyPlaceholders(files);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

await runAsyncTest('structural route exceptions preserve business mock rejection', async () => {
    const check = content => verifyPlaceholders([{ path: 'src/routes/example.ts', content }]);
    const allowed = [
        `app.get('/api/health', (_req,res)=>res.json({status:'ok',uptime:process.uptime(),timestamp:new Date().toISOString()}));`,
        `router.post('/register',(_req,res)=>res.status(403).json({error:'Registration disabled'}));`,
        `router.delete('/:id',(_req,res)=>res.status(405).json({error:'Deletion forbidden'}));`,
        `const ACCOUNTS=[{username:'admin_demo',role:'admin',label:'Administrator',description:'Demo administrator'}]; router.get('/demo-accounts',(_req,res)=>res.json({success:true,accounts:ACCOUNTS}));`,
        `import {ROLE_PERMISSIONS} from '../middleware/auth'; function permissionsFor(role){return (ROLE_PERMISSIONS[role]||[]).map(entry=>({resource:entry.resource,operations:[...entry.operations]}));} router.get('/permissions',(_req,res)=>{const roles=['admin'];res.json({success:true,roles:roles.map(role=>({role,permissions:permissionsFor(role)}))});});`
    ];
    for (const source of allowed) assert.equal(check(source).passed, true, source);
    const denied = [
        `router.get('/api/health',(_req,res)=>res.json({status:'ok',users:[{id:1}]}));`,
        `router.get('/items',(_req,res)=>res.status(200).json([{id:1}]));`,
        `router.get('/items',(_req,res)=>{if(false)res.status(403).json({error:'denied'});res.json([{id:1}]);});`,
        `const ACCOUNTS=[{username:'admin_demo',role:'admin',password:'secret'}];router.get('/demo-accounts',(_req,res)=>res.json({accounts:ACCOUNTS}));`,
        `const ITEMS=[{id:1,name:'fake'}];router.get('/items',(_req,res)=>res.json({items:ITEMS}));`,
        `router.get('/permissions',(_req,res)=>res.json({roles:[{role:'admin',permissions:[]}]}));`,
        `const ROLE_PERMISSIONS={admin:[{resource:'Fake',operations:['read']}]};function permissionsFor(role){return (ROLE_PERMISSIONS[role]||[]).map(entry=>({resource:entry.resource,operations:[...entry.operations]}));}const roles=['admin'];router.get('/permissions',(_req,res)=>res.json({roles:roles.map(role=>({role,permissions:permissionsFor(role)}))}));`,
        `import {ROLE_PERMISSIONS} from '../middleware/auth';function permissionsFor(role){(ROLE_PERMISSIONS[role]||[]).map(entry=>({resource:entry.resource,operations:[...entry.operations]}));return [];}const roles=['admin'];router.get('/permissions',(_req,res)=>res.json({roles:roles.map(role=>({role,permissions:permissionsFor(role)}))}));`,
        `import {ROLE_PERMISSIONS} from '../middleware/auth';function permissionsFor(role){return ((ROLE_PERMISSIONS[role]||[]).map(entry=>({resource:entry.resource,operations:[...entry.operations]})),[]);}const roles=['admin'];router.get('/permissions',(_req,res)=>res.json({roles:roles.map(role=>({role,permissions:permissionsFor(role)}))}));`
    ];
    for (const source of denied) assert.equal(check(source).passed, false, source);
});

await runAsyncTest('conditional forms require both local branches to reach network actions', async () => {
    const check = second => verifyPlaceholders([{ path:'src/pages/Users.tsx', content:`const create=async()=>{await fetch('/api/users',{method:'POST'});};const update=${second};export default()=> <form onSubmit={editing ? update : create}/>;` }]);
    assert.equal(check(`async()=>{await fetch('/api/users/1',{method:'PATCH'});}`).passed,true);
    for (const dead of [`e=>e.preventDefault()`, `()=>console.log('no request')`, `()=>{}`]) assert.equal(check(dead).passed,false);
});

finish();
