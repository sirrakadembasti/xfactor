import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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

    const JSZipClass = await getJSZip();
    let zip;

    if (typeof zipBufferOrPathOrInstance === 'string') {
        const buf = await fs.readFile(zipBufferOrPathOrInstance);
        zip = await JSZipClass.loadAsync(buf);
    } else if (Buffer.isBuffer(zipBufferOrPathOrInstance) || zipBufferOrPathOrInstance instanceof Uint8Array) {
        zip = await JSZipClass.loadAsync(zipBufferOrPathOrInstance);
    } else if (zipBufferOrPathOrInstance && typeof zipBufferOrPathOrInstance.file === 'function' && zipBufferOrPathOrInstance.files) {
        // Pre-validate any un-sanitized keys directly on instance
        for (const rawKey of Object.keys(zipBufferOrPathOrInstance.files)) {
            assertSafeEntryName(rawKey, resolvedOutputDir);
        }
        // Serialize and reload instance to ensure compressed size accuracy for ratio calculation
        const buf = await zipBufferOrPathOrInstance.generateAsync({ type: 'nodebuffer', platform: 'UNIX' });
        zip = await JSZipClass.loadAsync(buf);
    } else {
        throw new Error('Invalid ZIP input: expected file path, Buffer, or JSZip instance.');
    }

    const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);

    if (files.length > maxFiles) {
        throw new Error(`Extraction aborted: Exceeded file count limit (${files.length} > ${maxFiles})`);
    }

    let totalDecompressedSize = 0;

    for (const entryName of files) {
        const resolvedPath = assertSafeEntryName(entryName, resolvedOutputDir);
        const fileEntry = zip.files[entryName];
        const mode = fileEntry.unixPermissions;

        // Symbolic link detection (0xA000 flag mask in UNIX file modes)
        if (mode && (mode & 0xf000) === 0xa000) {
            throw new Error(`Extraction aborted: Symbolic link detected in zip: ${entryName}`);
        }

        const content = await fileEntry.async('nodebuffer');
        const decompressedSize = content.length;
        totalDecompressedSize += decompressedSize;

        if (totalDecompressedSize > maxTotalBytes) {
            throw new Error(`Extraction aborted: Exceeded total decompressed size limit (${totalDecompressedSize} > ${maxTotalBytes})`);
        }

        if (decompressedSize > 1024) {
            const compressedSize = fileEntry._data?.compressedSize || decompressedSize;
            const ratio = decompressedSize / Math.max(compressedSize, 1);
            if (ratio > maxRatio) {
                throw new Error(`Extraction aborted: Decompression bomb detected (ratio ${ratio.toFixed(1)}:1 exceeds ${maxRatio}:1)`);
            }
        }

        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, content);
    }

    return { success: true, files };
}
