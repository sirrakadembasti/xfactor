import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';

const SOURCE_DIRS = ['backend', 'frontend', 'execution', 'e2e', 'scripts', 'docs'];
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const IGNORED_DIRS = new Set(['node_modules', 'data', 'dist', 'build', 'coverage', 'test-results']);

function groupFor(file) {
  if (file.startsWith('docs/') || file.endsWith('.md')) return 'docs';
  if (file.startsWith('e2e/') || file.includes('/tests/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return 'tests';
  if (file.startsWith('backend/agents/')) return 'agents';
  if (file.startsWith('backend/engine/')) return 'engine';
  if (file.startsWith('frontend/')) return 'frontend';
  return 'backend';
}

async function collectFiles(root, relativeDir, files) {
  const fullDir = path.join(root, relativeDir);
  let entries;
  try { entries = await fs.readdir(fullDir, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativeFile = path.posix.join(relativeDir.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
      await collectFiles(root, relativeFile, files);
    } else if (entry.isFile() && (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) || entry.name.endsWith('.md'))) {
      files.add(relativeFile);
    }
  }
}

function importSpecifiers(ast) {
  const specs = [];
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration' || statement.type === 'ExportNamedDeclaration'
      || statement.type === 'ExportAllDeclaration') {
      if (statement.source?.value) specs.push(statement.source.value);
    }
  }
  return specs;
}

export function assertCuratedNodesExist(curatedNodes, sourceNodes) {
  const sourceIds = new Set(sourceNodes.map(node => node.id));
  const missing = curatedNodes.filter(node => !sourceIds.has(node.id)).map(node => node.id);
  if (missing.length) throw new Error(`Graphify has missing curated files: ${missing.join(', ')}`);
}

export async function buildSourceGraph(root) {
  const files = new Set();
  for (const dir of SOURCE_DIRS) await collectFiles(root, dir, files);
  for (const file of ['README.md', 'kullanici-kilavuzu.md', 'playwright.config.js']) {
    try { await fs.access(path.join(root, file)); files.add(file); } catch {}
  }
  const sorted = [...files].sort();
  const nodes = sorted.map(id => ({
    id, label: path.posix.basename(id), type: id.endsWith('.md') ? 'Document' : 'SourceFile',
    group: groupFor(id), file: id, description: '', val: 1
  }));
  const links = [];
  for (const file of sorted) {
    if (!SOURCE_EXTENSIONS.includes(path.extname(file))) continue;
    const source = await fs.readFile(path.join(root, file), 'utf8');
    let ast;
    try {
      ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'], errorRecovery: true });
    } catch (error) {
      throw new Error(`Graphify could not parse ${file}: ${error.message}`, { cause: error });
    }
    for (const specifier of importSpecifiers(ast)) {
      if (!specifier.startsWith('.')) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const candidates = [base, ...SOURCE_EXTENSIONS.map(ext => base + ext),
        ...SOURCE_EXTENSIONS.map(ext => path.posix.join(base, 'index' + ext))];
      const target = candidates.find(candidate => files.has(candidate));
      if (target && target !== file && !links.some(link => link.source === file && link.target === target)) {
        links.push({ source: file, target, label: 'imports' });
      }
    }
  }
  return { nodes, links };
}
