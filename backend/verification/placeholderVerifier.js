import { parse } from '@babel/parser';

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
const DYNAMIC_IDENTIFIER_PATTERN = /(^|_|\b)(prisma|db|database|service|fetch|axios|pool|client|repository|model)(\b|_|$)/i;
const ACTIVE_ACTION_PATTERN = /(^|_|\b)(api|fetch|axios|dispatch|post|put|delete|patch|send|submit|create|update|mutate|save|set[A-Z][a-zA-Z0-9_]*|on[A-Z][a-zA-Z0-9_]*|handle[A-Z][a-zA-Z0-9_]*)(\b|_|$)/i;
const NON_ACTION_CALLS = new Set(['preventdefault', 'stoppropagation', 'log', 'warn', 'error', 'info', 'debug', 'alert']);

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

export function verifyPlaceholders(files = []) {
    const issues = [];
    const scriptFiles = files.filter(f => f.path && /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(f.path));

    for (const file of scriptFiles) {
        const content = file.content || '';
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

        // Pass 1: Map all declared function identifiers in the file (including useCallback wrappers)
        function collectFunctions(node) {
            if (!node) return;

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

                        if (isMockOnly && !isDynamicReference(handlerBody)) {
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
