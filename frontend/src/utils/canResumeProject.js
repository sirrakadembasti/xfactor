export function canResumeProject(status) {
  return status === 'paused' || status === 'verification_failed';
}
