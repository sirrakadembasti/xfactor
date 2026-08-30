import assert from 'assert';
import { createTestHarness } from './testHarness.js';
import { verifyContamination } from '../verification/contaminationVerifier.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

if (!filteredTest || filteredTest === 'out-of-domain') {
    await runAsyncTest('P2.3.1: verifyContamination rejects out-of-domain vocabulary like rent-a-car in Todo project', async () => {
        const contract = {
            domainEntities: ['Todo', 'Category']
        };

        const files = [
            {
                path: 'README.md',
                content: '# Todo App\n\nBest rent-a-car and fleet management solution for your business.'
            },
            {
                path: 'src/App.jsx',
                content: 'export default function App() { return <div>Car rental dashboard</div>; }'
            }
        ];

        const result = verifyContamination(contract, files);
        assert.strictEqual(
            result.passed,
            false,
            'Expected contamination scanner to fail on rent-a-car'
        );
        assert.ok(
            result.issues.some(issue => issue.includes('rent-a-car') || issue.toLowerCase().includes('contamination')),
            'Issues must identify rent-a-car contamination'
        );
    });

    await runAsyncTest('P2.3.1: verifyContamination passes clean codebase with no template contamination', async () => {
        const contract = {
            domainEntities: ['Todo', 'Category']
        };

        const files = [
            {
                path: 'README.md',
                content: '# Todo App\n\nA modern task management application.'
            },
            {
                path: 'src/App.jsx',
                content: 'export default function App() { return <div>Manage your daily todos</div>; }'
            }
        ];

        const result = verifyContamination(contract, files);
        assert.strictEqual(result.passed, true);
        assert.strictEqual(result.issues.length, 0);
    });
}

finish();
