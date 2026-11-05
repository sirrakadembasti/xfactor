import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';

const HARD_LIMITS = Object.freeze({ maxFiles: 256, maxFileBytes: 262144, maxTotalBytes: 4194304, maxNodes: 100000, maxCandidates: 10000, maxIssues: 1000 });
const VISIBLE_ATTRIBUTES = new Set(['title', 'alt', 'placeholder', 'aria-label', 'aria-description', 'label', 'helperText', 'errorMessage', 'description', 'tooltip', 'emptyText', 'loadingText']);
const VALIDATORS = new Set(['min', 'max', 'length', 'email', 'url', 'uuid', 'regex', 'nonempty', 'positive', 'negative', 'int', 'finite', 'refine', 'superRefine', 'includes', 'startsWith', 'endsWith', 'datetime', 'date', 'time', 'ip', 'multipleOf', 'gte', 'lte', 'gt', 'lt']);
const VALIDATORS_WITH_VALUE = new Set(['min', 'max', 'length', 'regex', 'refine', 'includes', 'startsWith', 'endsWith', 'multipleOf', 'gte', 'lte', 'gt', 'lt']);
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const keyName = node => node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : null;
const memberName = node => node?.type === 'MemberExpression' && !node.computed ? keyName(node.property) : null;
const literal = node => node?.type === 'StringLiteral' ? node.value : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis.map(q => q.value.cooked ?? q.value.raw).join('') : null;

function rootName(node) {
    // Bound chain inspection independently from the global AST visit quota.
    for (let i = 0; node && i < 256; i++) {
        if (node.type === 'Identifier') return node.name;
        if (node.type === 'MemberExpression') node = node.object;
        else if (node.type === 'CallExpression') node = node.callee;
        else return null;
    }
    return null;
}

/**
 * Extracts conservative STATIC CANDIDATES from caller-supplied source strings.
 * No files are read, imported or executed. No language classification is made.
 * extractionComplete covers these supported literal contexts only; it never
 * means that all rendered UI or all translations have been discovered.
 * inventorySourceHash is null whenever the entire supplied inventory cannot be
 * hashed inside the declared limits. Anchors use UTF-16 offsets, 1-based lines
 * and 0-based columns (Babel conventions).
 */
export function buildUiLanguageCatalogue(files, options = {}) {
    if (!Array.isArray(files)) throw new TypeError('Kaynak dosyaları bir dizi olmalıdır.');
    if (!options || typeof options !== 'object') throw new TypeError('Sınırlar bir nesne olmalıdır.');
    const limits = Object.fromEntries(Object.entries(HARD_LIMITS).map(([key, hard]) => {
        const value = options[key] ?? hard;
        if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Geçersiz sınır: ${key}`);
        return [key, Math.min(value, hard)];
    }));
    const result = {
        kind: 'static-candidates', reviewed: false, fullProductProof: false,
        scope: 'Supported static literal contexts only; runtime DOM and independent review required.',
        extractionComplete: true, inventoryComplete: true, inventorySourceHash: null,
        limits, files: [], candidates: [], issues: []
    };
    let issueLimit = false;
    function issue(code, filePath = null, anchor = null) {
        result.extractionComplete = false;
        if (result.issues.length < limits.maxIssues) result.issues.push({ code, path: filePath, ...(anchor ? { anchor } : {}) });
        else if (!issueLimit) {
            issueLimit = true;
            result.issues[result.issues.length - 1] = { code: 'issue-limit', path: null };
        }
    }
    let totalBytes = 0;
    let nodesVisited = 0;
    const seenPaths = new Set();
    if (files.length > limits.maxFiles) {
        result.inventoryComplete = false;
        issue('file-limit');
    }
    for (let index = 0; index < Math.min(files.length, limits.maxFiles); index++) {
        const file = files[index];
        if (!file || typeof file.path !== 'string' || file.path.length > 1024 || !file.path || typeof file.content !== 'string') {
            result.inventoryComplete = false;
            issue('invalid-source');
            continue;
        }
        const filePath = file.path;
        if (seenPaths.has(filePath)) {
            result.inventoryComplete = false;
            issue('duplicate-path', filePath);
        }
        seenPaths.add(filePath);
        // UTF-8 is never shorter than the UTF-16 code-unit count. Check length
        // first so arbitrarily large input strings are not copied or scanned.
        const byteLength = file.content.length > limits.maxFileBytes ? null : Buffer.byteLength(file.content, 'utf8');
        const record = { path: filePath, byteLength, sourceHash: null, status: 'skipped' };
        result.files.push(record);
        if (byteLength === null || byteLength > limits.maxFileBytes) {
            result.inventoryComplete = false;
            issue('file-byte-limit', filePath);
            continue;
        }
        if (totalBytes + byteLength > limits.maxTotalBytes) {
            result.inventoryComplete = false;
            issue('total-byte-limit', filePath);
            continue;
        }
        totalBytes += byteLength;
        record.sourceHash = sha256(file.content);
        if (!/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(filePath)) {
            record.status = 'unsupported';
            issue('unsupported-source', filePath);
            continue;
        }
        const anchor = node => ({ path: filePath, sourceHash: record.sourceHash, line: node.loc?.start.line ?? 1, column: node.loc?.start.column ?? 0, start: node.start, end: node.end });
        function add(node, text, context) {
            const cleaned = text.replace(/\s+/g, ' ').trim();
            if (!cleaned) return;
            if (result.candidates.length >= limits.maxCandidates) {
                issue('candidate-limit', filePath, anchor(node));
                return;
            }
            result.candidates.push({ text: cleaned, context, anchor: anchor(node) });
        }
        function message(node, context) {
            const text = literal(node);
            if (text !== null) add(node, text, context);
            else if (node) issue('dynamic-ui-expression', filePath, anchor(node));
        }
        function messageProperties(object, keys, context) {
            if (object?.type !== 'ObjectExpression') return;
            for (const property of object.properties) {
                if (property.type === 'SpreadElement' || property.computed) {
                    issue('dynamic-message-properties', filePath, anchor(property));
                } else if (property.type === 'ObjectProperty' && !property.computed && keys.has(keyName(property.key))) {
                    message(property.value, context);
                }
            }
        }
        let ast;
        try {
            ast = parse(file.content, { sourceType: 'unambiguous', plugins: /\.[cm]?ts$|\.tsx$/i.test(filePath) ? ['typescript', 'jsx'] : ['jsx'], errorRecovery: false });
        } catch {
            record.status = 'parse-error';
            issue('parse-error', filePath);
            continue;
        }
        const zodNames = new Set(['z', 'zod']);
        for (const statement of ast.program.body) {
            if (statement.type === 'ImportDeclaration' && statement.source.value === 'zod') {
                for (const specifier of statement.specifiers) {
                    if (specifier.type !== 'ImportSpecifier' || ['z', 'zod'].includes(keyName(specifier.imported))) zodNames.add(specifier.local.name);
                }
            }
        }
        const stack = [{ node: ast, parent: null }];
        record.status = 'parsed';
        while (stack.length) {
            const { node, parent } = stack.pop();
            if (++nodesVisited > limits.maxNodes) {
                record.status = 'partial';
                issue('node-limit', filePath, anchor(node));
                break;
            }
            if (node.type === 'JSXText') add(node, node.value, 'jsx-text');
            else if (node.type === 'JSXAttribute' && VISIBLE_ATTRIBUTES.has(node.name?.name)) {
                if (node.value?.type === 'StringLiteral') add(node.value, node.value.value, `jsx-attribute:${node.name.name}`);
                else if (node.value?.type === 'JSXExpressionContainer') message(node.value.expression, `jsx-attribute:${node.name.name}`);
            } else if (node.type === 'JSXExpressionContainer' && ['JSXElement', 'JSXFragment'].includes(parent?.type)) {
                if (node.expression.type !== 'JSXEmptyExpression') message(node.expression, 'jsx-expression');
            } else if (node.type === 'CallExpression') {
                const method = memberName(node.callee);
                const root = rootName(node.callee);
                if (method === 'json' && ['res', 'response', 'reply'].includes(root)) {
                    if (node.arguments[0]?.type === 'ObjectExpression') messageProperties(node.arguments[0], new Set(['message', 'error']), 'http-message');
                    else issue('dynamic-http-response', filePath, anchor(node));
                }
                if (zodNames.has(root)) {
                    for (const argument of node.arguments) {
                        messageProperties(argument, new Set(['message', 'required_error', 'invalid_type_error', 'error']), 'validation-message');
                    }
                    if (VALIDATORS.has(method)) {
                        const offset = VALIDATORS_WITH_VALUE.has(method) ? 1 : 0;
                        for (const argument of node.arguments.slice(offset)) {
                            if (!['ObjectExpression', 'ArrowFunctionExpression', 'FunctionExpression'].includes(argument.type)) message(argument, 'validation-message');
                        }
                    }
                }
            }
            const children = [];
            for (const [key, value] of Object.entries(node)) {
                if (['loc', 'extra', 'comments', 'tokens', 'leadingComments', 'innerComments', 'trailingComments'].includes(key)) continue;
                if (Array.isArray(value)) {
                    for (const child of value) if (child && typeof child.type === 'string') children.push(child);
                } else if (value && typeof value.type === 'string') children.push(value);
            }
            for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], parent: node });
        }
    }
    if (result.inventoryComplete) {
        const inventory = result.files.map(({ path, sourceHash, byteLength }) => [path, sourceHash, byteLength]);
        result.inventorySourceHash = sha256(JSON.stringify(inventory));
    }
    return result;
}
