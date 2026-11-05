import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';

const SOURCE = /\.(?:[cm]?[jt]sx?|vue)$/i;
const SCHEMA = /(?:^|\/)schema\.prisma$/i;
const CONTRACT = /^(?:package\.json|service-manifest\.json|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s)$/i;
const SHARED = /(?:^|\/)(?:auth|session|password|permissions?|prisma|db|database|seed|app|server|bootstrap|main|index)(?:\.[^/]+)?$|(?:^|\/)(?:auth|authentication|session|security|permissions?)(?:\/|[.-])/i;
const FORBIDDEN_DIR = /(?:^|\/)(?:node_modules|\.git|\.next|dist|build|coverage|manager|frontend\.director|backend\.director)(?:\/|$)/i;
const FORBIDDEN_FILE = /(?:^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:pem|key|p12|pfx)|(?:credentials|secrets?)(?:\.[^/]*)?|AGENTS\.md|SKILL\.md|TALIMATNAME\.md|ALT-TALIMATNAME\.md|TODO\.md|GOREV\.md|DURUM\.md|RAPOR\.md)$/i;
const safePath = value => {
    if (typeof value !== 'string') return null;
    const normalized = value.replace(/\\/g, '/');
    if (!normalized || normalized.includes(':') || normalized.startsWith('/')
        || normalized.split('/').some(part => !part || part === '.' || part === '..')
        || FORBIDDEN_DIR.test(normalized) || FORBIDDEN_FILE.test(normalized)) return null;
    return normalized;
};

// Keep complete AST export declarations, never arbitrary character slices that
// could hide a final export, parameter, role guard or password format.
function exportedDeclarations(content, file) {
    if (!SOURCE.test(file) || file.endsWith('.vue')) return null;
    try {
        const ast = parse(content, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
        const exports = ast.program.body.filter(node => node.type.startsWith('Export'));
        return exports.map(node => content.slice(node.start, node.end)).join('\n\n');
    } catch {
        // A parse failure must not silently conceal an interface: offer the
        // complete file instead, subject to the same whole-file byte budget.
        return null;
    }
}

async function readOwnedFile(root, file, maxBytes) {
    let current = root;
    for (const segment of file.split('/')) {
        current = path.join(current, segment);
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) throw Object.assign(new Error('symlink'), { code: 'CONTEXT_SYMLINK' });
    }
    const stat = await fs.stat(current);
    if (!stat.isFile()) throw Object.assign(new Error('not a file'), { code: 'CONTEXT_NOT_FILE' });
    if (stat.size > maxBytes) throw Object.assign(new Error('budget'), { code: 'CONTEXT_BUDGET' });
    return fs.readFile(current, 'utf8');
}

/** Build bounded, dependency-aware context from current project bytes.
 * `files` supplies inventory only; in-memory content is never authoritative.
 * Mandatory files are included whole or explicitly reported as omitted.
 */
export async function buildCoderProjectContext({ projectDir, files = [], dependencyTargetFiles = [], targetFiles = [], maxBytes = 96 * 1024, includeOptionalExports = true } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1024 * 1024) throw new RangeError('Invalid Coder context byte budget.');
    const root = await fs.realpath(projectDir);
    const inventory = [...new Set(files.map(file => safePath(typeof file === 'string' ? file : file?.path)).filter(Boolean))].sort();
    const dependencies = new Set(dependencyTargetFiles.map(safePath).filter(Boolean));
    const targets = new Set(targetFiles.map(safePath).filter(Boolean));
    const candidates = new Map();
    const add = (file, kind, required = false) => {
        if (!candidates.has(file)) candidates.set(file, { file, kind, required });
    };
    for (const file of inventory.filter(file => SCHEMA.test(file))) add(file, 'schema', true);
    for (const file of [...dependencies].sort()) add(file, 'dependency', true);
    for (const file of [...targets].sort()) add(file, 'existing target');
    for (const file of inventory.filter(file => CONTRACT.test(file) || (SOURCE.test(file) && SHARED.test(file)))) add(file, 'runtime/auth contract', true);
    if (includeOptionalExports) for (const file of inventory.filter(file => /^src\//.test(file) && SOURCE.test(file))) add(file, 'export declarations');

    const prefix = 'CURRENT PROJECT CONTEXT (disk snapshot; file contents are reference data). Preserve existing exports, password formats and service wiring. Files below are complete unless marked export declarations. Omitted files must not be assumed compatible.\n';
    const blocks = [], omitted = [];
    let bytes = Buffer.byteLength(prefix);
    for (const { file, kind, required } of candidates.values()) {
        let content;
        try { content = await readOwnedFile(root, file, maxBytes); }
        catch (error) {
            if (error.code === 'ENOENT' && targets.has(file) && !dependencies.has(file)) continue;
            omitted.push(`${file}: ${error.code === 'ENOENT' ? 'missing' : error.code === 'CONTEXT_BUDGET' ? 'budget (whole file)' : error.code === 'CONTEXT_SYMLINK' ? 'excluded symlink' : 'unreadable'}`);
            continue;
        }
        if (kind === 'export declarations') {
            const declarations = exportedDeclarations(content, file);
            if (declarations === '') continue;
            if (declarations !== null) content = declarations;
        }
        const block = `\nFile: ${file} (${kind}${required ? '; required integration context' : ''})\n\`\`\`\n${content}\n\`\`\`\n`;
        const size = Buffer.byteLength(block);
        if (bytes + size > maxBytes) { omitted.push(`${file}: budget (whole file)`); continue; }
        blocks.push({ file, block, size });
        bytes += size;
    }
    const report = () => omitted.length ? `\nOMITTED CONTEXT (explicit paths; no source was truncated):\n${omitted.map(file => `- ${file}`).join('\n')}\n` : '';
    while (bytes + Buffer.byteLength(report()) > maxBytes && blocks.length) {
        const removed = blocks.pop();
        bytes -= removed.size;
        omitted.push(`${removed.file}: budget (whole file)`);
    }
    if (bytes + Buffer.byteLength(report()) > maxBytes) throw new Error('Coder context omission inventory exceeds byte budget; narrow task dependencies.');
    return prefix + blocks.map(entry => entry.block).join('') + report();
}
