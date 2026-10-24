// Trusted protocol metadata IO. Generated project metadata is never policy authority.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { writeSourceFile } from './codeGenerator.js';
import { commitWorkflowSource } from '../workflowAttempts.js';

export const MAX_PROTOCOL_BYTES = 2 * 1024 * 1024;

function invalid(message) {
    return Object.assign(new Error(`Unsafe protocol path: ${message}`), { code: 'PROTOCOL_PATH_UNSAFE' });
}

// Check through the filesystem root, including project-root links and junctions.
// Existing source commit primitives recheck synchronously before rename as well.
export function assertProtocolPath(target, options = {}, directory = false) {
    if (typeof target !== 'string' || !path.isAbsolute(target) || target.split(/[\\/]/).includes('..')) throw invalid('absolute bounded path required');
    const absolute = path.resolve(target);
    if (options.projectDir) {
        const root = path.resolve(options.projectDir);
        const relative = path.relative(root, absolute);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw invalid('destination outside project root');
    }
    let current = absolute;
    for (;;) {
        try {
            const stat = fsSync.lstatSync(current);
            if (stat.isSymbolicLink()) throw invalid('symbolic link or junction');
            if (current === absolute && !directory ? !stat.isFile() : !stat.isDirectory()) throw invalid('unexpected destination type');
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return absolute;
}

export async function ensureProtocolDir(folder, options = {}) {
    const target = assertProtocolPath(folder, options, true);
    commitWorkflowSource(options.sourceFence, () => {
        assertProtocolPath(target, options, true);
        fsSync.mkdirSync(target, { recursive: true });
        assertProtocolPath(target, options, true);
    });
    return target;
}

export async function readProtocolFile(file, options = {}) {
    let handle;
    try {
        const target = assertProtocolPath(file, options);
        handle = await fs.open(target, fsSync.constants.O_RDONLY | (fsSync.constants.O_NOFOLLOW || 0));
        const stat = await handle.stat();
        if (!stat.isFile()) throw invalid('metadata must be a regular file');
        if (stat.size > MAX_PROTOCOL_BYTES) throw Object.assign(new Error('Protocol metadata exceeds read limit'), { code: 'PROTOCOL_TOO_LARGE' });
        // Bounded even when a file grows after fstat; never readFile an untrusted leaf.
        const buffer = Buffer.alloc(MAX_PROTOCOL_BYTES + 1);
        let offset = 0;
        while (offset < buffer.length) {
            const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
            if (!bytesRead) break;
            offset += bytesRead;
        }
        if (offset > MAX_PROTOCOL_BYTES) throw Object.assign(new Error('Protocol metadata exceeds read limit'), { code: 'PROTOCOL_TOO_LARGE' });
        assertProtocolPath(target, options);
        const current = await fs.lstat(target);
        if (current.dev !== stat.dev || current.ino !== stat.ino) throw invalid('metadata changed during read');
        return buffer.subarray(0, offset).toString('utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        if (options.strict === false) return null;
        throw error;
    } finally { if (handle) await handle.close(); }
}

// Recovery also runs inside synchronous SQLite transactions. Keep the same
// no-follow, bounded-read and identity checks as the asynchronous protocol reader.
export function readProtocolFileSync(file, options = {}) {
    let descriptor;
    try {
        const target = assertProtocolPath(file, options);
        descriptor = fsSync.openSync(target, fsSync.constants.O_RDONLY | (fsSync.constants.O_NOFOLLOW || 0));
        const stat = fsSync.fstatSync(descriptor);
        if (!stat.isFile()) throw invalid('metadata must be a regular file');
        if (stat.size > MAX_PROTOCOL_BYTES) throw Object.assign(new Error('Protocol metadata exceeds read limit'), { code: 'PROTOCOL_TOO_LARGE' });
        const buffer = Buffer.alloc(MAX_PROTOCOL_BYTES + 1);
        let offset = 0;
        while (offset < buffer.length) {
            const bytesRead = fsSync.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
            if (!bytesRead) break;
            offset += bytesRead;
        }
        if (offset > MAX_PROTOCOL_BYTES) throw Object.assign(new Error('Protocol metadata exceeds read limit'), { code: 'PROTOCOL_TOO_LARGE' });
        assertProtocolPath(target, options);
        const current = fsSync.lstatSync(target);
        if (current.dev !== stat.dev || current.ino !== stat.ino) throw invalid('metadata changed during read');
        return buffer.subarray(0, offset).toString('utf8');
    } catch (error) {
        if (error.code === 'ENOENT' || options.strict === false) return null;
        throw error;
    } finally { if (descriptor !== undefined) fsSync.closeSync(descriptor); }
}

export function createProtocolRecoveryReader(projectDir) {
    const options = { projectDir };
    const safeStat = target => {
        // Validate containment and every ancestor before inspecting the leaf.
        const stat = fsSync.lstatSync(target);
        assertProtocolPath(target, options, stat.isDirectory());
        return stat;
    };
    return {
        readFileSync(file) { return readProtocolFileSync(file, options); },
        existsSync(target) {
            try {
                const stat = safeStat(target);
                return stat.isDirectory() || readProtocolFileSync(target, options) !== null;
            } catch { return false; }
        },
        readdirSync(folder) {
            const target = assertProtocolPath(folder, options, true);
            if (path.relative(projectDir, target).split(/[\\/]/).length > 64) throw invalid('metadata directory depth exceeds limit');
            const before = fsSync.lstatSync(target);
            const directory = fsSync.opendirSync(target);
            const entries = [];
            try {
                for (let entry; (entry = directory.readSync());) {
                    if (entries.length >= 10000) throw invalid('metadata directory entry limit exceeded');
                    entries.push(entry);
                }
            } finally { directory.closeSync(); }
            assertProtocolPath(target, options, true);
            const after = fsSync.lstatSync(target);
            if (after.dev !== before.dev || after.ino !== before.ino) throw invalid('metadata directory changed during read');
            return entries.filter(entry => {
                try { safeStat(path.join(target, entry.name)); return true; } catch { return false; }
            });
        }
    };
}

export async function writeProtocolFile(file, content, options = {}) {
    const target = assertProtocolPath(file, options);
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_PROTOCOL_BYTES) {
        throw Object.assign(new Error('Invalid or oversized protocol metadata'), { code: 'PROTOCOL_TOO_LARGE' });
    }
    const root = options.projectDir || path.dirname(target);
    await writeSourceFile(root, target, content, options.exclusive ? { encoding: 'utf8', flag: 'wx' } : 'utf8', options.sourceFence || null);
}
