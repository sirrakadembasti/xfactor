import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { createTestHarness } from './testHarness.js';

const require = createRequire(import.meta.url);
const JSZip = (await import('jszip').catch(() => null))?.default || require('../../frontend/node_modules/jszip');

const { safeExtractZip } = await import('../verification/safeExtractor.js');

const { runAsyncTest, finish } = createTestHarness();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xfactor-safe-extract-'));

try {
    await runAsyncTest('1. safeExtractZip rejects directory traversal in file path', async () => {
        const zip = new JSZip();
        zip.files['../escaped.js'] = {
            name: '../escaped.js',
            dir: false,
            async: async () => Buffer.from('alert("escaped")')
        };
        await assert.rejects(
            async () => safeExtractZip(zip, path.join(tempDir, 'traversal')),
            /Traversal attack/i
        );
    });

    await runAsyncTest('2. safeExtractZip rejects mixed path separator traversal (\\../ and /..\\)', async () => {
        const zip1 = new JSZip();
        zip1.files['a\\../b.js'] = {
            name: 'a\\../b.js',
            dir: false,
            async: async () => Buffer.from('alert(1)')
        };
        await assert.rejects(
            async () => safeExtractZip(zip1, path.join(tempDir, 'mixed1')),
            /Traversal attack/i
        );

        const zip2 = new JSZip();
        zip2.files['a/..\\b.js'] = {
            name: 'a/..\\b.js',
            dir: false,
            async: async () => Buffer.from('alert(2)')
        };
        await assert.rejects(
            async () => safeExtractZip(zip2, path.join(tempDir, 'mixed2')),
            /Traversal attack/i
        );
    });

    await runAsyncTest('3. safeExtractZip rejects null byte traversal in file path', async () => {
        const zip = new JSZip();
        zip.files['safe.js\0malicious.js'] = {
            name: 'safe.js\0malicious.js',
            dir: false,
            async: async () => Buffer.from('alert("null")')
        };
        await assert.rejects(
            async () => safeExtractZip(zip, path.join(tempDir, 'nullbyte')),
            /Traversal attack|null byte/i
        );
    });

    await runAsyncTest('4. safeExtractZip rejects symbolic link entries', async () => {
        const zip = new JSZip();
        zip.file('link-out.js', '../target', {
            unixPermissions: 0o120777
        });
        const zipBuf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });

        await assert.rejects(
            async () => safeExtractZip(zipBuf, path.join(tempDir, 'symlink')),
            /Symbolic link/i
        );
    });

    await runAsyncTest('5. safeExtractZip rejects decompression bombs exceeding byte limits', async () => {
        const zip = new JSZip();
        zip.file('bomb.txt', Buffer.alloc(2 * 1024 * 1024)); // 2MB
        const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

        await assert.rejects(
            async () => safeExtractZip(zipBuf, path.join(tempDir, 'bomb-bytes'), { maxTotalBytes: 1 * 1024 * 1024 }),
            /decompressed size limit|Exceeded total/i
        );
    });

    await runAsyncTest('6. safeExtractZip rejects decompression bombs exceeding maxRatio', async () => {
        // Create highly compressible payload (500KB of repeated 'A's compresses to < 1KB, ratio > 500:1)
        const zip = new JSZip();
        zip.file('ratio-bomb.txt', Buffer.alloc(500 * 1024, 0x41)); // 500KB of 'A'
        const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });

        await assert.rejects(
            async () => safeExtractZip(zipBuf, path.join(tempDir, 'bomb-ratio'), { maxRatio: 20 }),
            /Decompression bomb detected/i
        );
    });

    await runAsyncTest('7. safeExtractZip rejects exceeding maximum allowed file count with explicit 0 limit', async () => {
        const zip = new JSZip();
        zip.file('file-1.txt', 'content 1');
        const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

        await assert.rejects(
            async () => safeExtractZip(zipBuf, path.join(tempDir, 'filecount-zero'), { maxFiles: 0 }),
            /Exceeded file count limit/i
        );
    });

    await runAsyncTest('8. safeExtractZip extracts valid ZIP cleanly from file path, buffer, and JSZip instance', async () => {
        const zip = new JSZip();
        zip.file('package.json', '{"name":"safe-app"}');
        zip.file('src/index.js', 'console.log("hello");');
        zip.file('nested/dir/deep.txt', 'deep content');
        const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });

        const zipFilePath = path.join(tempDir, 'sample.zip');
        await fs.writeFile(zipFilePath, zipBuf);

        // Test extraction from file path
        const extractDir1 = path.join(tempDir, 'valid-path-out');
        const res1 = await safeExtractZip(zipFilePath, extractDir1);
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.files.length, 3);
        assert.strictEqual(await fs.readFile(path.join(extractDir1, 'package.json'), 'utf8'), '{"name":"safe-app"}');
        assert.strictEqual(await fs.readFile(path.join(extractDir1, 'nested/dir/deep.txt'), 'utf8'), 'deep content');

        // Test extraction from Buffer
        const extractDir2 = path.join(tempDir, 'valid-buf-out');
        const res2 = await safeExtractZip(zipBuf, extractDir2);
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.files.length, 3);
        assert.strictEqual(await fs.readFile(path.join(extractDir2, 'src/index.js'), 'utf8'), 'console.log("hello");');

        // Test extraction directly from JSZip instance
        const extractDir3 = path.join(tempDir, 'valid-instance-out');
        const res3 = await safeExtractZip(zip, extractDir3);
        assert.strictEqual(res3.success, true);
        assert.strictEqual(res3.files.length, 3);
    });
} finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    finish();
}
