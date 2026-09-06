import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultArtifactsRoot = path.join(backendRoot, 'data', 'artifacts');

export function getArtifactsRoot(env = process.env) {
    const configured = String(env.ARTIFACTS_ROOT || '').trim();
    const resolved = path.resolve(configured || defaultArtifactsRoot);
    if (String(env.NODE_ENV || '').toLowerCase() === 'production' && !configured) {
        throw new Error('ARTIFACTS_ROOT is required in production');
    }
    if (String(env.NODE_ENV || '').toLowerCase() === 'production' && !path.isAbsolute(configured)) {
        throw new Error('ARTIFACTS_ROOT must be absolute in production');
    }
    return resolved;
}

export async function assertArtifactsRootAvailable(root = getArtifactsRoot()) {
    await fs.mkdir(root, { recursive: true });
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw new Error('ARTIFACTS_ROOT must be a directory');
    await fs.access(root, constants.R_OK | constants.W_OK);
    return root;
}
