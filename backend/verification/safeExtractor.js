import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

function canonicalZipPath(value) {
    const normalized = value.replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.split('/').some(segment => segment === '..')) {
        throw new Error(`Extraction aborted: Invalid archive path: ${value}`);
    }
    const canonical = normalized.split('/').filter(Boolean).join('/');
    if (!canonical || canonical === '.') throw new Error(`Extraction aborted: Invalid archive path: ${value}`);
    return canonical;
}

function assertSafeEntryName(entryName, resolvedOutputDir) {
    if (entryName.includes('\0')) {
        throw new Error(`Extraction aborted: Traversal attack detected (null byte) in ${entryName}`);
    }

    // Segment-based traversal inspection
    const normalizedEntry = entryName.replace(/\\/g, '/');
    const segments = normalizedEntry.split('/');
    if (segments.some(seg => seg === '..') || normalizedEntry.startsWith('/') || path.isAbsolute(entryName)) {
        throw new Error(`Extraction aborted: Traversal attack detected for path: ${entryName}`);
    }

    const resolvedPath = path.resolve(resolvedOutputDir, entryName);
    const relative = path.relative(resolvedOutputDir, resolvedPath);

    // Disallow empty relative path (writing directly to root outputDir) or paths escaping root outputDir
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Extraction aborted: Traversal attack detected for path: ${entryName}`);
    }

    return resolvedPath;
}

export async function safeExtractZip(zipBufferOrPathOrInstance, outputDir, limits = {}) {
    const maxFiles = limits.maxFiles ?? 500;
    const maxTotalBytes = limits.maxTotalBytes ?? (20 * 1024 * 1024);
    const maxRatio = limits.maxRatio ?? 100;

    const resolvedOutputDir = path.resolve(outputDir);
    await fs.mkdir(resolvedOutputDir, { recursive: true });

    let zip;

    if (typeof zipBufferOrPathOrInstance === 'string') {
        const buf = await fs.readFile(zipBufferOrPathOrInstance);
        zip = await JSZip.loadAsync(buf);
    } else if (Buffer.isBuffer(zipBufferOrPathOrInstance) || zipBufferOrPathOrInstance instanceof Uint8Array) {
        zip = await JSZip.loadAsync(zipBufferOrPathOrInstance);
    } else if (zipBufferOrPathOrInstance && typeof zipBufferOrPathOrInstance.file === 'function' && zipBufferOrPathOrInstance.files) {
        // Pre-validate any un-sanitized keys directly on instance
        for (const rawKey of Object.keys(zipBufferOrPathOrInstance.files)) {
            assertSafeEntryName(rawKey, resolvedOutputDir);
        }
        // Serialize and reload instance to ensure compressed size accuracy for ratio calculation
        const buf = await zipBufferOrPathOrInstance.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
        zip = await JSZip.loadAsync(buf);
    } else {
        throw new Error('Invalid ZIP input: expected file path, Buffer, or JSZip instance.');
    }

    const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    const canonicalByRaw = new Map();
    const normalizedNames = new Set();
    for (const rawName of files) {
        const safeName = canonicalZipPath(rawName);
        if (normalizedNames.has(safeName)) {
            throw new Error(`Extraction aborted: Duplicate canonical entry: ${safeName}`);
        }
        normalizedNames.add(safeName);
        canonicalByRaw.set(rawName, safeName);
    }

    if (files.length > maxFiles) {
        throw new Error(`Extraction aborted: Exceeded file count limit (${files.length} > ${maxFiles})`);
    }

    let totalDecompressedSize = 0;

    // Validate archive metadata before asking JSZip to allocate decompressed bytes.
    for (const entryName of files) {
        const fileEntry = zip.files[entryName];
        const mode = fileEntry.unixPermissions;
        if (mode && (mode & 0xf000) === 0xa000) {
            throw new Error(`Extraction aborted: Symbolic link detected in zip: ${entryName}`);
        }
        const uncompressedSize = fileEntry._data?.uncompressedSize;
        const compressedSize = fileEntry._data?.compressedSize;
        if (!Number.isSafeInteger(uncompressedSize) || uncompressedSize < 0
            || !Number.isSafeInteger(compressedSize) || compressedSize < 0) {
            throw new Error(`Extraction aborted: Missing size metadata for ${entryName}`);
        }
        totalDecompressedSize += uncompressedSize;
        if (totalDecompressedSize > maxTotalBytes) {
            throw new Error(`Extraction aborted: Exceeded total decompressed size limit (${totalDecompressedSize} > ${maxTotalBytes})`);
        }
        if (uncompressedSize > 1024) {
            const ratio = uncompressedSize / Math.max(compressedSize, 1);
            if (ratio > maxRatio) {
                throw new Error(`Extraction aborted: Decompression bomb detected (ratio ${ratio.toFixed(1)}:1 exceeds ${maxRatio}:1)`);
            }
        }
    }

    for (const entryName of files) {
        const canonicalName = canonicalByRaw.get(entryName);
        const resolvedPath = assertSafeEntryName(canonicalName, resolvedOutputDir);
        const content = await zip.files[entryName].async('nodebuffer');
        if (content.length > maxTotalBytes || content.length > totalDecompressedSize) {
            throw new Error(`Extraction aborted: Decompressed size mismatch for ${canonicalName}`);
        }
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, content);
    }

    return { success: true, files };

}
