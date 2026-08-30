import { parse } from '@babel/parser';

export function verifySecurityBaseline(contract = {}, files = [], sandbox = null) {
    const issues = [];
    const scriptFiles = files.filter(f => f.path && /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(f.path));

    for (const file of scriptFiles) {
        const content = file.content || '';
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
