import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from '../../backend/node_modules/jszip/lib/index.js';
import { extractLocalArchive } from '../localArchive.js';

// OS temp dirs may be aliased (macOS /var, Windows 8.3 names); owned fixtures live under the canonical path.
const CANONICAL_TMP = await fs.realpath(os.tmpdir());

async function archive(files, options = {}) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content, { createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'STORE', ...options });
}
async function owned(t) {
  const root = await fs.mkdtemp(path.join(CANONICAL_TMP, 'xfactor-archive-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('extracts exact bytes only into fresh owned workspace and preserves input ZIP', async t => {
  const root = await owned(t);
  const bytes = await archive({ 'package.json': '{"name":"fixture"}', 'src/app.js': 'export const value=1;', '.env.example': 'EXAMPLE=value' });
  await fs.writeFile(path.join(root, 'artifact.zip'), bytes);
  await extractLocalArchive(bytes, root);
  assert.equal(await fs.readFile(path.join(root, 'src/app.js'), 'utf8'), 'export const value=1;');
  assert.deepEqual(await fs.readFile(path.join(root, 'artifact.zip')), bytes);
});
test('denies raw unsafe ZIP names before materializing anything', async t => {
  for (const name of ['../escape.js', '/root.js', 'C:/drive.js', 'a\\b.js', 'a/../b.js', 'a//b.js', 'bad\r.js', 'CON.js', 'CON .txt', 'dir/aux', 'a:stream', 'a?.js', 'trailing.', 'trailing ', 'node_modules/pkg.js', '.git/config', '.npmrc', '.env', '.env.local', 'dev.db', 'artifact.zip', '.home/overwrite']) {
    await t.test(JSON.stringify(name), async st => {
      const root = await owned(st);
      await assert.rejects(extractLocalArchive(await archive({ [name]: 'unsafe' }), root), /unsafe|reserved|forbidden/i);
      assert.deepEqual(await fs.readdir(root), []);
    });
  }
});
test('denies duplicate canonical names and file/directory conflicts on every OS', async t => {
  for (const files of [{ 'APP.js': 'a', 'app.js': 'b' }, { 'dir': 'file', 'dir/child.js': 'child' }]) {
    const root = await owned(t);
    await assert.rejects(extractLocalArchive(await archive(files), root), /duplicate|conflict/i);
    assert.deepEqual(await fs.readdir(root), []);
  }
});
test('rejects symlink ZIP entries before extraction', async t => {
  const root = await owned(t); const zip = new JSZip();
  zip.file('link', '../outside', { unixPermissions: 0o120777 });
  await assert.rejects(extractLocalArchive(await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }), root), /symlink/i);
  assert.deepEqual(await fs.readdir(root), []);
});
test('rejects existing target data and symlink or junction workspace roots', async t => {
  const root = await owned(t); const bytes = await archive({ 'app.js': 'new' });
  await fs.writeFile(path.join(root, 'app.js'), 'existing');
  await assert.rejects(extractLocalArchive(bytes, root), /fresh|existing/i);
  assert.equal(await fs.readFile(path.join(root, 'app.js'), 'utf8'), 'existing');
  const parent = await owned(t); const alias = path.join(parent, 'alias');
  await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(extractLocalArchive(bytes, alias), /symlink|junction/i);
});
test('rejects bounded metadata limits before inflation', async t => {
  for (const [bytes, limits, expected] of [
    [await archive({ a: 'abc' }), { maxFileBytes: 2 }, /file size/i],
    [await archive({ a: 'ab', b: 'cd' }), { maxExtractedBytes: 3 }, /extracted size/i],
    [await archive({ a: '', b: '' }), { maxFiles: 1 }, /file count/i],
    [await archive({ a: 'x'.repeat(5000) }, { compression: 'DEFLATE' }), { maxCompressionRatio: 2 }, /compression ratio/i],
    [await archive({ a: 'abc' }), { maxArchiveBytes: 1 }, /archive size/i]
  ]) {
    const root = await owned(t);
    await assert.rejects(extractLocalArchive(bytes, root, limits), expected);
    assert.deepEqual(await fs.readdir(root), []);
  }
});
test('rejects inconsistent headers, invalid UTF8, CRC damage and invalid central directory bounds', async t => {
  const original = await archive({ 'app.js': 'original' });
  const central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const end = original.length - 22;
  const cases = [
    bytes => bytes.writeUInt32LE(0xffffffff, end + 16),
    bytes => bytes.writeUInt32LE(0xffffffff, central + 24),
    bytes => bytes.writeUInt16LE(1, central + 8),
    bytes => { bytes[30] = 0xff; bytes[central + 46] = 0xff; },
    bytes => { bytes[30] = 'x'.charCodeAt(0); },
    bytes => { bytes[30 + Buffer.byteLength('app.js')] ^= 1; },
    bytes => bytes.writeUInt16LE(0xffff, end + 10)
  ];
  for (const corrupt of cases) {
    const root = await owned(t); const bytes = Buffer.from(original); corrupt(bytes);
    await assert.rejects(extractLocalArchive(bytes, root), /metadata|header|UTF|CRC|encrypted|zip64|size/i);
    assert.deepEqual(await fs.readdir(root), []);
  }
});
test('bounds actual DEFLATE output even when both headers forge a tiny extracted size', async t => {
  const root = await owned(t);
  const bytes = await archive({ 'large.txt': 'x'.repeat(200000) }, { compression: 'DEFLATE' });
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(16, 22); bytes.writeUInt32LE(16, central + 24);
  await assert.rejects(extractLocalArchive(bytes, root), /inflated size|inflation.*limit|output.*limit/i);
  assert.deepEqual(await fs.readdir(root), []);
});
