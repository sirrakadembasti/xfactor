/**
 * XFactor Ajan JSON Şemaları ve Yapılandırılmış Çıktı Doğrulayıcıları
 * Referans: agency-agents & Archon structured execution
 */
import path from 'path';
import { normalizeGeneratedIdentifier } from '../generatedIdentifiers.js';
import { canonicalizeTaskDependencies } from '../engine/dag.js';
import { hasRoleJourneyCoverage } from '../contracts/browserJourneyContract.js';


/**
 * JSON metnindeki geçersiz kaçış dizilerini (örn: JS regex \d, \w veya tek ters bölü) onarır.
 */
function sanitizeEscapeSequences(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\\\\|\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, (match) => match === '\\\\' ? '\\\\' : '\\\\');
}

function sliceJSONBoundaries(str) {
    if (typeof str !== 'string') return str;
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    const firstBracket = str.indexOf('[');
    const lastBracket = str.lastIndexOf(']');

    let candidate = str;
    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        candidate = str.slice(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
        candidate = str.slice(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1) {
        // Açılmış ama kapanmamış JSON objesi
        candidate = str.slice(firstBrace);
    } else if (firstBracket !== -1) {
        candidate = str.slice(firstBracket);
    }
    return candidate;
}

/**
 * Kesilmiş veya kapatılmamış JSON metinlerini (Unterminated string & unclosed braces) otomatik onarır.
 */
export function repairTruncatedJSON(raw) {
    if (typeof raw !== 'string') return '';
    let str = raw.trim();
    // Hem baştaki hem sondaki markdown kod bloklarını temizle
    str = str.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let inString = false;
    let isEscaped = false;
    const stack = [];
    let cleaned = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (inString) {
            if (isEscaped) {
                cleaned += char;
                isEscaped = false;
            } else if (char === '\\') {
                cleaned += char;
                isEscaped = true;
            } else if (char === '"') {
                cleaned += char;
                inString = false;
            } else if (char === '\n') {
                cleaned += '\\n';
            } else if (char === '\r') {
                cleaned += '\\r';
            } else if (char === '\t') {
                cleaned += '\\t';
            } else {
                cleaned += char;
            }
        } else {
            cleaned += char;
            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                stack.push('}');
            } else if (char === '[') {
                stack.push(']');
            } else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }
    }

    if (inString) {
        if (isEscaped) cleaned += '\\';
        cleaned += '"';
    }

    while (stack.length > 0) {
        cleaned += stack.pop();
    }

    return sanitizeEscapeSequences(cleaned);
}
/**
 * Ham veya kaçışsız (JSX className="...", raw double quotes vb.) metinlerden dosya bloklarını eksiksiz çıkarır.
 */
export function extractCoderFilesFromText(rawText) {
    if (typeof rawText !== 'string') return null;
    const files = [];
    let summary = "Otomatik üretilen kod dosyaları";

    // 1. Summary extraction
    const sumMatch = rawText.match(/"summary"\s*:\s*"([\s\S]*?)"\s*,\s*"files"/);
    if (sumMatch) {
        summary = sumMatch[1].trim();
    } else {
        const altSum = rawText.match(/"summary"\s*:\s*"([^"]+)"/);
        if (altSum) summary = altSum[1].trim();
    }

    // 2. Deneme: Yalnızca dosya nesnesi başlangıcı olan { "path": "...", "content": "..." } bloklarını yakala
    const fileBlockRegex = /\{\s*"path"\s*:\s*["'`]([^"'`\r\n]+)["'`]\s*,\s*"content"\s*:\s*(["'`])/g;
    let match;
    const matchIndices = [];
    while ((match = fileBlockRegex.exec(rawText)) !== null) {
        matchIndices.push({
            start: match.index,
            filePath: match[1].trim(),
            contentQuote: match[2],
            contentStart: match.index + match[0].length
        });
    }

    for (let i = 0; i < matchIndices.length; i++) {
        const item = matchIndices[i];
        const nextStart = i + 1 < matchIndices.length ? matchIndices[i + 1].start : rawText.length;
        let content = rawText.slice(item.contentStart, nextStart);

        const closingPattern = new RegExp(`(?:${item.contentQuote}|["'\`])?\\s*\\}\\s*(?:,\\s*\\{?|\\]\\s*\\}?)?\\s*(\`\`\`.*)?$`);
        content = content.replace(closingPattern, '').trim();

        if (content.endsWith(item.contentQuote)) {
            content = content.slice(0, -item.contentQuote.length).trim();
        }

        if (content.includes('\\n') && !content.includes('\n')) {
            content = content
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
        }

        if (item.filePath && content) {
            files.push({ path: item.filePath, content });
        }
    }

    // 3. Fallback: Eğer "content" önce geldiyse ters sıra ile dene: { "content": "...", "path": "..." }
    if (files.length === 0) {
        const altSegments = rawText.split(/"content"\s*:\s*(["'`])/);
        for (let i = 1; i < altSegments.length; i += 2) {
            const quote = altSegments[i];
            const rest = altSegments[i + 1] || '';
            const pathIdx = rest.indexOf('"path"');
            if (pathIdx !== -1) {
                let content = rest.slice(0, pathIdx).trim();
                if (content.endsWith(quote)) content = content.slice(0, -quote.length).trim();
                if (content.endsWith(',')) content = content.slice(0, -1).trim();
                if (content.endsWith(quote)) content = content.slice(0, -quote.length).trim();

                const pathPart = rest.slice(pathIdx);
                const pathMatch = pathPart.match(/"path"\s*:\s*["'`]([^"'`\n]+)["'`]/);
                if (pathMatch && pathMatch[1]) {
                    const filePath = pathMatch[1].trim();
                    files.push({ path: filePath, content });
                }
            }
        }
    }

    if (files.length > 0) {
        return { summary, files };
    }
    return null;
}

/**
 * Aşırı bozuk veya kesilmiş LLM çıktılarından dosya bloklarını kurtarır.
 */
export function extractFilesFromRawCoderOutput(text) {
    return extractCoderFilesFromText(text);
}

/**
 * JSON bloğunu (markdown fence veya çıplak JSON) güvenle ayıklar, geçersiz kaçışları ve kesilmeleri onarır ve parse eder.
 */
export function extractAndParseJSON(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Geçersiz veya boş LLM çıktısı.');
    }

    // Baştaki ve sondaki markdown kalıntılarını temizle
    const strippedText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    // 1. Markdown ```json ... ``` bloğunu ara
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)(?:\n?```|$)/i;
    const match = text.match(jsonBlockRegex);
    const rawCandidate = match ? match[1].trim() : strippedText;

    // Deneme 1: Doğrudan parse
    try {
        return JSON.parse(rawCandidate);
    } catch (e1) {
        // Deneme 2: Kaçış dizilerini onararak parse
        try {
            return JSON.parse(sanitizeEscapeSequences(rawCandidate));
        } catch (e2) {
            // Deneme 3: { } veya [ ] sınırlarına kırpıp doğrudan parse
            const sliced = sliceJSONBoundaries(rawCandidate);
            try {
                return JSON.parse(sliced);
            } catch (e3) {
                // Deneme 4: Sınırlarına kırpılmış metnin kaçış dizilerini onararak parse
                try {
                    return JSON.parse(sanitizeEscapeSequences(sliced));
                } catch (e4) {
                    // Deneme 5: Kesilmiş / Kapatılmamış JSON onarıcısı (Unterminated string repair)
                    try {
                        return JSON.parse(repairTruncatedJSON(sliced));
                    } catch (e5) {
                        // Deneme 6: Tüm metin üzerinden tam onarım
                        try {
                            const fullSliced = sliceJSONBoundaries(strippedText);
                            return JSON.parse(repairTruncatedJSON(fullSliced));
                        } catch (e6) {
                            // Deneme 7: Coder dosya kurtarıcı (Fallback extractor)
                            const fallbackResult = extractFilesFromRawCoderOutput(text);
                            if (fallbackResult && fallbackResult.files.length > 0) {
                                return fallbackResult;
                            }

                            throw new Error(`JSON ayrıştırma hatası: ${e1.message}. Ham metin: ${text.slice(0, 150)}...`);
                        }
                    }
                }
            }
        }
    }
}

/**
 * Manager Ajanı Çıktı Şeması Doğrulaması ve Otomatik Normalizasyon
 */
export function normalizeManagerPlan(plan) {
    if (!plan || typeof plan !== 'object') {
        plan = {};
    }
    plan.summary = plan.summary || plan.title || 'Proje Mimari Planı';
    plan.talimatname = plan.talimatname || plan.spec || plan.description || '# Proje Talimatnamesi\n';
    
    let rawDomains = plan.domains || plan.domain_list || plan.subdomains || ['frontend', 'backend'];
    if (!Array.isArray(rawDomains) || rawDomains.length === 0) {
        rawDomains = ['frontend', 'backend'];
    }
    plan.domains = rawDomains.map((d, idx) => {
        if (typeof d === 'string') {
            const name = d.trim() || `domain-${idx + 1}`;
            return {
                name,
                prefix: normalizeGeneratedIdentifier(name),
                description: `${name} domaini`
            };
        }
        const name = d.name || d.prefix || `domain-${idx + 1}`;
        const prefix = normalizeGeneratedIdentifier(d.prefix || d.name || `domain-${idx + 1}`);
        return {
            name,
            prefix,
            description: d.description || `${name} geliştirme`
        };
    });

    let rawReqs = plan.requirements || plan.requirementIds || [];
    if (!Array.isArray(rawReqs) || rawReqs.length === 0) {
        rawReqs = [{ id: 'REQ-1', statement: 'Temel mimari ve modül gereksinimi', mandatory: true }];
    }
    plan.requirements = rawReqs.map((r, idx) => {
        if (typeof r === 'string') {
            return {
                id: r.trim() || `REQ-${idx + 1}`,
                statement: r.trim() || `Gereksinim ${idx + 1}`,
                mandatory: true,
                kind: 'functional',
                priority: 'high'
            };
        }
        return {
            id: r.id || `REQ-${idx + 1}`,
            statement: r.statement || r.title || r.description || `Gereksinim ${idx + 1}`,
            mandatory: r.mandatory !== undefined ? Boolean(r.mandatory) : true,
            kind: r.kind || 'functional',
            priority: r.priority || 'high'
        };
    });

    if (plan.management && typeof plan.management === 'object') {
        const management = plan.management;
        plan.requirements = plan.requirements.filter(requirement => !/^MGMT-(?:RESOURCE|ROLE)-\d+$/.test(requirement.id));
        const sectionStart = '<!-- XFACTOR_MANAGEMENT_START -->';
        const sectionEnd = '<!-- XFACTOR_MANAGEMENT_END -->';
        plan.talimatname = plan.talimatname.replace(/\n?<!-- XFACTOR_MANAGEMENT_START -->[\s\S]*?<!-- XFACTOR_MANAGEMENT_END -->/g, '').trimEnd();
        const lines = [sectionStart, '## Yönetim ve rol sözleşmesi', `Değerlendirme: ${management.needed ? 'Gerekli' : 'Gerekli değil'}. ${management.reason || ''}`];
        if (management.needed && Array.isArray(management.resources) && Array.isArray(management.roles)) {
            for (const [index, resource] of management.resources.entries()) {
                const id = `MGMT-RESOURCE-${index + 1}`;
                const fixture = resource.verification ? `; verification ${JSON.stringify(resource.verification)}` : '';
                const readAccess = resource.readAccess ? `; readAccess ${resource.readAccess}` : '';
                const deletionPolicy = resource.deletionPolicy
                    ? `; relatedData ${resource.deletionPolicy.relatedData}: ${resource.deletionPolicy.reason}${resource.deletionPolicy.retentionRule ? `; retentionRule ${resource.deletionPolicy.retentionRule}` : ''}` : '';
                const statement = `Admin UI and API for ${resource.name}: ${resource.operations.join(', ')}; UI ${resource.uiPath}; API ${resource.apiPath}${readAccess}${deletionPolicy}${fixture}; verify persistent result.`;
                plan.requirements.push({ id, statement, mandatory: true, kind: 'functional', priority: 'high' });
                lines.push(`- ${id}: ${statement}`);
            }
            for (const [index, role] of management.roles.entries()) {
                const id = `MGMT-ROLE-${index + 1}`;
                const statement = `${role.name} login, permissions and isolated demo user ${role.demoUser?.username || ''}; allowed journeys: ${(role.journeys?.positive || []).join('; ')}; denied journeys: ${(role.journeys?.negative || []).join('; ')}.`;
                plan.requirements.push({ id, statement, mandatory: true, kind: 'behavior', priority: 'high' });
                lines.push(`- ${id}: ${statement}`);
            }
        }
        lines.push(sectionEnd);
        plan.talimatname += `\n\n${lines.join('\n')}`;
    }

    return plan;
}

function validateManagementFixtureTemplates(management) {
    const resources = new Map(management.resources.map(resource => [resource.name, resource]));
    const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
    const fail = reason => { throw new Error(`management.resources.verification ${reason}`); };
    const validateBody = (body, names, allowParent) => {
        if (!plainObject(body) || !Object.keys(body).length) fail('fixture body must be a nonempty JSON object.');
        let nodes = 0;
        const walk = (value, depth = 0) => {
            if (++nodes > 2048 || depth > 20) fail('fixture body exceeds depth/node bounds.');
            if (typeof value === 'string') {
                if (value.includes('{fixture:')) {
                    const ref = value.match(/^\{fixture:([A-Za-z][A-Za-z0-9_]{0,31})\.id\}$/);
                    if (!ref || !names.has(ref[1])) fail('fixture reference must be an exact token naming an earlier setup ID.');
                    return;
                }
                if (value.includes('{date:')) {
                    const date = value.match(/^\{date:([+-]?\d{1,4})d\}$/);
                    if (!date || Math.abs(Number(date[1])) > 3650) fail('date token must be an exact bounded relative day offset.');
                    return;
                }
                let literal = value.replaceAll('{nonce}', '');
                if (allowParent) literal = literal.replaceAll('{parentId}', '');
                if (/\{[^{}]*\}/.test(literal)) fail('fixture template contains an unknown or unavailable token.');
            } else if (Array.isArray(value)) {
                for (const part of value) walk(part, depth + 1);
            } else if (plainObject(value)) {
                for (const [key, part] of Object.entries(value)) {
                    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('fixture body contains an unsafe key.');
                    walk(part, depth + 1);
                }
            } else if (value !== null && !['number', 'boolean'].includes(typeof value)) fail('fixture body must contain JSON values.');
        };
        walk(body);
        if (Buffer.byteLength(JSON.stringify(body)) > 32768) fail('fixture body exceeds 32768 bytes.');
    };
    const validateSetup = (fixture, allowParent) => {
        const names = new Set();
        if (fixture.setup === undefined) return names;
        if (!Array.isArray(fixture.setup) || fixture.setup.length > 8) fail('setup must be an array of at most 8 steps.');
        for (const step of fixture.setup) {
            const resource = resources.get(step?.resource);
            if (!plainObject(step) || Object.keys(step).some(key => !['name', 'resource', 'role', 'createPath', 'createBody'].includes(key))
                || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(step.name || '') || names.has(step.name)
                || !resource?.operations.includes('create') || step.createPath !== resource.apiPath
                || typeof step.createPath !== 'string' || !/^\/(?!\/)[A-Za-z0-9/_-]+$/.test(step.createPath)) {
                fail('setup requires unique names, declared creatable resources and their exact safe local createPath.');
            }
            const creators = management.roles.filter(role => role.permissions.some(permission =>
                permission.resource === resource.name && permission.operations.includes('create')));
            if (!creators.length || (step.role !== undefined && !creators.some(role => role.name === step.role))) {
                fail('setup role must have create permission for the declared resource.');
            }
            validateBody(step.createBody, names, allowParent);
            names.add(step.name);
        }
        return names;
    };
    for (const resource of management.resources) {
        const fixture = resource.verification;
        if (fixture === undefined) continue;
        if (!plainObject(fixture)) fail('fixture must be an object.');
        if (fixture.identityField !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fixture.identityField)) {
            fail('identityField must be a valid field name.');
        }
        const names = validateSetup(fixture, false);
        for (const body of [fixture.createBody, fixture.updateBody]) {
            if (body !== undefined) validateBody(body, names, false);
        }
        if (fixture.retention !== undefined) {
            if (!plainObject(fixture.retention)) fail('retention fixture must be an object.');
            const retentionNames = validateSetup(fixture.retention, true);
            if (fixture.retention.createBody !== undefined) validateBody(fixture.retention.createBody, retentionNames, true);
        }
    }
}

export function validateManagerPlan(plan, { requireManagement = false } = {}) {
    if (!plan || typeof plan !== 'object') {
        throw new Error('Manager planı bir nesne olmalıdır.');
    }
    if (!plan.summary || typeof plan.summary !== 'string') {
        throw new Error('Manager planında "summary" (özet) alanı zorunludur.');
    }
    if (!plan.talimatname || typeof plan.talimatname !== 'string') {
        throw new Error('Manager planında "talimatname" şartname metni zorunludur.');
    }
    if (!Array.isArray(plan.domains) || plan.domains.length === 0) {
        throw new Error('Manager planında en az 1 domain tanımlanmalıdır (örn: ["frontend", "backend"]).');
    }
    for (const domain of plan.domains) {
        const name = typeof domain === 'string' ? domain : domain.name;
        if (!name || typeof name !== 'string') {
            throw new Error('Her domain için geçerli bir "name" belirtilmelidir.');
        }
    }
    const reqs = plan.requirements || plan.requirementIds;
    if (!Array.isArray(reqs) || reqs.length === 0) {
        throw new Error('Manager planında en az bir gereksinim ("requirements" veya "requirementIds") tanımlanmalıdır.');
    }
    const management = plan.management;
    if (requireManagement || management !== undefined) {
        if (!management || typeof management !== 'object' || Array.isArray(management) || typeof management.needed !== 'boolean') {
            throw new Error('Manager planında yapılandırılmış management.needed değerlendirmesi zorunludur.');
        }
        if (typeof management.reason !== 'string' || !management.reason.trim()) {
            throw new Error('management.reason somut bir gerekçe içermelidir.');
        }
        if (management.needed) {
            const auth = management.authentication;
            if (!auth || typeof auth.login !== 'string' || !auth.login.trim()
                || typeof auth.accountProvisioning !== 'string' || !auth.accountProvisioning.trim()
                || typeof auth.publicRegistration !== 'boolean') {
                throw new Error('management.authentication login, accountProvisioning ve publicRegistration kararını içermelidir.');
            }
            if (requireManagement || auth.apiLogin !== undefined) {
                if (!auth.apiLogin || typeof auth.apiLogin.path !== 'string'
                    || !/^\/(?!\/)/.test(auth.apiLogin.path) || /\.\.|[?#\\]/.test(auth.apiLogin.path)
                    || ['identityField', 'passwordField', 'tokenField'].some(field =>
                        auth.apiLogin[field] !== undefined && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(auth.apiLogin[field]))) {
                    throw new Error('management.authentication.apiLogin güvenli yerel giriş yolunu ve geçerli alan adlarını içermelidir.');
                }
            }
            if (!Array.isArray(management.resources) || management.resources.length === 0) {
                throw new Error('management.resources en az bir yönetilen kaynağı içermelidir.');
            }
            const resourceNames = new Set();
            const allowedOperations = new Set(['create', 'read', 'update', 'delete']);
            for (const resource of management.resources) {
                if (typeof resource?.name !== 'string' || !resource.name.trim()
                    || resourceNames.has(resource.name)
                    || !Array.isArray(resource.operations) || resource.operations.length === 0
                    || resource.operations.some(op => !allowedOperations.has(op))
                    || typeof resource.uiPath !== 'string' || !/^\/(?!\/)/.test(resource.uiPath) || /\.\.|[?#\\]/.test(resource.uiPath)
                    || typeof resource.apiPath !== 'string' || !/^\/(?!\/)/.test(resource.apiPath) || /\.\.|[?#\\]/.test(resource.apiPath)) {
                    throw new Error('management.resources her kaynak için benzersiz name, operations, uiPath ve apiPath gerektirir.');
                }
                if ((requireManagement && resource.operations.includes('read')
                    && !['public', 'authenticated'].includes(resource.readAccess))
                    || (resource.readAccess !== undefined
                        && !['public', 'authenticated'].includes(resource.readAccess))) {
                    throw new Error('management.resources.readAccess must be public or authenticated for readable resources.');
                }
                const mutationFixture = resource.verification;
                const needsItemFixture = resource.operations.includes('update') || resource.operations.includes('delete');
                if (resource.operations.includes('delete') && requireManagement) {
                    const policy = resource.deletionPolicy;
                    if (!policy || !['none', 'preserve', 'cascade'].includes(policy.relatedData)
                        || typeof policy.reason !== 'string' || !policy.reason.trim()) {
                        throw new Error('management.resources.deletionPolicy requires relatedData and a concrete reason.');
                    }
                    if (policy.relatedData !== 'none') {
                        if (typeof policy.retentionRule !== 'string' || !policy.retentionRule.trim()) {
                            throw new Error('management.resources.deletionPolicy.retentionRule must describe how long or until when related records are kept or deleted.');
                        }
                        const retention = mutationFixture?.retention;
                        if (!retention || typeof retention.createPath !== 'string'
                            || !/^\/(?!\/)/.test(retention.createPath) || /\.\.|[?#\\]/.test(retention.createPath)
                            || typeof retention.itemPath !== 'string'
                            || !/^\/(?!\/)/.test(retention.itemPath) || /\.\.|[?#\\]/.test(retention.itemPath)
                            || (retention.itemPath.match(/\{id\}/g) || []).length !== 1
                            || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(retention.parentField || '')
                            || !retention.createBody || typeof retention.createBody !== 'object'
                            || Array.isArray(retention.createBody)
                            || !JSON.stringify(retention.createBody).includes('{parentId}')) {
                            throw new Error('management.resources.verification.retention requires related create/read fixtures linked to the parent ID.');
                        }
                        const transition = retention.beforeDelete;
                        if (transition && (!['POST', 'PATCH', 'PUT'].includes(transition.method)
                            || typeof transition.path !== 'string' || !/^\/(?!\/)/.test(transition.path)
                            || /\.\.|[?#\\]/.test(transition.path)
                            || (transition.path.match(/\{id\}/g) || []).length !== 1
                            || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(transition.expectedField || '')
                            || !Object.hasOwn(transition, 'expectedValue'))) {
                            throw new Error('management.resources.verification.retention.beforeDelete needs a safe transition and expected state.');
                        }
                    }
                }
                if (needsItemFixture && (requireManagement || mutationFixture !== undefined)) {
                    const deletion = mutationFixture?.deleteExpectation;
                    if (!mutationFixture || typeof mutationFixture.itemPath !== 'string'
                        || !/^\/(?!\/)/.test(mutationFixture.itemPath)
                        || /\.\.|[?#\\]/.test(mutationFixture.itemPath)
                        || (mutationFixture.itemPath.match(/\{id\}/g) || []).length !== 1
                        || (resource.operations.includes('update') && !['PATCH', 'PUT'].includes(mutationFixture.updateMethod))
                        || (resource.operations.includes('delete') && !['absent', 'field'].includes(deletion?.kind))
                        || (deletion?.kind === 'field' && (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(deletion.field || '')
                            || !Object.hasOwn(deletion, 'equals')))) {
                        throw new Error('management.resources.verification requires an item path, update method and deletion expectation.');
                    }
                }
                resourceNames.add(resource.name);
            }
            if (!Array.isArray(management.roles) || management.roles.length === 0) {
                throw new Error('management.roles en az bir rol içermelidir.');
            }
            const demoUsers = new Set();
            const roleNames = new Set();
            const credentialNames = new Set();
            for (const role of management.roles) {
                const credentialName = typeof role?.name === 'string'
                    ? role.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') : '';
                if (typeof role?.name !== 'string' || !role.name.trim()
                    || roleNames.has(role.name)
                    || !credentialName || credentialNames.has(credentialName)
                    || !Array.isArray(role.permissions) || role.permissions.length === 0
                    || role.permissions.some(permission => !resourceNames.has(permission?.resource)
                        || !Array.isArray(permission.operations)
                        || permission.operations.some(op => !allowedOperations.has(op)))) {
                    throw new Error('management.roles her rol için kaynak bazlı permissions gerektirir.');
                }
                roleNames.add(role.name);
                credentialNames.add(credentialName);
                if (typeof role.demoUser?.username !== 'string' || !role.demoUser.username.trim()
                    || demoUsers.has(role.demoUser.username)
                    || role.demoUser.setup !== 'isolated-test-seed') {
                    throw new Error('management.roles her rol için benzersiz, izole test demoUser gerektirir.');
                }
                demoUsers.add(role.demoUser.username);
                if (!Array.isArray(role.journeys?.positive) || role.journeys.positive.length === 0
                    || !Array.isArray(role.journeys?.negative) || role.journeys.negative.length === 0) {
                    throw new Error('management.roles her rol için positive ve negative journeys gerektirir.');
                }
            }
            for (const resource of management.resources) {
                for (const operation of resource.operations) {
                    if (!management.roles.some(role => role.permissions.some(permission =>
                        permission.resource === resource.name && permission.operations.includes(operation)))) {
                        throw new Error(`Uncovered management operation: ${resource.name}.${operation}`);
                    }
                }
            }
            validateManagementFixtureTemplates(management);
            if (requireManagement && !hasRoleJourneyCoverage(plan.browser?.roleJourneys,
                management.roles.map(role => role.name))) {
                throw new Error('management browser.roleJourneys requires positive and negative interactive journeys with visible outcomes for every role.');
            }
        }
    }
    return true;
}

/**
 * Director Ajanı Çıktı Şeması Doğrulaması ve Otomatik Normalizasyon
 */
export function normalizeDirectorSpec(spec, fallbackDomain = 'domain') {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        spec = {};
    }

    const domain = spec.domain || spec.name || spec.prefix || fallbackDomain;
    spec.domain = typeof domain === 'string' ? domain.trim() : fallbackDomain;

    const altTalimat = spec.altTalimatname || spec.alt_talimatname || spec.altTalimat || spec.spec || spec.talimatname || spec.description || `# ${spec.domain} Alt Şartnamesi`;
    spec.altTalimatname = typeof altTalimat === 'string' ? altTalimat : `# ${spec.domain} Alt Şartnamesi`;

    let rawTL = spec.teamleaders || spec.team_leaders || spec.teamLeaders || spec.teams || spec.leaders || spec.teamleader;
    if (!rawTL || !Array.isArray(rawTL) || rawTL.length === 0) {
        spec.teamleaders = [{
            name: `${spec.domain}.teamleader`,
            prefix: normalizeGeneratedIdentifier(spec.domain),
            mission: `${spec.domain} geliştirme`
        }];
    } else {
        spec.teamleaders = rawTL.map((tl, idx) => {
            if (typeof tl === 'string') {
                return {
                    name: tl.trim() || `${spec.domain}.teamleader-${idx + 1}`,
                    prefix: normalizeGeneratedIdentifier(spec.domain),
                    mission: `${spec.domain} geliştirme`
                };
            }
            return {
                name: tl.name || `${spec.domain}.teamleader-${idx + 1}`,
                prefix: normalizeGeneratedIdentifier(tl.prefix || spec.domain),
                mission: tl.mission || `${spec.domain} geliştirme`
            };
        });
    }

    return spec;
}

export function validateDirectorSpec(spec) {
    if (!spec || typeof spec !== 'object') {
        throw new Error('Director şartnamesi bir nesne olmalıdır.');
    }
    if (!spec.domain || typeof spec.domain !== 'string') {
        throw new Error('Director şartnamesinde "domain" zorunludur.');
    }
    if (!spec.altTalimatname || typeof spec.altTalimatname !== 'string') {
        throw new Error('Director şartnamesinde "altTalimatname" metni zorunludur.');
    }
    if (!Array.isArray(spec.teamleaders) || spec.teamleaders.length === 0) {
        throw new Error('Director şartnamesinde en az bir teamleader tanımlanmalıdır.');
    }
    for (const tl of spec.teamleaders) {
        const name = typeof tl === 'string' ? tl : tl.name;
        if (!name) {
            throw new Error('Her teamleader için "name" ve "mission" zorunludur.');
        }
    }
    return true;
}

/**
 * Teamleader Görev Ayrıştırma (Task Decomposition) Şeması Doğrulaması ve Normalizasyon
 */
export function normalizeTeamleaderTasks(taskList, approvedRequirements = [], { allowLegacyFallback = false } = {}) {
    const rawInput = Array.isArray(taskList) ? { tasks: taskList } : taskList;
    if (!rawInput || typeof rawInput !== 'object') {
        taskList = { tasks: [] };
    } else {
        taskList = rawInput;
    }

    const approvedList = (Array.isArray(approvedRequirements) ? approvedRequirements : [])
        .map(r => typeof r === 'string' ? r : r?.id)
        .filter(id => typeof id === 'string' && id.length > 0);
    const useLegacyDefaults = allowLegacyFallback && approvedList.length === 0;
    let rawTasks = taskList.tasks || taskList.taskList || taskList.subtasks || taskList.items || [];
    if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        rawTasks = useLegacyDefaults ? [{
            id: 'task-1-core-setup',
            title: 'Temel Modül ve Bileşen Kurulumu',
            description: 'Gereksinimlere uygun temel bileşenleri ve modelleri oluştur.',
            dependencies: [],
            targetFiles: ['src/App.jsx'],
            requirementIds: [approvedList[0] || 'REQ-1']
        }] : [];
    }
    taskList.tasks = rawTasks.map((t, idx) => {
        if (typeof t === 'string') {
            const id = normalizeGeneratedIdentifier(`task-${idx + 1}`);
            return {
                id,
                title: t,
                description: t,
                dependencies: idx > 0 ? [normalizeGeneratedIdentifier(`task-${idx}`)] : [],
                targetFiles: [],
                requirementIds: useLegacyDefaults ? [`REQ-${idx + 1}`] : []
            };
        }
        const id = normalizeGeneratedIdentifier(t.id || `task-${idx + 1}`);
        const canonicalDependencies = canonicalizeTaskDependencies(t.dependencies || []);
        const dependencies = [...new Set(
            canonicalDependencies.map((dep) => normalizeGeneratedIdentifier(dep))
        )].sort();
        let reqIds = Array.isArray(t.requirementIds)
            ? t.requirementIds
            : (Array.isArray(t.requirements) ? t.requirements : (t.requirementId ? [t.requirementId] : []));

        // Preserve invalid/missing approved-scope assignments so the validators
        // can reject them; normalization cannot authorize a requirement link.
        if (useLegacyDefaults && reqIds.length === 0) {
            reqIds = [`REQ-${idx + 1}`];
        }

        return {
            id,
            title: t.title || t.name || `Görev ${idx + 1}`,
            description: t.description || t.title || `Görev ${idx + 1} geliştirme`,
            dependencies,
            targetFiles: Array.isArray(t.targetFiles) ? t.targetFiles : (t.target_files || []),
            requirementIds: reqIds,
            ...(Array.isArray(t.managementCoverage) ? { managementCoverage: t.managementCoverage } : {})
        };
    });

    return taskList;
}

export function validateTeamleaderTasks(taskList) {
    const rawInput = Array.isArray(taskList) ? { tasks: taskList } : taskList;
    if (!rawInput || typeof rawInput !== 'object') {
        throw new Error('Teamleader görev listesi bir nesne veya dizi olmalıdır.');
    }
    const tasks = rawInput.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('Teamleader en az bir atomik coder görevi üretmelidir.');
    }
    for (const task of tasks) {
        const reqIds = task.requirementIds || task.requirements;
        if (!Array.isArray(reqIds) || reqIds.length === 0) {
            throw new Error(`Görev "${task.id || task.title}" için en az bir "requirementIds" belirtilmelidir.`);
        }
        if (!Array.isArray(task.targetFiles) || task.targetFiles.length !== 1 || typeof task.targetFiles[0] !== 'string' || !task.targetFiles[0].trim()) {
            throw new Error(`Görev "${task.id || task.title}" atomik tek dosya sözleşmesi için tam olarak bir hedef dosya içermelidir.`);
        }
    }
    return true;
}
/**
 * Coder Ajanı Çok Dosyalı Kod Üretim Çıktısı Doğrulaması
 */
export function validateCoderFiles(codeOutput, allowedTargetFiles = null) {
    const files = Array.isArray(codeOutput)
        ? codeOutput
        : (codeOutput && Array.isArray(codeOutput.files) ? codeOutput.files : null);

    if (!files || files.length === 0) {
        throw new Error('Coder en az bir dosya ("files" dizisi) üretmelidir.');
    }
    const seenPaths = new Set();
    const allowedSet = Array.isArray(allowedTargetFiles) && allowedTargetFiles.length > 0
        ? new Set(allowedTargetFiles.map(p => path.normalize(p).replace(/\\/g, '/')))
        : null;

    for (const f of files) {
        if (!f || !f.path || typeof f.path !== 'string') {
            throw new Error('Her dosya için geçerli bir "path" (dosya yolu) zorunludur.');
        }
        const normPath = path.normalize(f.path).replace(/\\/g, '/');
        if (seenPaths.has(normPath)) {
            throw new Error(`Coder çıktısında yinelenen dosya yolu tespit edildi: "${f.path}".`);
        }
        seenPaths.add(normPath);

        if (allowedSet && !allowedSet.has(normPath)) {
            throw new Error(`Coder çıktısındaki "${f.path}" dosyası görevin hedef dosya sözleşmesinde (allowlist: ${allowedTargetFiles.join(', ')}) yer almıyor.`);
        }

        if (typeof f.content !== 'string') {
            throw new Error(`"${f.path}" dosyası için içerik ("content") metin olmalıdır.`);
        }
    }
    return true;
}

/**
 * Reviewer ve Tester Değerlendirme Şeması Doğrulaması ve Normalizasyon
 */
export function normalizeReviewResult(review) {
    if (!review || typeof review !== 'object') {
        review = {};
    }
    const hasExplicitBool = typeof review.approved === 'boolean';
    const isApprovedTrue = hasExplicitBool
        ? review.approved
        : (typeof review.approved === 'string' && ['true', 'approved', 'onaylandı', 'başarılı'].includes(review.approved.trim().toLowerCase()));

    const hasIssues = (Array.isArray(review.issues) && review.issues.length > 0) || (typeof review.feedback === 'string' && review.feedback.trim().length > 0 && !isApprovedTrue);

    review.approved = Boolean(isApprovedTrue && !hasIssues);
    review.summary = review.summary || review.feedback || review.message || (review.approved ? 'İnceleme başarıyla onaylandı.' : 'Düzeltme gerekli.');
    return review;
}

export function validateReviewResult(review) {
    if (!review || typeof review !== 'object') {
        throw new Error('İnceleme çıktısı bir nesne olmalıdır.');
    }
    if (typeof review.approved !== 'boolean') {
        throw new Error('İnceleme sonucunda "approved" boolean alanı zorunludur.');
    }
    if (!review.summary || typeof review.summary !== 'string') {
        throw new Error('İnceleme sonucunda "summary" metni zorunludur.');
    }
    return true;
}

export const normalizeTesterReport = normalizeReviewResult;
export const validateTesterReport = validateReviewResult;

/**
 * Görev bağımlılıklarını (DAG) döngüsel bağımlılık, eksik referans ve self-loop'lara karşı doğrular.
 */
export function validateTaskDependencies(tasks = [], { platform = process.platform } = {}) {
    const errors = [];
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { valid: false, errors: ['Görev listesi boş olamaz.'] };
    }

    const taskIds = new Set();
    for (const t of tasks) {
        if (!t?.id || typeof t.id !== 'string') {
            errors.push('Tüm görevlerin geçerli bir "id" değeri olmalıdır.');
            continue;
        }
        if (taskIds.has(t.id)) {
            errors.push(`Yinelenen görev ID'si tespit edildi: "${t.id}".`);
        }
        taskIds.add(t.id);
    }

    const dependencyIdsByTaskId = new Map();
    for (const t of tasks) {
        if (!t?.id) continue;
        try {
            dependencyIdsByTaskId.set(t.id, canonicalizeTaskDependencies(t.dependencies || []));
        } catch (error) {
            errors.push(`Görev "${t.id}" için geçersiz bağımlılıklar: ${error.message}`);
            dependencyIdsByTaskId.set(t.id, []);
        }
    }

    // Bağımlılık referans ve self-loop kontrolleri
    for (const t of tasks) {
        if (!t?.id) continue;
        const deps = dependencyIdsByTaskId.get(t.id) || [];
        for (const dep of deps) {
            if (dep === t.id) {
                errors.push(`Görev "${t.id}" kendine bağımlı (Self-loop) olamaz.`);
            }
            if (!taskIds.has(dep)) {
                errors.push(`Tanımsız bağımlılık referansı: "${t.id}" -> "${dep}".`);
            }
        }
    }

    // Döngüsel bağımlılık (Cycle Detection) kontrolü via Kahn's Algorithm
    const inDegree = new Map();
    const adjList = new Map();

    for (const t of tasks) {
        if (!t?.id) continue;
        inDegree.set(t.id, 0);
        adjList.set(t.id, []);
    }

    for (const t of tasks) {
        if (!t?.id) continue;
        const deps = dependencyIdsByTaskId.get(t.id) || [];
        for (const dep of deps) {
            if (taskIds.has(dep) && dep !== t.id) {
                adjList.get(dep).push(t.id);
                inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
            }
        }
    }

    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
        const u = queue.shift();
        visitedCount++;
        for (const v of adjList.get(u) || []) {
            inDegree.set(v, inDegree.get(v) - 1);
            if (inDegree.get(v) === 0) queue.push(v);
        }
    }

    if (visitedCount < taskIds.size) {
        errors.push('Döngüsel bağımlılık (Cycle) tespit edildi. Görevler tamamlanamaz.');
    }

    // Shared files are safe only when every owner pair is ordered by the DAG,
    // including transitive dependencies. Compare filesystem identities rather
    // than case-sensitive display paths on Windows.
    const dependsOn = (taskId, otherId) => {
        const pending = [...(dependencyIdsByTaskId.get(taskId) || [])];
        const seen = new Set();
        while (pending.length) {
            const dependencyId = pending.pop();
            if (dependencyId === otherId) return true;
            if (seen.has(dependencyId)) continue;
            seen.add(dependencyId);
            pending.push(...(dependencyIdsByTaskId.get(dependencyId) || []));
        }
        return false;
    };
    const fileOwnerMap = new Map();
    for (const t of tasks) {
        if (!t?.id) continue;
        const targets = Array.isArray(t.targetFiles) ? t.targetFiles : [];
        for (const file of targets) {
            if (typeof file !== 'string') continue;
            const normFile = (platform === 'win32' ? path.win32 : path.posix).normalize(file).replace(/\\/g, '/');
            const fileKey = platform === 'win32' ? normFile.toLowerCase() : normFile;
            const owners = fileOwnerMap.get(fileKey) || [];
            for (const prevTask of owners) {
                if (prevTask !== t.id && !dependsOn(t.id, prevTask) && !dependsOn(prevTask, t.id)) {
                    errors.push(`Bağımsız görevler arasında dosya sahipliği çakışması: "${normFile}" dosyası hem "${prevTask}" hem de "${t.id}" tarafından hedefleniyor.`);
                }
            }
            if (!owners.includes(t.id)) owners.push(t.id);
            fileOwnerMap.set(fileKey, owners);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Güvenilmeyen kullanıcı log veya rapor içeriklerindeki prompt ayrıştırıcılarını temizler.
 */
export function escapePromptDelimiters(rawText) {
    if (typeof rawText !== 'string') return '';
    return rawText
        .replace(/<<<UNTRUSTED_/g, '<<<_ESCAPED_UNTRUSTED_')
        .replace(/>>>/g, '___>>>');
}

/**
 * Güvenilmeyen kullanıcı verisini belirteçler (delimiters) ile izole prompt bloğuna sarar.
 */
export function formatUntrustedPromptContext(label, content) {
    const safeLabel = (label || 'DATA').replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    const escapedContent = escapePromptDelimiters(content || '');
    return `<<<UNTRUSTED_${safeLabel}_BEGIN>>>\n${escapedContent}\n<<<UNTRUSTED_${safeLabel}_END>>>`;
}
