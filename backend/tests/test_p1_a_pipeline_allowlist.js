import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createTestHarness } from './testHarness.js';
import { writeGeneratedFiles } from '../engine/codeGenerator.js';
import { orderDomainsCoreFirst } from '../engine/workflow.js';

const { runAsyncTest, finish } = createTestHarness();

const tempDirs = [];
async function createTempWorkspace(prefix = 'xfactor-allowlist-test-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

try {
    await runAsyncTest('1. writeGeneratedFiles should enforce targetFiles allowlist and reject unauthorized files', async () => {
        const projectDir = await createTempWorkspace();
        const coderDir = path.join(projectDir, 'backend', 'coder_1');
        await fs.mkdir(coderDir, { recursive: true });

        const allowedTargets = ['src/routes/auth.js', 'src/models/user.js'];

        const validFiles = [
            { path: 'src/routes/auth.js', content: 'export const auth = true;' },
            { path: 'src/models/user.js', content: 'export const user = true;' }
        ];

        const written = await writeGeneratedFiles(projectDir, coderDir, validFiles, allowedTargets);
        assert.strictEqual(written.length, 2);

        const invalidFiles = [
            { path: 'src/routes/auth.js', content: 'export const auth = true;' },
            { path: 'src/outside/Unauthorized.js', content: 'malicious write' }
        ];

        await assert.rejects(
            writeGeneratedFiles(projectDir, coderDir, invalidFiles, allowedTargets),
            /allowlist|sözleşmesinde|hedef dosya/i
        );
    });

    await runAsyncTest('2. orderDomainsCoreFirst should order core/backend domains before UI and extensions', async () => {
        const domains = [
            { name: 'analytics', prefix: 'analytics' },
            { name: 'frontend', prefix: 'frontend' },
            { name: 'database', prefix: 'database' },
            { name: 'backend', prefix: 'backend' }
        ];

        const ordered = orderDomainsCoreFirst(domains);
        const orderedNames = ordered.map(d => d.name);

        assert.ok(orderedNames.indexOf('database') < orderedNames.indexOf('analytics'));
        assert.ok(orderedNames.indexOf('backend') < orderedNames.indexOf('frontend'));
    });

    finish();
} finally {
    for (const dir of tempDirs) {
        try {
            await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        } catch {}
    }
}
