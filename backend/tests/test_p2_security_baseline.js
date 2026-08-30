import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { verifySecurityBaseline } from '../verification/securityVerifier.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (!filteredTest || filteredTest === 'cors-wildcard') {
    await runAsyncTest('P2.4.1: verifySecurityBaseline rejects unrestricted cors() and Access-Control-Allow-Origin *', async () => {
        const contract = {
            name: 'Todo App'
        };

        const files1 = [
            {
                path: 'src/server.js',
                content: `
                    import express from 'express';
                    import cors from 'cors';
                    const app = express();
                    app.use(cors());
                    export default app;
                `
            }
        ];

        const res1 = verifySecurityBaseline(contract, files1);
        assert.strictEqual(
            res1.passed,
            false,
            'Expected security baseline check to fail on wildcard CORS'
        );
        assert.ok(
            res1.issues.some(i => i.toLowerCase().includes('cors') || i.includes('*')),
            'Issues must identify unrestricted CORS in server.js'
        );

        const files2 = [
            {
                path: 'src/server.js',
                content: `
                    import express from 'express';
                    const app = express();
                    app.use((req, res, next) => {
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        next();
                    });
                    export default app;
                `
            }
        ];

        const res2 = verifySecurityBaseline(contract, files2);
        assert.strictEqual(res2.passed, false);
        assert.ok(res2.issues.some(i => i.includes('Access-Control-Allow-Origin') || i.toLowerCase().includes('cors')));

        const files3 = [
            {
                path: 'src/server.js',
                content: `
                    import express from 'express';
                    import cors from 'cors';
                    const app = express();
                    app.use(cors({ origin: ['https://app.example.com', '*'] }));
                    export default app;
                `
            }
        ];

        const res3 = verifySecurityBaseline(contract, files3);
        assert.strictEqual(res3.passed, false);
        assert.ok(res3.issues.some(i => i.includes('wildcard origin')));
    });

    await runAsyncTest('P2.4.1: verifySecurityBaseline passes secure explicit origin CORS configuration even with subsequent unrelated origin objects', async () => {
        const contract = {
            name: 'Todo App'
        };

        const files = [
            {
                path: 'src/server.js',
                content: `
                    import express from 'express';
                    import cors from 'cors';
                    const app = express();
                    app.use(cors({ origin: ['https://app.example.com', 'http://localhost:5173'], credentials: true }));
                    
                    // Unrelated config later in file
                    const unrelatedConfig = { origin: '*', role: 'admin' };
                    console.log(unrelatedConfig);
                    
                    export default app;
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.issues.length, 0);
    });
}
if (!filteredTest || filteredTest === 'secret-keys') {
    await runAsyncTest('P2.4.2: verifySecurityBaseline rejects committed .env file', async () => {
        const contract = { name: 'Todo App' };
        const files = [
            {
                path: '.env',
                content: 'DATABASE_URL=file:./dev.db\nJWT_SECRET=super_secret_production_key_123'
            },
            {
                path: 'src/index.js',
                content: 'console.log("Starting");'
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(
            res.passed,
            false,
            'Expected security baseline check to fail on committed .env file'
        );
        assert.ok(
            res.issues.some(i => i.includes('.env')),
            'Issues must identify committed .env file'
        );
    });

    await runAsyncTest('P2.4.2: verifySecurityBaseline rejects hardcoded secret keys in source files', async () => {
        const contract = { name: 'Todo App' };
        const files = [
            {
                path: 'src/lib/auth.js',
                content: `
                    const JWT_SECRET = "hardcoded_super_secret_jwt_key_2026";
                    const API_KEY = "sk_live_1234567890abcdef1234567890abcdef";
                    export function signToken(user) {
                        return jwt.sign(user, JWT_SECRET);
                    }
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(
            res.passed,
            false,
            'Expected security baseline check to fail on hardcoded secret key'
        );
        assert.strictEqual(res.issues.length, 2);
    });

    await runAsyncTest('P2.4.2: verifySecurityBaseline passes safe environment variable reads and .env.example', async () => {
        const contract = { name: 'Todo App' };
        const files = [
            {
                path: '.env.example',
                content: 'DATABASE_URL=file:./dev.db\nJWT_SECRET=your_jwt_secret_here'
            },
            {
                path: 'src/lib/auth.js',
                content: `
                    const JWT_SECRET = process.env.JWT_SECRET;
                    const API_KEY = process.env.API_KEY;
                    export function signToken(user) {
                        if (!JWT_SECRET) throw new Error("JWT_SECRET missing");
                        return jwt.sign(user, JWT_SECRET);
                    }
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.issues.length, 0);
    });
}

if (!filteredTest || filteredTest === 'missing-auth') {
    await runAsyncTest('P2.4.3: verifySecurityBaseline rejects unprotected mutate routes when contract requires auth', async () => {
        const contract = {
            name: 'Protected Todo App',
            authentication: { required: true }
        };

        const files = [
            {
                path: 'src/routes/todos.js',
                content: `
                    import express from 'express';
                    const router = express.Router();

                    router.get('/api/todos', (req, res) => res.json([]));
                    router.post('/api/todos', (req, res) => res.json({ created: true }));
                    router.delete('/api/todos/:id', (req, res) => res.json({ deleted: true }));

                    export default router;
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(
            res.passed,
            false,
            'Expected security check to fail on unprotected mutate endpoint'
        );
        assert.strictEqual(res.issues.length, 2);
        assert.ok(res.issues.some(i => i.includes('POST /api/todos') && i.toLowerCase().includes('auth')));
        assert.ok(res.issues.some(i => i.includes('DELETE /api/todos/:id') && i.toLowerCase().includes('auth')));
    });

    await runAsyncTest('P2.4.3: verifySecurityBaseline passes protected mutate routes with auth middleware', async () => {
        const contract = {
            name: 'Protected Todo App',
            authentication: { required: true }
        };

        const files = [
            {
                path: 'src/routes/todos.js',
                content: `
                    import express from 'express';
                    import { requireAuth } from '../middleware/auth.js';
                    const router = express.Router();

                    router.get('/api/todos', (req, res) => res.json([]));
                    router.post('/api/todos', requireAuth, (req, res) => res.json({ created: true }));
                    router.delete('/api/todos/:id', requireAuth, (req, res) => res.json({ deleted: true }));

                    export default router;
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.issues.length, 0);
    });

    await runAsyncTest('P2.4.3: verifySecurityBaseline supports MemberExpression and ArrayExpression auth middlewares', async () => {
        const contract = {
            name: 'Protected Todo App',
            authentication: { required: true }
        };

        const files = [
            {
                path: 'src/routes/todos.js',
                content: `
                    import express from 'express';
                    import authService from '../services/auth.js';
                    import { requireUser } from '../middleware/auth.js';
                    const router = express.Router();

                    router.post('/api/todos', authService.authenticateJWT, (req, res) => res.json({ created: true }));
                    router.put('/api/todos/:id', [requireUser], (req, res) => res.json({ updated: true }));
                    router.delete('/api/todos/:id', [authService.protectRoute], (req, res) => res.json({ deleted: true }));

                    export default router;
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.issues.length, 0);
    });
}

if (!filteredTest || filteredTest === 'unsolicited-auth') {
    await runAsyncTest('P2.4.4: verifySecurityBaseline rejects unsolicited auth modules when contract disables auth', async () => {
        const contract = {
            name: 'Public Todo App',
            authentication: { required: false }
        };

        const files = [
            {
                path: 'src/routes/auth.js',
                content: `
                    import express from 'express';
                    const router = express.Router();
                    router.post('/login', (req, res) => res.json({ token: 'fake' }));
                    export default router;
                `
            },
            {
                path: 'src/components/LoginForm.jsx',
                content: `
                    export default function LoginForm() {
                        return <form action="/login"><input type="password" /></form>;
                    }
                `
            },
            {
                path: 'src/auth.js',
                content: ''
            },
            {
                path: 'src/security/authenticator.js',
                content: 'export function authenticate() {}'
            },
            {
                path: 'src/lib/credentials.js',
                content: `
                    import { verify } from 'jsonwebtoken';
                    export const validateCredential = (token, key) => verify(token, key);
                `
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(
            res.passed,
            false,
            'Expected security check to fail on unsolicited auth module'
        );
        assert.ok(res.issues.some(issue => issue.includes('src/routes/auth.js')));
        assert.ok(res.issues.some(issue => issue.includes('src/components/LoginForm.jsx')));
        assert.ok(res.issues.some(issue => issue.includes('src/auth.js')));
        assert.ok(res.issues.some(issue => issue.includes('src/security/authenticator.js')));
        assert.ok(res.issues.some(issue => issue.includes('src/lib/credentials.js')));
    });

    await runAsyncTest('P2.4.4: verifySecurityBaseline permits non-auth public application files', async () => {
        const contract = {
            name: 'Public Todo App',
            authentication: { required: false }
        };

        const files = [
            {
                path: 'src/routes/todos.js',
                content: `
                    import express from 'express';
                    const router = express.Router();
                    router.get('/api/todos', (req, res) => res.json([]));
                    export default router;
                `
            },
            {
                path: 'src/components/TodoForm.jsx',
                content: 'export default function TodoForm() { return <form><input name="title" /></form>; }'
            }
        ];

        const res = verifySecurityBaseline(contract, files);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.issues.length, 0);
    });
}

finish();
