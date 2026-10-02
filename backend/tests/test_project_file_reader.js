import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectFiles } from '../projectFileReader.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-file-reader-'));
try {
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'manager'));
  await fs.writeFile(path.join(root, 'src', 'app.js'), 'export const ok = true;');
  await fs.writeFile(path.join(root, 'image.png'), Buffer.from([0, 255, 42]));
  await fs.writeFile(path.join(root, '.env'), 'SECRET=hidden');
  await fs.writeFile(path.join(root, '.env.example'), 'SECRET=');
  await fs.writeFile(path.join(root, 'manager', 'visible.js'), 'private');
  await fs.writeFile(path.join(root, 'DURUM.md'), 'private');
  await fs.writeFile(path.join(root, 'package-lock.json'), '{}');
  await fs.writeFile(path.join(root, 'Dockerfile'), 'FROM node');
  const files = await readProjectFiles(root);
  assert.deepEqual(files.map(file => file.path).sort(), ['.env.example', 'Dockerfile', 'image.png', 'src/app.js']);
  assert.deepEqual(files.find(file => file.path === 'image.png'), {
    path: 'image.png', content: 'AP8q', encoding: 'base64', size: 3
  });
  assert.equal(files.find(file => file.path === 'src/app.js').content, 'export const ok = true;');
  console.log('PASS: private files, agent state, dependency lock and binary/text response contracts');

  const largeDir = path.join(root, 'budget');
  await fs.mkdir(largeDir);
  for (let i = 0; i < 12; i++) {
    await fs.writeFile(path.join(largeDir, `${i}.txt`), Buffer.alloc(2 * 1024 * 1024 - 1, 65));
  }
  await fs.writeFile(path.join(largeDir, 'oversized.txt'), Buffer.alloc(2 * 1024 * 1024 + 1));
  const budget = await readProjectFiles(largeDir);
  assert.equal(budget.length, 10);
  assert.ok(budget.reduce((total, file) => total + file.size, 0) <= 20 * 1024 * 1024);
  console.log('PASS: individual file and aggregate response size limits');
  await fs.writeFile(path.join(largeDir, 'remaining.txt'), '0123456789');
  const filledBudget = await readProjectFiles(largeDir);
  assert.equal(filledBudget.length, 11);
  assert.equal(filledBudget.reduce((total, file) => total + file.size, 0), 20 * 1024 * 1024);
  console.log('PASS: smaller files can fill the remaining budget after larger files are skipped');

  const growingDir = path.join(root, 'growing');
  await fs.mkdir(growingDir);
  const growingFile = path.join(growingDir, 'growing.txt');
  await fs.writeFile(growingFile, 'small at stat time');
  const originalReadFile = fs.readFile;
  fs.readFile = async (target, ...options) => {
    if (target === growingFile) await fs.writeFile(target, Buffer.alloc(2 * 1024 * 1024 + 1));
    return originalReadFile(target, ...options);
  };
  try {
    assert.deepEqual(await readProjectFiles(growingDir), []);
  } finally {
    fs.readFile = originalReadFile;
  }
  console.log('PASS: files that grow between stat and read cannot bypass the response limit');
  const countDir = path.join(root, 'count');
  await fs.mkdir(countDir);
  await Promise.all(Array.from({ length: 501 }, (_, i) => fs.writeFile(path.join(countDir, `${i}.txt`), 'ok')));
  assert.equal((await readProjectFiles(countDir)).length, 500);
  assert.deepEqual(await readProjectFiles(path.join(root, 'absent')), []);
  console.log('PASS: file count limit and missing project compatibility');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
