export function validateJob(input, now) {
  if (!input || typeof input !== 'object') {
    return { valid: false, reason: 'Invalid input format' };
  }

  const { version, jobId, operation, projectId, contractId, contractHash, revision, artifactId, archiveBase64, contract, deadline, nonce, inputSha256 } = input;
  
  if (version !== 1) return { valid: false, reason: 'Invalid version' };
  if (typeof jobId !== 'string' || jobId.length > 100 || jobId.length === 0) return { valid: false, reason: 'Invalid jobId' };
  if (operation !== 'prepare_dependencies' && operation !== 'verify_artifact') return { valid: false, reason: 'Invalid operation' };
  if (typeof projectId !== 'string' || projectId.length === 0) return { valid: false, reason: 'Invalid projectId' };
  if (typeof contractId !== 'string' || contractId.length === 0) return { valid: false, reason: 'Invalid contractId' };
  if (typeof contractHash !== 'string' || contractHash.length === 0) return { valid: false, reason: 'Invalid contractHash' };
  if (typeof revision !== 'string' || revision.length === 0) return { valid: false, reason: 'Invalid revision' };
  if (typeof artifactId !== 'string' || artifactId.length === 0) return { valid: false, reason: 'Invalid artifactId' };
  if (typeof archiveBase64 !== 'string' || archiveBase64.length > 33554432) return { valid: false, reason: 'Invalid archiveBase64' };
  if (typeof nonce !== 'string' || !/^[0-9a-f]{64}$/.test(nonce)) return { valid: false, reason: 'Invalid nonce' };
  if (typeof inputSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(inputSha256)) return { valid: false, reason: 'Invalid inputSha256' };
  
  if (!contract || typeof contract !== 'object') return { valid: false, reason: 'Invalid contract' };
  if ('hostPath' in contract || 'image' in contract || 'dockerParams' in contract) return { valid: false, reason: 'Forbidden host/Docker field in contract' };
  if ('hostPath' in input || 'image' in input || 'dockerParams' in input) return { valid: false, reason: 'Forbidden host/Docker field in job' };
  
  if (typeof deadline !== 'number' || deadline <= now) return { valid: false, reason: 'Expired or invalid deadline' };
  if (deadline - now > 15 * 60 * 1000) return { valid: false, reason: 'Deadline exceeds 15 minutes' };

  return { valid: true, job: { version, jobId, operation, projectId, contractId, contractHash, revision, artifactId, archiveBase64, contract, deadline, nonce, inputSha256 } };
}
