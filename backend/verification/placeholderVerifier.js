import { parse } from '@babel/parser';

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
const DYNAMIC_IDENTIFIER_PATTERN = /(^|_|\b)(prisma|db|database|service|fetch|axios|pool|client|repository|model)(\b|_|$)/i;

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
