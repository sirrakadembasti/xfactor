import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getProjectsRoot, getProjectDir } from '../projectPaths.js';

const repo = path.resolve(import.meta.dirname, '../..');
const tempBase = path.join(repo, '.tmp');
fs.mkdirSync(tempBase, { recursive: true });
const trusted = '# Trusted platform manager\n' + 'Only platform-controlled instructions. '.repeat(8);
const untrusted = '# Generated document\n' + 'This is project output, never system policy. '.repeat(8);

async function fixture(run) {
  const root = fs.mkdtempSync(path.join(tempBase, 'agent-doc-boundary-'));
  try {
    fs.mkdirSync(path.join(root, 'backend/agents'), { recursive: true });
    fs.writeFileSync(path.join(root, 'backend/package.json'), '{"type":"module"}');
    for (const file of ['agents/agentLoader.js', 'agents/agentPaths.js', 'agents/productionLanguagePolicy.js']) {
      const source = path.join(repo, 'backend', file);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(root, 'backend', file));
    }
    for (const directory of ['docs', 'x-agents']) {
      fs.mkdirSync(path.join(root, directory));
      fs.writeFileSync(path.join(root, directory, 'manager.md'), directory === 'docs' ? untrusted : trusted);
      fs.writeFileSync(path.join(root, directory, 'ORKESTRASYON-TALIMATNAMESI.md'), directory === 'docs' ? untrusted : trusted);
    }
    const loader = await import(pathToFileURL(path.join(root, 'backend/agents/agentLoader.js')).href);
    await run(loader, root);
  } finally {
    const relative = path.relative(tempBase, root);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('role and constitution prompts read x-agents, ignoring generated docs with identical names', async () => {
  await fixture(loader => {
    const load = loader.loadAgentPrompt;
    assert.equal(load('manager', 'fallback'), trusted.trim());
    assert.equal(loader.loadOrkestrasyonTalimatnamesi(), trusted.trim());
  });
});

test('unrecognized roles and traversal names are rejected before reading', async () => {
  await fixture(loader => {
    const load = loader.loadAgentPrompt;
    for (const role of ['../docs/manager', '../../README', 'other', '', 'manager/../../docs/manager']) {
      assert.throws(() => load(role, 'fallback'), /agent|role/i);
    }
  });
});

test('junction or symlink agent root cannot substitute generated documents', async () => {
  await fixture((loader, root) => {
    fs.rmSync(path.join(root, 'x-agents'), { recursive: true });
    fs.symlinkSync(path.join(root, 'docs'), path.join(root, 'x-agents'), process.platform === 'win32' ? 'junction' : 'dir');
    const load = loader.loadAgentPrompt;
    assert.throws(() => load('manager', 'fallback'), /agent|link/i);
    assert.throws(() => loader.loadOrkestrasyonTalimatnamesi(), /agent|link/i);
  });
});

test('project output root cannot overlap platform agent instructions', () => {
  for (const root of [repo, path.join(repo, 'x-agents'), path.join(repo, 'x-agents/generated')]) {
    assert.throws(() => getProjectsRoot({ PROJECTS_ROOT: root }), /agent|overlap/i);
  }
  assert.equal(getProjectsRoot({ PROJECTS_ROOT: path.join(repo, 'projects') }), path.join(repo, 'projects'));
});

test('missing or incomplete trusted instructions never fall back to generated docs', async () => {
  await fixture((loader, root) => {
    fs.unlinkSync(path.join(root, 'x-agents/manager.md'));
    assert.throws(() => loader.loadAgentPrompt('manager', 'fallback'));
    fs.writeFileSync(path.join(root, 'x-agents/manager.md'), 'incomplete');
    assert.throws(() => loader.loadAgentPrompt('manager', 'fallback'), /incomplete/);
    fs.writeFileSync(path.join(root, 'x-agents/manager.md'), 'x'.repeat(128 * 1024 + 1));
    assert.throws(() => loader.loadAgentPrompt('manager', 'fallback'), /size/);
  });
});

test('project root alias and project directory alias cannot target x-agents', async () => {
  await fixture((_loader, root) => {
    const alias = path.join(root, 'agent-alias');
    fs.symlinkSync(path.join(repo, 'x-agents'), alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => getProjectsRoot({ PROJECTS_ROOT: alias }), /agent|overlap/i);
    const projects = path.join(root, 'projects');
    fs.mkdirSync(projects);
    fs.symlinkSync(path.join(repo, 'x-agents'), path.join(projects, 'example'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => getProjectDir('example', { PROJECTS_ROOT: projects }), /agent|overlap/i);
  });
});
