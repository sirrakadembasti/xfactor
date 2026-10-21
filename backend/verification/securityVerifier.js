import { parse } from '@babel/parser';

const SECRET_NAME_PATTERN = /(?:JWT_SECRET|API_KEY|SECRET_KEY|PRIVATE_KEY|DATABASE_PASSWORD|AUTH_SECRET|ACCESS_TOKEN_SECRET|REFRESH_TOKEN_SECRET)/i;
const MUTATION_METHODS = new Set(['post', 'put', 'delete', 'patch']);
const AUTH_MIDDLEWARE_PATTERN = /(?:auth|jwt|protect|token|user|session|guard|passport|verify|security)/i;
const AUTH_FILE_TOKENS = new Set(['auth', 'authentication', 'login', 'jwt']);
const AUTH_LOGIC_PATTERN = /(?:from\s+['"]jsonwebtoken['"]|require\s*\(\s*['"]jsonwebtoken['"]\s*\)|['"`]\/(?:api\/)?(?:auth|login|logout|register|session)\b|type\s*=\s*['"]password['"]|\b(?:jwt|jsonwebtoken)\s*\.|\b(?:signIn|logIn|authenticateUser)\s*\()/i;
const PUBLIC_AUTH_ROUTE_PATTERN = /^(?:\/api)?(?:\/v\d+)?\/(?:auth(?:\/(?:login|register|signin|signup|token|refresh|forgot-password|reset-password|verify|session)?)?|login|register|signin|signup|token|refresh)$/i;

function isPublicAuthRoute(routePath) {
    if (!routePath || typeof routePath !== 'string') return false;
    const normalized = routePath.split('?')[0].replace(/\/+$/, '');
    return PUBLIC_AUTH_ROUTE_PATTERN.test(normalized);
}

function hasAuthFileToken(filePath) {
    const basename = filePath.split(/[\\/]/).pop() || '';
    const stem = basename.replace(/\.[^.]+$/, '');
    const tokens = stem
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    return tokens.some(token => (
        AUTH_FILE_TOKENS.has(token) ||
        token === 'oauth' ||
        /^auth(?!or)/.test(token) ||
        /auth$/.test(token)
    ));
}

function checkAuthNode(node) {
    if (!node) return false;
    if (node.type === 'Identifier') {
        return AUTH_MIDDLEWARE_PATTERN.test(node.name);
    }
    if (node.type === 'MemberExpression') {
        const prop = node.property?.name;
        const obj = node.object?.name;
        return AUTH_MIDDLEWARE_PATTERN.test(prop || '') || AUTH_MIDDLEWARE_PATTERN.test(obj || '');
    }
    if (node.type === 'CallExpression') {
        return checkAuthNode(node.callee);
    }
    if (node.type === 'ArrayExpression') {
        const elements = node.elements || [];
        return elements.some(checkAuthNode);
    }
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
        return containsNodeType(node.body, checkAuthNode);
    }
    return false;
}

function hasAuthMiddleware(args) {
    if (!Array.isArray(args) || args.length < 2) return false;
    const middlewareArgs = args.slice(1, args.length - 1);
    return middlewareArgs.some(checkAuthNode);
}

function containsNodeType(node, predicate) {
    if (!node || typeof node !== 'object') return false;
    if (predicate(node)) return true;
    for (const value of Object.values(node)) {
        if (Array.isArray(value) && value.some(item => containsNodeType(item, predicate))) {
            return true;
        }
        if (value && typeof value === 'object' && containsNodeType(value, predicate)) {
            return true;
        }
    }
    return false;
}

function isUnsafeRawSqlArgument(node) {
    if (!node || node.type !== 'BinaryExpression' || node.operator !== '+') return false;
    const hasVariable = containsNodeType(node, child => child.type === 'Identifier');
    const hasSqlFragment = containsNodeType(
        node,
        child => (child.type === 'StringLiteral' || child.type === 'Literal') && typeof child.value === 'string'
    );
    return hasVariable && hasSqlFragment;
}

function isPrismaReceiver(node) {
    if (!node) return false;
    if (node.type === 'Identifier') return node.name === 'prisma';
    if (node.type === 'MemberExpression') {
        const propertyName = node.property?.name || node.property?.value;
        return propertyName === 'prisma' || isPrismaReceiver(node.object);
    }
    return false;
}

function collectRouteContext(ast) {
    const calls = new WeakMap(), records = [], rebindings = [];
    function visit(node, scope, ancestors = []) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Program' || node.type === 'BlockStatement') {
            scope = { parent: scope, bindings: new Map(), fallback: new Map() };
            const parent = ancestors.at(-1);
            if (parent && /Function/.test(parent.type)) for (const param of parent.params || []) {
                if (param.type === 'Identifier') scope.bindings.set(param.name, { kind: /^(?:app|router)$/.test(param.name) ? 'router' : 'other' });
            }
        }
        if (node.type === 'ImportDeclaration') for (const spec of node.specifiers || []) {
            scope.bindings.set(spec.local.name, { kind: node.source.value === 'express'
                ? spec.imported?.name === 'Router' ? 'routerFactory' : 'express' : 'other', imported: true });
        }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
            const existing = scope.bindings.get(node.id.name);
            if (existing?.initializers) existing.initializers.push(node.init);
            else scope.bindings.set(node.id.name, { init: node.init, initializers: [node.init], scope });
            rebindings.push({ node, scope, name: node.id.name });
        }
        if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') rebindings.push({ node, scope, name: node.left.name });
        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
            const parent = ancestors.at(-1), container = ancestors.at(-2);
            const record = { node, scope, container: parent?.type === 'ExpressionStatement'
                && ['Program', 'BlockStatement'].includes(container?.type) ? container : null };
            calls.set(node, record); records.push(record);
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) for (const child of value) { if (child?.type) visit(child, scope, [...ancestors, node]); }
            else if (value?.type) visit(value, scope, [...ancestors, node]);
        }
    }
    visit(ast, null);
    const findBinding = (scope, name) => {
        for (let current = scope; current; current = current.parent) if (current.bindings.has(name)) return current.bindings.get(name);
        return null;
    };
    function kindOf(node, scope, seen = new Set()) {
        if (!node) return 'other';
        if (node.type === 'Identifier') {
            const binding = findBinding(scope, node.name);
            if (!binding) return node.name === 'express' ? 'express' : node.name === 'Router' ? 'routerFactory' : 'other';
            if (binding.kind) return binding.kind;
            if (seen.has(binding)) return 'other';
            const kinds = (binding.initializers || [binding.init]).map(init => kindOf(init, binding.scope, new Set([...seen, binding])));
            return kinds.includes('router') ? 'router' : kinds[0] || 'other';
        }
        if (node.type === 'MemberExpression' && node.property?.name === 'Router' && kindOf(node.object, scope, seen) === 'express') return 'routerFactory';
        if (node.type === 'CallExpression') {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0]?.value === 'express') return 'express';
            if (['express', 'routerFactory'].includes(kindOf(node.callee, scope, seen))) return 'router';
        }
        return 'other';
    }
    function receiver(node, scope) {
        if (node?.type !== 'Identifier') return null;
        const binding = findBinding(scope, node.name);
        if (binding) return kindOf(node, scope) === 'router' ? binding : null;
        // Existing importless app/router snippets remain route declarations.
        if (!/^(?:app|router)$/.test(node.name)) return null;
        if (!scope.fallback.has(node.name)) scope.fallback.set(node.name, {});
        return scope.fallback.get(node.name);
    }
    const routeInfo = node => {
        const record = calls.get(node);
        if (!record) return null;
        let object = node.callee.object, args = node.arguments;
        if (object?.type === 'CallExpression' && object.callee?.type === 'MemberExpression' && object.callee.property?.name === 'route') {
            args = [object.arguments[0], ...args]; object = object.callee.object;
        }
        const key = receiver(object, record.scope);
        return key ? { ...record, key, args } : null;
    };
    const protections = records.filter(record => record.node.callee.property?.name === 'use').flatMap(record => {
        const key = receiver(record.node.callee.object, record.scope);
        if (!key || !record.container) return [];
        const args = record.node.arguments, first = args[0];
        const hasPath = first?.type === 'StringLiteral';
        // Dynamic/array mount paths and nested router mounts do not establish auth proof.
        if (first?.type === 'ArrayExpression' && first.elements.some(item => item?.type === 'StringLiteral')) return [];
        const middleware = hasPath ? args.slice(1) : args;
        if (!middleware.some(arg => !/router/i.test(arg?.name || '') && checkAuthNode(arg))) return [];
        const firstBinding = first?.type === 'Identifier' ? findBinding(record.scope, first.name) : null;
        const firstName = first?.name || first?.property?.name || '';
        if (!hasPath && (!checkAuthNode(first) || /(?:path|prefix|url)$/i.test(firstName)
            || (firstBinding && !firstBinding.imported && !(firstBinding.initializers || [firstBinding.init])
                .every(init => ['FunctionExpression', 'ArrowFunctionExpression'].includes(init?.type))))) return [];
        return [{ ...record, key, path: hasPath ? first.value.replace(/\/+$/, '') : '' }];
    });
    return { routeInfo, protectedByUse(route, routePath) {
        return protections.some(use => use.key === route.key && use.container === route.container && use.node.start < route.node.start
            && !rebindings.some(change => change.node.start > use.node.start && change.node.start < route.node.start
                && receiver({ type: 'Identifier', name: change.name }, change.scope) === route.key)
            && (use.path === '' || routePath === use.path || routePath.startsWith(`${use.path}/`)));
    } };
}

export function verifySecurityBaseline(contract = {}, files = [], sandbox = null) {
    const issues = [];
    const isAuthRequired = Boolean(
        contract.authentication?.required ||
        contract.auth?.required ||
        contract.requiresAuth ||
        contract.management?.needed === true
    );
    const isAuthExplicitlyDisabled = (
        contract.authentication?.required === false ||
        contract.auth?.required === false ||
        contract.requiresAuth === false
    );

    // Check for committed .env files
    for (const file of files) {
        const filePath = file.path || '';
        if (filePath === '.env' || filePath.endsWith('/.env') || filePath.endsWith('\\.env') || (filePath.includes('.env') && !filePath.includes('.env.example'))) {
            issues.push(`Committed .env file detected in repository: ${filePath}`);
        }
    }

    const scriptFiles = files.filter(f => f.path && /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(f.path));

    for (const file of scriptFiles) {
        const content = file.content || '';
        if (
            isAuthExplicitlyDisabled &&
            (hasAuthFileToken(file.path) || (typeof content === 'string' && AUTH_LOGIC_PATTERN.test(content)))
        ) {
            issues.push(`Unsolicited authentication module or login logic detected in ${file.path}`);
        }
        if (!content || typeof content !== 'string') continue;

        let ast;
        try {
            ast = parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript']
            });
        } catch {
            continue;
        }

        const routeContext = collectRouteContext(ast);

        function walk(node) {
            if (!node) return;

            // 1. Check cors() call expressions via AST
            if (node.type === 'CallExpression') {
                const callee = node.callee;
                const isCors = (callee.type === 'Identifier' && callee.name === 'cors') ||
                    (callee.type === 'MemberExpression' && callee.property && callee.property.name === 'cors');

                if (isCors) {
                    if (node.arguments.length === 0) {
                        issues.push(`Unrestricted CORS: cors() invoked without origin options in ${file.path}`);
                    } else if (node.arguments.length > 0 && node.arguments[0].type === 'ObjectExpression') {
                        const props = node.arguments[0].properties || [];
                        const originProp = props.find(p => p.type === 'ObjectProperty' && (p.key?.name === 'origin' || p.key?.value === 'origin'));
                        if (!originProp) {
                            issues.push(`Unrestricted CORS: cors() options object missing origin definition in ${file.path}`);
                        } else {
                            const val = originProp.value;
                            if (val && (val.type === 'StringLiteral' || val.type === 'Literal') && val.value === '*') {
                                issues.push(`Permissive CORS wildcard origin detected in ${file.path}`);
                            } else if (val && val.type === 'ArrayExpression') {
                                const elements = val.elements || [];
                                if (elements.some(el => el && (el.type === 'StringLiteral' || el.type === 'Literal') && el.value === '*')) {
                                    issues.push(`Permissive CORS wildcard origin detected in ${file.path}`);
                                }
                            }
                        }
                    }
                }
            }

            // 2. Check header('Access-Control-Allow-Origin', '*') or setHeader(...)
            if (node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression') {
                const propName = node.callee.property?.name;
                if (propName === 'setHeader' || propName === 'header' || propName === 'set') {
                    if (node.arguments.length >= 2) {
                        const headerName = node.arguments[0];
                        const headerVal = node.arguments[1];
                        if (
                            headerName && (headerName.type === 'StringLiteral' || headerName.type === 'Literal') &&
                            String(headerName.value).toLowerCase() === 'access-control-allow-origin'
                        ) {
                            if (headerVal && (headerVal.type === 'StringLiteral' || headerVal.type === 'Literal') && String(headerVal.value) === '*') {
                                issues.push(`Wildcard Access-Control-Allow-Origin: * header detected in ${file.path}`);
                            }
                        }
                    }
                }
            }

            // 3. Check hardcoded secret variables
            if (node.type === 'VariableDeclarator' && node.id && node.id.name) {
                const varName = node.id.name;
                if (SECRET_NAME_PATTERN.test(varName) && node.init && (node.init.type === 'StringLiteral' || node.init.type === 'Literal')) {
                    issues.push(`Hardcoded secret key detected: ${varName} in ${file.path}`);
                }
            }

            // 4. Check mandatory authentication on mutation routes
            if (isAuthRequired && node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression') {
                const prop = node.callee.property?.name;
                const propLower = prop ? prop.toLowerCase() : '';
                const route = routeContext.routeInfo(node);
                if (MUTATION_METHODS.has(propLower) && route && route.args.length >= 2) {
                    const firstArg = route.args[0];
                    let routePath = '';
                    if (firstArg.type === 'StringLiteral' || firstArg.type === 'Literal') {
                        routePath = String(firstArg.value || '');
                    } else if (firstArg.type === 'TemplateLiteral') {
                        routePath = firstArg.quasis.map(q => q.value?.cooked || q.value?.raw || '').join('');
                    }

                    if (!isPublicAuthRoute(routePath) && !hasAuthMiddleware(route.args) && !routeContext.protectedByUse(route, routePath)) {
                        issues.push(`Mandatory authentication missing on mutate route ${propLower.toUpperCase()} ${routePath || 'unknown'} in ${file.path}`);
                    }
                }
            }

            // 5. Check dynamic string concatenation in raw Prisma SQL calls
            if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
                const rawMethod = node.callee.property?.name || node.callee.property?.value;
                if (
                    (rawMethod === '$queryRaw' || rawMethod === '$executeRaw') &&
                    isPrismaReceiver(node.callee.object) &&
                    isUnsafeRawSqlArgument(node.arguments?.[0])
                ) {
                    issues.push(`SQL injection vulnerability: concatenated variable in prisma.${rawMethod} call in ${file.path}`);
                }
            }

            for (const key of Object.keys(node)) {
                if (key === 'loc' || key === 'comments') continue;
                const val = node[key];
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item === 'object' && item.type) walk(item);
                    }
                } else if (val && typeof val === 'object' && val.type) {
                    walk(val);
                }
            }
        }

        walk(ast);
    }

    return {
        passed: issues.length === 0,
        issues
    };
}
