import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import module from 'module';
import { parse } from '@babel/parser';
import { executeInSandbox } from './sandboxRunner.js';

const NODE_BUILTINS = new Set(
    module.builtinModules || [
        'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
        'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
        'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
        'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
        'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys',
        'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm',
        'wasi', 'worker_threads', 'zlib'
    ]
);

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo']);

function extractPackageName(importPath) {
    if (!importPath || typeof importPath !== 'string') return null;
    const trimmed = importPath.trim();
    if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.startsWith('@/') || trimmed.startsWith('~/') || trimmed === '@') {
        return null;
    }

    if (trimmed.startsWith('node:')) {
        return null;
    }

    if (NODE_BUILTINS.has(trimmed) || NODE_BUILTINS.has(trimmed.split('/')[0])) {
        return null;
    }

    if (trimmed.startsWith('@')) {
        const parts = trimmed.split('/');
        if (parts.length >= 2) {
            return `${parts[0]}/${parts[1]}`;
        }
        return trimmed;
    }

    return trimmed.split('/')[0];
}

function traverseAst(node, visitor) {
    if (!node || typeof node !== 'object') return;
    visitor(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'comments' || key === 'leadingComments' || key === 'trailingComments') continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const c of child) traverseAst(c, visitor);
        } else if (child && typeof child === 'object' && typeof child.type === 'string') {
            traverseAst(child, visitor);
        }
    }
}

export function extractImportsFromCode(content) {
    const packages = new Set();
    if (!content || typeof content !== 'string') return packages;

    let ast = null;
    try {
        ast = parse(content, {
            sourceType: 'unambiguous',
            plugins: [
                'jsx',
                'typescript',
                'asyncGenerators',
                'bigInt',
                'classProperties',
                'classPrivateProperties',
                'classPrivateMethods',
                'dynamicImport',
                'importMeta',
                'nullishCoalescingOperator',
                'numericSeparator',
                'objectRestSpread',
                'optionalCatchBinding',
                'optionalChaining',
                'topLevelAwait'
            ],
            errorRecovery: true
        });
    } catch {
        // Fallback for unparseable chunks
        ast = null;
    }

    if (ast) {
        traverseAst(ast, (node) => {
            // 1. Static import: import ... from 'pkg'
            if (node.type === 'ImportDeclaration' && node.source?.value) {
                const pkg = extractPackageName(node.source.value);
                if (pkg) packages.add(pkg);
            }

            // 2. Export ... from 'pkg'
            if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source?.value) {
                const pkg = extractPackageName(node.source.value);
                if (pkg) packages.add(pkg);
            }

            // 3. Dynamic import: import('pkg')
            if (node.type === 'Import' || node.type === 'ImportExpression') {
                if (node.source?.value) {
                    const pkg = extractPackageName(node.source.value);
                    if (pkg) packages.add(pkg);
                }
            }

            // 4. CJS require / dynamic import via CallExpression
            if (node.type === 'CallExpression') {
                const callee = node.callee;
                if (callee?.type === 'Identifier' && callee.name === 'require' && node.arguments?.[0]?.value) {
                    const pkg = extractPackageName(node.arguments[0].value);
                    if (pkg) packages.add(pkg);
                } else if (callee?.type === 'Import' && node.arguments?.[0]?.value) {
                    const pkg = extractPackageName(node.arguments[0].value);
                    if (pkg) packages.add(pkg);
                }
            }
        });
    }

    return packages;
}

export async function scanProjectImports(projectDir) {
    const discovered = new Set();

    async function walk(dir) {
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name)) {
                    await walk(path.join(dir, entry.name));
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (CODE_EXTENSIONS.has(ext)) {
                    try {
                        const content = await fs.readFile(path.join(dir, entry.name), 'utf8');
                        const filePackages = extractImportsFromCode(content);
                        for (const pkg of filePackages) {
                            discovered.add(pkg);
                        }
                    } catch {}
                }
            }
        }
    }

    await walk(projectDir);
    return discovered;
}

export async function verifyDependencies(projectDir, contract = {}, options = {}) {
    const checks = [];

    // 1. package.json check
    const packageJsonPath = path.join(projectDir, 'package.json');
    let packageJson = null;
    try {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(content);
        checks.push({
            name: 'package_json',
            status: 'passed',
            reason: 'package.json exists and is valid JSON.'
        });
    } catch (err) {
        checks.push({
            name: 'package_json',
            status: 'failed',
            reason: `package.json is missing or invalid: ${err.message}`
        });
        return { passed: false, checks };
    }

    // 2. Lockfile check (package-lock.json, yarn.lock, or pnpm-lock.yaml)
    const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const lockfileFound = lockfiles.some(f => fsSync.existsSync(path.join(projectDir, f)));
    if (!lockfileFound) {
        checks.push({
            name: 'lockfile',
            status: 'failed',
            reason: 'No deterministic lockfile (package-lock.json/yarn.lock/pnpm-lock.yaml) found.'
        });
    } else {
        checks.push({
            name: 'lockfile',
            status: 'passed',
            reason: 'Deterministic lockfile is present.'
        });
    }

    // 3. AST Import Inventory Match
    const declaredDeps = new Set([
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
        ...Object.keys(packageJson.peerDependencies || {}),
        ...Object.keys(packageJson.optionalDependencies || {})
    ]);

    const discoveredImports = await scanProjectImports(projectDir);
    const undeclared = [];
    for (const pkg of discoveredImports) {
        if (!declaredDeps.has(pkg)) {
            undeclared.push(pkg);
        }
    }

    if (undeclared.length > 0) {
        checks.push({
            name: 'ast_import_inventory',
            status: 'failed',
            reason: `Source code imports undeclared packages: ${undeclared.join(', ')}`,
            undeclared
        });
    } else {
        checks.push({
            name: 'ast_import_inventory',
            status: 'passed',
            reason: `All ${discoveredImports.size} discovered imports are declared in package.json.`,
            count: discoveredImports.size
        });
    }

    // 4. Sandboxed Clean Install (npm ci)
    if (lockfileFound && undeclared.length === 0) {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        try {
            const installRes = await executeInSandbox(npmCmd, ['ci', '--ignore-scripts'], {
                workspace: projectDir,
                timeoutMs: options.timeoutMs || 120000,
                adapter: options.adapter,
                allowHostExecution: options.allowHostExecution
            });

            if (installRes.passed) {
                checks.push({
                    name: 'clean_install',
                    status: 'passed',
                    reason: 'Clean install succeeded in sandbox.'
                });
            } else {
                checks.push({
                    name: 'clean_install',
                    status: 'failed',
                    reason: `Clean install failed in sandbox: ${installRes.stderr || installRes.stdout}`,
                    exitCode: installRes.exitCode
                });
            }
        } catch (err) {
            checks.push({
                name: 'clean_install',
                status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                reason: `Clean install sandbox error: ${err.message}`
            });
        }
    } else {
        checks.push({
            name: 'clean_install',
            status: 'skipped',
            reason: 'Skipped clean install due to prior dependency validation failures.'
        });
    }

    const allPassed = checks.every(c => c.status === 'passed' || c.status === 'skipped');
    return {
        passed: allPassed && !checks.some(c => c.status === 'failed' || c.status === 'blocked'),
        checks
    };
}
