import { extractAndParseJSON, normalizeDirectorSpec } from './schemas.js';
import { loadAgentSystemPrompt } from './agentLoader.js';

export const DIRECTOR_SYSTEM_PROMPT = loadAgentSystemPrompt('director');
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
    const data = extractAndParseJSON(rawText);
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

const REACT_ENTRY_EXTENSIONS = ['tsx', 'jsx', 'ts', 'js'];
const FRONTEND_RUNTIME_GROUPS = [
    ['index.html'],
    REACT_ENTRY_EXTENSIONS.map(extension => `src/main.${extension}`),
    ['src/App', 'src/router', 'src/routes', 'src/router/index'].flatMap(prefix => REACT_ENTRY_EXTENSIONS.map(extension => `${prefix}.${extension}`))
];

/** Only the known React/Vite frontend topology needs these entrypoints. */
export function validateFrontendRuntimePlan(tasks = [], { stack = {}, domain = {}, files = [], isLastTeamleader = true } = {}) {
    const domainName = typeof domain === 'string' ? domain : domain.prefix || domain.name || '';
    const required = isLastTeamleader && stack.framework === 'vite' && stack.isVue !== true && /^(?:frontend|ui|client)(?:[._-]|$)/i.test(domainName);
    if (!required) return { passed: true, required: false, missing: [], issues: [] };
    const paths = new Set(tasks.flatMap(task => task.targetFiles || []).filter(file => typeof file === 'string').map(file => file.replace(/\\/g, '/')));
    for (const file of files) {
        if (typeof file?.path === 'string' && typeof file.content === 'string' && file.content.trim()) paths.add(file.path.replace(/\\/g, '/'));
    }
    const missing = FRONTEND_RUNTIME_GROUPS.filter(group => !group.some(file => paths.has(file))).map(group => group.join(' or '));
    return { passed: missing.length === 0, required: true, missing,
        issues: missing.map(group => `Frontend runtime entrypoint missing: ${group}`) };
}

/** Runtime-only cache migration; the caller retains contract/DAG validation. */
export async function resolveFrontendRuntimePlan({ cachedPlan, context = {}, generatePlan, validateCandidate = candidate => candidate, onInvalidCachedPlan = async () => {}, onInvalidCandidate = async () => {} }) {
    const validate = (candidate, checkCandidate = true) => {
        let candidateErrors = [];
        if (checkCandidate) {
            try { candidate = validateCandidate(candidate) || candidate; }
            catch (error) { candidateErrors = [String(error.message || error).slice(0, 4000)]; }
        }
        if (candidateErrors.length) return { passed: false, plan: candidate, missing: [], missingCoverage: [], issues: candidateErrors };
        const runtime = validateFrontendRuntimePlan(candidate?.tasks || [], context);
        const coverage = validateDomainPlanCoverage(candidate?.tasks || [], context);
        return { passed: !candidateErrors.length && runtime.passed && coverage.passed, plan: candidate,
            missing: runtime.missing, missingCoverage: coverage.missing,
            issues: [...candidateErrors, ...runtime.issues, ...coverage.missing.map(key => `Missing domain management coverage: ${key}`)] };
    };
    let validation = validate(cachedPlan, Boolean(cachedPlan));
    if (cachedPlan && validation.passed) return { plan: validation.plan, newlyPlanned: false };
    if (cachedPlan) await onInvalidCachedPlan(validation);
    for (let attempt = 1; attempt <= 2; attempt++) {
        const plan = await generatePlan({ attempt, missingPaths: validation.missing, missingCoverage: validation.missingCoverage, validationErrors: validation.issues });
        validation = validate(plan);
        if (validation.passed) return { plan: validation.plan, newlyPlanned: true };
        const shortString = value => typeof value === 'string' ? value.slice(0, 160) : undefined;
        const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
        await onInvalidCandidate({ attempt, missingPaths: validation.missing, missingCoverage: validation.missingCoverage,
            taskCount: tasks.length, tasks: tasks.filter(task => task && typeof task === 'object').slice(0, 64).map(task => ({
                id: shortString(task.id), targetFiles: (Array.isArray(task.targetFiles) ? task.targetFiles : []).slice(0, 4).map(shortString),
                managementCoverage: (Array.isArray(task.managementCoverage) ? task.managementCoverage : []).filter(entry => entry && typeof entry === 'object').slice(0, 16)
                    .map(entry => Object.fromEntries(['requirementId', 'surface', 'operation', 'journey'].filter(key => typeof entry[key] === 'string').map(key => [key, shortString(entry[key])])))
            })) });
    }
    throw new Error(`Invalid frontend runtime entrypoint/domain coverage plan after one correction: ${validation.issues.join('; ')}`);
}

function matchesManagementSurface(file, entry) {
    const normalized = file.replace(/\\/g, '/').toLowerCase();
    if (!/\.(?:[cm]?[jt]sx?|vue|svelte|html|py)$/i.test(normalized)) return false;
    const api = /(?:^|\/)(?:api|routes?|controllers?|backend|server)(?:\/|\.)/.test(normalized);
    const ui = !api && (/(?:^|\/)(?:frontend|components?|pages?|views?|app)(?:\/|\.)/.test(normalized)
        || /\.(?:jsx|tsx|vue|svelte|html)$/.test(normalized));
    if (entry.surface === 'api') return api;
    if (entry.surface === 'ui') return ui;
    if (entry.journey === 'login') {
        const words = file.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
            .toLowerCase().split(/[^a-z0-9]+/);
        return words.some(word => ['auth', 'login', 'session', 'middleware'].includes(word));
    }
    return Boolean(entry.journey && ui);
}

/** Current-contract task metadata is proof of planned scope; disk presence is never scope. */
export function validateDomainPlanCoverage(tasks = [], { contract = {}, domain = {}, teamleaderId = 'candidate', teamleaderPlans = {}, isLastTeamleader = true } = {}) {
    const prefix = typeof domain === 'string' ? domain : domain.prefix || domain.name || '';
    const backend = /^(?:backend|api|server)(?:[._-]|$)/i.test(prefix);
    const frontend = /^(?:frontend|ui|client)(?:[._-]|$)/i.test(prefix);
    if (!isLastTeamleader || contract.management?.needed !== true || (!backend && !frontend)) return { passed: true, missing: [] };
    const required = [];
    for (const [index, resource] of (contract.management.resources || []).entries()) {
        for (const operation of resource.operations || []) required.push(`MGMT-RESOURCE-${index + 1}:${backend ? 'api' : 'ui'}:${operation}`);
    }
    if (frontend) for (const [index] of (contract.management.roles || []).entries()) {
        for (const journey of ['login', 'positive', 'negative']) required.push(`MGMT-ROLE-${index + 1}:${journey}`);
    }
    const plans = { ...teamleaderPlans, [teamleaderId]: { tasks } };
    const covered = new Set();
    const roleFiles = new Map();
    for (const [team, candidate] of Object.entries(plans)) {
        // Frontend client wrappers cannot stand in for backend domain API tasks.
        if (backend && !team.startsWith(`${prefix}.`)) continue;
        for (const task of candidate?.tasks || []) {
            if (!Array.isArray(task.targetFiles) || task.targetFiles.length !== 1) continue;
            const entries = Array.isArray(task.managementCoverage) ? task.managementCoverage : [];
            if (new Set(entries.map(entry => entry?.surface).filter(Boolean)).size > 1) continue;
            for (const entry of entries) {
                if (!task.requirementIds?.includes(entry?.requirementId) || !matchesManagementSurface(task.targetFiles[0], entry)) continue;
                const key = entry.surface ? `${entry.requirementId}:${entry.surface}:${entry.operation}` : `${entry.requirementId}:${entry.journey}`;
                if (required.includes(key)) {
                    covered.add(key);
                    if (entry.journey) {
                        if (!roleFiles.has(key)) roleFiles.set(key, new Set());
                        roleFiles.get(key).add(task.targetFiles[0].replace(/\\/g, '/').toLowerCase());
                    }
                }
            }
        }
    }
    if (frontend) for (const [index] of (contract.management.roles || []).entries()) {
        const id = `MGMT-ROLE-${index + 1}`;
        const loginFiles = roleFiles.get(`${id}:login`) || new Set();
        for (const journey of ['positive', 'negative']) {
            const journeyFiles = roleFiles.get(`${id}:${journey}`) || new Set();
            if (journeyFiles.size && [...journeyFiles].every(file => loginFiles.has(file))) covered.delete(`${id}:${journey}`);
        }
    }
    const missing = required.filter(key => !covered.has(key));
    return { passed: !missing.length, missing };
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
    for (const plan of Object.values(teamleaderPlans || {})) {
        for (const task of plan?.tasks || []) {
            if (!Array.isArray(task.targetFiles) || task.targetFiles.length !== 1) continue;
            const entries = Array.isArray(task.managementCoverage) ? task.managementCoverage : [];
            const surfaces = new Set(entries.map(entry => entry?.surface).filter(Boolean));
            if (surfaces.size > 1) continue;
            for (const entry of entries) {
                if (!task.requirementIds?.includes(entry?.requirementId)) continue;
                if (!matchesManagementSurface(task.targetFiles[0], entry)) continue;
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
    const resourceNames = new Set([...ids].map(id => /^MGMT-RESOURCE-(\d+)$/.exec(id)?.[1])
        .filter(Boolean).map(index => contract.management?.resources?.[Number(index) - 1]?.name).filter(Boolean));
    if (resourceNames.size) {
        const grants = (contract.management?.roles || []).map(role => ({ name: role.name,
            permissions: (role.permissions || []).filter(permission => resourceNames.has(permission.resource)) }));
        approvedDetails.push(`resource role permissions: ${JSON.stringify(grants)}`);
        approvedDetails.push('readAccess authenticated yalnız oturum gerektirir; her rol için ayrıca onaylı resource/operation iznini denetle. Boş izin listesi erişim vermez. Test fixture uçları yalnız izole test ortamında ve yetkili rol ile kullanılabilir.');
    }
    if ([...ids].some(id => id.startsWith('MGMT-ROLE-'))) {
        approvedDetails.push(`authentication: ${JSON.stringify(contract.management?.authentication || {})}`);
    }
    if ([...ids].some(id => id.startsWith('MGMT-ROLE-')) || task.managementCoverage.some(entry => entry.surface === 'ui')) {
        approvedDetails.push(`browser role journeys: ${JSON.stringify(contract.browser?.roleJourneys || [])}`);
    }
    return `${description}\n\nZorunlu yönetim kapsamı: ${obligations.join('; ')}.\nOnaylı gereksinimler: ${requirements.join(' | ')}.\nOnaylı yönetim ayrıntıları: ${approvedDetails.join(' | ')}.\nHedef dosyada bu davranışları uygula; Reviewer her kapsamı denetlemeli.`;
}
