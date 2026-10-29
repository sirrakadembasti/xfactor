/**
 * Verification Stage Module (ENG-8)
 * Handles isolated artifact and dependency verification helpers.
 */

export function extractPreparedLockfile(prepResult, prepError = null) {
    if (prepResult?.status !== 'completed' || !prepResult.result?.packageLockBase64) {
        throw new Error(prepError?.message || prepResult?.result?.error || prepResult?.error ||
            'Isolated dependency preparation did not produce a package-lock.json.');
    }
    return {
        packageLockBase64: prepResult.result.packageLockBase64,
        packageLockSha256: prepResult.result.packageLockSha256 || null
    };
}
