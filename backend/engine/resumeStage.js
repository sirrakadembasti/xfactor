import crypto from 'node:crypto';

export function fingerprintArtifactFiles(files) {
    if (!Array.isArray(files) || !files.some(file => file.path === 'package.json')) return null;
    const digest = crypto.createHash('sha256');
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
        if (typeof file.path !== 'string' || !file.path || file.content == null) return null;
        const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
        digest.update(`${file.path.length}:${file.path}:${content.length}:`);
        digest.update(content);
    }
    return digest.digest('hex');
}

export function resolveDependencyResume(checkpoint, contract, files) {
    return Boolean(checkpoint && contract
        && checkpoint.stage === 'dependency_preparation'
        && checkpoint.contractId === contract.id
        && checkpoint.contractHash === contract.contract_hash
        && checkpoint.artifactHash
        && checkpoint.artifactHash === fingerprintArtifactFiles(files));
}
