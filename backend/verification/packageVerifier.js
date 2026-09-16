import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import module from 'module';
import crypto from 'crypto';
import { parse } from '@babel/parser';
import { executeInSandbox } from './sandboxRunner.js';
function computeDigest(text) {
    return crypto.createHash('sha256').update(String(text ?? '')).digest('hex');
}
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
    if (trimmed.startsWith('.') || trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.startsWith('@/') || trimmed.startsWith('~/') || trimmed === '@' || trimmed.startsWith('@lib/') || trimmed.startsWith('@components/') || trimmed.startsWith('@app/') || trimmed.startsWith('@actions/')) {
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

    // Worker callers provide an adapter inventory. Never inspect the host workspace.
    const suppliedFiles = Array.isArray(options.files) ? options.files : null;
    const readSupplied = name => suppliedFiles?.find(file => String(file.path || '').replace(/\\/g, '/').toLowerCase().endsWith(`/${name}`) || String(file.path || '').toLowerCase() === name);
    const packageFile = readSupplied('package.json');
    const packageJsonPath = path.join(projectDir, 'package.json');
    let packageJson = null;
    try {
        const content = packageFile ? String(packageFile.content || '') : await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(content);
        checks.push({ name: 'package_json', status: 'passed', reason: 'package.json exists and is valid JSON.' });
    } catch (err) {
        checks.push({ name: 'package_json', status: 'failed', reason: `package.json is missing or invalid: ${err.message}` });
        return { passed: false, checks };
    }
    const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const lockfileFound = suppliedFiles
        ? lockfiles.some(name => Boolean(readSupplied(name)))
        : lockfiles.some(f => fsSync.existsSync(path.join(projectDir, f)));
    checks.push({ name: 'lockfile', status: lockfileFound ? 'passed' : 'failed', reason: lockfileFound ? 'Deterministic lockfile is present.' : 'No deterministic lockfile found.' });
    const declaredDeps = new Set([...Object.keys(packageJson.dependencies || {}), ...Object.keys(packageJson.devDependencies || {}), ...Object.keys(packageJson.peerDependencies || {}), ...Object.keys(packageJson.optionalDependencies || {})]);
    const discoveredImports = suppliedFiles
        ? new Set(suppliedFiles.flatMap(file => CODE_EXTENSIONS.has(path.extname(String(file.path || '')).toLowerCase()) ? [...extractImportsFromCode(String(file.content || ''))] : []))
        : await scanProjectImports(projectDir);
    const undeclared = [...discoveredImports].filter(pkg => !declaredDeps.has(pkg));
    checks.push({ name: 'ast_import_inventory', status: undeclared.length ? 'failed' : 'passed', reason: undeclared.length ? `Source code imports undeclared packages: ${undeclared.join(', ')}` : `All ${discoveredImports.size} discovered imports are declared in package.json.`, undeclared, count: discoveredImports.size });

    // 4. Sandboxed clean install. A populated node_modules directory is not
    // evidence: always execute npm ci against the validated npm lockfile.
    if (!lockfileFound) {
        checks.push({
            name: 'clean_install',
            status: 'blocked',
            command: null,
            reason: 'Clean install blocked because a deterministic lockfile is missing.'
        });
    } else if (!(suppliedFiles ? Boolean(readSupplied('package-lock.json')) : fsSync.existsSync(path.join(projectDir, 'package-lock.json')))) {
        checks.push({
            name: 'clean_install',
            status: 'blocked',
            command: null,
            reason: 'Unsupported toolchain: only npm package-lock.json is supported for clean verification.'
        });
    } else if (undeclared.length > 0) {
        checks.push({
            name: 'clean_install',
            status: 'blocked',
            command: null,
            reason: 'Clean install blocked by undeclared imports.'
        });
    } else {
        const npmCmd = (options.adapter?.id === 'docker-worker' || options.adapter?.getCapabilities?.().adapterId === 'docker-worker') ? 'npm' : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
        const installArgs = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
        try {
            const installRes = await executeInSandbox(npmCmd, installArgs, {
                workspace: projectDir,
                timeoutMs: options.timeoutMs || 600000,
                adapter: options.adapter,
                signal: options.signal,
                env: options.env
            });
            checks.push({
                name: 'clean_install',
                status: installRes.passed ? 'passed' : 'failed',
                command: `${npmCmd} ${installArgs.join(' ')}`,
                exitCode: installRes.exitCode ?? (installRes.passed ? 0 : 1),
                stdout: installRes.stdout || '',
                stderr: installRes.stderr || '',
                stdoutDigest: computeDigest(installRes.stdout),
                stderrDigest: computeDigest(installRes.stderr),
                reason: installRes.passed ? 'Clean npm ci install succeeded in sandbox.' : `Clean install failed in sandbox: ${installRes.stderr || installRes.stdout}`
            });
        } catch (err) {
            checks.push({
                name: 'clean_install',
                status: err.code === 'SANDBOX_UNAVAILABLE' ? 'blocked' : 'failed',
                command: `${npmCmd} ${installArgs.join(' ')}`,
                exitCode: err.exitCode ?? null,
                stdout: err.stdout || '',
                stderr: err.stderr || err.message || '',
                stdoutDigest: computeDigest(err.stdout),
                stderrDigest: computeDigest(err.stderr || err.message),
                reason: `Clean install sandbox error: ${err.message}`
            });
        }
    }

    const allPassed = checks.every(c => c.status === 'passed' || c.status === 'skipped');
    return {
        passed: allPassed && !checks.some(c => c.status === 'failed' || c.status === 'blocked'),
        checks
    };
}
