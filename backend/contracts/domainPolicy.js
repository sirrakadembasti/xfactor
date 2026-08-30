const KNOWN_TEMPLATE_CONTAMINANTS = [
    'rent-a-car',
    'acmecarrental',
    'carrental',
    'acmecorp',
    'examplecorp',
    'template-app',
    'boilerplate-demo'
];

const STUB_PATTERNS = [
    { pattern: /\/\/\s*TODO:\s*implement/i, reason: 'Contains unfulfilled "// TODO: implement" placeholder.' },
    { pattern: /not implemented(?: yet)?/i, reason: 'Contains "not implemented" error/placeholder message.' },
    { pattern: /function\s+[a-zA-Z0-9_$]+\s*\([^)]*\)\s*\{\s*return\s+null;\s*\}/, reason: 'Function returns literal null without implementation.' },
    { pattern: /res\.json\(\s*\{\s*message:\s*['"]not implemented['"]\s*\}\s*\)/i, reason: 'API handler returns static "not implemented" payload.' }
];

export function extractDomainElements(contract = {}) {
    const domains = Array.isArray(contract.domains) ? contract.domains : [];
    return domains.map(d => {
        const name = typeof d === 'string' ? d : (d.name || '');
        const prefix = typeof d === 'string' ? d : (d.prefix || d.name || '');
        const description = typeof d === 'string' ? '' : (d.description || '');

        return {
            domain: name,
            prefix,
            description,
            models: [`${name.charAt(0).toUpperCase() + name.slice(1)}Model`],
            endpoints: [`/api/${prefix}`]
        };
    });
}

export function checkTemplateContamination(filePath, content, allowedVocabulary = []) {
    if (!content || typeof content !== 'string') {
        return { contaminated: false, contaminants: [] };
    }

    const allowedSet = new Set(allowedVocabulary.map(w => String(w).toLowerCase()));
    const lowerContent = content.toLowerCase();
    const contaminants = [];

    for (const brand of KNOWN_TEMPLATE_CONTAMINANTS) {
        if (!allowedSet.has(brand) && lowerContent.includes(brand)) {
            contaminants.push(brand);
        }
    }

    return {
        contaminated: contaminants.length > 0,
        contaminants
    };
}

export function isStubOrSkeleton(content, extension = '') {
    if (!content || typeof content !== 'string') {
        return { isStub: false, reasons: [] };
    }

    const reasons = [];
    for (const { pattern, reason } of STUB_PATTERNS) {
        if (pattern.test(content)) {
            reasons.push(reason);
        }
    }

    return {
        isStub: reasons.length > 0,
        reasons
    };
}

export function verifyDomainCompliance(contract = {}, files = []) {
    const issues = [];
    const domainEntities = Array.isArray(contract.domainEntities)
        ? contract.domainEntities
        : (Array.isArray(contract.entities) ? contract.entities : []);

    const requiredEndpoints = Array.isArray(contract.requiredEndpoints)
        ? contract.requiredEndpoints
        : (Array.isArray(contract.endpoints) ? contract.endpoints : []);

    const scriptFiles = files.filter(f => f.path && /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(f.path));

    if (domainEntities.length > 0) {
        const prismaFile = files.find(f => f.path && (f.path.endsWith('schema.prisma') || f.path.includes('schema.prisma')));
        const prismaContent = prismaFile ? prismaFile.content : '';

        const modelRegex = /model\s+([A-Za-z0-9_]+)\s*\{/g;
        const declaredModels = new Set();
        let match;
        while ((match = modelRegex.exec(prismaContent)) !== null) {
            declaredModels.add(match[1].toLowerCase());
        }

        for (const entity of domainEntities) {
            const entityName = typeof entity === 'string' ? entity : (entity.name || String(entity));
            if (!declaredModels.has(entityName.toLowerCase())) {
                issues.push(`Missing database model: ${entityName}`);
            }
        }

        // Verify entity queries in script files
        const queriedModels = new Set();
        const prismaQueryRegex = /prisma\s*\.\s*([a-zA-Z0-9_]+)/g;

        for (const script of scriptFiles) {
            const content = script.content || '';
            let queryMatch;
            while ((queryMatch = prismaQueryRegex.exec(content)) !== null) {
                queriedModels.add(queryMatch[1].toLowerCase());
            }
        }

        for (const entity of domainEntities) {
            const entityName = typeof entity === 'string' ? entity : (entity.name || String(entity));
            const lowerName = entityName.toLowerCase();
            if (declaredModels.has(lowerName) && !queriedModels.has(lowerName)) {
                issues.push(`Entity ${entityName} is declared but never queried in source code`);
            }
        }
    }

    if (requiredEndpoints.length > 0) {
        const implementedRoutes = new Set();
        const routeRegex = /(?:router|app)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

        for (const script of scriptFiles) {
            const content = script.content || '';
            let routeMatch;
            while ((routeMatch = routeRegex.exec(content)) !== null) {
                const method = routeMatch[1].toUpperCase();
                const routePath = routeMatch[2].trim();
                implementedRoutes.add(`${method} ${routePath}`);
            }
        }

        for (const reqEndpoint of requiredEndpoints) {
            let endpointStr = '';
            if (typeof reqEndpoint === 'string') {
                const parts = reqEndpoint.trim().split(/\s+/);
                if (parts.length >= 2) {
                    endpointStr = `${parts[0].toUpperCase()} ${parts.slice(1).join(' ').trim()}`;
                } else {
                    endpointStr = `GET ${parts[0] || ''}`.trim();
                }
            } else if (reqEndpoint && typeof reqEndpoint === 'object') {
                const method = (reqEndpoint.method || 'GET').toUpperCase();
                const routePath = (reqEndpoint.path || reqEndpoint.url || '').trim();
                endpointStr = `${method} ${routePath}`;
            }

            if (endpointStr && !implementedRoutes.has(endpointStr)) {
                issues.push(`Required endpoint ${endpointStr} has no implementation route`);
            }
        }
    }

    return {
        passed: issues.length === 0,
        issues
    };
}
