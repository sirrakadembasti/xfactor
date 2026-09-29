import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanUsedNpmPackages, ensureProjectScaffold } from '../engine/codeGenerator.js';

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

test('Vue Vite scaffold keeps a compatible Vue toolchain without React packages', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-vue-scaffold-'));
    try {
        await fs.mkdir(path.join(projectDir, 'src'));
        await fs.writeFile(path.join(projectDir, 'src', 'App.vue'), "<script setup>import { ref } from 'vue'; import { useRouter } from 'vue-router'; import { defineStore } from 'pinia';</script>");
        await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({
            dependencies: { react: '^18.3.1', vue: '^1.0.0', 'vue-router': '^1.0.0', pinia: '^1.0.0' },
            devDependencies: { '@vitejs/plugin-react': 'latest' }
        }));
        await fs.writeFile(path.join(projectDir, 'vite.config.js'),
            "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport path from 'path';\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: { '@': path.resolve(__dirname, './src') }\n  }\n});\n");
        await ensureProjectScaffold(projectDir, { title: 'Emlak' }, { summary: 'Vue 3 Vite frontend' });
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        const viteConfig = await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8');
        assert.match(pkg.dependencies.vue, /^\^3\./);
        assert.match(pkg.dependencies['vue-router'], /^\^4\./);
        assert.notEqual(pkg.dependencies.pinia, '^1.0.0');
        assert.equal(pkg.dependencies.react, undefined);
        assert.equal(pkg.devDependencies['@vitejs/plugin-react'], undefined);
        assert.ok(pkg.devDependencies['@vitejs/plugin-vue']);
        assert.match(viteConfig, /@vitejs\/plugin-vue/);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});
