import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { scanUsedNpmPackages, ensureProjectScaffold, detectProjectStack, ensureUserModelInSchema } from '../engine/codeGenerator.js';

test('imported rate limiter receives a modern compatible fallback while explicit versions stay unchanged', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-rate-limit-version-'));
    try {
        await fs.mkdir(path.join(projectDir, 'src'));
        await fs.writeFile(path.join(projectDir, 'src/httpApp.ts'), "import rateLimit from 'express-rate-limit';\nexport const limiter = rateLimit({ skip: () => true, standardHeaders: true, legacyHeaders: false });\n");
        const plan = { summary: 'Vite React frontend and Express TypeScript API' };
        await ensureProjectScaffold(projectDir, {}, plan);
        const pkgPath = path.join(projectDir, 'package.json');
        let pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        assert.equal(pkg.dependencies['express-rate-limit'], '8.6.1');
        pkg.dependencies['express-rate-limit'] = '^7.5.1';
        await fs.writeFile(pkgPath, JSON.stringify(pkg));
        await ensureProjectScaffold(projectDir, {}, plan);
        pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        assert.equal(pkg.dependencies['express-rate-limit'], '^7.5.1');
    } finally { await fs.rm(projectDir, { recursive: true, force: true }); }
});

test('ESM Vite scaffold creates loadable PostCSS config and preserves existing config bytes', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-esm-postcss-'));
    try {
        await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'esm-postcss', type: 'module', dependencies: { react: '^18.3.1', vite: 'latest' } }));
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React frontend' });
        const configPath = path.join(projectDir, 'postcss.config.js');
        const config = await import(pathToFileURL(configPath).href);
        assert.deepEqual(config.default.plugins, { tailwindcss: {}, autoprefixer: {} });
        const custom = "export default { plugins: { 'custom-plugin': {} } };\n";
        await fs.writeFile(configPath, custom);
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React frontend' });
        assert.equal(await fs.readFile(configPath, 'utf8'), custom);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

test('User schema guard preserves complete source bytes across repeated scaffold calls', () => {
    for (const eol of ['\n', '\r\n']) {
        const schema = ['// preserve formatting', 'model   User {', '  id String @id', '  username String @unique',
            '  password String', '  role String', '  createdAt DateTime @default(now())', '', '}', '',
            'model Other { id Int @id }', ''].join(eol);
        assert.equal(ensureUserModelInSchema(schema), schema);
        assert.equal(ensureUserModelInSchema(ensureUserModelInSchema(schema)), schema);
    }
});

test('User schema guard supplements missing fields once and leaves other models byte-identical', () => {
    const other = '\n// unrelated model\nmodel Room {\n  id String @id\n}\n';
    for (const user of ['', 'model User {\n  id String @id\n  customField String?\n}\n']) {
        const original = user + other;
        const supplemented = ensureUserModelInSchema(original);
        assert.notEqual(supplemented, original);
        assert.ok(supplemented.includes(other));
        for (const field of ['id', 'username', 'password', 'role', 'createdAt']) assert.match(supplemented, new RegExp(`\\b${field}\\b`));
        if (user) assert.match(supplemented, /customField String\?/);
        assert.equal(ensureUserModelInSchema(supplemented), supplemented);
    }
});

test('repeated authenticated scaffold preserves the accepted Prisma schema bytes and digest', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-schema-repeat-'));
    try {
        await fs.mkdir(path.join(projectDir, 'prisma'));
        const schemaPath = path.join(projectDir, 'prisma/schema.prisma');
        const schema = 'model User {\n  id String @id\n  username String @unique\n  password String\n  role String\n  createdAt DateTime @default(now())\n}\n';
        await fs.writeFile(schemaPath, schema);
        const state = { title: 'Schema resume fixture', contract: { authentication: { required: true } } };
        const plan = { summary: 'Vite React Express Prisma SQLite' };
        const digest = value => createHash('sha256').update(value).digest('hex');
        const expected = Buffer.from(schema);
        for (let repeat = 0; repeat < 2; repeat++) {
            await ensureProjectScaffold(projectDir, state, plan);
            const actual = await fs.readFile(schemaPath);
            assert.deepEqual(actual, expected);
            assert.equal(digest(actual), digest(expected));
        }
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

test('explicit Vite and Express scaffold declares two runnable services and an API bootstrap contract', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-mixed-scaffold-'));
    try {
        const plan = { summary: 'React Vite frontend with Express TypeScript backend' };
        assert.equal((await detectProjectStack(projectDir, {}, plan)).hasExpressApi, true);
        await ensureProjectScaffold(projectDir, {}, plan);
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'service-manifest.json'), 'utf8'));
        assert.ok(pkg.dependencies.express && pkg.dependencies.cors && pkg.dependencies.dotenv);
        assert.ok(pkg.devDependencies.tsx && pkg.devDependencies['@types/express']);
        assert.equal(pkg.scripts['start:api'], 'tsx src/server.ts');
        assert.equal(manifest.services.web.port, 4173);
        assert.equal(manifest.services.api.port, 3001);
        assert.deepEqual(manifest.services.api.args, ['run', 'start:api']);
        assert.equal(manifest.services.api.healthEndpoint, '/api/health');
        const bootstrap = await fs.readFile(path.join(projectDir, 'src/server.ts'), 'utf8');
        assert.match(bootstrap, /import app from ['"]\.\/httpApp['"]/);
        assert.match(bootstrap, /app\.listen/);
        assert.match(bootstrap, /3001/);
        assert.match(await fs.readFile(path.join(projectDir, 'src/httpApp.ts'), 'utf8'), /\/api\/health/);
        await assert.rejects(fs.stat(path.join(projectDir, 'src/app.ts')), { code: 'ENOENT' });
        const config = await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8');
        assert.match(config, /127\.0\.0\.1:3001/);
        assert.match(config, /preview:\s*\{\s*proxy/);
        assert.match(config, /server:\s*\{\s*proxy/);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

test('repeated scaffold preserves custom API entry and React App without injecting an unused app module', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-custom-api-entry-'));
    try {
        await fs.mkdir(path.join(projectDir, 'src'));
        const files = {
            'server.ts': "import api from './httpApp';\napi.listen(Number(process.env.PORT || 3001));\n",
            'httpApp.ts': '/* application-owned API module */\n',
            'App.tsx': 'export default function App() { return <main>Hotel</main>; }\n'
        };
        for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(projectDir, 'src', name), content);
        for (let iteration = 0; iteration < 2; iteration++) {
            await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React frontend and Express TypeScript API' });
            for (const [name, content] of Object.entries(files)) assert.equal(await fs.readFile(path.join(projectDir, 'src', name), 'utf8'), content);
            await assert.rejects(fs.stat(path.join(projectDir, 'src/app.ts')), { code: 'ENOENT' });
        }
        await fs.unlink(path.join(projectDir, 'src/httpApp.ts'));
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React frontend and Express TypeScript API' });
        await assert.rejects(fs.stat(path.join(projectDir, 'src/httpApp.ts')), { code: 'ENOENT' }, 'An existing custom entry owns its imports; scaffold must not inject fallback modules.');
    } finally { await fs.rm(projectDir, { recursive: true, force: true }); }
});

test('missing API entry can use an existing legacy app module without rewriting or duplicating it', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-legacy-api-module-'));
    try {
        await fs.mkdir(path.join(projectDir, 'src'));
        const legacy = '/* preserve legacy routes and middleware */\nexport default legacyApi;\n';
        await fs.writeFile(path.join(projectDir, 'src/app.ts'), legacy);
        for (let iteration = 0; iteration < 2; iteration++) {
            await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React frontend and Express TypeScript API' });
            assert.equal(await fs.readFile(path.join(projectDir, 'src/app.ts'), 'utf8'), legacy);
            assert.match(await fs.readFile(path.join(projectDir, 'src/server.ts'), 'utf8'), /import app from ['"]\.\/app['"]/);
            await assert.rejects(fs.stat(path.join(projectDir, 'src/httpApp.ts')), { code: 'ENOENT' });
        }
    } finally { await fs.rm(projectDir, { recursive: true, force: true }); }
});

test('mixed scaffold preserves explicit runtime wiring and an existing application bootstrap', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-existing-mixed-'));
    try {
        await fs.mkdir(path.join(projectDir, 'src'));
        const bootstrap = '/* application-owned bootstrap */\n';
        const app = '/* application-owned app */\n';
        const config = 'export default { /* custom proxy */ };\n';
        const manifest = { version: '1.0', services: {
            web: { command: 'npm', args: ['run', 'preview'], port: 4173, healthEndpoint: '/' },
            api: { type: 'express', command: 'node', args: ['custom-api.js'], port: 5000, healthEndpoint: '/ready' }
        } };
        await fs.writeFile(path.join(projectDir, 'src/server.ts'), bootstrap);
        await fs.writeFile(path.join(projectDir, 'src/app.ts'), app);
        await fs.writeFile(path.join(projectDir, 'vite.config.js'), config);
        await fs.writeFile(path.join(projectDir, 'service-manifest.json'), JSON.stringify(manifest));
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React and Express TypeScript' });
        assert.deepEqual(JSON.parse(await fs.readFile(path.join(projectDir, 'service-manifest.json'), 'utf8')), manifest);
        assert.equal(await fs.readFile(path.join(projectDir, 'src/server.ts'), 'utf8'), bootstrap);
        assert.equal(await fs.readFile(path.join(projectDir, 'src/app.ts'), 'utf8'), app);
        assert.equal(await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8'), config);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

test('Prisma scaffold preserves an existing seed command and its configuration', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-seed-preservation-'));
    try {
        await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({
            prisma: { seed: 'node prisma/seed.cjs', schema: 'prisma/custom.prisma' },
            scripts: { 'prisma:seed': 'node prisma/seed.cjs' }
        }));
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React Prisma SQLite' });
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        assert.equal(pkg.prisma.seed, 'node prisma/seed.cjs');
        assert.equal(pkg.prisma.schema, 'prisma/custom.prisma');
        assert.equal(pkg.scripts['prisma:seed'], 'node prisma/seed.cjs');
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

for (const packageType of ['module', 'commonjs']) {
    test(`repeated mixed scaffold preserves ${packageType} runtime, API and seed configuration`, async () => {
        const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-runtime-preservation-'));
        try {
            await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({
                type: packageType,
                scripts: { 'start:api': 'tsx custom/server.ts', 'prisma:seed': 'node prisma/seed.cjs' },
                prisma: { seed: 'node prisma/seed.cjs', schema: 'prisma/custom.prisma' }
            }));
            await fs.writeFile(path.join(projectDir, '.env.example'), '# Application settings\nDATABASE_URL="file:custom.db"\n');
            for (let pass = 0; pass < 2; pass++) {
                await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React Express TypeScript Prisma SQLite' });
                const pkg = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
                assert.equal(pkg.type, packageType);
                assert.equal(pkg.scripts['start:api'], 'tsx custom/server.ts');
                assert.equal(pkg.scripts['prisma:seed'], 'node prisma/seed.cjs');
                assert.deepEqual(pkg.prisma, { seed: 'node prisma/seed.cjs', schema: 'prisma/custom.prisma' });
            }
            const example = await fs.readFile(path.join(projectDir, '.env.example'), 'utf8');
            assert.match(example, /^# Application settings\nDATABASE_URL="file:custom.db"\n/);
            assert.equal(example.split('\n').filter(line => line.startsWith('AUTH_SECRET=')).length, 1);
            assert.match(example, /^AUTH_SECRET=$/m);
            assert.match(example, /32/);
        } finally {
            await fs.rm(projectDir, { recursive: true, force: true });
        }
    });
}

test('mixed scaffold documents AUTH_SECRET without replacing an existing secret example', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-auth-secret-example-'));
    try {
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React Express TypeScript' });
        const examplePath = path.join(projectDir, '.env.example');
        const example = await fs.readFile(examplePath, 'utf8');
        assert.match(example, /^AUTH_SECRET=$/m);
        await fs.writeFile(examplePath, example.replace('AUTH_SECRET=', 'AUTH_SECRET=application-owned-example'));
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React Express TypeScript' });
        assert.equal(await fs.readFile(examplePath, 'utf8'), example.replace('AUTH_SECRET=', 'AUTH_SECRET=application-owned-example'));
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

test('missing mixed API bootstrap follows the explicitly declared service port', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-custom-api-port-'));
    try {
        const manifest = { version: '1.0', services: {
            web: { command: 'npm', args: ['run', 'preview'], port: 4173, healthEndpoint: '/' },
            api: { type: 'express', command: 'npm', args: ['run', 'start:api'], port: 5000, healthEndpoint: '/api/health' }
        } };
        await fs.writeFile(path.join(projectDir, 'service-manifest.json'), JSON.stringify(manifest));
        await ensureProjectScaffold(projectDir, {}, { summary: 'Vite React and Express TypeScript' });
        const bootstrap = await fs.readFile(path.join(projectDir, 'src/server.ts'), 'utf8');
        assert.match(bootstrap, /process\.env\.PORT\s*\|\|\s*5000/);
        assert.match(await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8'), /127\.0\.0\.1:5000/);
        assert.deepEqual(JSON.parse(await fs.readFile(path.join(projectDir, 'service-manifest.json'), 'utf8')), manifest);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

test('mixed scaffold upgrades its prior Vite-only runtime without replacing the web service', async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-upgrade-mixed-'));
    try {
        await ensureProjectScaffold(projectDir, {}, { summary: 'React Vite TypeScript' });
        const before = JSON.parse(await fs.readFile(path.join(projectDir, 'service-manifest.json'), 'utf8'));
        await fs.mkdir(path.join(projectDir, 'src/routes'), { recursive: true });
        await fs.writeFile(path.join(projectDir, 'src/routes/rooms.ts'), "import { Router } from 'express';\n");
        await ensureProjectScaffold(projectDir, {}, { summary: 'React Vite TypeScript frontend and Express API' });
        const after = JSON.parse(await fs.readFile(path.join(projectDir, 'service-manifest.json'), 'utf8'));
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
        assert.deepEqual(after.services.web, before.services.web);
        assert.equal(after.services.api.port, 3001);
        assert.match(pkg.dependencies.express, /^\^4\./);
        assert.match(pkg.devDependencies['@types/express'], /^\^4\./);
        const config = await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8');
        assert.match(config, /127\.0\.0\.1:3001/);
        await ensureProjectScaffold(projectDir, {}, { summary: 'React Vite TypeScript frontend and Express API' });
        assert.equal(await fs.readFile(path.join(projectDir, 'vite.config.js'), 'utf8'), config);
    } finally {
        await fs.rm(projectDir, { recursive: true, force: true });
    }
});

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
