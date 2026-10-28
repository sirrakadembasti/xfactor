import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTestHarness } from './testHarness.js';
import { generateProjectReadme } from '../engine/readmeGenerator.js';
import { verifyReadmeCommands } from '../verification/readmeVerifier.js';

const { runAsyncTest, finish } = createTestHarness();
const filteredTest = process.argv.find((arg) => arg.startsWith('--test='))?.split('=')[1];

async function makeDir(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p7-readme-'));
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

if (!filteredTest || filteredTest === 'vite-pure') {
  await runAsyncTest('P7.5.1: Pure Vite/React project uses dev script + 5173, no prisma', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({
        name: 'vite-app',
        scripts: { dev: 'vite', build: 'vite build' },
        dependencies: { react: '^18.0.0', vite: '^5.0.0' },
        devDependencies: {},
      }),
    });
    const readme = await generateProjectReadme({
      projectTitle: 'Vite App',
      summary: 'A Vite app.',
      talimatname: '## Notes\nSimple app.',
      projectDir: dir,
    });
    assert.match(readme, /npm run dev/);
    assert.match(readme, /5173/);
    assert.ok(!/prisma/i.test(readme), 'must not mention prisma');
    assert.ok(!readme.includes('NEXTAUTH_SECRET'), 'must not mention NEXTAUTH_SECRET');
  });
}

if (!filteredTest || filteredTest === 'prisma-steps') {
  await runAsyncTest('P7.5.2: Project with prisma dependency gets Prisma setup steps', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({
        name: 'fullstack-app',
        scripts: { dev: 'next dev' },
        dependencies: { prisma: '^5.0.0', next: '^14.0.0' },
        devDependencies: {},
      }),
    });
    const readme = await generateProjectReadme({
      projectTitle: 'Fullstack App',
      summary: 'Next + Prisma.',
      talimatname: '',
      projectDir: dir,
    });
    assert.match(readme, /npx prisma generate/);
    assert.match(readme, /npx prisma db push/);
  });

  await runAsyncTest('P7.5.2b: schema.prisma file alone triggers Prisma steps', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'vite' }, dependencies: {} }),
      'schema.prisma': 'datasource db { provider = "sqlite" url = "file:./dev.db" }',
    });
    const readme = await generateProjectReadme({
      projectTitle: 'X',
      summary: 's',
      talimatname: '',
      projectDir: dir,
    });
    assert.match(readme, /npx prisma generate/);
    assert.match(readme, /npx prisma db push/);
  });
}

if (!filteredTest || filteredTest === 'env-keys') {
  await runAsyncTest('P7.5.3: .env.example keys are listed', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'vite' }, dependencies: {} }),
      '.env.example': 'MY_API_KEY=xxx\nCUSTOM_PORT=1234\n# comment line\n',
    });
    const readme = await generateProjectReadme({
      projectTitle: 'X',
      summary: 's',
      talimatname: '',
      projectDir: dir,
    });
    assert.ok(readme.includes('MY_API_KEY'), 'must list MY_API_KEY');
    assert.ok(readme.includes('CUSTOM_PORT'), 'must list CUSTOM_PORT');
  });
}

if (!filteredTest || filteredTest === 'sanitize') {
  await runAsyncTest('P7.5.4: Internal orchestration markers stripped from architecture notes', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'vite' }, dependencies: {} }),
    });
    const readme = await generateProjectReadme({
      projectTitle: 'X',
      summary: 's',
      talimatname: 'backend.director: do this\nfrontend.teamleader: do that\n[PLAN_HAZIR] Mimari planı ve şartnameyi hazırladım done',
      projectDir: dir,
    });
    assert.ok(!readme.includes('backend.director'), 'must strip backend.director');
    assert.ok(!readme.includes('frontend.teamleader'), 'must strip frontend.teamleader');
    assert.ok(!readme.includes('[PLAN_HAZIR]'), 'must strip [PLAN_HAZIR]');
    assert.ok(!/Mimari planı ve şartnameyi hazırladım/.test(readme), 'must strip internal prompt tail');
  });
}

if (!filteredTest || filteredTest === 'no-scripts') {
  await runAsyncTest('P7.5.5: Project without scripts omits run step, invents no command', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({ name: 'x', dependencies: {} }),
    });
    const readme = await generateProjectReadme({
      projectTitle: 'X',
      summary: 's',
      talimatname: '',
      projectDir: dir,
    });
    assert.ok(!readme.includes('npm run dev'), 'must not invent npm run dev');
    assert.ok(!readme.includes('npm start'), 'must not invent npm start');
    assert.ok(!/Uygulamayı Başlatın/.test(readme), 'must omit the run step');
  });
}

if (!filteredTest || filteredTest === 'management') {
  await runAsyncTest('P7.5.6: final ZIP setup lists demo seed after environment and uses clean install', async () => {
    const dir = await makeDir({
      'package.json': JSON.stringify({ name: 'inventory', scripts: { start: 'node server.js', 'prisma:seed': 'prisma db seed' }, dependencies: { '@prisma/client': '^6.4.0' } }),
      '.env.example': 'DATABASE_URL="file:./dev.db"\nXFACTOR_DEMO_PASSWORD_MANAGER=\n',
      'Dockerfile': 'FROM node:22-alpine\nVOLUME ["/data"]\n'
    });
    const readme = await generateProjectReadme({ projectTitle: 'Inventory', projectDir: dir,
      lockfileExpected: true, management: { needed: true, roles: [{ name: 'manager' }] } });
    assert.match(readme, /npm ci/);
    assert.ok(readme.indexOf('cp .env.example .env') < readme.indexOf('npx prisma db push'));
    assert.match(readme, /npm run prisma:seed/);
    assert.match(readme, /XFACTOR_DEMO_PASSWORD_MANAGER/);
    assert.match(readme, /yalnızca geliştirme ve test/i);
    assert.match(readme, /target=\/data/);
  });
}

await runAsyncTest('mixed Vite Express README starts both declared services and validates against canonical ports', async () => {
  const manifest = { version: '1.0', services: { web: { type: 'vite', port: 4173 }, api: { type: 'express', port: 3001 } } };
  for (const apiScript of ['dev:api', 'start:api']) {
    const pkg = { name: 'mixed', scripts: { dev: 'vite', [apiScript]: 'tsx src/server.ts' }, dependencies: { vite: 'latest', express: 'latest' } };
    const dir = await makeDir({ 'package.json': JSON.stringify(pkg), 'service-manifest.json': JSON.stringify(manifest),
      '.env.example': 'AUTH_SECRET=\nPORT=3001\n', Dockerfile: 'FROM node:22\nEXPOSE 4173\n' });
    const readme = await generateProjectReadme({ projectDir: dir });
    assert.match(readme, new RegExp(`npm run ${apiScript}`));
    assert.match(readme, /npm run dev -- --host 127\.0\.0\.1 --port 4173/);
    assert.match(readme, /PORT=3001/);
    assert.match(readme, /localhost:3001/); assert.match(readme, /localhost:4173/);
    assert.match(readme, /\/api/); assert.match(readme, /docker run/);
    const result = await verifyReadmeCommands({}, [{ path: 'README.md', content: readme }, { path: 'package.json', content: JSON.stringify(pkg) },
      { path: 'service-manifest.json', content: JSON.stringify(manifest) }, { path: 'src/server.ts', content: 'const port = process.env.PORT || 3001;' }]);
    assert.equal(result.passed, true, JSON.stringify(result.issues));
  }
});

await runAsyncTest('mixed manifest without API scripts must not invent an API command', async () => {
  const dir = await makeDir({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
    'service_manifest.json': JSON.stringify({ services: { web: { type: 'vite', port: 4173 }, api: { type: 'express', port: 3001 } } }) });
  const readme = await generateProjectReadme({ projectDir: dir });
  assert.ok(!readme.includes('npm run dev:api')); assert.ok(!readme.includes('npm run start:api'));
});

finish();
