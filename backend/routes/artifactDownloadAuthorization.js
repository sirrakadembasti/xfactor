export function authorizeArtifactDownload({ artifact, assertEvidence }) {
    if (!artifact) return { status: 404, error: 'Artifact not found' };
    try {
        assertEvidence();
        return { status: 200 };
    } catch (error) {
        return { status: 409, error: error.message };
    }
}
