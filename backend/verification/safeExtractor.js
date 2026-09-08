import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';

function canonicalZipPath(value) {
    const normalized = value.replace(/\\/g, '/');
    if (!normalized || normalized.includes('\0') || normalized.startsWith('/')) {
        throw new Error(`Extraction aborted: Invalid archive path: ${value}`);
    }
    const canonical = path.posix.normalize(normalized);
    if (!canonical || canonical === '.' || canonical === '..' || canonical.startsWith('../')) {
        throw new Error(`Extraction aborted: Invalid archive path: ${value}`);
    }
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

export async function inspectZipEntries(zip, limits = {}, { readContent = true } = {}) {
    const maxFiles = limits.maxFiles ?? 500;
    const maxTotalBytes = limits.maxTotalBytes ?? 20 * 1024 * 1024;
    const maxFileBytes = limits.maxFileBytes ?? 2 * 1024 * 1024;
    const maxRatio = limits.maxRatio ?? 100;
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
        if (entry.unixPermissions && (entry.unixPermissions & 0xf000) === 0xa000) {
            throw new Error(`Extraction aborted: Symbolic link detected in zip: ${rawName}`);
        }
        const uncompressedSize = entry._data?.uncompressedSize;
        const compressedSize = entry._data?.compressedSize;
        if (!Number.isSafeInteger(uncompressedSize) || !Number.isSafeInteger(compressedSize)) {
            throw new Error(`Extraction aborted: Missing size metadata for ${rawName}`);
        }
        if (uncompressedSize > maxFileBytes) throw new Error(`Extraction aborted: File size limit exceeded for ${name}`);
        total += uncompressedSize;
        if (total > maxTotalBytes) throw new Error(`Extraction aborted: Exceeded total decompressed size limit`);
        if (uncompressedSize > 1024 && uncompressedSize / Math.max(compressedSize, 1) > maxRatio) {
            throw new Error(`Extraction aborted: Decompression bomb detected for ${name}`);
        }
        entries.push({ rawName, path: name, entry, size: uncompressedSize });
    }
    if (!readContent) return entries;
    for (const item of entries) item.content = await item.entry.async('nodebuffer');
    return entries;
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

    const entries = await inspectZipEntries(zip, {
        maxFiles,
        maxTotalBytes,
        maxRatio,
        maxFileBytes: limits.maxFileBytes ?? 2 * 1024 * 1024
    });
    for (const item of entries) {
        const resolvedPath = assertSafeEntryName(item.path, resolvedOutputDir);
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, item.content);
    }
    return { success: true, files: entries.map(item => item.path) };
}
