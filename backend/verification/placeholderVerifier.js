import { parse } from '@babel/parser';

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
const DYNAMIC_IDENTIFIER_PATTERN = /(^|_|\b)(prisma|db|database|service|fetch|axios|pool|client|repository|model)(\b|_|$)/i;
const ACTIVE_ACTION_PATTERN = /(^|_|\b)(api|fetch|axios|dispatch|post|put|delete|patch|send|submit|create|update|mutate|save|set[A-Z][a-zA-Z0-9_]*|on[A-Z][a-zA-Z0-9_]*|handle[A-Z][a-zA-Z0-9_]*)(\b|_|$)/i;
const NON_ACTION_CALLS = new Set(['preventdefault', 'stoppropagation', 'log', 'warn', 'error', 'info', 'debug', 'alert']);

const LINE_COMMENT_PLACEHOLDER_PATTERN = /(?:\/\/|\/\*|\*)\s*(?:TODO|TO-DO|FIXME)\b/i;
const NOT_IMPLEMENTED_PATTERN = /throw\s+(?:new\s+)?(?:[A-Za-z0-9_$]*Error)?\s*\(\s*['"`](?:not implemented|todo|fixme)[^'"`]*['"`]\s*\)/i;

function isStaticLiteralExpression(node) {
    if (!node) return false;
    return (
        node.type === 'ArrayExpression' ||
        node.type === 'ObjectExpression' ||
        node.type === 'StringLiteral' ||
        node.type === 'NumericLiteral' ||
        node.type === 'BooleanLiteral' ||
        node.type === 'NullLiteral' ||
        node.type === 'Literal'
    );
}

function isDynamicReference(node) {
    if (!node) return false;
    let found = false;

    function walk(n) {
        if (!n || found) return;
        if (n.type === 'AwaitExpression') {
            found = true;
            return;
        }
        if (n.type === 'Identifier') {
            const name = n.name;
            if (DYNAMIC_IDENTIFIER_PATTERN.test(name)) {
                found = true;
                return;
            }
        }
        if (n.type === 'MemberExpression') {
            if (n.object && n.object.type === 'Identifier') {
                const objName = n.object.name;
                if (DYNAMIC_IDENTIFIER_PATTERN.test(objName) || objName === 'req' || objName === 'request') {
                    found = true;
                    return;
                }
            }
        }
        for (const key of Object.keys(n)) {
            if (key === 'loc' || key === 'comments') continue;
            const val = n[key];
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (item && typeof item === 'object' && item.type) walk(item);
                }
            } else if (val && typeof val === 'object' && val.type) {
                walk(val);
            }
        }
    }

    walk(node);
    return found;
}

function hasActiveAction(node) {
    if (!node) return false;
    let found = false;

    function walk(n) {
        if (!n || found) return;
        if (n.type === 'AwaitExpression') {
            found = true;
            return;
        }
        if (n.type === 'CallExpression') {
            const callee = n.callee;
            if (callee && callee.type === 'MemberExpression' && callee.property) {
                const prop = callee.property.name;
                const objName = callee.object?.name;
                const propLower = prop ? prop.toLowerCase() : '';
                const objLower = objName ? objName.toLowerCase() : '';

                if (objLower === 'console' || NON_ACTION_CALLS.has(propLower)) {
                    // Utility / logging call is not an active action
                } else if (ACTIVE_ACTION_PATTERN.test(prop) || ACTIVE_ACTION_PATTERN.test(objName || '')) {
                    found = true;
                    return;
                }
            } else if (callee && callee.type === 'Identifier') {
                const fnName = callee.name;
                const fnLower = fnName ? fnName.toLowerCase() : '';
                if (!NON_ACTION_CALLS.has(fnLower) && ACTIVE_ACTION_PATTERN.test(fnName)) {
                    found = true;
                    return;
                }
            }
        }
        if (n.type === 'Identifier') {
            const name = n.name;
            const nameLower = name ? name.toLowerCase() : '';
            if (!NON_ACTION_CALLS.has(nameLower) && (name === 'fetch' || name === 'dispatch' || name === 'api' || name === 'axios')) {
                found = true;
                return;
            }
        }
        for (const key of Object.keys(n)) {
            if (key === 'loc' || key === 'comments') continue;
            const val = n[key];
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (item && typeof item === 'object' && item.type) walk(item);
                }
            } else if (val && typeof val === 'object' && val.type) {
                walk(val);
            }
        }
    }

    walk(node);
    return found;
}

function checkSendCall(callExpr) {
    if (!callExpr || callExpr.type !== 'CallExpression') return false;
    const callee = callExpr.callee;
    if (callee && callee.type === 'MemberExpression' && callee.property) {
        const propName = callee.property.name;
        if (propName === 'json' || propName === 'send') {
            if (callExpr.arguments.length > 0 && isStaticLiteralExpression(callExpr.arguments[0])) {
                return true;
            }
        }
    }
    return false;
}

function visit(node, callback) {
    if (!node || typeof node !== 'object' || !node.type) return;
    callback(node);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'comments') continue;
        if (Array.isArray(value)) value.forEach(child => visit(child, callback));
        else visit(value, callback);
    }
}

const propertyName = node => node?.property?.name;
function objectFields(node, allowed) {
    if (node?.type !== 'ObjectExpression' || node.properties.some(property => property.type !== 'ObjectProperty'
        || property.computed || !allowed.includes(property.key.name || property.key.value))) return null;
    const entries = node.properties.map(property => [property.key.name || property.key.value, property.value]);
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return null;
    return Object.fromEntries(entries);
}

// These are metadata/readiness/error responses, never successful business data.
// Every literal response in the handler must have its own structural proof.
function hasProvenNonMockResponses(body, route, constants, functions, hasPermissionTableImport) {
    const responses = [];
    visit(body, node => { if (checkSendCall(node)) responses.push(node); });
    return responses.length > 0 && responses.every(call => {
        const payload = call.arguments[0];
        const receiver = call.callee.object;
        const status = receiver?.type === 'CallExpression' && propertyName(receiver.callee) === 'status'
            ? receiver.arguments[0]?.value : 200;
        const denied = objectFields(payload, ['success', 'error', 'message', 'code']);
        if (Number.isInteger(status) && status >= 400 && status <= 599 && denied
            && (!denied.success || denied.success.value === false)
            && [denied.error, denied.message].some(value => value?.type === 'StringLiteral' && value.value.trim())) return true;
        if (status !== 200) return false;
        const health = objectFields(payload, ['status', 'uptime', 'timestamp']);
        if (/^\/?api(?:\/v1)?\/(?:health|healthz|ready|readyz|ping)\/?$/i.test(route) && health
            && health.status?.value === 'ok') {
            const uptime = health.uptime;
            const timestamp = health.timestamp;
            const realUptime = uptime?.type === 'CallExpression' && uptime.arguments.length === 0
                && uptime.callee.object?.name === 'process' && propertyName(uptime.callee) === 'uptime';
            const realTimestamp = timestamp?.type === 'CallExpression' && timestamp.arguments.length === 0
                && propertyName(timestamp.callee) === 'toISOString' && timestamp.callee.object?.type === 'NewExpression'
                && timestamp.callee.object.callee?.name === 'Date' && timestamp.callee.object.arguments.length === 0;
            if ((realUptime || realTimestamp) && (!uptime || realUptime) && (!timestamp || realTimestamp)) return true;
        }
        const metadata = objectFields(payload, ['success', 'accounts', 'roles']);
        if (!metadata || (metadata.success && metadata.success.value !== true)) return false;
        if (metadata.accounts && !metadata.roles) {
            const list = constants.get(metadata.accounts.name);
            return list?.type === 'ArrayExpression' && list.elements.length > 0 && list.elements.length <= 128
                && list.elements.every(item => {
                    const fields = objectFields(item, ['username', 'role', 'label', 'description']);
                    return fields?.username && fields.role && Object.values(fields).every(value => value.type === 'StringLiteral' && value.value.trim());
                });
        }
        // A role matrix projection must read the declared permission table and
        // project its actual resource/operations, not return a canned role list.
        const roles = metadata.roles;
        if (!roles || metadata.accounts || roles.type !== 'CallExpression' || propertyName(roles.callee) !== 'map') return false;
        const list = constants.get(roles.callee.object?.name);
        const mapper = roles.arguments[0];
        const fields = objectFields(mapper?.body, ['role', 'permissions']);
        const helper = fields?.permissions?.type === 'CallExpression' && functions.get(fields.permissions.callee?.name);
        if (!hasPermissionTableImport || constants.has('ROLE_PERMISSIONS') || list?.type !== 'ArrayExpression' || !list.elements.length || !list.elements.every(value => value?.type === 'StringLiteral')
            || !fields?.role || fields.role.name !== mapper.params?.[0]?.name || !helper
            || fields.permissions.arguments[0]?.name !== fields.role.name) return false;
        const statements = helper.body?.body;
        if (!Array.isArray(statements) || statements.length !== 1 || statements[0].type !== 'ReturnStatement') return false;
        const node = statements[0].argument;
        if (node?.type !== 'CallExpression' || propertyName(node.callee) !== 'map' || node.arguments.length !== 1) return false;
            const table = node.callee.object;
            const lookup = table?.type === 'LogicalExpression' && table.operator === '||' ? table.left : table;
            if (table?.type === 'LogicalExpression' && (table.right?.type !== 'ArrayExpression' || table.right.elements.length)) return false;
            const result = objectFields(node.arguments[0]?.body, ['resource', 'operations']);
            const entry = node.arguments[0]?.params?.[0]?.name;
            return Boolean(lookup?.type === 'MemberExpression' && lookup.computed && lookup.object?.name === 'ROLE_PERMISSIONS'
                && lookup.property?.name === helper.params?.[0]?.name && result?.resource?.object?.name === entry
                && propertyName(result.resource) === 'resource' && result.operations?.type === 'ArrayExpression'
                && result.operations.elements.length === 1 && result.operations.elements[0]?.type === 'SpreadElement'
                && result.operations.elements[0].argument?.object?.name === entry
                && propertyName(result.operations.elements[0].argument) === 'operations');
    });
}

export function verifyPlaceholders(files = []) {
    const issues = [];
    const scriptFiles = files.filter(f => f.path && !f.path.startsWith('manager/') && !f.path.includes('/manager/') && !f.path.startsWith('node_modules/') && /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(f.path));

    for (const file of scriptFiles) {
        const content = Buffer.isBuffer(file.content) ? file.content.toString('utf8') : String(file.content || '');
        const lines = content.split(/\r?\n/);

        // Check line-by-line for placeholder comments and "Not implemented" throw bypasses
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (LINE_COMMENT_PLACEHOLDER_PATTERN.test(line)) {
                issues.push(`Placeholder comment detected in ${file.path}:${i + 1}: ${line.trim()}`);
            }
            if (NOT_IMPLEMENTED_PATTERN.test(line)) {
                issues.push(`"Not implemented" error bypass detected in ${file.path}:${i + 1}: ${line.trim()}`);
            }
        }

        let ast;
        try {
            ast = parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript']
            });
        } catch {
            continue;
        }

        const declaredFunctions = new Map();
        const constants = new Map();
        let hasPermissionTableImport = false;

        // Pass 1: Map all declared function identifiers in the file (including useCallback wrappers)
        function collectFunctions(node) {
            if (!node) return;

            if (node.type === 'ImportDeclaration' && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier'
                && specifier.imported?.name === 'ROLE_PERMISSIONS' && specifier.local?.name === 'ROLE_PERMISSIONS')) hasPermissionTableImport = true;

            if (node.type === 'VariableDeclaration' && node.kind === 'const') {
                for (const declaration of node.declarations) if (declaration.id?.type === 'Identifier') constants.set(declaration.id.name, declaration.init);
            }

            if (node.type === 'FunctionDeclaration' && node.id && node.id.name) {
                declaredFunctions.set(node.id.name, node);
            } else if (node.type === 'VariableDeclarator' && node.id && node.id.name && node.init) {
                if (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression') {
                    declaredFunctions.set(node.id.name, node.init);
                } else if (node.init.type === 'CallExpression') {
                    const callee = node.init.callee;
                    const isUseCallback = (callee.type === 'Identifier' && callee.name === 'useCallback') ||
                        (callee.type === 'MemberExpression' && callee.property && callee.property.name === 'useCallback');
                    if (isUseCallback && Array.isArray(node.init.arguments) && node.init.arguments.length > 0) {
                        const firstArg = node.init.arguments[0];
                        if (firstArg.type === 'ArrowFunctionExpression' || firstArg.type === 'FunctionExpression') {
                            declaredFunctions.set(node.id.name, firstArg);
                        }
                    }
                }
            }

            for (const key of Object.keys(node)) {
                if (key === 'loc' || key === 'comments') continue;
                const val = node[key];
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item === 'object' && item.type) collectFunctions(item);
                    }
                } else if (val && typeof val === 'object' && val.type) {
                    collectFunctions(val);
                }
            }
        }

        collectFunctions(ast);

        // Pass 2: Inspect route handlers and UI form submit handlers
        function walkAst(node) {
            if (!node) return;

            // Route call expression matching: router.get('/path', handler) or app.get('/path', handler)
            if (node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression') {
                const methodProp = node.callee.property;
                const methodName = methodProp && (methodProp.name || methodProp.value);

                if (methodName && ROUTE_METHODS.has(String(methodName).toLowerCase()) && Array.isArray(node.arguments) && node.arguments.length >= 2) {
                    const firstArg = node.arguments[0];
                    let routePath = '';
                    if (firstArg.type === 'StringLiteral' || firstArg.type === 'Literal') {
                        routePath = firstArg.value;
                    }

                    const handlerArg = node.arguments[node.arguments.length - 1];
                    if (handlerArg && (handlerArg.type === 'ArrowFunctionExpression' || handlerArg.type === 'FunctionExpression')) {
                        const handlerBody = handlerArg.body;
                        let isMockOnly = false;

                        // Check if arrow function returns literal array/object directly
                        if (isStaticLiteralExpression(handlerBody)) {
                            isMockOnly = true;
                        } else if (checkSendCall(handlerBody)) {
                            isMockOnly = true;
                        } else if (handlerBody.type === 'BlockStatement') {
                            const statements = handlerBody.body || [];
                            for (const stmt of statements) {
                                let exprToCheck = null;
                                if (stmt.type === 'ExpressionStatement') {
                                    exprToCheck = stmt.expression;
                                } else if (stmt.type === 'ReturnStatement') {
                                    exprToCheck = stmt.argument;
                                    if (exprToCheck && isStaticLiteralExpression(exprToCheck)) {
                                        isMockOnly = true;
                                    }
                                }

                                if (exprToCheck && checkSendCall(exprToCheck)) {
                                    isMockOnly = true;
                                }
                            }
                        }

                        const normalizedRoute = String(routePath || '').replace(/^\/+|\/+$/g, '').toLowerCase();
                        const isExemptRoute = /^(health|healthz|ping|ready|readyz|info|status|api|api\/v1)?$/.test(normalizedRoute);
                        if (isMockOnly && !isDynamicReference(handlerBody) && !isExemptRoute
                            && !hasProvenNonMockResponses(handlerBody, routePath, constants, declaredFunctions, hasPermissionTableImport)) {
                            issues.push(`Static mock handler detected for endpoint: ${routePath || 'unknown route'} in ${file.path}`);
                        }
                    }
                }
            }

            // JSX <form> inspection
            if (node.type === 'JSXOpeningElement' && node.name && node.name.name === 'form') {
                const attributes = node.attributes || [];
                const onSubmitAttr = attributes.find(attr => attr.type === 'JSXAttribute' && attr.name && attr.name.name === 'onSubmit');

                if (onSubmitAttr && onSubmitAttr.value && onSubmitAttr.value.type === 'JSXExpressionContainer') {
                    const expr = onSubmitAttr.value.expression;
                    if (expr.type === 'ConditionalExpression') {
                        const branchHasNetwork = branch => {
                            if (branch.type === 'ConditionalExpression') return branchHasNetwork(branch.consequent) && branchHasNetwork(branch.alternate);
                            const handler = branch.type === 'Identifier' ? declaredFunctions.get(branch.name) : branch;
                            let network = false;
                            visit(handler, node => {
                                if (node.type !== 'CallExpression') return;
                                const callee = node.callee;
                                if (callee?.name === 'fetch' || (callee?.type === 'MemberExpression'
                                    && ['api', 'axios'].includes(callee.object?.name)
                                    && ['get', 'post', 'put', 'patch', 'delete', 'request'].includes(propertyName(callee)))) network = true;
                            });
                            return network;
                        };
                        if (!branchHasNetwork(expr)) issues.push(`Dead UI form detected with no network/API action in ${file.path}`);
                        return;
                    }
                    let handlerFn = null;
                    let isDirectProp = false;

                    if (expr.type === 'ArrowFunctionExpression' || expr.type === 'FunctionExpression') {
                        handlerFn = expr;
                    } else if (expr.type === 'Identifier') {
                        const handlerName = expr.name;
                        handlerFn = declaredFunctions.get(handlerName);
                        if (!handlerFn && (ACTIVE_ACTION_PATTERN.test(handlerName) || handlerName.startsWith('on') || handlerName.startsWith('handle'))) {
                            isDirectProp = true;
                        }
                    } else if (expr.type === 'MemberExpression') {
                        // e.g. props.onSubmit or form.submit
                        isDirectProp = true;
                    } else if (expr.type === 'CallExpression') {
                        // e.g. form.handleSubmit(onSubmit)
                        const calleeName = expr.callee?.property?.name || expr.callee?.name || '';
                        if (calleeName.toLowerCase().includes('submit')) {
                            const innerArg = expr.arguments?.[0];
                            if (innerArg?.type === 'Identifier') {
                                handlerFn = declaredFunctions.get(innerArg.name);
                                if (!handlerFn && (ACTIVE_ACTION_PATTERN.test(innerArg.name)
                                    || innerArg.name.startsWith('on')
                                    || innerArg.name.startsWith('handle'))) {
                                    isDirectProp = true;
                                }
                            } else if (innerArg && (innerArg.type === 'ArrowFunctionExpression' || innerArg.type === 'FunctionExpression')) {
                                handlerFn = innerArg;
                            } else {
                                isDirectProp = true;
                            }
                        } else {
                            isDirectProp = true;
                        }
                    }
                    if (!isDirectProp) {
                        if (!handlerFn || !hasActiveAction(handlerFn)) {
                            issues.push(`Dead UI form detected with no network/API action in ${file.path}`);
                        }
                    }
                }
            }

            for (const key of Object.keys(node)) {
                if (key === 'loc' || key === 'comments') continue;
                const val = node[key];
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item === 'object' && item.type) walkAst(item);
                    }
                } else if (val && typeof val === 'object' && val.type) {
                    walkAst(val);
                }
            }
        }

        walkAst(ast);
    }

    return {
        passed: issues.length === 0,
        issues
    };
}
