import { parse } from '@babel/parser';

const SECRET_NAME_PATTERN = /(?:JWT_SECRET|API_KEY|SECRET_KEY|PRIVATE_KEY|DATABASE_PASSWORD|AUTH_SECRET|ACCESS_TOKEN_SECRET|REFRESH_TOKEN_SECRET)/i;
const MUTATION_METHODS = new Set(['post', 'put', 'delete', 'patch']);
const AUTH_MIDDLEWARE_PATTERN = /(?:auth|jwt|protect|token|user|session|guard)/i;
const AUTH_FILE_TOKENS = new Set(['auth', 'authentication', 'login', 'jwt']);
const AUTH_LOGIC_PATTERN = /(?:from\s+['"]jsonwebtoken['"]|require\s*\(\s*['"]jsonwebtoken['"]\s*\)|['"`]\/(?:api\/)?(?:auth|login|logout|register|session)\b|type\s*=\s*['"]password['"]|\b(?:jwt|jsonwebtoken)\s*\.|\b(?:signIn|logIn|authenticateUser)\s*\()/i;

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
    return false;
}

function hasAuthMiddleware(args) {
    if (!Array.isArray(args) || args.length < 2) return false;
    const middlewareArgs = args.slice(1, args.length - 1);
    return middlewareArgs.some(checkAuthNode);
}

export function verifySecurityBaseline(contract = {}, files = [], sandbox = null) {
    const issues = [];
    const isAuthRequired = Boolean(
        contract.authentication?.required ||
        contract.auth?.required ||
        contract.requiresAuth
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
                if (MUTATION_METHODS.has(propLower) && Array.isArray(node.arguments) && node.arguments.length >= 2) {
                    const firstArg = node.arguments[0];
                    const routePath = (firstArg.type === 'StringLiteral' || firstArg.type === 'Literal') ? firstArg.value : '';
                    if (!hasAuthMiddleware(node.arguments)) {
                        issues.push(`Mandatory authentication missing on mutate route ${propLower.toUpperCase()} ${routePath || 'unknown'} in ${file.path}`);
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
