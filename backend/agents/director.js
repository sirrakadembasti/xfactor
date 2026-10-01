import { extractAndParseJSON, validateDirectorSpec, normalizeDirectorSpec } from './schemas.js';
import { loadAgentPrompt } from './agentLoader.js';

export const DIRECTOR_SYSTEM_PROMPT = loadAgentPrompt('director');
export function buildDirectorPrompt(domain, domainDescription, rootTalimatname) {
    return `Sorumlu Olduğun Domain: ${domain}
Domain Açıklaması: ${domainDescription}

Ana Proje Talimatnamesi:
"""
${rootTalimatname}
"""

Lütfen ${domain} domaini için detaylı ALT-TALIMATNAME.md ve teamleader yapılandırmasını JSON formatında üret.`;
}

export function parseDirectorResponse(rawText, domain = 'domain') {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { altTalimatname: rawText };
    }
    return normalizeDirectorSpec(data, domain);
}

export function validatePlanTasks(planTasks = [], contract = {}) {
    const issues = [];
    const contractRequirements = [
        ...(Array.isArray(contract.requirements) ? contract.requirements : []),
        ...(Array.isArray(contract.requirementIds) ? contract.requirementIds : [])
    ];
    const approvedRequirementIds = new Set(
        contractRequirements
            .map(requirement => (
                typeof requirement === 'string' ? requirement : requirement?.id
            ))
            .filter(requirementId => typeof requirementId === 'string' && requirementId.length > 0)
    );

    for (const task of planTasks) {
        const taskId = task?.id || task?.title || 'unknown';
        if (!Array.isArray(task?.requirementIds) || task.requirementIds.length === 0) {
            issues.push(`UNSOLICITED_FEATURE: Task "${taskId}" has no requirementIds`);
            continue;
        }
        for (const requirementId of task.requirementIds) {
            if (!approvedRequirementIds.has(requirementId)) {
                issues.push(
                    `UNSOLICITED_FEATURE: Task "${taskId}" references unknown requirement "${requirementId}"`
                );
            }
        }
    }

    return {
        passed: issues.length === 0,
        issues
    };
}

export function validateManagementTaskCoverage(contract = {}, teamleaderPlans = {}) {
    if (contract.management?.needed !== true) return { passed: true, missing: [] };
    const required = [];
    for (const [index, resource] of (contract.management.resources || []).entries()) {
        for (const operation of resource.operations || []) {
            for (const surface of ['ui', 'api']) required.push(`MGMT-RESOURCE-${index + 1}:${surface}:${operation}`);
        }
    }
    for (const [index] of (contract.management.roles || []).entries()) {
        for (const journey of ['login', 'positive', 'negative']) required.push(`MGMT-ROLE-${index + 1}:${journey}`);
    }
    const covered = new Set();
    const resourceFiles = new Map();
    const roleFiles = new Map();
    const addFile = (map, key, file) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(file.replace(/\\/g, '/').toLowerCase());
    };
    const isCodeFile = file => /\.(?:[cm]?[jt]sx?|vue|svelte|html|py)$/i.test(file);
    const matchesSurface = (file, entry) => {
        const normalized = file.replace(/\\/g, '/').toLowerCase();
        if (!isCodeFile(normalized)) return false;
        if (entry.surface === 'api') return /(?:^|\/)(?:api|routes?|controllers?|backend|server)(?:\/|\.)/.test(normalized);
        if (entry.surface === 'ui') return !/(?:^|\/)(?:api|routes?|controllers?|backend|server)(?:\/|\.)/.test(normalized)
            && (/(?:^|\/)(?:frontend|components?|pages?|views?|app)(?:\/|\.)/.test(normalized)
                || /\.(?:jsx|tsx|vue|svelte|html)$/.test(normalized));
        if (entry.journey === 'login') return /(?:^|\/|\b)(?:auth|login|session|middleware)(?:[./_-]|$)/.test(normalized);
        if (entry.journey) return !/(?:^|\/)(?:api|routes?|controllers?|backend|server)(?:\/|\.)/.test(normalized)
            && (/(?:^|\/)(?:frontend|components?|pages?|views?|app)(?:\/|\.)/.test(normalized)
                || /\.(?:jsx|tsx|vue|svelte|html)$/.test(normalized));
        return false;
    };
    for (const plan of Object.values(teamleaderPlans || {})) {
        for (const task of plan?.tasks || []) {
            if (!Array.isArray(task.targetFiles) || task.targetFiles.length !== 1) continue;
            const entries = Array.isArray(task.managementCoverage) ? task.managementCoverage : [];
            const surfaces = new Set(entries.map(entry => entry?.surface).filter(Boolean));
            if (surfaces.size > 1) continue;
            for (const entry of entries) {
                if (!task.requirementIds?.includes(entry?.requirementId)) continue;
                if (!matchesSurface(task.targetFiles[0], entry)) continue;
                const key = entry.surface
                    ? `${entry.requirementId}:${entry.surface}:${entry.operation}`
                    : `${entry.requirementId}:${entry.journey}`;
                if (!required.includes(key)) continue;
                covered.add(key);
                addFile(entry.journey ? roleFiles : resourceFiles, key, task.targetFiles[0]);
            }
        }
    }
    for (const [index, resource] of (contract.management.resources || []).entries()) {
        for (const operation of resource.operations || []) {
            const uiKey = `MGMT-RESOURCE-${index + 1}:ui:${operation}`;
            const apiKey = `MGMT-RESOURCE-${index + 1}:api:${operation}`;
            const uiFiles = resourceFiles.get(uiKey) || new Set();
            const apiFiles = resourceFiles.get(apiKey) || new Set();
            if (![...uiFiles].some(ui => [...apiFiles].some(api => api !== ui))) {
                covered.delete(uiKey);
                covered.delete(apiKey);
            }
        }
    }
    for (const [index] of (contract.management.roles || []).entries()) {
        const id = `MGMT-ROLE-${index + 1}`;
        const loginFiles = roleFiles.get(`${id}:login`) || new Set();
        for (const journey of ['positive', 'negative']) {
            const journeyFiles = roleFiles.get(`${id}:${journey}`) || new Set();
            if (journeyFiles.size && [...journeyFiles].every(file => loginFiles.has(file))) covered.delete(`${id}:${journey}`);
        }
    }
    const missing = required.filter(id => !covered.has(id));
    return { passed: missing.length === 0, missing };
}

export function formatManagementTaskDescription(task = {}, contract = {}) {
    const description = task.description || '';
    if (!Array.isArray(task.managementCoverage) || task.managementCoverage.length === 0) return description;
    const obligations = task.managementCoverage.map(entry =>
        [entry.requirementId, entry.surface || entry.journey, entry.operation].filter(Boolean).join(' / '));
    const ids = new Set(task.managementCoverage.map(entry => entry.requirementId));
    const requirements = (contract.requirements || [])
        .filter(requirement => ids.has(requirement.id))
        .map(requirement => `${requirement.id}: ${requirement.statement}`);
    const approvedDetails = [...ids].map(id => {
        const resourceIndex = /^MGMT-RESOURCE-(\d+)$/.exec(id)?.[1];
        if (resourceIndex) return `${id}: ${JSON.stringify(contract.management?.resources?.[Number(resourceIndex) - 1] || {})}`;
        const roleIndex = /^MGMT-ROLE-(\d+)$/.exec(id)?.[1];
        if (roleIndex) return `${id}: ${JSON.stringify(contract.management?.roles?.[Number(roleIndex) - 1] || {})}`;
        return '';
    }).filter(Boolean);
    if ([...ids].some(id => id.startsWith('MGMT-ROLE-'))) {
        approvedDetails.push(`authentication: ${JSON.stringify(contract.management?.authentication || {})}`);
        approvedDetails.push(`browser role journeys: ${JSON.stringify(contract.browser?.roleJourneys || [])}`);
    }
    return `${description}\n\nZorunlu yönetim kapsamı: ${obligations.join('; ')}.\nOnaylı gereksinimler: ${requirements.join(' | ')}.\nOnaylı yönetim ayrıntıları: ${approvedDetails.join(' | ')}.\nHedef dosyada bu davranışları uygula; Reviewer her kapsamı denetlemeli.`;
}
