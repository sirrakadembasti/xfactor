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

if (!filteredTest || filteredTest === 'allowed-vocabulary') {
    await runAsyncTest('P2.3.2: verifyContamination respects allowedVocabulary from contract allowlist', async () => {
        const contract = {
            domainEntities: ['Todo', 'MaintenanceItem'],
            allowedVocabulary: ['car rental', 'fleet management']
        };

        const files = [
            {
                path: 'README.md',
                content: '# Fleet and Car Rental Maintenance Todo Tracker\n\nManage maintenance tasks for car rental operations.'
            },
            {
                path: 'src/App.jsx',
                content: 'export default function App() { return <div>Fleet management todo list</div>; }'
            }
        ];

        const result = verifyContamination(contract, files);
        assert.strictEqual(
            result.passed,
            true,
            'Expected contamination scanner to accept allowed word car rental'
        );
        assert.strictEqual(result.issues.length, 0);
    });

    await runAsyncTest('P2.3.2: verifyContamination rejects un-allowed contaminant even if other words are allowlisted', async () => {
        const contract = {
            domainEntities: ['Todo'],
            allowedVocabulary: ['fleet management']
        };

        const files = [
            {
                path: 'README.md',
                content: '# Fleet management with unapproved rent-a-car templates'
            }
        ];

        const result = verifyContamination(contract, files);
        assert.strictEqual(result.passed, false);
        assert.strictEqual(result.issues.length, 1);
        assert.ok(result.issues[0].includes('rent-a-car'));
    });
}

finish();
