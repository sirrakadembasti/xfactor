import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createTestHarness } from './testHarness.js';
import * as fileProtocol from '../engine/fileProtocol.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find(arg => arg.startsWith('--test='))?.split('=')[1];

async function createWorkspace() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-repair-allowlist-'));
}

if (!filteredTest || filteredTest === 'repair-write') {
    await runAsyncTest('P2.7.1: repair writes reject files outside the active task allowlist', async () => {
        const projectDir = await createWorkspace();
        try {
            let error = null;
            try {
                if (typeof fileProtocol.writeGeneratedFiles === 'function') {
                    await fileProtocol.writeGeneratedFiles(
                        {
                            projectDir,
                            allowedFiles: ['src/components/TodoList.jsx']
                        },
                        [{ path: 'src/index.html', content: '<div>Unsolicited rewrite</div>' }]
                    );
                }
            } catch (caught) {
                error = caught;
            }

            assert.ok(error, 'Expected file protocol to block out-of-scope write');
            assert.strictEqual(error.code, 'OUT_OF_SCOPE_MUTATION');
            await assert.rejects(
                fs.stat(path.join(projectDir, 'src/index.html')),
                candidate => candidate.code === 'ENOENT'
            );
        } finally {
            await fs.rm(projectDir, { recursive: true, force: true });
        }
    });

    await runAsyncTest('P2.7.1: repair writes reject malformed allowlist contexts consistently', async () => {
        const projectDir = await createWorkspace();
        try {
            for (const taskContext of [
                null,
                { projectDir, allowedFiles: [null] }
            ]) {
                await assert.rejects(
                    fileProtocol.writeGeneratedFiles(
                        taskContext,
                        [{ path: 'src/components/TodoList.jsx', content: 'unsafe' }]
                    ),
                    error => error.code === 'OUT_OF_SCOPE_MUTATION'
                );
            }
        } finally {
            await fs.rm(projectDir, { recursive: true, force: true });
        }
    });

    await runAsyncTest('P2.7.1: repair writes allow files in the active task allowlist', async () => {
        const projectDir = await createWorkspace();
        try {
            assert.strictEqual(
                typeof fileProtocol.writeGeneratedFiles,
                'function',
                'Expected repair-aware writeGeneratedFiles interface'
            );
            const written = await fileProtocol.writeGeneratedFiles(
                {
                    projectDir,
                    allowedFiles: ['src/components/TodoList.jsx']
                },
                [{ path: 'src/components/TodoList.jsx', content: 'export default function TodoList() {}' }]
            );

            assert.deepStrictEqual(written.map(file => file.path), ['src/components/TodoList.jsx']);
            assert.strictEqual(
                await fs.readFile(path.join(projectDir, 'src/components/TodoList.jsx'), 'utf8'),
                'export default function TodoList() {}'
            );
        } finally {
            await fs.rm(projectDir, { recursive: true, force: true });
        }
    });
}

finish();
