import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectArtifactFiles } from '../artifactInventory.js';

test('ZIP inventory excludes local secrets and runtime databases', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-artifact-private-'));
    try {
        await fs.mkdir(path.join(projectDir, 'prisma'));
        await fs.writeFile(path.join(projectDir, '.env'), 'SECRET=real-secret');
        await fs.writeFile(path.join(projectDir, '.env.production'), 'SECRET=production-secret');
        await fs.writeFile(path.join(projectDir, '.env.example'), 'SECRET=placeholder');
        await fs.writeFile(path.join(projectDir, 'prisma', 'dev.db'), 'private-records');
        await fs.writeFile(path.join(projectDir, 'prisma', 'dev.db-wal'), 'private-wal');
        await fs.writeFile(path.join(projectDir, 'prisma', 'schema.prisma'), 'model Book {}');
        const files = await collectArtifactFiles(projectDir);
        assert.deepEqual(files.map(file => file.path), ['.env.example', 'prisma/schema.prisma']);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});
