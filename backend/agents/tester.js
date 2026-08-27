import path from 'path';
import { parse } from '@babel/parser';
import { extractAndParseJSON, validateReviewResult, normalizeReviewResult } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_TESTER_PROMPT = `
Sen bir "Tester" (QA / Test) ajanısın (tester.agent).
Görevin, üretilen projenin veya kod modülünün çalışabilirliğini, sınır durumlarını ve fonksiyonel gereksinimlerini doğrulamaktır.

MİSYON:
1. Üretilen dosyaları, deterministik denetim sonuçlarını ve proje talimatnamesindeki kabul kriterlerini karşılaştır.
2. Fonksiyonel gereksinimlerin ve şema/API bütünlüğünün karşılandığını doğrula.
3. Çıktını KESİNLİKLE aşağıdaki JSON formatında döndür.

JSON ÇIKTI ŞEMASI:
{
  "approved": true,
  "summary": "Test ve doğrulama özeti",
  "passedCount": 5,
  "failedCount": 0,
  "issues": [],
  "notes": "Tüm kabul kriterleri başarıyla doğrulandı."
`;
export const TESTER_SYSTEM_PROMPT = loadAgentPromptFromDocs('tester', FALLBACK_TESTER_PROMPT);


const AUTH_FUNCTION_NAMES = new Set(['getCurrentUser', 'getUser', 'requireUser']);
const SECRET_ENV_NAME_RE = /(?:SECRET|TOKEN|PASSWORD|API_KEY)/;

const PRISMA_DATABASE_URL_PREFIXES = {
    sqlite: ['file:'],
    postgresql: ['postgresql://', 'postgres://'],
    cockroachdb: ['postgresql://', 'postgres://'],
    mysql: ['mysql://'],
    sqlserver: ['sqlserver://'],
    mongodb: ['mongodb://', 'mongodb+srv://']
};

function buildScriptParseIssue(filePath, error) {
    const message = error?.message ? String(error.message).replace(/\s+/g, ' ').trim() : 'Bilinmeyen parser hatası';
    return `Sözdizimi Hatası: "${filePath}" dosyası Babel parser tarafından çözümlenemedi -> ${message}`;
}

function getScriptParseRecord(file, cache) {
    if (!file?.path || typeof file.content !== 'string') return null;

    const cached = cache.get(file.path);
    if (cached && cached.content === file.content) return cached;

    const record = {
        content: file.content,
        ast: null,
        error: null,
        reported: false
    };

    try {
        record.ast = parseScriptAst(file.content, file.path);
    } catch (error) {
        record.error = error;
    }

    cache.set(file.path, record);
    return record;
}

function readEnvAssignments(generatedFiles) {
    const values = new Map();
    for (const file of generatedFiles) {
        if (!['.env', '.env.example'].includes(file?.path) || typeof file.content !== 'string') continue;
        for (const line of file.content.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
            if (!match) continue;
            values.set(match[1], match[2].replace(/^['"]|['"]$/g, ''));
        }
    }
    return values;
}

function getScriptParsePlugins(filePath = '') {
    const lower = typeof filePath === 'string' ? filePath.toLowerCase() : '';
    const plugins = [];
    if (lower.endsWith('.jsx') || lower.endsWith('.tsx') || lower.endsWith('.js')) plugins.push('jsx');
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) plugins.push('typescript');
    return plugins;
}

function parseScriptAst(content, filePath) {
    return parse(content, {
        sourceType: 'unambiguous',
        plugins: getScriptParsePlugins(filePath)
    });
}

function walkAst(node, visitor, parent = null, key = null) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index++) {
            walkAst(node[index], visitor, parent, key);
        }
        return;
    }

    if (typeof node.type !== 'string') {
        for (const value of Object.values(node)) {
            walkAst(value, visitor, parent, key);
        }
        return;
    }

    visitor(node, parent, key);

    for (const prop of Object.keys(node)) {
        if (
            prop === 'type'
            || prop === 'start'
            || prop === 'end'
            || prop === 'loc'
            || prop === 'range'
            || prop === 'extra'
            || prop === 'leadingComments'
            || prop === 'innerComments'
            || prop === 'trailingComments'
            || prop === 'comments'
        ) {
            continue;
        }

        const value = node[prop];
        if (!value || typeof value !== 'object') continue;
        walkAst(value, visitor, node, prop);
    }
}

function isScriptFilePath(filePath) {
    return typeof filePath === 'string' && /\.(?:[cm]?[jt]sx?)$/.test(filePath);
}

function isIdentifierNamed(node, name) {
    return !!node && node.type === 'Identifier' && node.name === name;
}

function unwrapExpression(node) {
    let current = node;
    while (
        current
        && typeof current === 'object'
        && (
            current.type === 'ChainExpression'
            || current.type === 'ParenthesizedExpression'
            || current.type === 'TSAsExpression'
            || current.type === 'TSTypeAssertion'
            || current.type === 'TypeCastExpression'
        )
    ) {
        current = current.expression;
    }
    return current;
}
function isSecretEnvMember(node) {
    const access = unwrapExpression(node);
    if (!access || (access.type !== 'MemberExpression' && access.type !== 'OptionalMemberExpression') || access.computed) return null;
    const envAccess = unwrapExpression(access.object);
    if (!envAccess || (envAccess.type !== 'MemberExpression' && envAccess.type !== 'OptionalMemberExpression') || envAccess.computed) return null;
    if (!isIdentifierNamed(envAccess.object, 'process')) return null;
    if (!isIdentifierNamed(envAccess.property, 'env')) return null;
    return access.property?.type === 'Identifier' && SECRET_ENV_NAME_RE.test(access.property.name) ? access : null;
}

function isInterpolationFreeTemplateLiteral(node) {
    return !!node && node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && node.expressions.length === 0;
}

function describeFallbackNode(node) {
    const unwrapped = unwrapExpression(node);
    if (!unwrapped) return 'fallback';
    if (unwrapped.type === 'StringLiteral' || (unwrapped.type === 'Literal' && typeof unwrapped.value === 'string')) {
        return JSON.stringify(unwrapped.value);
    }
    if (isInterpolationFreeTemplateLiteral(unwrapped)) {
        return '`...`';
    }
    return unwrapped.type;
}

function buildSecretFallbackIssue(envName, operator, fallbackNode) {
    return `Güvensiz fallback tespit edildi: process.env.${envName} ${operator} ${describeFallbackNode(fallbackNode)}.`;
}

function getSecretFallbackMatch(node) {
    const logical = unwrapExpression(node);
    if (!logical || logical.type !== 'LogicalExpression') return null;
    if (logical.operator !== '||' && logical.operator !== '??') return null;
    const envMember = isSecretEnvMember(logical.left);
    if (!envMember) return null;
    const fallbackNode = unwrapExpression(logical.right);
    if (!(
        fallbackNode?.type === 'StringLiteral'
        || (fallbackNode?.type === 'Literal' && typeof fallbackNode.value === 'string')
        || isInterpolationFreeTemplateLiteral(fallbackNode)
    )) {
        return null;
    }

    return {
        envName: envMember.property.name,
        operator: logical.operator,
        fallbackNode
    };
}

function isMemberExpressionNamed(node, objectName, propertyName) {
    const member = unwrapExpression(node);
    if (!member || (member.type !== 'MemberExpression' && member.type !== 'OptionalMemberExpression') || member.computed) return false;
    return isIdentifierNamed(member.object, objectName) && member.property?.type === 'Identifier' && member.property.name === propertyName;
}

function isPrismaUserFindFirstCall(node) {
    const call = unwrapExpression(node);
    if (!call || (call.type !== 'CallExpression' && call.type !== 'OptionalCallExpression')) return false;
    const callee = unwrapExpression(call.callee);
    if (!callee || (callee.type !== 'MemberExpression' && callee.type !== 'OptionalMemberExpression') || callee.computed) return false;
    if (callee.property?.type !== 'Identifier' || callee.property.name !== 'findFirst') return false;
    return isMemberExpressionNamed(callee.object, 'prisma', 'user');
}

function collectPatternBindingNames(pattern, names) {
    if (!pattern || typeof pattern !== 'object') return;

    if (pattern.type === 'Identifier') {
        names.add(pattern.name);
        return;
    }

    if (pattern.type === 'AssignmentPattern') {
        collectPatternBindingNames(pattern.left, names);
        return;
    }

    if (pattern.type === 'RestElement') {
        collectPatternBindingNames(pattern.argument, names);
        return;
    }

    if (pattern.type === 'ObjectPattern') {
        for (const prop of pattern.properties || []) {
            if (prop.type === 'RestElement') {
                collectPatternBindingNames(prop.argument, names);
                continue;
            }
            if (prop.type === 'ObjectProperty') {
                collectPatternBindingNames(prop.value, names);
            }
        }
        return;
    }

    if (pattern.type === 'ArrayPattern') {
        for (const element of pattern.elements || []) {
            collectPatternBindingNames(element, names);
        }
        return;
    }

    if (pattern.type === 'TSParameterProperty') {
        collectPatternBindingNames(pattern.parameter, names);
        return;
    }

    if (pattern.type === 'TSAsExpression' || pattern.type === 'TSTypeAssertion' || pattern.type === 'TypeCastExpression' || pattern.type === 'ParenthesizedExpression') {
        collectPatternBindingNames(pattern.expression, names);
    }
}

function isFunctionNode(node) {
    return !!node && (
        node.type === 'FunctionDeclaration'
        || node.type === 'FunctionExpression'
        || node.type === 'ArrowFunctionExpression'
    );
}

function getFunctionParameterNames(functionNode) {
    const names = new Set();
    for (const param of functionNode?.params || []) {
        collectPatternBindingNames(param, names);
    }
    return names;
}

function collectImmediateScopeBindingNames(rootNode) {
    const names = new Set();

    const visit = current => {
        if (!current || typeof current !== 'object') return;
        if (Array.isArray(current)) {
            for (const item of current) visit(item);
            return;
        }
        if (typeof current.type !== 'string') {
            for (const value of Object.values(current)) visit(value);
            return;
        }
        if (current !== rootNode && isFunctionNode(current)) {
            if (current.type === 'FunctionDeclaration' && current.id?.type === 'Identifier') {
                names.add(current.id.name);
            }
            return;
        }

        if (current.type === 'VariableDeclarator') {
            collectPatternBindingNames(current.id, names);
        } else if (current.type === 'FunctionDeclaration' && current.id?.type === 'Identifier') {
            names.add(current.id.name);
        } else if (current.type === 'ClassDeclaration' && current.id?.type === 'Identifier') {
            names.add(current.id.name);
        } else if (current.type === 'CatchClause' && current.param) {
            collectPatternBindingNames(current.param, names);
        }

        for (const prop of Object.keys(current)) {
            if (
                prop === 'type'
                || prop === 'start'
                || prop === 'end'
                || prop === 'loc'
                || prop === 'range'
                || prop === 'extra'
                || prop === 'leadingComments'
                || prop === 'innerComments'
                || prop === 'trailingComments'
                || prop === 'comments'
            ) {
                continue;
            }

            const value = current[prop];
            if (!value || typeof value !== 'object') continue;
            visit(value);
        }
    };

    visit(rootNode);
    return names;
}

function isCallerDerivedValue(node, parameterNames, shadowedNames) {
    const current = unwrapExpression(node);
    if (!current) return false;
    if (current.type === 'Identifier') {
        return parameterNames.has(current.name) && !shadowedNames.has(current.name);
    }
    if (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
        if (current.computed || current.property?.type !== 'Identifier') return false;
        return isCallerDerivedValue(current.object, parameterNames, shadowedNames);
    }
    if (current.type === 'ConditionalExpression') {
        return isCallerDerivedValue(current.consequent, parameterNames, shadowedNames) && isCallerDerivedValue(current.alternate, parameterNames, shadowedNames);
    }
    if (current.type === 'LogicalExpression') {
        return isCallerDerivedValue(current.left, parameterNames, shadowedNames) && isCallerDerivedValue(current.right, parameterNames, shadowedNames);
    }
    return false;
}

function hasIdentityBoundWhere(node, parameterNames, shadowedNames) {
    const current = unwrapExpression(node);
    if (!current) return false;

    if (current.type === 'ObjectExpression') {
        let hasIdentity = false;
        const seenKeys = new Set();

        for (const prop of current.properties || []) {
            if (prop.type === 'SpreadElement') {
                return false;
            }
            if (prop.type !== 'ObjectProperty') return false;
            if (prop.computed) return false;

            const key = prop.key;
            const keyName = key?.type === 'Identifier'
                ? key.name
                : key?.type === 'StringLiteral' || key?.type === 'Literal'
                    ? String(key.value)
                    : null;
            if (!keyName) return false;
            if (seenKeys.has(keyName)) return false;
            seenKeys.add(keyName);

            if (keyName === 'NOT') {
                return false;
            }

            if (keyName === 'id') {
                if (!isCallerDerivedValue(prop.value, parameterNames, shadowedNames)) return false;
                hasIdentity = true;
                continue;
            }

            if (keyName === 'OR' || keyName === 'AND') {
                const branches = unwrapExpression(prop.value);
                if (!branches || branches.type !== 'ArrayExpression' || branches.elements.length === 0) return false;
                if (!branches.elements.every(branch => hasIdentityBoundWhere(branch, parameterNames, shadowedNames))) return false;
                hasIdentity = true;
                continue;
            }

            if (hasIdentityBoundWhere(prop.value, parameterNames, shadowedNames)) {
                hasIdentity = true;
            }
        }
        return hasIdentity;
    }

    if (current.type === 'ArrayExpression') {
        return current.elements.length > 0 && current.elements.every(element => hasIdentityBoundWhere(element, parameterNames, shadowedNames));
    }

    if (current.type === 'ConditionalExpression') {
        return hasIdentityBoundWhere(current.consequent, parameterNames, shadowedNames) && hasIdentityBoundWhere(current.alternate, parameterNames, shadowedNames);
    }

    if (current.type === 'LogicalExpression') {
        return hasIdentityBoundWhere(current.left, parameterNames, shadowedNames) && hasIdentityBoundWhere(current.right, parameterNames, shadowedNames);
    }

    return false;
}

function callHasIdentityBoundWhere(callNode, parameterNames, shadowedNames) {
    const call = unwrapExpression(callNode);
    if (!call || (call.type !== 'CallExpression' && call.type !== 'OptionalCallExpression')) return false;
    const unwrappedArg = unwrapExpression(call.arguments?.[0]);
    if (!unwrappedArg || unwrappedArg.type !== 'ObjectExpression') return false;

    const whereProps = [];
    for (const prop of unwrappedArg.properties || []) {
        if (prop.type === 'SpreadElement') return false;
        if (prop.type !== 'ObjectProperty' || prop.computed) return false;

        const key = prop.key;
        const keyName = key?.type === 'Identifier'
            ? key.name
            : key?.type === 'StringLiteral' || key?.type === 'Literal'
                ? String(key.value)
                : null;
        if (!keyName) return false;
        if (keyName === 'where') whereProps.push(prop);
    }

    if (whereProps.length !== 1) return false;
    return hasIdentityBoundWhere(whereProps[0].value, parameterNames, shadowedNames);
}

function getDeclarationName(node, parent) {
    if (!node) return null;
    if (node.type === 'FunctionDeclaration') {
        const name = node.id?.type === 'Identifier' ? node.id.name : null;
        return name && AUTH_FUNCTION_NAMES.has(name) ? name : null;
    }

    if (node.type === 'FunctionExpression') {
        const explicitName = node.id?.type === 'Identifier' ? node.id.name : null;
        if (explicitName && AUTH_FUNCTION_NAMES.has(explicitName)) return explicitName;
        if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier' && AUTH_FUNCTION_NAMES.has(parent.id.name)) {
            return parent.id.name;
        }
        return null;
    }

    if (node.type === 'ArrowFunctionExpression' && parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
        return AUTH_FUNCTION_NAMES.has(parent.id.name) ? parent.id.name : null;
    }

    return null;
}

function collectAuthFunctionNodes(ast) {
    const functions = [];
    walkAst(ast, (node, parent) => {
        const name = getDeclarationName(node, parent);
        if (name) functions.push({ name, node });
    });
    return functions;
}

function walkAuthFunctionBody(rootNode, visitor, parameterNames, shadowedNames) {
    const visit = (current, currentShadowed = shadowedNames, parent = null, key = null) => {
        if (!current || typeof current !== 'object') return;
        if (Array.isArray(current)) {
            for (let index = 0; index < current.length; index++) {
                visit(current[index], currentShadowed, parent, key);
            }
            return;
        }
        if (typeof current.type !== 'string') {
            for (const value of Object.values(current)) {
                visit(value, currentShadowed, parent, key);
            }
            return;
        }
        if (current !== rootNode && isFunctionNode(current)) {
            const nestedName = getDeclarationName(current, parent);
            if (nestedName) return;

            const nestedShadowed = new Set(currentShadowed);
            for (const name of getFunctionParameterNames(current)) nestedShadowed.add(name);
            for (const name of collectImmediateScopeBindingNames(current.body)) nestedShadowed.add(name);
            visit(current.body, nestedShadowed, current, 'body');
            return;
        }

        visitor(current, parent, key, parameterNames, currentShadowed);

        for (const prop of Object.keys(current)) {
            if (
                prop === 'type'
                || prop === 'start'
                || prop === 'end'
                || prop === 'loc'
                || prop === 'range'
                || prop === 'extra'
                || prop === 'leadingComments'
                || prop === 'innerComments'
                || prop === 'trailingComments'
                || prop === 'comments'
            ) {
                continue;
            }

            const value = current[prop];
            if (!value || typeof value !== 'object') continue;
            visit(value, currentShadowed, current, prop);
        }
    };

    visit(rootNode, shadowedNames);
}

function inspectAuthFunctionNode(filePath, functionName, functionNode, issues) {
    const body = functionNode.body;
    if (!body) return 0;

    const parameterNames = getFunctionParameterNames(functionNode);
    const rootShadowedNames = collectImmediateScopeBindingNames(body);
    let count = 0;

    walkAuthFunctionBody(body, (node, parent, key, activeParameterNames, activeShadowedNames) => {
        if (isPrismaUserFindFirstCall(node) && !callHasIdentityBoundWhere(node, activeParameterNames, activeShadowedNames)) {
            issues.push(buildIdentityFreeUserIssue(filePath, functionName));
            count++;
        }
    }, parameterNames, rootShadowedNames);

    return count;
}

function getPrismaDatasourceDefinitions(content) {
    const definitions = [];
    for (const match of content.matchAll(/datasource\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g)) {
        const blockContent = match[2];
        const providerMatch = blockContent.match(/provider\s*=\s*["']([^"']+)["']/);
        const urlMatch = blockContent.match(/url\s*=\s*env\(\s*["']([^"']+)["']\s*\)/);
        definitions.push({
            name: match[1],
            provider: providerMatch ? providerMatch[1].toLowerCase() : '',
            urlEnvName: urlMatch ? urlMatch[1] : ''
        });
    }
    return definitions;
}

function isCompatibleDatabaseUrl(provider, databaseUrl) {
    const prefixes = PRISMA_DATABASE_URL_PREFIXES[provider];
    return Array.isArray(prefixes) && prefixes.some(prefix => databaseUrl.startsWith(prefix));
}

function buildIdentityFreeUserIssue(filePath, functionName) {
    return `Güvensiz varsayılan kullanıcı sorgusu tespit edildi: "${filePath}" içindeki ${functionName} identity-bound id lookup olmadan prisma.user.findFirst kullanıyor.`;
}

function buildProviderMismatchIssue(provider, databaseUrl, datasourceName) {
    return `Uyumsuz provider/DATABASE_URL eşleşmesi: datasource "${datasourceName}" için provider="${provider}" ve DATABASE_URL="${databaseUrl}" geçersiz.`;
}

function collectEnvProviderAudit(generatedFiles, issues) {
    const envAssignments = readEnvAssignments(generatedFiles);
    const databaseUrl = envAssignments.get('DATABASE_URL');
    if (!databaseUrl) return 0;

    let count = 0;
    for (const file of generatedFiles) {
        if (!file?.path || !file.path.endsWith('schema.prisma') || typeof file.content !== 'string') continue;
        for (const datasource of getPrismaDatasourceDefinitions(file.content)) {
            if (datasource.urlEnvName !== 'DATABASE_URL') continue;
            if (!datasource.provider) continue;
            if (!isCompatibleDatabaseUrl(datasource.provider, databaseUrl)) {
                issues.push(buildProviderMismatchIssue(datasource.provider, databaseUrl, datasource.name));
                count++;
            }
        }
    }
    return count;
}

function collectRawAuthAudit(generatedFiles, issues, scriptParseCache) {
    let count = 0;
    for (const file of generatedFiles) {
        if (!isScriptFilePath(file?.path) || typeof file.content !== 'string') continue;

        const record = getScriptParseRecord(file, scriptParseCache);
        if (!record || record.error) continue;

        walkAst(record.ast, node => {
            const fallback = getSecretFallbackMatch(node);
            if (!fallback) return;
            issues.push(buildSecretFallbackIssue(fallback.envName, fallback.operator, fallback.fallbackNode));
            count++;
        });

        for (const authFunction of collectAuthFunctionNodes(record.ast)) {
            count += inspectAuthFunctionNode(file.path, authFunction.name, authFunction.node, issues);
        }
    }
    return count;
}

/**
 * Üretilen projede deterministik şema, JSON ve sözdizimi denetimi yapar
 */
export function runDeterministicProjectAudit(generatedFiles = []) {
    const issues = [];
    let passedCount = 0;
    let failedCount = 0;
    const scriptParseCache = new Map();

    if (!Array.isArray(generatedFiles) || generatedFiles.length === 0) {
        return {
            passed: false,
            issues: ['Hiçbir proje dosyası üretilmemiş.'],
            passedCount: 0,
            failedCount: 1
        };
    }

    // 1. JSON Sözdizimi Kontrolü
    for (const file of generatedFiles) {
        if (file.path && file.path.endsWith('.json') && typeof file.content === 'string') {
            try {
                JSON.parse(file.content);
                passedCount++;
            } catch (err) {
                issues.push(`Geçersiz JSON dosyası: "${file.path}" -> ${err.message}`);
                failedCount++;
            }
        }
    }
    failedCount += collectEnvProviderAudit(generatedFiles, issues);



    // 2. Prisma Şeması & API Route Bütünlük Kontrolü
    const prismaFile = generatedFiles.find(f => f.path && f.path.endsWith('schema.prisma'));
    if (prismaFile && typeof prismaFile.content === 'string') {
        const modelMatches = Array.from(prismaFile.content.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{/g));
        const definedModels = new Set(modelMatches.map(m => m[1].toLowerCase()));

        for (const file of generatedFiles) {
            if (file.path && (file.path.includes('/api/') || file.path.includes('service') || file.path.includes('routes')) && typeof file.content === 'string') {
                const prismaCalls = Array.from(file.content.matchAll(/prisma\.([a-zA-Z0-9_]+)\.(findMany|findUnique|findFirst|create|update|delete|upsert|count)/g));
                for (const call of prismaCalls) {
                    const usedModel = call[1].toLowerCase();
                    if (!definedModels.has(usedModel) && usedModel !== '$queryraw' && usedModel !== '$executeRaw') {
                        issues.push(`Prisma Şema Uyumsuzluğu: "${file.path}" dosyasında "prisma.${call[1]}" çağrısı yapılmış ancak schema.prisma içinde "${call[1]}" modeli tanımlı değil!`);
                        failedCount++;
                    }
                }
            }
        }
        if (definedModels.size > 0) passedCount++;
    }

    // 3. JS/TS sözdizimi denetimi ve AST tabanlı auth taraması
    for (const file of generatedFiles) {
        if (!isScriptFilePath(file?.path) || typeof file.content !== 'string') continue;

        const record = getScriptParseRecord(file, scriptParseCache);
        if (!record) continue;

        if (record.error) {
            if (!record.reported) {
                issues.push(buildScriptParseIssue(file.path, record.error));
                record.reported = true;
            }
            failedCount++;
            continue;
        }

        passedCount++;
    }
    failedCount += collectRawAuthAudit(generatedFiles, issues, scriptParseCache);
    // 4. Statik Yerel İthalat ve Dosya Varlık Denetimi (Dead Import / Path Resolution Check)
    const existingLookup = new Set();
    for (const f of generatedFiles) {
        if (!f.path) continue;
        const norm = f.path.replace(/\\/g, '/');
        existingLookup.add(norm);
        const ext = path.extname(norm);
        if (ext) {
            existingLookup.add(norm.slice(0, -ext.length)); // uzantısız halini ekle
        }
        if (norm.endsWith('/index.ts') || norm.endsWith('/index.tsx') || norm.endsWith('/index.js') || norm.endsWith('/index.jsx')) {
            existingLookup.add(path.dirname(norm)); // klasör adıyla import edilebilir
        }
    }

    // Prisma & DB köprüsü eşleştirmesi
    if (existingLookup.has('src/lib/prisma') || existingLookup.has('src/lib/prisma.ts')) {
        existingLookup.add('src/lib/db');
        existingLookup.add('src/lib/db.ts');
    }
    if (existingLookup.has('src/lib/db') || existingLookup.has('src/lib/db.ts')) {
        existingLookup.add('src/lib/prisma');
        existingLookup.add('src/lib/prisma.ts');
    }

    // 5. Harici Paket ve package.json Bağımlılık Denetimi
    let declaredPackages = new Set();
    const pkgFile = generatedFiles.find(f => f.path === 'package.json');
    if (pkgFile && typeof pkgFile.content === 'string') {
        try {
            const parsedPkg = JSON.parse(pkgFile.content);
            declaredPackages = new Set([
                ...Object.keys(parsedPkg.dependencies || {}),
                ...Object.keys(parsedPkg.devDependencies || {})
            ]);
        } catch {}
    }

    const NODE_BUILTIN_MODULES = new Set([
        'fs', 'fs/promises', 'path', 'url', 'http', 'https', 'crypto',
        'events', 'os', 'stream', 'util', 'child_process', 'assert', 'buffer',
        'next', 'next/server', 'next/font', 'next/font/google', 'next/navigation',
        'next/router', 'next/link', 'next/image', 'next/head', 'react', 'react-dom'
    ]);

    for (const file of generatedFiles) {
        if (file.path && (file.path.endsWith('.js') || file.path.endsWith('.jsx') || file.path.endsWith('.ts') || file.path.endsWith('.tsx')) && typeof file.content === 'string') {
            const importMatches = Array.from(file.content.matchAll(/(?:import\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g));
            const currentFileDir = path.dirname(file.path).replace(/\\/g, '/');

            for (const match of importMatches) {
                const specifier = match[1];
                if (!specifier) continue;

                // A. Yerel İthalat Denetimi (@/... veya ./... veya ../...)
                if (specifier.startsWith('@/') || specifier.startsWith('./') || specifier.startsWith('../')) {
                    let targetPath = '';
                    if (specifier.startsWith('@/')) {
                        targetPath = 'src/' + specifier.slice(2);
                    } else {
                        targetPath = path.posix.normalize(path.posix.join(currentFileDir, specifier));
                    }

                    // CSS veya font dosyası değilse varlık kontrolü yap
                    if (!specifier.endsWith('.css') && !specifier.endsWith('.svg') && !specifier.endsWith('.png') && !specifier.endsWith('.ico')) {
                        if (!existingLookup.has(targetPath) && !existingLookup.has(targetPath + '.ts') && !existingLookup.has(targetPath + '.tsx') && !existingLookup.has(targetPath + '.js') && !existingLookup.has(targetPath + '.jsx')) {
                            issues.push(`Kırık Yerel İthalat (Dosya Yok): "${file.path}" dosyasında "${specifier}" import edilmiş ancak hedef dosya (${targetPath}) diskte mevcut değil!`);
                            failedCount++;
                        } else {
                            passedCount++;
                        }
                    }
                }
                // B. Harici Paket Denetimi
                else if (!specifier.startsWith('/') && !NODE_BUILTIN_MODULES.has(specifier)) {
                    let pkgName = specifier;
                    if (specifier.startsWith('@')) {
                        pkgName = specifier.split('/').slice(0, 2).join('/');
                    } else {
                        pkgName = specifier.split('/')[0];
                    }

                    if (pkgName && !NODE_BUILTIN_MODULES.has(pkgName) && !!pkgFile) {
                        if (!declaredPackages.has(pkgName)) {
                            issues.push(`Eksik NPM Bağımlılığı: "${file.path}" dosyasında "${pkgName}" paketi kullanılmış ancak package.json içinde tanımlı değil!`);
                            failedCount++;
                        } else {
                            passedCount++;
                        }
                    }
                }
            }
        }
    }

    // 6. Dosya Boyut ve İçerik Kontrolü
    for (const file of generatedFiles) {
        if (!file.content || file.content.trim().length === 0) {
            issues.push(`Boş dosya tespit edildi: "${file.path}"`);
            failedCount++;
        } else {
            passedCount++;
        }
    }

    return {
        passed: issues.length === 0,
        issues,
        passedCount,
        failedCount
    };
}

/**
 * Üretilen dosyalardan yapılandırılmış zengin Proje Manifestosu (Project Manifest) çıkarır.
 */
export function extractProjectManifest(generatedFiles = [], projectSpec = '') {
    const manifest = {
        routes: [],
        schemas: [],
        models: [],
        sharedTypes: [],
        envVars: { declared: [], used: [] },
        dependencyGraph: { packages: [], internalLinks: [] }
    };

    const declaredEnvSet = new Set();
    const usedEnvSet = new Set();
    const declaredPkgSet = new Set();
    const internalLinksSet = new Set();

    for (const file of generatedFiles) {
        if (!file || !file.path) continue;
        const normPath = file.path.replace(/\\/g, '/');
        const content = typeof file.content === 'string' ? file.content : '';

        // 1. Rotalar (Routes)
        if (normPath.startsWith('src/app/') || normPath.startsWith('app/') || normPath.startsWith('src/pages/') || normPath.startsWith('pages/')) {
            if (normPath.endsWith('/page.tsx') || normPath.endsWith('/page.jsx') || normPath.endsWith('/page.js') || normPath.endsWith('/page.ts') || normPath === 'src/app/page.tsx' || normPath === 'src/app/page.jsx') {
                let routeUrl = normPath
                    .replace(/^(src\/)?(app|pages)/, '')
                    .replace(/\/page\.(tsx|jsx|js|ts)$/, '')
                    .replace(/\/index\.(tsx|jsx|js|ts)$/, '');
                if (!routeUrl || routeUrl === '') routeUrl = '/';
                manifest.routes.push({ type: 'PAGE', path: routeUrl, file: normPath });
            } else if (normPath.endsWith('/route.ts') || normPath.endsWith('/route.js')) {
                let apiRouteUrl = normPath
                    .replace(/^(src\/)?(app|pages)/, '')
                    .replace(/\/route\.(ts|js)$/, '');
                if (!apiRouteUrl.startsWith('/')) apiRouteUrl = '/' + apiRouteUrl;
                
                // HTTP Metotlarını ayıkla (GET, POST, PUT, DELETE, PATCH)
                const methods = [];
                if (/export\s+(?:async\s+)?function\s+GET\b/.test(content)) methods.push('GET');
                if (/export\s+(?:async\s+)?function\s+POST\b/.test(content)) methods.push('POST');
                if (/export\s+(?:async\s+)?function\s+PUT\b/.test(content)) methods.push('PUT');
                if (/export\s+(?:async\s+)?function\s+DELETE\b/.test(content)) methods.push('DELETE');
                if (/export\s+(?:async\s+)?function\s+PATCH\b/.test(content)) methods.push('PATCH');

                manifest.routes.push({ type: 'API', path: apiRouteUrl, methods, file: normPath });
            }
        }

        // 2. Prisma Modelleri (Models)
        if (normPath.endsWith('schema.prisma')) {
            const modelMatches = Array.from(content.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g));
            for (const [_, modelName, modelBody] of modelMatches) {
                const fields = [];
                const lines = modelBody.split('\n');
                for (const l of lines) {
                    const clean = l.trim();
                    if (!clean || clean.startsWith('//') || clean.startsWith('@@')) continue;
                    const tokens = clean.split(/\s+/);
                    if (tokens.length >= 2) {
                        fields.push(`${tokens[0]}: ${tokens[1]}`);
                    }
                }
                manifest.models.push({ name: modelName, fields });
            }
        }

        // 3. Validasyon Şemaları (Schemas)
        if (normPath.includes('validation') || normPath.includes('schema') || content.includes('z.object')) {
            const zodMatches = Array.from(content.matchAll(/(?:export\s+)?const\s+([A-Za-z0-9_]+Schema|[A-Za-z0-9_]+Input)\s*=\s*z\.object/g));
            for (const m of zodMatches) {
                manifest.schemas.push({ name: m[1], file: normPath });
            }
        }

        // 4. Paylaşılan Tipler (Shared Types)
        if (normPath.includes('types') || normPath.endsWith('.d.ts')) {
            const typeMatches = Array.from(content.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g));
            for (const tm of typeMatches) {
                manifest.sharedTypes.push({ name: tm[1], file: normPath });
            }
        }

        // 5. Ortam Değişkenleri (Env Vars)
        if (normPath === '.env' || normPath === '.env.example') {
            const envLines = content.split('\n');
            for (const el of envLines) {
                const match = el.match(/^\s*([A-Za-z0-9_]+)\s*=/);
                if (match) declaredEnvSet.add(match[1]);
            }
        }
        const envCalls = Array.from(content.matchAll(/process\.env\.([A-Za-z0-9_]+)/g));
        for (const ec of envCalls) {
            usedEnvSet.add(ec[1]);
        }

        // 6. Bağımlılık Grafiği (Dependency Graph)
        if (normPath === 'package.json') {
            try {
                const pkg = JSON.parse(content);
                Object.keys(pkg.dependencies || {}).forEach(p => declaredPkgSet.add(p));
                Object.keys(pkg.devDependencies || {}).forEach(p => declaredPkgSet.add(p));
            } catch {}
        }

        const importMatches = Array.from(content.matchAll(/(?:import\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g));
        for (const im of importMatches) {
            const spec = im[1];
            if (spec.startsWith('@/') || spec.startsWith('./') || spec.startsWith('../')) {
                internalLinksSet.add(`${path.basename(normPath)} -> ${spec}`);
            }
        }
    }

    manifest.envVars.declared = Array.from(declaredEnvSet);
    manifest.envVars.used = Array.from(usedEnvSet);
    manifest.dependencyGraph.packages = Array.from(declaredPkgSet);
    manifest.dependencyGraph.internalLinks = Array.from(internalLinksSet);

    return manifest;
}

export function buildTesterPrompt(projectTitle, acceptanceCriteria, generatedFiles, options = {}) {
    const audit = options.deterministicAudit || runDeterministicProjectAudit(generatedFiles);
    const buildResults = options.buildResults || null;
    const manifest = options.manifest || extractProjectManifest(generatedFiles, acceptanceCriteria);

    return `PROJE DOĞRULAMA & KABUL TESTİ (QA AUDIT)
==================================================
Proje Başlığı: ${projectTitle}

1. MİMARİ VE KABUL KRİTERLERİ (Project Spec):
"""
${acceptanceCriteria}
"""

2. PROJE MANİFESTOSU (Project Manifest):
--------------------------------------------------
A. Rotalar ve API Uç Noktaları (Routes):
${manifest.routes.length > 0 ? manifest.routes.map(r => `- [${r.type}] ${r.path} ${r.methods && r.methods.length > 0 ? `(Metotlar: ${r.methods.join(', ')})` : ''}`).join('\n') : '- Rota bulunamadı.'}

B. Veritabanı Modelleri (Prisma Models):
${manifest.models.length > 0 ? manifest.models.map(m => `- ${m.name} [Alanlar: ${m.fields.slice(0, 8).join(', ')}${m.fields.length > 8 ? ' ...' : ''}]`).join('\n') : '- Prisma modeli tanımlı değil.'}

C. Doğrulama Şemaları (Validation Schemas):
${manifest.schemas.length > 0 ? manifest.schemas.map(s => `- ${s.name} (${s.file})`).join('\n') : '- Özel validasyon şeması bulunamadı.'}

D. Paylaşılan Tipler & Arayüzler (Shared Types):
${manifest.sharedTypes.length > 0 ? manifest.sharedTypes.map(t => `- ${t.name} (${t.file})`).join('\n') : '- Özel tip dosyası bulunamadı.'}

E. Ortam Değişkenleri (Environment Variables):
- Tanımlı Değişkenler: ${manifest.envVars.declared.length > 0 ? manifest.envVars.declared.join(', ') : 'Yok'}
- Kodda Kullanılanlar: ${manifest.envVars.used.length > 0 ? manifest.envVars.used.join(', ') : 'Yok'}

F. Bağımlılık ve Paket Grafiği (Dependency Graph):
- Paketler: ${manifest.dependencyGraph.packages.join(', ') || 'Yok'}
- Kritik Modül Köprüleri: ${manifest.dependencyGraph.internalLinks.length > 0 ? manifest.dependencyGraph.internalLinks.slice(0, 15).join('; ') : 'Yok'}

3. DETERMINISTIK STATIK DENETİM SONUÇLARI:
--------------------------------------------------
- Durum: ${audit.passed ? 'BAŞARILI' : 'HATALAR TESPİT EDİLDİ'}
- Başarılı Kontroller: ${audit.passedCount}, Başarısız Kontroller: ${audit.failedCount}
${audit.issues.length > 0 ? `Tespit Edilen Kritik Sorunlar:\n${audit.issues.map(i => `- ${i}`).join('\n')}` : '- Kritik şema/JSON/import hatası tespit edilmedi.'}

4. COMPILER / BUILD DOĞRULAMA SONUÇLARI:
--------------------------------------------------
${buildResults ? (buildResults.passed ? '- Derleyici / Tip Denetimi: BAŞARILI (TypeScript/Prisma/Build hatasız).' : `- Derleyici / Tip Denetimi Hataları:\n${buildResults.issues.map(i => `- ${i}`).join('\n')}`) : '- Derleyici ve sözdizimi denetimi tamamlandı.'}

Lütfen yukarıdaki kapsamlı Proje Manifestosu, Derleyici Sonuçları ve Kabul Kriterlerini karşılaştırarak projenin fonksiyonel bütünlüğünü, semantik uyumunu ve çalışabilirliğini JSON formatında nihai QA kararı olarak raporla.`;
}

export function parseTesterResponse(rawText, deterministicAudit = null) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { summary: rawText };
    }
    const normalized = normalizeReviewResult(data);

    if (deterministicAudit && !deterministicAudit.passed && deterministicAudit.issues.length > 0) {
        normalized.approved = false;
        normalized.issues = [...(normalized.issues || []), ...deterministicAudit.issues];
        normalized.summary = `Deterministik Hatalar Tespit Edildi: ${deterministicAudit.issues.join(' | ')}. ${normalized.summary || ''}`;
    }

    return normalized;
}
