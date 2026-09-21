import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSourceGraph, assertCuratedNodesExist } from '../scripts/graphSource.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-graphify-'));
try {
  await fs.mkdir(path.join(root, 'frontend/src/components'), { recursive: true });
  await fs.mkdir(path.join(root, 'backend'), { recursive: true });
  await fs.writeFile(path.join(root, 'frontend/src/App.tsx'), "import Button from './components/Button';\nexport default () => <Button />;\n");
  await fs.writeFile(path.join(root, 'frontend/src/components/Button.tsx'), 'export default function Button() { return <button />; }\n');
  await fs.writeFile(path.join(root, 'backend/server.js'), "import './missing.js';\n");
  await fs.writeFile(path.join(root, 'frontend/vite.config.js'), 'export default {};\n');
  await fs.writeFile(path.join(root, 'playwright.config.js'), 'export default {};\n');
  await fs.writeFile(path.join(root, 'README.md'), '# Fixture\n');

  const graph = await buildSourceGraph(root);
  const ids = new Set(graph.nodes.map(node => node.id));
  assert(ids.has('frontend/src/App.tsx'));
  assert(ids.has('frontend/src/components/Button.tsx'));
  assert(ids.has('README.md'));
  assert(ids.has('frontend/vite.config.js'));
  assert(ids.has('playwright.config.js'));
  assert(graph.links.some(link => link.source === 'frontend/src/App.tsx'
    && link.target === 'frontend/src/components/Button.tsx' && link.label === 'imports'));
  assert(graph.links.every(link => ids.has(link.source) && ids.has(link.target)));
  assert(!graph.links.some(link => link.target.endsWith('missing.js')));
  assert.doesNotThrow(() => assertCuratedNodesExist([{ id: 'frontend/src/App.tsx' }], graph.nodes));
  assert.throws(() => assertCuratedNodesExist([{ id: 'backend/deleted.js' }], graph.nodes), /backend\/deleted\.js/);

  const committedGraph = JSON.parse(await fs.readFile(
    path.join(import.meta.dirname, '../../graphify-out/graph.json'), 'utf8'
  ));
  const workflowDagRelations = committedGraph.links
    .filter(link => link.source === 'backend/engine/workflow.js' && link.target === 'backend/engine/dag.js')
    .map(link => link.label);
  assert(workflowDagRelations.includes('imports'));
  assert(workflowDagRelations.includes('executes_waves'));
  console.log('Graphify source extraction: passed');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
