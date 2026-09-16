import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { ARTIFACT_LIMITS } from '../artifactLimits.js';

function canonicalZipPath(value) {
    if (!value || typeof value !== 'string') {
        throw new Error('Extraction aborted: Traversal attack detected for path: empty');
    }
    if (value.includes('\0')) {
        throw new Error(`Extraction aborted: Traversal attack detected for path: ${value}`);
    }
    const normalized = value.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.split('/').some(seg => seg === '..')) {
        throw new Error(`Extraction aborted: Traversal attack detected for path: ${value}`);
    }
    const canonical = path.posix.normalize(normalized);
    if (!canonical || canonical === '.' || canonical === '..' || canonical.startsWith('../')) {
        throw new Error(`Extraction aborted: Traversal attack detected for path: ${value}`);
    }
    return canonical;
}

function assertSafeEntryName(entryName, resolvedOutputDir) {
    const resolvedPath = path.resolve(resolvedOutputDir, entryName);
    const relative = path.relative(resolvedOutputDir, resolvedPath);
    if (!entryName || entryName.includes('\0') || relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Extraction aborted: Traversal attack detected for path: ${entryName}`);
    return resolvedPath;
}

export async function inspectZipEntries(zip, limits = {}, { readContent = true } = {}) {
    const maxFiles = limits.maxFiles ?? ARTIFACT_LIMITS.maxFiles;
    const maxTotalBytes = limits.maxTotalBytes ?? ARTIFACT_LIMITS.maxExtractedBytes;
    const maxFileBytes = limits.maxFileBytes ?? ARTIFACT_LIMITS.maxFileBytes;
    const maxRatio = limits.maxRatio ?? ARTIFACT_LIMITS.maxCompressionRatio;
    const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    if (files.length > maxFiles) throw new Error(`Extraction aborted: Exceeded file count limit (${files.length} > ${maxFiles})`);
    const seen = new Set();
    const entries = [];
    let total = 0;
    for (const rawName of files) {
        const name = canonicalZipPath(rawName);
        if (seen.has(name)) throw new Error(`Extraction aborted: Duplicate canonical entry: ${name}`);
        seen.add(name);
        const entry = zip.files[rawName];
        if (entry.unixPermissions && (entry.unixPermissions & 0xf000) === 0xa000) throw new Error(`Extraction aborted: Symbolic link detected in zip: ${rawName}`);
        let uncompressedSize = entry._data?.uncompressedSize;
        let compressedSize = entry._data?.compressedSize;
        if (!Number.isSafeInteger(uncompressedSize) || !Number.isSafeInteger(compressedSize)) {
            const contentBuffer = await entry.async('nodebuffer');
            uncompressedSize = contentBuffer.length;
            compressedSize = contentBuffer.length;
        }
        if (uncompressedSize > maxFileBytes) throw new Error(`Extraction aborted: File size limit exceeded for ${name}`);
        total += uncompressedSize;
        if (total > maxTotalBytes) throw new Error('Extraction aborted: Exceeded total decompressed size limit');
        if (uncompressedSize > 1024 && uncompressedSize / Math.max(compressedSize, 1) > maxRatio) throw new Error(`Extraction aborted: Decompression bomb detected for ${name}`);
        entries.push({ rawName, path: name, entry, size: uncompressedSize });
    }
    if (readContent) for (const item of entries) item.content = await item.entry.async('nodebuffer');
    return entries;
}

export async function safeExtractZip(input, outputDir, limits = {}) {
    const resolvedOutputDir = path.resolve(outputDir);
    await fs.mkdir(resolvedOutputDir, { recursive: true });
    let zip;
    if (typeof input === 'string') zip = await JSZip.loadAsync(await fs.readFile(input));
    else if (Buffer.isBuffer(input) || input instanceof Uint8Array) zip = await JSZip.loadAsync(input);
    else if (input && typeof input.file === 'function' && input.files) zip = input;
    else throw new Error('Invalid ZIP input: expected file path, Buffer, or JSZip instance.');
    const entries = await inspectZipEntries(zip, limits);
    for (const item of entries) {
        const target = assertSafeEntryName(item.path, resolvedOutputDir);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, item.content);
    }
    return { success: true, files: entries.map(item => item.path) };
}
