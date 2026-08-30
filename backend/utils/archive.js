import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createArtifact, addArtifactFile } from '../repositories/artifactRepository.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getJSZip() {
    try {
        const mod = await import('jszip');
        return mod.default || mod;
    } catch {
        try {
            return require('jszip');
        } catch {
            const frontendJsZipPath = path.resolve(__dirname, '../../frontend/node_modules/jszip');
            const mod = require(frontendJsZipPath);
            return mod.default || mod;
        }
    }
}

export async function createProjectZip(projectId, contractId, files, artifactsDir = 'backend/data/artifacts') {
    const JSZipClass = await getJSZip();
    const zip = new JSZipClass();
    const manifest = [];

    for (const file of files) {
        zip.file(file.path, file.content);
        const hash = crypto.createHash('sha256').update(file.content).digest('hex');
        const size = Buffer.byteLength(file.content, 'utf8');
        manifest.push({ path: file.path, sha256: hash, size });
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const zipHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
    const zipSize = zipBuffer.length;

    const artifactId = `artifact-${crypto.randomUUID()}`;
    const zipFileName = `${projectId}-${artifactId}.zip`;
    const artifactPath = path.join(artifactsDir, zipFileName);

    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(artifactPath, zipBuffer);

    const manifestJson = JSON.stringify(manifest);

    createArtifact({
        id: artifactId,
        projectId,
        contractId,
        kind: 'zip',
        path: artifactPath,
        sha256: zipHash,
        size: zipSize,
        manifestJson,
        status: 'draft'
    });

    for (const file of manifest) {
        addArtifactFile({
            contractId,
            artifactId,
            path: file.path,
            sha256: file.sha256,
            size: file.size
        });
    }

    return { id: artifactId, sha256: zipHash, path: artifactPath, size: zipSize, manifest };
}
