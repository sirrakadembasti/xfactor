import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';

test('download success audit is written only after completed transfer', async () => {
  const { sendArtifactDownload } = await import('../routes/artifactDownload.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-download-'));
  const file = path.join(root, 'fixture.zip');
  await fs.writeFile(file, 'archive fixture');
  const audits = [];
  const app = express();
  app.get('/download', (_, res, next) => sendArtifactDownload(res, { path: file }, {
    onComplete: () => audits.push('success'), onError: next
  }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).end());
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/download`;
  try {
    assert.deepEqual(audits, []);
    assert.equal(await (await fetch(url)).text(), 'archive fixture');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(audits, ['success']);
    await fs.unlink(file);
    assert.equal((await fetch(url)).status, 404);
    assert.deepEqual(audits, ['success']);
  } finally { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); }
});
