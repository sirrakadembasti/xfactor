export function canResumeProject(status, lastError = null) {
  return status === 'paused' || status === 'verification_failed'
    || (status === 'artifact_verified' && Boolean(lastError));
}
