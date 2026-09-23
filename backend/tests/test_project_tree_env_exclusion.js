import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { listProjectTree } from '../engine/codeGenerator.js';

test('archive source tree excludes local environment secrets but keeps the example', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-tree-env-'));
    try {
        await fs.writeFile(path.join(projectDir, '.env'), 'SECRET=real-secret');
        await fs.writeFile(path.join(projectDir, '.env.local'), 'SECRET=local-secret');
        await fs.writeFile(path.join(projectDir, '.env.production'), 'SECRET=production-secret');
        await fs.writeFile(path.join(projectDir, '.env.example'), 'SECRET=placeholder');
        const tree = await listProjectTree(projectDir);
        assert.deepEqual(tree.map(file => file.path), ['.env.example']);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});
