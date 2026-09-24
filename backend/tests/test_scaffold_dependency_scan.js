import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanUsedNpmPackages } from '../engine/codeGenerator.js';

test('dependency scan ignores Next build output and Node builtins', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-dep-scan-'));
    try {
        await fs.mkdir(path.join(projectDir, 'src'));
        await fs.mkdir(path.join(projectDir, '.next'));
        await fs.writeFile(path.join(projectDir, 'src', 'main.ts'),
            "import { z } from 'zod';\nimport net from 'node:net';\nimport threads from 'worker_threads';\n");
        await fs.writeFile(path.join(projectDir, '.next', 'bundle.js'),
            "import 'something';\nimport '@prisma/client-ba35935d35dcfd44';\n");
        assert.deepEqual(await scanUsedNpmPackages(projectDir), ['zod']);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});
