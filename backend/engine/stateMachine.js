export const PROJECT_STATUS = {
    PLANNING: 'planning',
    PENDING_APPROVAL: 'pending_approval',
    CONTRACT_APPROVED: 'contract_approved',
    IMPLEMENTING: 'implementing',
    IMPLEMENTATION_FINISHED: 'implementation_finished',
    VERIFICATION_PENDING: 'verification_pending',
    VERIFICATION_RUNNING: 'verification_running',
    VERIFICATION_FAILED: 'verification_failed',
    PAUSED: 'paused',
    BUILD_VERIFIED: 'build_verified',
    RUNTIME_VERIFIED: 'runtime_verified',
    ACCEPTANCE_VERIFIED: 'acceptance_verified',
    ARTIFACT_VERIFIED: 'artifact_verified',
    COMPLETED: 'completed',
    CAPABILITY_BLOCKED: 'capability_blocked'
};

export const WORKFLOW_STATUS = {
    RUNNING: 'running',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    FAILED: 'failed',
    ABORTED: 'aborted',
    STALE_TERMINATED: 'stale_terminated'
};

export function canTransitionProject(fromStatus, toStatus) {
    if (fromStatus === toStatus) return true;

    const allowed = {
        [PROJECT_STATUS.PLANNING]: [
            PROJECT_STATUS.PENDING_APPROVAL,
            PROJECT_STATUS.CAPABILITY_BLOCKED
        ],
        [PROJECT_STATUS.PENDING_APPROVAL]: [
            PROJECT_STATUS.CONTRACT_APPROVED,
            PROJECT_STATUS.CAPABILITY_BLOCKED,
            PROJECT_STATUS.PLANNING
        ],
        [PROJECT_STATUS.CONTRACT_APPROVED]: [
            PROJECT_STATUS.IMPLEMENTING,
            PROJECT_STATUS.PLANNING
        ],
        [PROJECT_STATUS.IMPLEMENTING]: [
            PROJECT_STATUS.IMPLEMENTATION_FINISHED,
            PROJECT_STATUS.PAUSED,
            PROJECT_STATUS.PLANNING
        ],
        [PROJECT_STATUS.IMPLEMENTATION_FINISHED]: [PROJECT_STATUS.VERIFICATION_PENDING],
        [PROJECT_STATUS.VERIFICATION_PENDING]: [PROJECT_STATUS.VERIFICATION_RUNNING],
        [PROJECT_STATUS.VERIFICATION_RUNNING]: [
            PROJECT_STATUS.VERIFICATION_FAILED,
            PROJECT_STATUS.BUILD_VERIFIED
        ],
        [PROJECT_STATUS.VERIFICATION_FAILED]: [
            PROJECT_STATUS.PAUSED,
            PROJECT_STATUS.PLANNING
        ],
        [PROJECT_STATUS.BUILD_VERIFIED]: [
            PROJECT_STATUS.RUNTIME_VERIFIED,
            PROJECT_STATUS.PAUSED
        ],
        [PROJECT_STATUS.RUNTIME_VERIFIED]: [
            PROJECT_STATUS.ACCEPTANCE_VERIFIED,
            PROJECT_STATUS.PAUSED
        ],
        [PROJECT_STATUS.ACCEPTANCE_VERIFIED]: [PROJECT_STATUS.ARTIFACT_VERIFIED],
        [PROJECT_STATUS.ARTIFACT_VERIFIED]: [PROJECT_STATUS.COMPLETED],
        [PROJECT_STATUS.PAUSED]: [
            PROJECT_STATUS.IMPLEMENTING,
            PROJECT_STATUS.VERIFICATION_PENDING,
            PROJECT_STATUS.PLANNING
        ],
        [PROJECT_STATUS.CAPABILITY_BLOCKED]: [
            PROJECT_STATUS.PLANNING,
            PROJECT_STATUS.PENDING_APPROVAL
        ],
        [PROJECT_STATUS.COMPLETED]: []
    };

    return allowed[fromStatus]?.includes(toStatus) === true;
}
