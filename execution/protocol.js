export function validateJob(input, now) {
  if (!input || typeof input !== 'object') {
    return { valid: false, reason: 'Invalid input format' };
  }

  const { version, jobId, operation, projectId, contractId, contractHash, revision, artifactId, archiveBase64, contract, deadline } = input;
  
  if (version !== 1) return { valid: false, reason: 'Invalid version' };
  if (typeof jobId !== 'string' || jobId.length > 100 || jobId.length === 0) return { valid: false, reason: 'Invalid jobId' };
  if (typeof operation !== 'string' || operation.length === 0) return { valid: false, reason: 'Invalid operation' };
  if (typeof projectId !== 'string' || projectId.length === 0) return { valid: false, reason: 'Invalid projectId' };
  if (typeof contractId !== 'string' || contractId.length === 0) return { valid: false, reason: 'Invalid contractId' };
  if (typeof contractHash !== 'string' || contractHash.length === 0) return { valid: false, reason: 'Invalid contractHash' };
  if (typeof revision !== 'string' || revision.length === 0) return { valid: false, reason: 'Invalid revision' };
  if (typeof artifactId !== 'string' || artifactId.length === 0) return { valid: false, reason: 'Invalid artifactId' };
  
  // 24 MiB decoded size max for ZIP, base64 expands it by 4/3 => max 33,554,432 bytes
  if (typeof archiveBase64 !== 'string' || archiveBase64.length > 33554432) return { valid: false, reason: 'Invalid archiveBase64' };
  
  if (!contract || typeof contract !== 'object') return { valid: false, reason: 'Invalid contract' };
  
  if (typeof deadline !== 'number' || deadline <= now) return { valid: false, reason: 'Expired or invalid deadline' };
  // Deadline max 15 minutes
  if (deadline - now > 15 * 60 * 1000) return { valid: false, reason: 'Deadline exceeds 15 minutes' };

  return { valid: true, job: { version, jobId, operation, projectId, contractId, contractHash, revision, artifactId, archiveBase64, contract, deadline } };
}
