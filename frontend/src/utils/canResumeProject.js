export function requiresManagerRevision(lastError) {
  return /Worker repair requires Manager revision:/i.test(String(lastError || ''));
}

export function canResumeProject(status, lastError = null, resumeBlocked = false) {
  if (resumeBlocked || requiresManagerRevision(lastError)) return false;
  return status === 'paused' || status === 'verification_failed'
    || (status === 'artifact_verified' && Boolean(lastError));
}
