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

finish();
