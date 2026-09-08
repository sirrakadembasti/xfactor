import fs from 'fs/promises';
import path from 'path';
import { ARTIFACT_LIMITS } from './artifactLimits.js';

export async function collectArtifactFiles(root, options = {}) {
    const maxFiles = options.maxFiles ?? ARTIFACT_LIMITS.maxFiles;
    const maxTotalBytes = options.maxTotalBytes ?? ARTIFACT_LIMITS.maxExtractedBytes;
    const maxFileBytes = options.maxFileBytes ?? ARTIFACT_LIMITS.maxFileBytes;
    if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new Error('Invalid maxFiles limit.');
    if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 0) throw new Error('Invalid maxTotalBytes limit.');
    const files = [];
    const seenPaths = new Set();
    let totalBytes = 0;
    const rootPath = path.resolve(root);
    async function walk(currentPath, relativePath) {
        const stats = await fs.lstat(currentPath);
        if (stats.isSymbolicLink()) throw new Error(`Symlink not allowed: ${relativePath || root}`);
        if (stats.isDirectory()) {
            const entries = (await fs.readdir(currentPath)).sort();
            for (const entry of entries) await walk(path.join(currentPath, entry), path.posix.join(relativePath, entry));
            return;
        }
        if (!stats.isFile()) throw new Error(`Unsupported artifact entry: ${relativePath}`);
        if (files.length >= maxFiles) throw new Error(`Limits exceeded: Maximum file count of ${maxFiles} reached.`);
        if (stats.size > maxFileBytes || totalBytes + stats.size > maxTotalBytes) throw new Error(`Oversized: limits exceeded for total bytes (${maxTotalBytes})`);
        const normalizedPath = path.posix.normalize(relativePath.replace(/\\/g, '/'));
        if (!normalizedPath || normalizedPath === '.' || normalizedPath.startsWith('../') || seenPaths.has(normalizedPath)) throw new Error(`Duplicate or invalid file path detected: ${normalizedPath}`);
        const content = await fs.readFile(currentPath);
        if (content.length !== stats.size) throw new Error(`File changed while reading: ${normalizedPath}`);
        seenPaths.add(normalizedPath);
        totalBytes += content.length;
        files.push({ path: normalizedPath, content });
    }
    await walk(rootPath, '');
    return files;
}
