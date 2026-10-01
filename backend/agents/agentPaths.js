import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_DOCUMENT_ROOT = fileURLToPath(new URL('../../x-agents/', import.meta.url));
const roles = new Set(['manager', 'director', 'teamleader', 'coder', 'reviewer', 'tester']);
const files = new Set([
  ...[...roles].map(role => `${role}.md`), 'ORKESTRASYON-TALIMATNAMESI.md',
  'ALT-TALIMATNAME.md', 'GOREV.md', 'DURUM.md', 'RAPOR.md', 'TODO.md'
]);

export function agentRoleFile(role) {
  if (!roles.has(role)) throw new Error('Unknown agent role.');
  return `${role}.md`;
}

export function readAgentDocument(filename) {
  if (!files.has(filename)) throw new Error('Unknown agent document.');
  const root = path.resolve(AGENT_DOCUMENT_ROOT);
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Agent root must be a directory without links.');
  const source = path.join(root, filename);
  const fileStat = fs.lstatSync(source);
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error('Agent document must be a regular file without links.');
  if (path.dirname(fs.realpathSync(source)) !== fs.realpathSync(root)) throw new Error('Agent document escapes its trusted root.');
  const descriptor = fs.openSync(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.size > 128 * 1024) throw new Error('Invalid agent document size or type.');
    return fs.readFileSync(descriptor, 'utf8');
  } finally { fs.closeSync(descriptor); }
}

function canonicalPath(value) {
  let parent = path.resolve(value);
  const suffix = [];
  while (true) {
    try { return path.resolve(fs.realpathSync(parent), ...suffix); }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code) || path.dirname(parent) === parent) throw error;
      suffix.unshift(path.basename(parent));
      parent = path.dirname(parent);
    }
  }
}

function contains(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function assertProjectsSeparateFromAgents(projectsRoot) {
  const agentRoot = path.resolve(AGENT_DOCUMENT_ROOT);
  const roots = [[path.resolve(projectsRoot), agentRoot], [canonicalPath(projectsRoot), canonicalPath(agentRoot)]];
  if (roots.some(([projects, agents]) => contains(projects, agents) || contains(agents, projects))) {
    throw new Error('Projects root overlaps protected x-agents instructions.');
  }
}
