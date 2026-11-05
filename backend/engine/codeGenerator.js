/**
 * Çok Dosyalı Kod Üretim ve Dosya Yazma Modülü (Tool Use & Dark Factory)
 * Referans: Archon Code Generator
 */

import fs from 'fs/promises';
import fsSync from 'node:fs';
import path from 'path';
import { isBuiltin } from 'node:module';
import { randomUUID } from 'node:crypto';
import { isSafeProjectPath } from '../security.js';
import { writeStructuredLog } from '../observability.js';
import { commitWorkflowSource } from '../workflowAttempts.js';
import { buildDockerfileContent, buildDockerignoreContent, buildServiceLauncherContent } from './templates/dockerTemplates.js';
import { ensurePrismaAndAuthTemplates, ensureUserModelInSchema } from './templates/prismaTemplates.js';

export { buildDockerfileContent, buildDockerignoreContent } from './templates/dockerTemplates.js';
export { ensurePrismaAndAuthTemplates, ensureUserModelInSchema } from './templates/prismaTemplates.js';

// The worker resolves this dist-tag into the artifact lockfile. Keeping the
// policy in one place avoids stale version claims in generated manifests.
export const LATEST_STABLE_VERSION = 'latest';
const KNOWN_PACKAGE_VERSIONS = {
    'clsx': LATEST_STABLE_VERSION,
    'tailwind-merge': LATEST_STABLE_VERSION,
    'lucide-react': LATEST_STABLE_VERSION,
    'zod': '^3.24.1', // Agent contracts currently generate Zod 3 APIs.
    'tailwindcss-animate': LATEST_STABLE_VERSION,
    'react-hook-form': LATEST_STABLE_VERSION,
    '@hookform/resolvers': LATEST_STABLE_VERSION,
    'sonner': LATEST_STABLE_VERSION,
    'axios': LATEST_STABLE_VERSION,
    'swr': LATEST_STABLE_VERSION,
    '@tanstack/react-query': LATEST_STABLE_VERSION,
    'date-fns': LATEST_STABLE_VERSION,
    'dayjs': LATEST_STABLE_VERSION,
    'framer-motion': LATEST_STABLE_VERSION,
    'canvas-confetti': LATEST_STABLE_VERSION,
    '@types/canvas-confetti': LATEST_STABLE_VERSION,
    'recharts': LATEST_STABLE_VERSION,
    'zustand': LATEST_STABLE_VERSION,
    'bcryptjs': LATEST_STABLE_VERSION,
    '@types/bcryptjs': LATEST_STABLE_VERSION,
    'jsonwebtoken': LATEST_STABLE_VERSION,
    '@types/jsonwebtoken': LATEST_STABLE_VERSION,
    'next-auth': LATEST_STABLE_VERSION,
    'uuid': LATEST_STABLE_VERSION,
    '@types/uuid': LATEST_STABLE_VERSION,
    'express': LATEST_STABLE_VERSION,
    'express-rate-limit': '8.6.1', // Generated skip/header options require the modern API; 1.x adds progressive delays.
    'cors': LATEST_STABLE_VERSION,
    'helmet': LATEST_STABLE_VERSION,
    'dotenv': LATEST_STABLE_VERSION,
    'morgan': LATEST_STABLE_VERSION,
    '@types/express': LATEST_STABLE_VERSION,
    '@types/cors': LATEST_STABLE_VERSION,
    '@types/morgan': LATEST_STABLE_VERSION,
    'cookie-parser': LATEST_STABLE_VERSION,
    '@types/cookie-parser': LATEST_STABLE_VERSION,
    'class-variance-authority': LATEST_STABLE_VERSION,
    'nanoid': LATEST_STABLE_VERSION,
    'jose': LATEST_STABLE_VERSION,
    'tailwindcss': '^3.4.17',
    'postcss': LATEST_STABLE_VERSION,
    'autoprefixer': LATEST_STABLE_VERSION,
    'typescript': LATEST_STABLE_VERSION,
    'prisma': '^6.4.0',
    'tsx': LATEST_STABLE_VERSION,
    'nodemon': LATEST_STABLE_VERSION,
    'vite': LATEST_STABLE_VERSION,
    '@vitejs/plugin-react': LATEST_STABLE_VERSION,
    '@vitejs/plugin-vue': LATEST_STABLE_VERSION,
    'vue': '^3.0.0',
    'vue-router': '^4.0.0',
    'pinia': LATEST_STABLE_VERSION,
    '@prisma/client': '^6.4.0',
    'next': LATEST_STABLE_VERSION,
    'react': '^18.3.1',
    'react-dom': '^18.3.1',
    '@types/node': LATEST_STABLE_VERSION,
    '@types/react': '^18.3.1',
    '@types/react-dom': '^18.3.1'
};

const DEV_TOOLCHAIN_PACKAGES = new Set([
    'tailwindcss',
    'postcss',
    'autoprefixer',
    'typescript',
    'prisma',
    'tsx',
    'nodemon',
    'vite',
    '@vitejs/plugin-react',
    '@vitejs/plugin-vue',
    'eslint',
    'prettier'
]);

function isDevPackage(pkg) {
    return pkg.startsWith('@types/') || DEV_TOOLCHAIN_PACKAGES.has(pkg);
}

const NODE_BUILTINS = new Set([
    'fs', 'fs/promises', 'path', 'url', 'http', 'https', 'crypto',
    'events', 'os', 'stream', 'util', 'child_process', 'assert', 'buffer',
    'next', 'next/server', 'next/font', 'next/font/google', 'next/navigation',
    'next/router', 'next/link', 'next/image', 'next/head', 'react', 'react-dom'
]);

/**
 * Üretilen dosyalardaki tüm harici paket importlarını otomatik tarar.
 */
export async function scanUsedNpmPackages(projectDir) {
    const usedPackages = new Set();
    const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue']);
    const ignoredDirectories = new Set(['node_modules', '.git', '.next', 'coverage', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);

    async function scanDir(currentDir) {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (ignoredDirectories.has(entry.name)) continue;
                const resPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await scanDir(resPath);
                } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
                    const content = await fs.readFile(resPath, 'utf8');
                    const importMatches = content.matchAll(/(?:import\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g);
                    for (const match of importMatches) {
                        const specifier = match[1];
                        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/') || specifier.startsWith('@lib/') || specifier.startsWith('@components/') || specifier.startsWith('@app/') || specifier.startsWith('@actions/')) continue;
                        if (specifier.startsWith('node:') || isBuiltin(specifier) || NODE_BUILTINS.has(specifier)) continue;

                        // Paket adını ayrıştır (örn: @prisma/client veya sonner veya lucide-react/dist/...)
                        let pkgName = specifier;
                        if (specifier.startsWith('@')) {
                            const parts = specifier.split('/');
                            pkgName = parts.slice(0, 2).join('/');
                        } else {
                            pkgName = specifier.split('/')[0];
                        }

                        if (pkgName && !NODE_BUILTINS.has(pkgName)) {
                            usedPackages.add(pkgName);
                        }
                    }
                }
            }
        } catch {}
    }

    await scanDir(projectDir);
    return Array.from(usedPackages);
}
export const GENERATION_LIMITS = {
    MAX_FILES: 100,
    MAX_FILE_SIZE_BYTES: 1024 * 1024, // 1 MB
    MAX_TOTAL_BYTES: 10 * 1024 * 1024, // 10 MB
    MAX_DIRECTORY_DEPTH: 8
};

const PROTECTED_PROTOCOL_FILES = new Set([
    'talimatname.md',
    'durum.md',
    'gorev.md',
    'todo.md',
    'rapor.md',
    'alt-talimatname.md'
]);

const PROTECTED_ORCHESTRATION_PREFIXES = [
    'manager/',
    'directors/',
    'teamleaders/',
    '.git/',
    'node_modules/'
];

const ALLOWED_GENERATED_DOTFILES = new Set([
    '.gitignore',
    '.env.example',
    '.eslintrc',
    '.eslintrc.json',
    '.eslintrc.js',
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    '.babelrc',
    '.npmrc'
]);

/**
 * Üretilen dosyanın orkestrasyon metadata/protokol dosyası olup olmadığını denetler.
 */
export function isProtectedOrchestrationPath(filePath) {
    if (!filePath || typeof filePath !== 'string') return true;
    
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const lower = normalized.toLowerCase();
    const baseName = path.basename(lower);

    // 1. Protokol dosya adları
    if (PROTECTED_PROTOCOL_FILES.has(baseName)) {
        return true;
    }

    // 2. Orkestrasyon ve metadata dizinleri
    for (const prefix of PROTECTED_ORCHESTRATION_PREFIXES) {
        if (lower.startsWith(prefix) || lower.includes(`/${prefix}`)) {
            return true;
        }
    }

    // 3. İzin verilmeyen gizli (.dot) dosyalar
    if (baseName.startsWith('.') && !ALLOWED_GENERATED_DOTFILES.has(baseName)) {
        return true;
    }

    return false;
}

/**
 * Üretilen dosya kümesini kota sınırlarına (dosya sayısı, boyut, derinlik) göre doğrular.
 */
export function validateGenerationQuotas(files = []) {
    if (!Array.isArray(files)) {
        return { valid: false, error: 'Geçersiz dosya listesi formatı.' };
    }

    if (files.length > GENERATION_LIMITS.MAX_FILES) {
        return {
            valid: false,
            error: `Toplam dosya sayısı limiti aşıldı (${files.length} > ${GENERATION_LIMITS.MAX_FILES}).`
        };
    }

    let totalBytes = 0;
    for (const file of files) {
        if (!file?.path || typeof file.content !== 'string') continue;

        const fileSize = Buffer.byteLength(file.content, 'utf8');
        if (fileSize > GENERATION_LIMITS.MAX_FILE_SIZE_BYTES) {
            return {
                valid: false,
                error: `"${file.path}" için tekil dosya boyutu limiti aşıldı (${fileSize} bayt > ${GENERATION_LIMITS.MAX_FILE_SIZE_BYTES} bayt).`
            };
        }
        totalBytes += fileSize;

        // Dizin derinliği kontrolü
        const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
        const segments = normalized.split('/').filter(Boolean);
        if (segments.length > GENERATION_LIMITS.MAX_DIRECTORY_DEPTH) {
            return {
                valid: false,
                error: `"${file.path}" için dizin derinlik limiti aşıldı (${segments.length} > ${GENERATION_LIMITS.MAX_DIRECTORY_DEPTH}).`
            };
        }
    }
    if (totalBytes > GENERATION_LIMITS.MAX_TOTAL_BYTES) {
        return {
            valid: false,
            error: `Toplam üretilen içerik boyutu limiti aşıldı (${totalBytes} bayt > ${GENERATION_LIMITS.MAX_TOTAL_BYTES} bayt).`
        };
    }

    return { valid: true };
}

// normalizeGeneratedIdentifier'ın TEK canonical kaynağı ../generatedIdentifiers.js'tir.
// Geriye uyum için yeniden dışa aktarılır; burada duplicate implementasyon yok.
export { normalizeGeneratedIdentifier } from '../generatedIdentifiers.js';

// Check existing components, including the project root and its ancestors.
// lstat also detects dangling links, which realpath alone cannot reject safely.
async function assertGeneratedWriteDestination(target, projectDir) {
    const root = path.resolve(projectDir);
    const absolute = path.resolve(target);
    const relative = path.relative(root, absolute);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Generated write destination must be inside its project root.');
    }
    let current = absolute;
    for (;;) {
        try {
            const stat = await fs.lstat(current);
            if (stat.isSymbolicLink()) throw new Error(`Symbolic link or junction in generated write destination: ${current}`);
            if (current === absolute ? !stat.isFile() : !stat.isDirectory()) {
                throw new Error(`Invalid generated write destination type: ${current}`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
}


/**
 * Coder tarafından üretilen dosyaları doğrular ve hem ajanın kendi klasörüne
 * hem de projenin kaynak dizinine güvenle yazar.
 */
export async function writeGeneratedFiles(projectDir, coderDir, files = [], allowedTargetFiles = null, sourceFence = null) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error('Yazılacak geçerli dosya bulunamadı.');
    }

    // Target Allowlist Enforce (P1-A Contract)
    if (Array.isArray(allowedTargetFiles) && allowedTargetFiles.length > 0) {
        const allowedSet = new Set(allowedTargetFiles.map(p => path.normalize(p).replace(/\\/g, '/')));
        for (const file of files) {
            if (file && file.path) {
                const norm = path.normalize(file.path).replace(/\\/g, '/');
                if (!allowedSet.has(norm)) {
                    throw new Error(`Coder çıktısındaki "${file.path}" dosyası görevin hedef dosya sözleşmesinde (allowlist: ${allowedTargetFiles.join(', ')}) yer almıyor.`);
                }
            }
        }
    }

    // 1. Yazma sınırı değişmezi (Write Boundary Invariant): Kota ve limit denetimi
    const quotaCheck = validateGenerationQuotas(files);
    if (!quotaCheck.valid) {
        throw new Error(`Üretim kotası aşıldı: ${quotaCheck.error}`);
    }
    // Güvenlik: coderDir yalnızca proje kök dizini içinde olabilir (lexical containment).
    // Proje root'u dışına veya aynı root'a işaret eden coderDir fail-closed reddedilir.
    // Bu kontrolden ÖNCE hiçbir dosya yazılmaz.
    if (coderDir) {
        const projectAbs = path.resolve(projectDir);
        const coderAbs = path.resolve(coderDir);
        const rel = path.relative(projectAbs, coderAbs);
        const isInside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
        if (!isInside) {
            throw new Error(
                `coderDir proje kök dizininin (${projectAbs}) dışında olamaz: ${coderAbs}`
            );
        }
    }

    // Aday dosyaları filtrele ve hedef yolları hesapla (henüz yazma yok).
    const candidates = [];
    for (const file of files) {
        if (!file.path || typeof file.content !== 'string') {
            continue;
        }

        // Güvenlik: Path Traversal Kontrolü
        if (!isSafeProjectPath(file.path, projectDir)) {
            writeStructuredLog('warn', 'security.generated_path_rejected', { file: file.path });
            continue;
        }

        // Güvenlik: Orkestrasyon metadata ve protokol dosyası koruma guard'ı
        if (isProtectedOrchestrationPath(file.path)) {
            writeStructuredLog('warn', 'security.protected_path_rejected', { file: file.path });
            continue;
        }

        const targetPath = path.join(projectDir, file.path);
        candidates.push({ file, targetPath });
    }

    const destinations = candidates.flatMap(({ file, targetPath }) => [
        { targetPath, content: file.content },
        ...(coderDir ? [{ targetPath: path.join(coderDir, file.path.replace(/[\\/]/g, '__')), content: file.content }] : [])
    ]);
    // Preflight both source and coder-copy destinations before creating anything.
    for (const { targetPath } of destinations) await assertGeneratedWriteDestination(targetPath, projectDir);

    const staged = [];
    let primaryError = null;
    try {
        for (const { targetPath, content } of destinations) {
            await assertGeneratedWriteDestination(targetPath, projectDir);
            const parent = path.dirname(targetPath);
            await fs.mkdir(parent, { recursive: true });
            await assertGeneratedWriteDestination(targetPath, projectDir);
            const temporaryPath = path.join(parent, `.xfactor-generated-${randomUUID()}.tmp`);
            const mode = await fs.lstat(targetPath).then(stat => stat.mode & 0o777, error => {
                if (error.code !== 'ENOENT') throw error;
                return 0o666;
            });
            // Exclusive staging never opens or truncates a pre-existing linked file.
            const handle = await fs.open(temporaryPath, 'wx', mode);
            staged.push({ targetPath, temporaryPath });
            try { await handle.writeFile(content, 'utf8'); }
            finally { await handle.close(); }
        }
        commitStagedSources(projectDir, staged, sourceFence);
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        await cleanupStagedSources(staged, primaryError);
    }
    return candidates.map(({ file }) => ({ path: file.path, size: Buffer.byteLength(file.content, 'utf8') }));
}

async function cleanupStagedSources(staged, primaryError) {
    const failures = [];
    for (const { temporaryPath } of staged) {
        try { await fs.unlink(temporaryPath); }
        catch (error) { if (error.code !== 'ENOENT') failures.push(error); }
    }
    if (!failures.length) return;
    if (primaryError) primaryError.cleanupFailures = [...(primaryError.cleanupFailures || []), ...failures];
    else throw failures[0];
}

function commitStagedSources(projectDir, staged, sourceFence) {
    const committedPaths = [];
    try {
        commitWorkflowSource(sourceFence, () => {
            // Recheck every ancestor without yielding while holding SQLite's
            // writer lock. This protects cooperative workflow writers; an OS
            // adversary swapping ancestors needs stronger OS handle APIs.
            for (const { targetPath, exclusive } of staged) {
                let current = path.resolve(targetPath);
                for (;;) {
                    try {
                        const stat = fsSync.lstatSync(current);
                        if (stat.isSymbolicLink() || (current === path.resolve(targetPath) ? !stat.isFile() : !stat.isDirectory())) {
                            throw new Error(`Invalid generated write destination: ${current}`);
                        }
                        if (exclusive && current === path.resolve(targetPath)) {
                            const error = new Error(`File already exists: ${targetPath}`);
                            error.code = 'EEXIST';
                            throw error;
                        }
                    } catch (error) { if (error.code !== 'ENOENT') throw error; }
                    const parent = path.dirname(current);
                    if (parent === current) break;
                    current = parent;
                }
            }
            for (const { targetPath, temporaryPath } of staged) {
                fsSync.renameSync(temporaryPath, targetPath);
                committedPaths.push(path.relative(projectDir, targetPath));
            }
        });
    } catch (error) {
        // Filesystem batches cannot be rolled back by SQLite. Never retry a
        // partial batch automatically or report it as a completed checkpoint.
        if (committedPaths.length) {
            error.sourceCommitPartial = true;
            error.committedPaths = committedPaths;
        }
        throw error;
    }
}

// Trusted scaffold/README writer. It uses the same staging and commit fence,
// while retaining scaffold-only names such as .dockerignore and wx semantics.
export async function writeSourceFile(projectDir, targetPath, content, options = 'utf8', sourceFence = null) {
    await assertGeneratedWriteDestination(targetPath, projectDir);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await assertGeneratedWriteDestination(targetPath, projectDir);
    const temporaryPath = path.join(path.dirname(targetPath), `.xfactor-generated-${randomUUID()}.tmp`);
    const mode = await fs.lstat(targetPath).then(stat => stat.mode & 0o777, error => {
        if (error.code !== 'ENOENT') throw error;
        return 0o666;
    });
    let primaryError = null;
    try {
        const handle = await fs.open(temporaryPath, 'wx', mode);
        try {
            await handle.writeFile(content, typeof options === 'string' ? options : options.encoding || 'utf8');
        } finally { await handle.close(); }
        commitStagedSources(projectDir, [{ targetPath, temporaryPath, exclusive: options?.flag === 'wx' }], sourceFence);
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        await cleanupStagedSources([{ temporaryPath }], primaryError);
    }
}

export function isAuthRequested(state = {}, plan = {}) {
    if (plan?.management?.needed === true || state?.contract?.management?.needed === true) return true;
    if (state?.contract?.authentication?.required === true || state?.contract?.auth?.required === true
        || state?.auth === true || state?.hasAuth === true || plan?.hasAuth === true) {
        return true;
    }
    if (plan?.management?.needed === false || state?.contract?.management?.needed === false
        || state?.contract?.authentication?.required === false) return false;
    const authRegex = /auth|login|giris|kullanici|user/i;
    if (typeof state?.title === 'string' && authRegex.test(state.title)) return true;
    if (typeof state?.plan === 'string' && authRegex.test(state.plan)) return true;
    if (typeof plan === 'string' && authRegex.test(plan)) return true;
    if (typeof plan?.talimatname === 'string' && authRegex.test(plan.talimatname)) return true;
    if (typeof plan?.summary === 'string' && authRegex.test(plan.summary)) return true;
    return false;
}

/**
 * Üretilen projenin bağımsız olarak hemen çalıştırılabilir olmasını garanti eder (Scaffold Guard).
 * package.json, tsconfig.json, globals.css, tailwind.config vb. eksikse otomatik üretir.
 */
export async function detectProjectStack(projectDir, state = {}, plan = {}) {
    let hasNextApp = false;
    let hasVite = false;
    let hasPrisma = false;
    let hasTypeScript = false;

    try {
        const appStat = await fs.stat(path.join(projectDir, 'src', 'app')).catch(() => null);
        if (appStat && appStat.isDirectory()) hasNextApp = true;
        const nextCfgStat = await fs.stat(path.join(projectDir, 'next.config.js')).catch(() => null) ||
                            await fs.stat(path.join(projectDir, 'next.config.mjs')).catch(() => null) ||
                            await fs.stat(path.join(projectDir, 'next.config.ts')).catch(() => null);
        if (nextCfgStat) hasNextApp = true;

        const viteCfgStat = await fs.stat(path.join(projectDir, 'vite.config.js')).catch(() => null) ||
                            await fs.stat(path.join(projectDir, 'vite.config.ts')).catch(() => null) ||
                            await fs.stat(path.join(projectDir, 'vite.config.mjs')).catch(() => null);
        if (viteCfgStat) hasVite = true;

        const prismaStat = await fs.stat(path.join(projectDir, 'prisma', 'schema.prisma')).catch(() => null) ||
                           await fs.stat(path.join(projectDir, 'schema.prisma')).catch(() => null);
        if (prismaStat) hasPrisma = true;

        const tsconfigStat = await fs.stat(path.join(projectDir, 'tsconfig.json')).catch(() => null);
        if (tsconfigStat) hasTypeScript = true;
    } catch {}

    const specText = `${state.title || ''} ${plan.summary || ''} ${plan.talimatname || ''}`.toLowerCase();
    const hasReactKeyword = specText.includes('react') || specText.includes('frontend') || specText.includes('ui') || specText.includes('client');
    const isVue = /\bvue\s*(?:3|js)?\b|vue\.js|pinia|vue-router/i.test(specText);
    const isExpressOnly = (specText.includes('express') || specText.includes('rest api') || specText.includes('node api') || specText.includes('backend api')) && !hasReactKeyword && !isVue && !hasNextApp && !hasVite;

    if (specText.includes('next.js') || specText.includes('nextjs') || specText.includes('app router')) {
        hasNextApp = true;
    } else if (specText.includes('vite') || specText.includes('react spa') || isVue
        || (hasReactKeyword && /\bexpress(?:\.js)?\b/.test(specText))) {
        hasVite = true;
    }
    if (specText.includes('prisma') || specText.includes('sqlite') || specText.includes('database')) {
        hasPrisma = true;
    }
    if (specText.includes('typescript') || specText.includes('ts') || specText.includes('tsx')) {
        hasTypeScript = true;
    }

    const isNext = hasNextApp || (!hasVite && !isExpressOnly);
    // Split runtime: Next.js or Vite owns the UI, src/server.ts starts the
    // default-exported Express application in src/httpApp.ts (legacy app.ts is preserved).
    const hasExpressApi = (isNext || hasVite) && /\bexpress(?:\.js)?\b/.test(specText);
    const framework = isNext ? 'nextjs' : (hasVite ? 'vite' : (isExpressOnly ? 'express' : 'node'));

    return {
        framework,
        isNext,
        hasNextApp,
        hasVite,
        hasExpressApi,
        isExpressOnly,
        isVue,
        hasPrisma,
        hasTypeScript
    };
}

export async function ensureProjectScaffold(projectDir, state = {}, plan = {}, sourceFence = null) {
    const writeSource = (targetPath, content, options) => writeSourceFile(projectDir, targetPath, content, options, sourceFence);
    const title = state.title || 'xfactor-app';
    const safeName = title.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';

    // 1. Proje Türü / Framework Algılama
    const isAuthRequired = isAuthRequested(state, plan);
    const stack = await detectProjectStack(projectDir, state, plan);
    if (stack.hasNextApp && stack.hasVite) {
        throw new Error('Worker repair requires Manager revision: framework conflict: existing Next output and requested/detected Vite runtime. Preserve the current framework in a repair revision, or generate the new architecture as a separate project; source files were not changed.');
    }
    let { isNext, hasPrisma, isExpressOnly, isVue, hasExpressApi, hasVite } = stack;
    if (isAuthRequired) {
        hasPrisma = true;
    }
    const pkgPath = path.join(projectDir, 'package.json');
    let currentPkg = {};
    try {
        const raw = await fs.readFile(pkgPath, 'utf8');
        currentPkg = JSON.parse(raw);
    } catch {}

    const baseDependencies = {
        'react': '^18.3.1',
        'react-dom': '^18.3.1'
    };

    if (hasPrisma) {
        baseDependencies['@prisma/client'] = '^6.4.0';
    }

    const baseDevDependencies = {
        '@types/node': LATEST_STABLE_VERSION,
        '@types/react': '^18.3.1',
        '@types/react-dom': '^18.3.1',
        'autoprefixer': LATEST_STABLE_VERSION,
        'postcss': LATEST_STABLE_VERSION,
        'tailwindcss': '^3.4.17',
        'typescript': LATEST_STABLE_VERSION
    };

    if (hasPrisma) {
        baseDevDependencies['prisma'] = '^6.4.0';
        baseDevDependencies['tsx'] = LATEST_STABLE_VERSION;
    }
    if (isVue && !isNext) {
        delete baseDependencies.react;
        delete baseDependencies['react-dom'];
        delete baseDevDependencies['@types/react'];
        delete baseDevDependencies['@types/react-dom'];
        baseDependencies.vue = '^3.0.0';
        baseDependencies['vue-router'] = '^4.0.0';
        baseDependencies.pinia = LATEST_STABLE_VERSION;
    }

    let scripts = {};
    if (isNext) {
        baseDependencies['next'] = LATEST_STABLE_VERSION;
        baseDevDependencies['eslint'] = LATEST_STABLE_VERSION;
        baseDevDependencies['eslint-config-next'] = LATEST_STABLE_VERSION;
        scripts = {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'eslint .',
            test: 'node --test tests/*.test.js',
            ...(hasPrisma ? {
                'prisma:generate': 'prisma generate',
                'prisma:push': 'prisma db push',
                'prisma:seed': 'prisma db seed'
            } : {})
        };
    } else if (isExpressOnly) {
        delete baseDependencies['react'];
        delete baseDependencies['react-dom'];

        delete baseDevDependencies['@types/react'];
        delete baseDevDependencies['@types/react-dom'];
        delete baseDevDependencies['autoprefixer'];
        delete baseDevDependencies['postcss'];
        delete baseDevDependencies['tailwindcss'];

        baseDependencies['express'] = LATEST_STABLE_VERSION;
        baseDependencies['cors'] = LATEST_STABLE_VERSION;
        baseDependencies['dotenv'] = LATEST_STABLE_VERSION;
        baseDevDependencies['@types/express'] = LATEST_STABLE_VERSION;
        baseDevDependencies['nodemon'] = LATEST_STABLE_VERSION;
        scripts = {
            dev: 'node server.js',
            start: 'node server.js',
            ...(hasPrisma ? {
                'prisma:generate': 'prisma generate',
                'prisma:push': 'prisma db push',
                'prisma:seed': 'prisma db seed'
            } : {})
        };
    } else {
        baseDevDependencies['vite'] = LATEST_STABLE_VERSION;
        baseDevDependencies[isVue ? '@vitejs/plugin-vue' : '@vitejs/plugin-react'] = LATEST_STABLE_VERSION;
        scripts = {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            ...(hasPrisma ? {
                'prisma:generate': 'prisma generate',
                'prisma:push': 'prisma db push',
                'prisma:seed': 'prisma db seed'
            } : {})
        };
    }

    if (hasExpressApi) {
        Object.assign(baseDependencies, { express: '^4.21.2', cors: LATEST_STABLE_VERSION, dotenv: LATEST_STABLE_VERSION });
        Object.assign(baseDevDependencies, { '@types/express': '^4.17.21', '@types/cors': LATEST_STABLE_VERSION, tsx: LATEST_STABLE_VERSION });
        scripts['dev:api'] = 'tsx watch src/server.ts';
        scripts['start:api'] = 'tsx src/server.ts';
        scripts['start:services'] = 'node scripts/xfactor-start.cjs';
    }

    // Otomatik İthalat Taraması: Dosyalarda kullanılan harici paketleri bul ve ekle
    const scannedPackages = await scanUsedNpmPackages(projectDir);
    const scannedDeps = {};
    const scannedDevDeps = {};
    for (const pkg of scannedPackages) {
        const version = (pkg === 'express-rate-limit' && (currentPkg.dependencies?.[pkg] || currentPkg.devDependencies?.[pkg]))
            || KNOWN_PACKAGE_VERSIONS[pkg] || '^1.0.0';
        if (isDevPackage(pkg)) {
            scannedDevDeps[pkg] = version;
        } else {
            scannedDeps[pkg] = version;
        }
    }

    const finalPkg = {
        name: currentPkg.name || safeName,
        version: currentPkg.version || '1.0.0',
        private: true,
        ...(currentPkg.type ? { type: currentPkg.type } : {}),
        scripts: {
            ...scripts,
            ...(currentPkg.scripts || {}),
            ...(hasPrisma ? { 'prisma:seed': currentPkg.scripts?.['prisma:seed'] || 'prisma db seed' } : {}),
            ...(plan?.management?.needed === true && hasPrisma ? {
                'xfactor:test:setup': currentPkg.scripts?.['xfactor:test:setup'] || 'prisma db push && prisma db seed'
            } : {})
        },
        ...(hasPrisma ? {
            prisma: {
                ...(currentPkg.prisma && typeof currentPkg.prisma === 'object' ? currentPkg.prisma : {}),
                seed: currentPkg.prisma?.seed || 'tsx prisma/seed.ts'
            }
        } : {}),
        dependencies: {
            ...Object.fromEntries(
                Object.entries(currentPkg.dependencies || {}).filter(
                    ([k]) => !k.startsWith('@lib/') && !k.startsWith('@components/') && !k.startsWith('@app/') && !k.startsWith('@actions/')
                )
            ),
            ...baseDependencies,
            ...scannedDeps
        },
        devDependencies: {
            ...(currentPkg.devDependencies || {}),
            ...baseDevDependencies,
            ...scannedDevDeps,
            ...(hasPrisma ? {
                prisma: '^6.4.0',
                tsx: LATEST_STABLE_VERSION
            } : {})
        }
    };

    // Imported packages must not replace the compatible Express 4 runtime/types.
    if (hasExpressApi) {
        await fs.mkdir(path.join(projectDir, 'scripts'), { recursive: true });
        try {
            await writeSource(path.join(projectDir, 'scripts/xfactor-start.cjs'), buildServiceLauncherContent(), { encoding: 'utf8', flag: 'wx' });
        } catch (error) { if (error.code !== 'EEXIST') throw error; }
        finalPkg.dependencies.express = currentPkg.dependencies?.express || '^4.21.2';
        finalPkg.devDependencies['@types/express'] = currentPkg.devDependencies?.['@types/express'] || '^4.17.21';
    }

    if (isVue && !isNext) {
        for (const packageName of ['react', 'react-dom']) delete finalPkg.dependencies[packageName];
        for (const packageName of ['@types/react', '@types/react-dom', '@vitejs/plugin-react']) {
            delete finalPkg.devDependencies[packageName];
        }
        finalPkg.dependencies.vue = '^3.0.0';
        finalPkg.dependencies['vue-router'] = '^4.0.0';
        finalPkg.dependencies.pinia = LATEST_STABLE_VERSION;
        finalPkg.devDependencies['@vitejs/plugin-vue'] = LATEST_STABLE_VERSION;
    }

    await writeSource(pkgPath, JSON.stringify(finalPkg, null, 2), 'utf8');
    if (isNext) {
        const lintConfigs = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.js'];
        const hasLintConfig = (await Promise.all(lintConfigs.map(name => fs.stat(path.join(projectDir, name)).then(() => true).catch(() => false)))).some(Boolean);
        if (!hasLintConfig) {
            await writeSource(path.join(projectDir, 'eslint.config.mjs'),
                "import { defineConfig } from 'eslint/config';\nimport nextVitals from 'eslint-config-next/core-web-vitals';\n\nexport default defineConfig([...nextVitals]);\n", 'utf8');
        }
    }

    const serviceManifestPath = path.join(projectDir, 'service-manifest.json');
    try {
        await fs.stat(serviceManifestPath);
    } catch {
        const service = isNext
            ? { type: 'nextjs', command: 'npm', args: ['run', 'start'], port: 3000, healthEndpoint: '/' }
            : isExpressOnly
                ? { type: 'express', command: 'npm', args: ['run', 'start'], port: 3000, healthEndpoint: '/health' }
                : { type: 'vite', command: 'npm', args: ['run', 'preview', '--', '--host', '0.0.0.0', '--port', '4173'], port: 4173, healthEndpoint: '/' };
        await writeSource(
            serviceManifestPath,
            JSON.stringify({ version: '1.0', services: {
                web: service,
                ...(hasExpressApi ? { api: {
                    type: 'express', command: 'npm', args: ['run', 'start:api'], port: 3001, healthEndpoint: '/api/health'
                } } : {})
            } }, null, 2),
            'utf8'
        );
    }

    let apiPort = 3001;
    if (hasExpressApi) {
        // Upgrade an earlier UI-only scaffold without replacing declared services.
        // Invalid/user-defined manifests remain for the verifier to diagnose.
        let manifest;
        try { manifest = JSON.parse(await fs.readFile(serviceManifestPath, 'utf8')); } catch {}
        if (manifest?.services && typeof manifest.services === 'object' && !Array.isArray(manifest.services)
            && !manifest.services.api && !Object.values(manifest.services).some(service => service?.type === 'express')) {
            const occupiedPorts = new Set(Object.values(manifest.services).map(service => Number(service?.port)));
            if (!occupiedPorts.has(3001)) {
                manifest.services.api = { type: 'express', command: 'npm', args: ['run', 'start:api'], port: 3001, healthEndpoint: '/api/health' };
                await writeSource(serviceManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
            }
        }
        const api = manifest?.services?.api || Object.values(manifest?.services || {}).find(service => service?.type === 'express');
        if (Number.isInteger(api?.port) && api.port >= 1024 && api.port <= 65535) apiPort = api.port;
        await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
        const existingRuntimeFiles = await fs.readdir(path.join(projectDir, 'src'));
        // Existing bootstraps own their imports. Injecting an unused app.ts can
        // collide with the React App module on case-insensitive filesystems.
        if (!existingRuntimeFiles.some(name => name.toLowerCase() === 'server.ts')) {
            const apiModule = existingRuntimeFiles.includes('httpApp.ts') ? 'httpApp'
                : existingRuntimeFiles.includes('app.ts') ? 'app' : 'httpApp';
            const runtimeFiles = {
                [`src/${apiModule}.ts`]: `import express from 'express';\nimport cors from 'cors';\n\nconst app = express();\napp.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:${isNext ? 3000 : 4173}', credentials: true }));\napp.use(express.json());\napp.get('/api/health', (_req, res) => res.json({ status: 'healthy' }));\n\n// Register application routers here; src/server.ts owns the listener.\nexport default app;\n`,
                'src/server.ts': `import 'dotenv/config';\nimport app from './${apiModule}';\n\n// XFactor ${isNext ? 'Next.js' : 'Vite'} + Express runtime contract: API ${apiPort}.\nconst port = Number(process.env.PORT || ${apiPort});\nconst server = app.listen(port, process.env.HOST || '0.0.0.0');\nfor (const signal of ['SIGTERM', 'SIGINT'] as const) {\n  process.once(signal, () => server.close(() => process.exit(0)));\n}\n`
            };
            for (const [relativePath, content] of Object.entries(runtimeFiles)) {
                try { await writeSource(path.join(projectDir, relativePath), content, { encoding: 'utf8', flag: 'wx' }); }
                catch (error) { if (error.code !== 'EEXIST') throw error; }
            }
        }
    }

    // 3. tsconfig.json Kontrolü (@/* Path Alias Çözümü)
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    try {
        await fs.stat(tsconfigPath);
    } catch {
        const tsconfigContent = {
            compilerOptions: {
                target: 'es2022',
                lib: ['dom', 'dom.iterable', 'esnext'],
                allowJs: true,
                skipLibCheck: true,
                strict: false,
                noEmit: true,
                esModuleInterop: true,
                module: 'esnext',
                moduleResolution: 'bundler',
                resolveJsonModule: true,
                isolatedModules: true,
                jsx: isNext ? 'preserve' : 'react-jsx',
                incremental: true,
                ...(isNext ? { plugins: [{ name: 'next' }] } : {}),
                paths: {
                    '@/*': ['./src/*'],
                    '@lib/*': ['./src/lib/*'],
                    '@components/*': ['./src/components/*'],
                    '@app/*': ['./src/app/*'],
                    '@actions/*': ['./src/actions/*']
                }
            },
            include: isNext ? ['next-env.d.ts', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '.next/types/**/*.ts'] : ['src'],
            exclude: ['node_modules', 'manager']
        };
        await writeSource(tsconfigPath, JSON.stringify(tsconfigContent, null, 2), 'utf8');
    }

    // NextAuth Session.user kimliği/rolü için canonical TypeScript module augmentation.
    if (isNext && finalPkg.dependencies?.['next-auth']) {
        const authTypesPath = path.join(projectDir, 'src', 'types', 'next-auth.d.ts');
        try {
            await fs.stat(authTypesPath);
        } catch {
            await fs.mkdir(path.dirname(authTypesPath), { recursive: true });
            await writeSource(authTypesPath, `import "next-auth";\n\ndeclare module "next-auth" {\n  interface Session {\n    user: {\n      id: string;\n      role?: string;\n      name?: string | null;\n      email?: string | null;\n      image?: string | null;\n    };\n  }\n}\n`, 'utf8');
        }
    }

    // 4. jsconfig.json
    const jsconfigPath = path.join(projectDir, 'jsconfig.json');
    try {
        await fs.stat(jsconfigPath);
    } catch {
        const jsconfigContent = {
            compilerOptions: {
                baseUrl: '.',
                paths: {
                    '@/*': ['./src/*'],
                    '@lib/*': ['./src/lib/*'],
                    '@components/*': ['./src/components/*'],
                    '@app/*': ['./src/app/*'],
                    '@actions/*': ['./src/actions/*']
                }
            }
        };
        await writeSource(jsconfigPath, JSON.stringify(jsconfigContent, null, 2), 'utf8');
    }

    // 5. CSS Dosyaları (src/app/globals.css veya src/index.css)
    const tailwindBaseContent = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  --background: 0 0% 100%;\n  --foreground: 222.2 84% 4.9%;\n}\n\n.dark {\n  --background: 222.2 84% 4.9%;\n  --foreground: 210 40% 98%;\n}\n\nbody {\n  background-color: hsl(var(--background));\n  color: hsl(var(--foreground));\n}\n`;

    if (isNext) {
        const appDir = path.join(projectDir, 'src', 'app');
        const globalsCssPath = path.join(appDir, 'globals.css');
        try {
            await fs.mkdir(appDir, { recursive: true });
            await fs.stat(globalsCssPath);
        } catch {
            await writeSource(globalsCssPath, tailwindBaseContent, 'utf8');
        }

        const layoutPath = path.join(appDir, 'layout.tsx');
        try {
            await fs.stat(layoutPath);
        } catch {
            const layoutContent = `import './globals.css';\n\nexport const metadata = {\n  title: '${state.title || 'App'}',\n  description: 'Generated application',\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="tr">\n      <body>{children}</body>\n    </html>\n  );\n}\n`;
            await writeSource(layoutPath, layoutContent, 'utf8');
        }

        const pagePath = path.join(appDir, 'page.tsx');
        try {
            await fs.stat(pagePath);
        } catch {
            const pageContent = `import Link from 'next/link';\n\nexport default function HomePage() {\n  return (\n    <main className="min-h-screen p-8 flex flex-col items-center justify-center text-center">\n      <h1 className="text-3xl font-bold mb-4">${state.title || 'Quiz Master'}</h1>\n      <p className="text-gray-600 mb-6">Uygulama başarıyla oluşturuldu ve çalışıyor.</p>\n      <div className="flex gap-4">\n        <Link href="/quizzes" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Quizler</Link>\n        <Link href="/admin/quizzes" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Yönetim</Link>\n      </div>\n    </main>\n  );\n}\n`;
            await writeSource(pagePath, pageContent, 'utf8');
        }

        const nextConfigPath = path.join(projectDir, 'next.config.js');
        try {
            await fs.stat(nextConfigPath);
        } catch {
            const nextConfigContent = `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n};\nmodule.exports = nextConfig;\n`;
            await writeSource(nextConfigPath, nextConfigContent, 'utf8');
        }
    } else {
        const srcIndexCssPath = path.join(projectDir, 'src', 'index.css');
        try {
            await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
            await fs.stat(srcIndexCssPath);
        } catch {
            await writeSource(srcIndexCssPath, tailwindBaseContent, 'utf8');
        }

        const viteConfigPath = path.join(projectDir, 'vite.config.js');
        const reactConfigContent = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport path from 'path';\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: { '@': path.resolve(__dirname, './src') }\n  }\n});\n`;
        const vueConfigContent = `import { defineConfig } from 'vite';\nimport vue from '@vitejs/plugin-vue';\nimport path from 'path';\n\nexport default defineConfig({\n  plugins: [vue()],\n  resolve: {\n    alias: { '@': path.resolve(__dirname, './src') }\n  }\n});\n`;
        const withApiProxy = content => hasExpressApi
            ? content.replace('  plugins:', `  server: { proxy: { '/api': 'http://127.0.0.1:${apiPort}' } },\n  preview: { proxy: { '/api': 'http://127.0.0.1:${apiPort}' } },\n  plugins:`)
            : content;
        const existingConfig = await fs.readFile(viteConfigPath, 'utf8').catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
        });
        if (existingConfig === null || (isVue && existingConfig === reactConfigContent)
            || (hasExpressApi && [reactConfigContent, vueConfigContent].includes(existingConfig))) {
            const viteConfigContent = withApiProxy(isVue ? vueConfigContent : reactConfigContent);
            await writeSource(viteConfigPath, viteConfigContent, 'utf8');
        }
    }
    // 6. Standart Tailwind & UI Yardımcısı (src/lib/utils.ts)
    const utilsPath = path.join(projectDir, 'src', 'lib', 'utils.ts');
    try {
        await fs.stat(utilsPath);
    } catch {
        const utilsDir = path.dirname(utilsPath);
        await fs.mkdir(utilsDir, { recursive: true });
        const utilsContent = `import { clsx, type ClassValue } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n`;
        await writeSource(utilsPath, utilsContent, 'utf8');
    }

    // 7. Standart Prisma Singleton (src/lib/prisma.ts)
    if (hasPrisma) {
        const prismaTsPath = path.join(projectDir, 'src', 'lib', 'prisma.ts');
        try {
            await fs.stat(prismaTsPath);
        } catch {
            const prismaDir = path.dirname(prismaTsPath);
            await fs.mkdir(prismaDir, { recursive: true });
            const prismaContent = `import { PrismaClient } from '@prisma/client';\n\nconst globalForPrisma = globalThis as unknown as {\n  prisma: PrismaClient | undefined;\n};\n\nexport const prisma = globalForPrisma.prisma ?? new PrismaClient();\n\nif (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;\n`;
            await writeSource(prismaTsPath, prismaContent, 'utf8');
        }
    }

    // 6. tailwind.config.ts ve postcss.config.js
    const tailwindConfigPath = path.join(projectDir, 'tailwind.config.ts');
    try {
        await fs.stat(tailwindConfigPath);
    } catch {
        const twConfigContent = `import type { Config } from 'tailwindcss';\n\nconst config: Config = {\n  darkMode: 'class',\n  content: [\n    './index.html',\n    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/components/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/app/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/**/*.{js,ts,jsx,tsx}',\n  ],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\nexport default config;\n`;
        await writeSource(tailwindConfigPath, twConfigContent, 'utf8');
    }

    const postcssConfigPath = path.join(projectDir, 'postcss.config.js');
    try {
        await fs.stat(postcssConfigPath);
    } catch {
        const postcssExport = finalPkg.type === 'module' ? 'export default' : 'module.exports =';
        const postcssContent = `${postcssExport} {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
        await writeSource(postcssConfigPath, postcssContent, 'utf8');
    }
    // 7. .env.example (Prisma / Database URL Koruması)
    const envExampleContent = [
        'DATABASE_URL="file:./dev.db"',
        'NEXTAUTH_SECRET=replace-with-a-long-random-secret',
        'NEXTAUTH_URL=http://localhost:3000',
        ''
    ].join('\n');

    const envExamplePath = path.join(projectDir, '.env.example');
    try {
        await fs.stat(envExamplePath);
    } catch {
        await writeSource(envExamplePath, envExampleContent, 'utf8');
    }
    if (hasExpressApi) {
        const example = await fs.readFile(envExamplePath, 'utf8');
        if (!/^\s*AUTH_SECRET\s*=/m.test(example)) {
            await writeSource(envExamplePath,
                `${example}${example.endsWith('\n') ? '' : '\n'}# Express authentication: set a random secret of at least 32 characters.\nAUTH_SECRET=\n`,
                'utf8');
        }
    }
    if (plan?.management?.needed === true) {
        let example = await fs.readFile(envExamplePath, 'utf8');
        for (const role of plan.management.roles || []) {
            const variable = `XFACTOR_DEMO_PASSWORD_${String(role.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
            if (variable.endsWith('_') || new RegExp(`^${variable}=`, 'm').test(example)) continue;
            example += `${example.endsWith('\n') ? '' : '\n'}${variable}=\n`;
        }
        await writeSource(envExamplePath, example, 'utf8');
    }
    // 8. Dockerfile ve .dockerignore (Tak-Çalıştır Konteyner Desteği)
    const dockerfilePath = path.join(projectDir, 'Dockerfile');
    const dockerignorePath = path.join(projectDir, '.dockerignore');

    try {
        await fs.stat(dockerfilePath);
    } catch {
        const dockerfileContent = buildDockerfileContent({ isNext, isExpressOnly, hasVite, hasExpressApi, hasPrisma });
        await writeSource(dockerfilePath, dockerfileContent, 'utf8');
    }

    try {
        await fs.stat(dockerignorePath);
    } catch {
        const dockerignoreContent = buildDockerignoreContent();
        await writeSource(dockerignorePath, dockerignoreContent, 'utf8');
    }

    // 9. Prisma & Auth Şablonları (Çift Köprü, User Modeli, Seed, Auth Yardımcıları)
    await ensurePrismaAndAuthTemplates({
        projectDir,
        hasPrisma,
        isAuthRequired,
        plan,
        sourceFence,
        writeSource
    });

    return true;
}

/**
 * Dosya ağacındaki dosyaları listeler (IDE ve ZIP için)
 */
export async function listProjectTree(projectDir, {
    maxFiles = 500,
    maxTotalBytes = 20 * 1024 * 1024,
    maxDepth = 10,
    strict = false
} = {}) {
    const results = [];
    let totalBytes = 0;
    const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'coverage', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
    const IGNORED_FILES = new Set(['package-lock.json', 'bun.lockb', '.DS_Store', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);
    const incompleteTree = message => {
        const error = new Error(message);
        error.code = 'PROJECT_TREE_INCOMPLETE';
        return error;
    };

    async function traverse(currentDir, relativeDir = '', depth = 0) {
        if (depth > maxDepth || results.length >= maxFiles || totalBytes >= maxTotalBytes) {
            if (strict) throw incompleteTree(`Project tree evidence limit reached at ${relativeDir || '.'}`);
            return;
        }
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (results.length >= maxFiles || totalBytes >= maxTotalBytes) {
                    if (strict) throw incompleteTree(`Project tree evidence limit reached at ${relativeDir || '.'}`);
                    break;
                }
                if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)
                    || /^\.xfactor-generated-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i.test(entry.name)) continue;
                if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
                if (/\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/i.test(entry.name)) continue;
                if (entry.name === '.git' || entry.name === '.DS_Store') continue;

                const resPath = path.join(currentDir, entry.name);
                const relPath = path.join(relativeDir, entry.name).replace(/\\/g, '/');
                if (strict && entry.isSymbolicLink()) {
                    throw incompleteTree(`Symbolic link cannot be verified safely: ${relPath}`);
                }

                if (entry.isDirectory()) {
                    await traverse(resPath, relPath, depth + 1);
                } else {
                    const stat = await fs.stat(resPath).catch(() => null);
                    if (!stat) {
                        if (strict) throw incompleteTree(`Unable to stat project evidence: ${relPath}`);
                        continue;
                    }
                    if (stat.size > GENERATION_LIMITS.MAX_FILE_SIZE_BYTES) {
                        if (strict) throw incompleteTree(`Project evidence file exceeds size limit: ${relPath}`);
                        continue;
                    }
                    if (strict && totalBytes + stat.size > maxTotalBytes) {
                        throw incompleteTree(`Project tree evidence byte limit reached at ${relPath}`);
                    }
                    const content = await fs.readFile(resPath, 'utf8');
                    totalBytes += stat.size;
                    results.push({ path: relPath, content });
                }
            }
        } catch (error) {
            if (strict) {
                if (error?.code === 'PROJECT_TREE_INCOMPLETE') throw error;
                throw incompleteTree(`Unable to read complete project evidence at ${relativeDir || '.'}: ${error.message}`);
            }
        }
    }

    await traverse(projectDir);
    return results;
}
