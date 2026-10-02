import fs from 'node:fs/promises';
import path from 'node:path';
import { isSafeProjectPath, isSymlinkDirent, assertPathInsideRoot } from './security.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_TOTAL_FILES = 500;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']);
const ALLOWED_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.html',
    '.prisma', '.sql', '.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp',
    '.gif', '.txt', '.yaml', '.yml', '.graphql', '.gql'
]);
const ALLOWED_DOT_FILES = new Set(['.env.example', '.gitignore']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
const IGNORED_FILES = new Set(['package-lock.json', 'bun.lockb', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);

/** Read the editor-visible project files without exposing private/runtime state. */
export async function readProjectFiles(root, { onReadError = () => {} } = {}) {
    const results = [];
    let totalBytes = 0;
    async function visit(directory, relativePath = '') {
        if (results.length >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) return;
        let entries;
        try {
            entries = await fs.readdir(directory, { withFileTypes: true });
        } catch {
            // Preserve the API's partial-list response for unavailable directories.
            return;
        }
        for (const entry of entries) {
            if (results.length >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) break;
            if (isSymlinkDirent(entry)) continue;
            if (entry.name.startsWith('.') && !ALLOWED_DOT_FILES.has(entry.name)) continue;
            const target = path.join(directory, entry.name);
            const relative = path.join(relativePath, entry.name).replace(/\\/g, '/');
            if (!isSafeProjectPath(relative, root)) continue;
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) await visit(target, relative);
                continue;
            }
            if (!entry.isFile() || IGNORED_FILES.has(entry.name)) continue;
            const extension = path.extname(entry.name).toLowerCase();
            if (!ALLOWED_EXTENSIONS.has(extension) && !ALLOWED_DOT_FILES.has(entry.name) && extension !== '') continue;
            try {
                const stat = await fs.stat(target);
                if (stat.size > MAX_FILE_SIZE || totalBytes + stat.size > MAX_TOTAL_BYTES) continue;
                await assertPathInsideRoot(target, root);
                const content = await fs.readFile(target);
                // A file can grow between stat and read; account for actual bytes.
                if (content.length > MAX_FILE_SIZE || totalBytes + content.length > MAX_TOTAL_BYTES) continue;
                totalBytes += content.length;
                const binary = BINARY_EXTENSIONS.has(extension);
                results.push({ path: relative, content: content.toString(binary ? 'base64' : 'utf8'),
                    encoding: binary ? 'base64' : 'utf8', size: content.length });
            } catch (error) {
                onReadError(error, relative);
            }
        }
    }
    await visit(root);
    return results;
}
