import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROJECTS_DIR = path.resolve(__dirname, '../projects');
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

export function isValidProjectId(projectId) {
    if (typeof projectId !== 'string') return false;
    const clean = projectId.trim();
    if (!clean || clean.includes('\0')) return false;
    return PROJECT_ID_PATTERN.test(clean);
}

export function getProjectsRoot(env = process.env) {
    const configured = typeof env?.PROJECTS_ROOT === 'string' ? env.PROJECTS_ROOT.trim() : '';
    return configured ? path.resolve(configured) : DEFAULT_PROJECTS_DIR;
}

export function getProjectDir(projectId, env = process.env) {
    if (!isValidProjectId(projectId)) {
        throw new Error(`Invalid project ID format: "${projectId}". Must match ${PROJECT_ID_PATTERN}`);
    }
    const root = getProjectsRoot(env);
    const resolved = path.resolve(root, projectId.trim());
    const relative = path.relative(root, resolved);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path containment violation: "${projectId}" escapes projects root "${root}"`);
    }
    return resolved;
}

export function resolveSafeProjectPath(projectId, relativePath, env = process.env) {
    if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0')) {
        throw new Error(`Invalid relative path: "${relativePath}"`);
    }
    const projectDir = getProjectDir(projectId, env);
    const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(projectDir, normalizedRelative);
    const relativeToProject = path.relative(projectDir, resolved);
    if (relativeToProject.startsWith('..') || path.isAbsolute(relativeToProject)) {
        throw new Error(`Path traversal attempt detected: "${relativePath}" escapes "${projectDir}"`);
    }
    return resolved;
}
