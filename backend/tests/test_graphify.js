import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSourceGraph, assertCuratedNodesExist } from '../scripts/graphSource.js';
import { renderGraphHtml, renderTreeHtml, renderGraphReport } from '../scripts/graphViews.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-graphify-'));
try {
  await fs.mkdir(path.join(root, 'frontend/src/components'), { recursive: true });
  await fs.mkdir(path.join(root, 'backend'), { recursive: true });
  await fs.mkdir(path.join(root, 'execution'), { recursive: true });
  await fs.writeFile(path.join(root, 'frontend/src/App.tsx'), "import Button from './components/Button';\nexport default () => <Button />;\n");
  await fs.writeFile(path.join(root, 'frontend/src/components/Button.tsx'), 'export default function Button() { return <button />; }\n');
  await fs.writeFile(path.join(root, 'backend/server.js'), [
    "import './missing.js';",
    "app.get('/readyz', (_req, res) => res.end());",
    ''
  ].join('\n'));
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

  await fs.writeFile(path.join(root, 'backend/worker.js'), 'export function runTask() { return process.env.WORKER_TOKEN; }\nexport class Worker { run() { return runTask(); } }\n');
  await fs.writeFile(path.join(root, 'backend/routes.js'), [
    "import express from 'express';",
    "import { runTask } from './worker.js';",
    'const router = express.Router();',
    'export function installRoutes() {',
    "  router.post('/:id', runTask);",
    '  runTask();',
    "  import('./worker.js');",
    "  import(someRuntimeValue);",
    '}',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'backend/api.js'), [
    "import { installRoutes } from './routes.js';",
    "app.use('/api/tasks', installRoutes());",
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'frontend/src/client.js'), [
    'export const sendTask = id => request(`/tasks/${encodeURIComponent(id)}`, { method: "POST" });',
    'export const sendOther = id => request(`/other/${encodeURIComponent(id)}`, { method: "POST" });',
    'export const listRuns = (id, query) => request(`/projects/${encodeURIComponent(id)}/verification-runs${query ? `?${query}` : \'\'}`);',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'backend/executionClient.js'), [
    "export const getCapabilities = () => request('/readyz');",
    "export const submit = job => request('/v1/jobs', { method: 'POST' });",
    'export const poll = job => request(`/v1/jobs/${encodeURIComponent(job.jobId)}?projectId=${encodeURIComponent(job.projectId)}`);',
    "export const cancel = job => request(`/v1/jobs/${encodeURIComponent(job.jobId)}`, { method: 'DELETE' });",
    ''
  ].join('\n'));
  await fs.writeFile(path.join(root, 'execution/server.js'), [
    "import http from 'node:http';",
    'http.createServer((req, res) => {',
    '  const url = new URL(req.url, `http://${req.headers.host}`);',
    "  if (req.method === 'GET' && url.pathname === '/readyz') return res.end();",
    "  if (req.method === 'POST' && url.pathname === '/v1/jobs') return res.end();",
    '  const match = url.pathname.match(/^\\/v1\\/jobs\\/([^/]+)$/);',
    '  if (match) {',
    "    if (req.method === 'GET') return res.end();",
    "    if (req.method === 'DELETE') return res.end();",
    '  }',
    '});',
    ''
  ].join('\n'));
  const detailed = await buildSourceGraph(root);
  const install = detailed.nodes.find(node => node.file === 'backend/routes.js' && node.type === 'Function' && node.label === 'installRoutes');
  const run = detailed.nodes.find(node => node.file === 'backend/worker.js' && node.type === 'Function' && node.label === 'runTask');
  const route = detailed.nodes.find(node => node.type === 'HttpRoute' && node.label === 'POST /:id');
  assert(install && run && route, 'function and HTTP route nodes are extracted');
  assert(detailed.links.some(link => link.source === 'backend/routes.js' && link.target === install.id && link.label === 'contains'));
  assert(detailed.links.some(link => link.source === install.id && link.target === run.id && link.label === 'calls'));
  const workerClass = detailed.nodes.find(node => node.type === 'Class' && node.label === 'Worker');
  const workerMethod = detailed.nodes.find(node => node.type === 'Method' && node.label === 'Worker.run');
  assert(workerClass && workerMethod);
  assert(detailed.links.some(link => link.source === workerClass.id && link.target === workerMethod.id && link.label === 'contains'));
  assert(detailed.nodes.some(node => node.id === 'env:WORKER_TOKEN'));
  assert(detailed.links.some(link => link.source === run.id && link.target === 'env:WORKER_TOKEN' && link.label === 'reads_env'));
  assert(detailed.links.some(link => link.source === install.id && link.target === route.id && link.label === 'registers_route'));
  assert(detailed.nodes.some(node => node.id === 'package:express'));
  assert(detailed.links.some(link => link.source === 'backend/routes.js' && link.target === 'package:express' && link.label === 'imports_package'));
  assert(detailed.links.some(link => link.source === install.id && link.target === 'backend/worker.js' && link.label === 'dynamic_imports'));
  assert(!detailed.links.some(link => link.label === 'calls' && link.target === 'backend/routes.js'));
  const request = detailed.nodes.find(node => node.type === 'HttpRequest' && node.label === 'POST /tasks/:id');
  assert(request, 'HTTP client request extracted from a template path');
  assert(detailed.links.some(link => link.source === request.id && link.target === route.id && link.label === 'requests_route'));
  const unrelated = detailed.nodes.find(node => node.type === 'HttpRequest' && node.label === 'POST /other/:id');
  assert(!detailed.links.some(link => link.source === unrelated.id && link.target === route.id && link.label === 'requests_route'));
  assert(detailed.nodes.some(node => node.type === 'HttpRequest' && node.label === 'GET /projects/:id/verification-runs'));
  assert(!detailed.nodes.some(node => node.type === 'HttpRequest' && node.label.includes('verification-runs:value')));
  for (const label of ['GET /readyz', 'POST /v1/jobs', 'GET /v1/jobs/:jobId', 'DELETE /v1/jobs/:jobId']) {
    assert(detailed.nodes.some(node => node.type === 'HttpRoute' && node.label === label), `${label} raw worker route is extracted`);
  }
  for (const label of ['GET /readyz', 'POST /v1/jobs', 'GET /v1/jobs/:jobId', 'DELETE /v1/jobs/:jobId']) {
    const workerRequest = detailed.nodes.find(node => node.type === 'HttpRequest'
      && node.file === 'backend/executionClient.js' && node.label === label);
    const workerRoute = detailed.nodes.find(node => node.type === 'HttpRoute'
      && node.file === 'execution/server.js' && node.label === label);
    assert(workerRequest && workerRoute, `${label} worker request and route are extracted`);
    assert(detailed.links.some(link => link.source === workerRequest.id
      && link.target === workerRoute.id && link.label === 'requests_route'), `${label} worker request maps to its execution route`);
  }
  const html = renderGraphHtml(detailed);
  assert(html.includes('POST /tasks/:id') && html.includes('backend/worker.js'));
  assert(html.includes('id="graph-search"') && html.includes('id="relation-filter"'));
  const tree = renderTreeHtml(detailed);
  assert(tree.includes('backend/routes.js') && tree.includes('frontend/src/components/Button.tsx'));
  const report = renderGraphReport(detailed);
  assert(report.includes('HttpRoute') && report.includes('registers_route'));

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
