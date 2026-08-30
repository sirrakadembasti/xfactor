import { db } from '../db.js';

export function linkRequirementToFile({ contractId, requirementId, artifactId, path: filePath }) {
    db.prepare(`
        INSERT INTO requirement_file_links (contract_id, requirement_id, artifact_id, path)
        VALUES (?, ?, ?, ?)
    `).run(contractId, requirementId, artifactId, filePath);
}

export function linkRequirementToCheck({ contractId, requirementId, verificationCheckId }) {
    db.prepare(`
        INSERT INTO requirement_check_links (contract_id, requirement_id, verification_check_id)
        VALUES (?, ?, ?)
    `).run(contractId, requirementId, verificationCheckId);
}

export function linkRequirementToArtifact({ contractId, requirementId, artifactId }) {
    db.prepare(`
        INSERT INTO requirement_artifact_links (contract_id, requirement_id, artifact_id)
        VALUES (?, ?, ?)
    `).run(contractId, requirementId, artifactId);
}

export class TraceabilityMatrix {
    constructor(contractId) {
        this.contractId = contractId;
    }

    async buildMatrix() {
        const requirements = db.prepare(`
            SELECT id, stable_key, statement, kind, priority, mandatory, status
            FROM requirements
            WHERE contract_id = ?
            ORDER BY stable_key ASC
        `).all(this.contractId);

        const taskLinks = db.prepare(`
            SELECT requirement_id, task_id
            FROM requirement_task_links
            WHERE contract_id = ?
        `).all(this.contractId);

        const fileLinks = db.prepare(`
            SELECT requirement_id, artifact_id, path
            FROM requirement_file_links
            WHERE contract_id = ?
        `).all(this.contractId);

        const checkLinks = db.prepare(`
            SELECT requirement_id, verification_check_id
            FROM requirement_check_links
            WHERE contract_id = ?
        `).all(this.contractId);

        const artifactLinks = db.prepare(`
            SELECT requirement_id, artifact_id
            FROM requirement_artifact_links
            WHERE contract_id = ?
        `).all(this.contractId);

        const taskLinkMap = new Map();
        for (const l of taskLinks) {
            if (!taskLinkMap.has(l.requirement_id)) taskLinkMap.set(l.requirement_id, []);
            taskLinkMap.get(l.requirement_id).push(l.task_id);
        }

        const fileLinkMap = new Map();
        for (const l of fileLinks) {
            if (!fileLinkMap.has(l.requirement_id)) fileLinkMap.set(l.requirement_id, []);
            fileLinkMap.get(l.requirement_id).push(l.path);
        }

        const checkLinkMap = new Map();
        for (const l of checkLinks) {
            if (!checkLinkMap.has(l.requirement_id)) checkLinkMap.set(l.requirement_id, []);
            checkLinkMap.get(l.requirement_id).push(l.verification_check_id);
        }

        const artifactLinkMap = new Map();
        for (const l of artifactLinks) {
            if (!artifactLinkMap.has(l.requirement_id)) artifactLinkMap.set(l.requirement_id, []);
            artifactLinkMap.get(l.requirement_id).push(l.artifact_id);
        }

        return requirements.map((req) => {
            const hasTask = (taskLinkMap.get(req.id) || []).length > 0;
            const files = fileLinkMap.get(req.id) || [];
            const hasFiles = files.length > 0;
            const hasChecks = (checkLinkMap.get(req.id) || []).length > 0;
            const hasArtifact = (artifactLinkMap.get(req.id) || []).length > 0;

            const isMandatory = Number(req.mandatory) === 1;
            const codeCell = hasTask || hasFiles;
            const apiCell = files.some(f => f.includes('api') || f.includes('server') || f.includes('backend') || f.includes('route'));
            const uiCell = files.some(f => f.includes('ui') || f.includes('view') || f.includes('page') || f.includes('frontend') || f.includes('component'));
            const testCell = hasChecks;
            const runtimeCell = hasChecks;
            const artifactCell = hasArtifact;

            let rowStatus = 'UNCOVERED';
            if (codeCell) {
                rowStatus = 'COVERED';
            } else if (!isMandatory) {
                rowStatus = 'OPTIONAL_UNCOVERED';
            }

            return {
                requirementId: req.id,
                stableKey: req.stable_key,
                statement: req.statement,
                mandatory: isMandatory,
                codeCell,
                apiCell,
                uiCell,
                testCell,
                runtimeCell,
                artifactCell,
                status: rowStatus
            };
        });
    }

    async verifyCoveragePolicy() {
        const matrix = await this.buildMatrix();
        const uncoveredMandatory = matrix.filter(r => r.mandatory && (r.status === 'UNCOVERED' || r.status === 'BLOCKED'));

        return {
            passed: uncoveredMandatory.length === 0,
            uncoveredMandatory,
            totalRequirements: matrix.length,
            matrix
        };
    }
}
