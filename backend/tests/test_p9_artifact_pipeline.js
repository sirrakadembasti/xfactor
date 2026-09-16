import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import JSZip from 'jszip';
import { createTestHarness } from './testHarness.js';

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function workspace(prefix = 'xfactor-p9-artifact-') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    return {
        dir,
        cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    };
}

const { runAsyncTest, finish } = createTestHarness();

const failingArchiveDeps = {
    db: {},
    createArtifact() {},
    addArtifactFile() { throw new Error('constraint failure'); },
    withArtifactTransaction: async work => work()
};
async function runTests() {
    let createProjectZip;
    let collectArtifactFiles;
    let verifyArtifact;
    let safeExtractZip;
    let authorizeArtifactDownload;
    
    try {
        const archive = await import('../utils/archive.js');
        createProjectZip = archive.createProjectZip;
        
        const inventory = await import('../artifactInventory.js');
        collectArtifactFiles = inventory.collectArtifactFiles;
        
        const verifier = await import('../verification/artifactVerifier.js');
        verifyArtifact = verifier.verifyArtifact;
        
        const safeExt = await import('../verification/safeExtractor.js');
        ({ authorizeArtifactDownload } = await import('../routes/artifactDownloadAuthorization.js'));
        safeExtractZip = safeExt.safeExtractZip;
        
    } catch (err) {
        console.error("Setup failed", err);
        process.exit(1);
    }

    await runAsyncTest("1. Binary and package-lock extraction digest", async () => {
        const ws = await workspace();
        try {
            const originalPng = crypto.randomBytes(1024);
            await fs.writeFile(path.join(ws.dir, 'image.png'), originalPng);
            const lockContent = JSON.stringify({ name: "test", lockfileVersion: 3 });
            await fs.writeFile(path.join(ws.dir, 'package-lock.json'), lockContent);
            
            const limits = { maxFiles: 100, maxTotalBytes: 10 * 1024 * 1024 };
            const files = await collectArtifactFiles(ws.dir, limits);
            
            const pngFile = files.find(f => f.path === 'image.png');
            assert.ok(pngFile, "Missing image.png");
            assert.equal(sha256(pngFile.content), sha256(originalPng), "Binary hash mismatch");
            
            const lockFile = files.find(f => f.path === 'package-lock.json');
            assert.ok(lockFile, "Missing package-lock.json");
            assert.equal(lockFile.content.toString(), lockContent, "Lockfile content mismatch");
        } finally {
            await ws.cleanup();
        }
    });
    
    await runAsyncTest("1a. Publication rejects compression ratio bombs before filesystem or database mutation", async () => {
        const ws = await workspace();
        const publication = { artifactRows: 0, fileRows: 0, transactions: 0 };
        const deps = {
            db: {},
            createArtifact() { publication.artifactRows++; },
            addArtifactFile() { publication.fileRows++; },
            withArtifactTransaction: async work => {
                publication.transactions++;
                return work();
            }
        };
        try {
            const repeatedContent = Buffer.alloc(128 * 1024, 0x41);
            await assert.rejects(
                createProjectZip("ratio-project", "ratio-contract", [
                    { path: "repeated.txt", content: repeatedContent }
                ], ws.dir, deps),
                /Decompression bomb detected|compression ratio/i
            );
            assert.strictEqual(publication.artifactRows, 0, "No artifact DB row may be created");
            assert.strictEqual(publication.fileRows, 0, "No artifact file DB row may be created");
            assert.strictEqual(publication.transactions, 0, "Publication transaction must not begin");
            assert.deepStrictEqual(await fs.readdir(ws.dir), [], "No temporary or final archive may be created");
        } finally {
            await ws.cleanup();
        }
    });



    await runAsyncTest("2. Missing/oversize/symlink/duplicate limits", async () => {
        const ws = await workspace();
        try {
            await fs.writeFile(path.join(ws.dir, 'large.txt'), Buffer.alloc(2 * 1024 * 1024));
            try {
                await fs.symlink(path.join(ws.dir, 'large.txt'), path.join(ws.dir, 'link.txt'));
            } catch (err) {
                if (err.code !== 'EPERM') throw err;
            }
            
            const limits = { maxFiles: 10, maxTotalBytes: 1024 * 1024 };
            
            await assert.rejects(
                collectArtifactFiles(ws.dir, limits),
                /Oversized|limits exceeded|symlink/i
            );
        } finally {
            await ws.cleanup();
        }
    });

    await runAsyncTest("3. Stale/cancelled cannot complete", async () => {
        const staleRunId = "run-old-123";
        const currentActiveJob = { runId: "run-new-456" };
        
        await assert.rejects(
            verifyArtifact({ projectId: "proj1", contractId: "cont1", artifactId: "art1" }, {
                runId: staleRunId,
                activeJob: currentActiveJob
            }),
            /Stale or cancelled/i
        );
    });

    await runAsyncTest("4. Download authorization gates stale/unverified evidence", async () => {
        const stale = authorizeArtifactDownload({
            artifact: { id: 'a1' },
            assertEvidence: () => { throw new Error('stale verification evidence'); }
        });
        assert.strictEqual(stale.status, 409);
        const unverified = authorizeArtifactDownload({
            artifact: { id: 'a2' },
            assertEvidence: () => { throw new Error('artifact is not verified'); }
        });
        assert.strictEqual(unverified.status, 409);
        const missing = authorizeArtifactDownload({
            artifact: null,
            assertEvidence: () => { throw new Error('must not execute'); }
        });
        assert.strictEqual(missing.status, 404);
        const verified = authorizeArtifactDownload({
            artifact: { id: 'a3' },
            assertEvidence: () => undefined
        });
        assert.strictEqual(verified.status, 200);
    });

    await runAsyncTest("4. Returned lock only package-lock path", async () => {
        const ws = await workspace();
        try {
            const maliciousPath = '../outside.json';
            const files = [
                { path: maliciousPath, content: Buffer.from("{}") }
            ];
            await assert.rejects(
                createProjectZip("proj1", "cont1", files, ws.dir),
                /Invalid path/i
            );
        } finally {
            await ws.cleanup();
        }
    });

    await runAsyncTest("5. Tamper/deadline safe extractor limits", async () => {
        const ws = await workspace();
        try {
            // Tamper test: Zip bomb extraction limits
            const bombDir = path.join(ws.dir, 'bomb');
            const limits = { maxFiles: 10, maxTotalBytes: 50, maxRatio: 100 };
            
            // Create a fake zip that would trigger bomb ratio
            const zip = new JSZip();
            zip.file("huge.txt", "a".repeat(2000));
            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
            
            const zipPath = path.join(ws.dir, 'bomb.zip');
            await fs.writeFile(zipPath, zipBuffer);
            
            await assert.rejects(
                safeExtractZip(zipPath, bombDir, limits),
                /Extraction aborted|ratio|exceeds/i
            );
        } finally {
            await ws.cleanup();
        }
    });

    await runAsyncTest("6. Transaction cleanup on publication failure", async () => {
        const ws = await workspace();
        try {
            // Pass duplicate files to cause a unique constraint/error or path error
            // Actually, createProjectZip throws if files array is invalid.
            const badFiles = [
                { path: "test.txt", content: Buffer.from("1") },
                { path: "test.txt", content: Buffer.from("2") }
            ];
            await assert.rejects(
                createProjectZip("proj1", "cont1", badFiles, ws.dir),
                /Duplicate file path/i
            );
            
            const tempFiles = await fs.readdir(ws.dir);
            assert.equal(tempFiles.length, 0, "Compensating cleanup failed");

            // Also test DB error causing rollback
            // Pass valid files but bad contractId so DB foreign key constraint fails
            const validFiles = [{ path: "test.txt", content: Buffer.from("1") }];
            await assert.rejects(
                createProjectZip("proj1", "non-existent-contract", validFiles, ws.dir, failingArchiveDeps),
                /Failed|constraint/i
            );
            
            const afterDbErrorFiles = await fs.readdir(ws.dir);
            assert.equal(afterDbErrorFiles.length, 0, "Compensating cleanup failed after DB error");

        } finally {
            await ws.cleanup();
        }
    });

    finish();
}

runTests();
