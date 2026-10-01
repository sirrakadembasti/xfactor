import path from 'node:path';

export function sendArtifactDownload(res, artifact, { onComplete, onError }) {
  return res.download(artifact.path, path.basename(artifact.path), error => {
    if (error) { onError(error); return; }
    try { onComplete(); } catch (auditError) { onError(auditError); }
  });
}
