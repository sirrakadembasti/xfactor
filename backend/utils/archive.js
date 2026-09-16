import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';
import { inspectZipEntries } from '../verification/safeExtractor.js';
import { getArtifactsRoot } from '../artifactPaths.js';

async function loadArchiveDefaults() {
    const [{ db }, repository] = await Promise.all([
        import('../db.js'),
        import('../repositories/artifactRepository.js')
    ]);
    return {
        db,
        createArtifact: repository.createArtifact,
        addArtifactFile: repository.addArtifactFile,
        withArtifactTransaction: repository.withArtifactTransaction
    };
}

function canonicalPath(value) {
    if (typeof value !== 'string' || !value || value.includes('\0')) {
        throw new Error(`Invalid path: ${value}`);
    }
    const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../')
        || normalized.startsWith('/') || normalized.includes('/../')) {
        throw new Error(`Invalid path: ${value}`);
    }
    return normalized;
}

export async function createProjectZip(
    projectId,
    contractId,
    files,
    artifactsDir = getArtifactsRoot(),
    deps = {}
) {
    if (!Array.isArray(files)) throw new Error('Artifact files must be an array.');
    const zip = new JSZip();
    const manifest = [];
    const seenPaths = new Set();
    const orderedFiles = [...files].sort((a, b) => canonicalPath(a?.path).localeCompare(canonicalPath(b?.path)));
    if (orderedFiles.length > ARTIFACT_LIMITS.maxFiles) throw new Error('Artifact file count limit exceeded.');
    let totalInputBytes = 0;
    for (const file of orderedFiles) {
        const normalizedPath = canonicalPath(file?.path);
        if (seenPaths.has(normalizedPath)) throw new Error(`Duplicate file path detected: ${normalizedPath}`);
        if (!Buffer.isBuffer(file?.content) && typeof file?.content !== 'string' && !(file?.content instanceof Uint8Array)) {
            throw new Error(`Invalid content for ${normalizedPath}`);
        }
        seenPaths.add(normalizedPath);
        const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
        if (content.length > ARTIFACT_LIMITS.maxFileBytes || totalInputBytes + content.length > ARTIFACT_LIMITS.maxExtractedBytes) {
            throw new Error('Artifact extracted-size limit exceeded.');
        }
        totalInputBytes += content.length;
        zip.file(normalizedPath, content, { date: new Date(0), createFolders: false });
        manifest.push({
            path: normalizedPath,
            sha256: crypto.createHash('sha256').update(content).digest('hex'),
            size: content.length
        });
    }
    const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
        platform: 'UNIX'
    });
    if (zipBuffer.length > ARTIFACT_LIMITS.maxArchiveBytes) throw new Error('Artifact archive-size limit exceeded.');

    // Inspect central-directory metadata before allocating decompressed entry bytes
    // or touching the artifact filesystem/database.
    const generatedZip = await JSZip.loadAsync(zipBuffer);
    await inspectZipEntries(generatedZip, {
        maxFiles: ARTIFACT_LIMITS.maxFiles,
        maxTotalBytes: ARTIFACT_LIMITS.maxExtractedBytes,
        maxFileBytes: ARTIFACT_LIMITS.maxFileBytes,
        maxRatio: ARTIFACT_LIMITS.maxCompressionRatio
    }, { readContent: false });
    const needsDefaults = !deps.createArtifact || !deps.addArtifactFile || !deps.withArtifactTransaction;
    const loaded = needsDefaults ? await loadArchiveDefaults() : {};
    const db = deps.db || loaded.db;
    const createArtifact = deps.createArtifact || loaded.createArtifact;
    const addArtifactFile = deps.addArtifactFile || loaded.addArtifactFile;
    const withArtifactTransaction = deps.withArtifactTransaction || loaded.withArtifactTransaction;
    const zipHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
    const zipSize = zipBuffer.length;
    const artifactId = `artifact-${crypto.randomUUID()}`;
    const zipFileName = `${projectId}-${artifactId}.zip`;
    const tempArtifactPath = path.join(artifactsDir, `${zipFileName}.tmp`);
    const finalArtifactPath = path.join(artifactsDir, zipFileName);
    await fs.mkdir(artifactsDir, { recursive: true });
    try {
        await fs.writeFile(tempArtifactPath, zipBuffer, { flag: 'wx' });
        const result = await withArtifactTransaction(async () => {
            createArtifact({
                id: artifactId, projectId, contractId, kind: 'zip',
                path: finalArtifactPath, sha256: zipHash, size: zipSize,
                manifestJson: JSON.stringify(manifest), status: 'draft'
            });
            for (const file of manifest) {
                addArtifactFile({
                    contractId, artifactId, path: file.path,
                    sha256: file.sha256, size: file.size
                });
            }
            await fs.rename(tempArtifactPath, finalArtifactPath);
            return { id: artifactId, sha256: zipHash, path: finalArtifactPath, size: zipSize, manifest };
        }, db);
        return result;
    } catch (error) {
        await fs.rm(tempArtifactPath, { force: true }).catch(() => {});
        await fs.rm(finalArtifactPath, { force: true }).catch(() => {});
        throw error;
    }
}
