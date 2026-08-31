/**
 * Çok Dosyalı Kod Üretim ve Dosya Yazma Modülü (Tool Use & Dark Factory)
 * Referans: Archon Code Generator
 */

import fs from 'fs/promises';
import path from 'path';
import { isSafeProjectPath, assertPathInsideRoot, assertSafeExistingParent } from '../security.js';
import { writeStructuredLog } from '../observability.js';

const KNOWN_PACKAGE_VERSIONS = {
    'react-hook-form': '^7.54.2',
    '@hookform/resolvers': '^3.9.1',
    'sonner': '^1.7.4',
    'axios': '^1.7.9',
    'swr': '^2.3.0',
    '@tanstack/react-query': '^5.62.11',
    'date-fns': '^4.1.0',
    'dayjs': '^1.11.13',
    'framer-motion': '^11.15.0',
    'canvas-confetti': '^1.9.3',
    '@types/canvas-confetti': '^1.9.0',
    'recharts': '^2.15.0',
    'zustand': '^5.0.2',
    'bcryptjs': '^2.4.3',
    '@types/bcryptjs': '^2.4.6',
    'jsonwebtoken': '^9.0.2',
    '@types/jsonwebtoken': '^9.0.7',
    'next-auth': '^4.24.11',
    'uuid': '^11.0.4',
    '@types/uuid': '^10.0.0'
};

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
    const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

    async function scanDir(currentDir) {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'manager') continue;
                const resPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await scanDir(resPath);
                } else if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
                    const content = await fs.readFile(resPath, 'utf8');
                    const importMatches = content.matchAll(/(?:import\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g);
                    for (const match of importMatches) {
                        const specifier = match[1];
                        if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/')) continue;
                        if (NODE_BUILTINS.has(specifier)) continue;

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


/**
 * Coder tarafından üretilen dosyaları doğrular ve hem ajanın kendi klasörüne
 * hem de projenin kaynak dizinine güvenle yazar.
 */
export async function writeGeneratedFiles(projectDir, coderDir, files = [], allowedTargetFiles = null) {
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

    // Tüm hedefler için üst dizin doğrulaması + oluşturma (aday başına tek akış).
    // (1) mkdir'DEN ÖNCE: mevcut üst dizin zinciri kök içinde mi? (symlink ile kök dışına
    //     dizin oluşturulmasını engeller — P0.3 F1). (2) mkdir sonrası: tam üst dizin
    //     zinciri kök içinde mi? Herhangi biri başarısız olursa yazım başlamadan throw
    //     edilir; aşağıdaki yazım döngüsü henüz çalışmadığı için kısmi yazma OLMAZ.
    for (const { targetPath } of candidates) {
        const parent = path.dirname(targetPath);
        await assertSafeExistingParent(parent, projectDir);
        await fs.mkdir(parent, { recursive: true });
        await assertPathInsideRoot(parent, projectDir);
    }

    // 3. Tüm dosyaları yaz.
    const writtenFiles = [];
    for (const { file, targetPath } of candidates) {
        // Proje kök dizinine yaz (örn: src/App.jsx)
        await fs.writeFile(targetPath, file.content, 'utf8');

        // Ajanın kendi yerel klasörüne izole kopya yaz (Agent = Klasör ilkesi)
        if (coderDir) {
            const agentFileName = file.path.replace(/[\\/]/g, '__');
            const agentFilePath = path.join(coderDir, agentFileName);
            await fs.writeFile(agentFilePath, file.content, 'utf8');
        }

        writtenFiles.push({
            path: file.path,
            size: Buffer.byteLength(file.content, 'utf8')
        });
    }

    return writtenFiles;
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
    const isExpressOnly = (specText.includes('express') || specText.includes('rest api') || specText.includes('node api') || specText.includes('backend api')) && !hasReactKeyword && !hasNextApp && !hasVite;

    if (specText.includes('next.js') || specText.includes('nextjs') || specText.includes('app router')) {
        hasNextApp = true;
    } else if (specText.includes('vite') || specText.includes('react spa')) {
        hasVite = true;
    }
    if (specText.includes('prisma') || specText.includes('sqlite') || specText.includes('database')) {
        hasPrisma = true;
    }
    if (specText.includes('typescript') || specText.includes('ts') || specText.includes('tsx')) {
        hasTypeScript = true;
    }

    const isNext = hasNextApp || (!hasVite && !isExpressOnly);
    const framework = isNext ? 'nextjs' : (hasVite ? 'vite' : (isExpressOnly ? 'express' : 'node'));

    return {
        framework,
        isNext,
        hasNextApp,
        hasVite,
        isExpressOnly,
        hasPrisma,
        hasTypeScript
    };
}

export async function ensureProjectScaffold(projectDir, state = {}, plan = {}) {
    const title = state.title || 'xfactor-app';
    const safeName = title.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';

    // 1. Proje Türü / Framework Algılama
    const stack = await detectProjectStack(projectDir, state, plan);
    const { isNext, hasPrisma, isExpressOnly } = stack;
    const pkgPath = path.join(projectDir, 'package.json');
    let currentPkg = {};
    try {
        const raw = await fs.readFile(pkgPath, 'utf8');
        currentPkg = JSON.parse(raw);
    } catch {}

    const baseDependencies = {
        'clsx': '^2.1.1',
        'lucide-react': '^0.469.0',
        'react': '^18.3.1',
        'react-dom': '^18.3.1',
        'tailwind-merge': '^2.5.5',
        'zod': '^3.24.1',
        'react-hook-form': '^7.54.2',
        '@hookform/resolvers': '^3.9.1',
        'sonner': '^1.7.4'
    };

    if (hasPrisma) {
        baseDependencies['@prisma/client'] = '^5.22.0';
    }

    const baseDevDependencies = {
        '@types/node': '^22.10.2',
        '@types/react': '^18.3.18',
        '@types/react-dom': '^18.3.5',
        'autoprefixer': '^10.4.20',
        'postcss': '^8.4.49',
        'tailwindcss': '^3.4.17',
        'typescript': '^5.7.2'
    };

    if (hasPrisma) {
        baseDevDependencies['prisma'] = '^5.22.0';
    }

    let scripts = {};
    if (isNext) {
        baseDependencies['next'] = '^14.2.24';
        baseDependencies['tailwindcss-animate'] = '^1.0.7';
        scripts = {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint',
            ...(hasPrisma ? { 'prisma:generate': 'prisma generate', 'prisma:push': 'prisma db push' } : {})
        };
    } else if (isExpressOnly) {
        delete baseDependencies['react'];
        delete baseDependencies['react-dom'];
        delete baseDependencies['clsx'];
        delete baseDependencies['lucide-react'];
        delete baseDependencies['tailwind-merge'];
        delete baseDevDependencies['@types/react'];
        delete baseDevDependencies['@types/react-dom'];
        delete baseDevDependencies['autoprefixer'];
        delete baseDevDependencies['postcss'];
        delete baseDevDependencies['tailwindcss'];

        baseDependencies['express'] = '^4.21.2';
        baseDependencies['cors'] = '^2.8.5';
        baseDependencies['dotenv'] = '^16.4.7';
        baseDevDependencies['@types/express'] = '^5.0.0';
        baseDevDependencies['nodemon'] = '^3.1.9';
        scripts = {
            dev: 'node server.js',
            start: 'node server.js',
            ...(hasPrisma ? { 'prisma:generate': 'prisma generate', 'prisma:push': 'prisma db push' } : {})
        };
    } else {
        baseDevDependencies['vite'] = '^5.4.14';
        baseDevDependencies['@vitejs/plugin-react'] = '^4.3.4';
        scripts = {
            dev: 'vite',
            build: 'vite build',
            preview: 'vite preview',
            ...(hasPrisma ? { 'prisma:generate': 'prisma generate', 'prisma:push': 'prisma db push' } : {})
        };
    }

    // Otomatik İthalat Taraması: Dosyalarda kullanılan harici paketleri bul ve ekle
    const scannedPackages = await scanUsedNpmPackages(projectDir);
    for (const pkg of scannedPackages) {
        if (!baseDependencies[pkg] && !baseDevDependencies[pkg] && !currentPkg.dependencies?.[pkg] && !currentPkg.devDependencies?.[pkg]) {
            const version = KNOWN_PACKAGE_VERSIONS[pkg] || '^1.0.0';
            if (pkg.startsWith('@types/')) {
                baseDevDependencies[pkg] = version;
            } else {
                baseDependencies[pkg] = version;
            }
        }
    }

    const finalPkg = {
        name: currentPkg.name || safeName,
        version: currentPkg.version || '1.0.0',
        private: true,
        scripts: {
            ...scripts,
            ...(currentPkg.scripts || {})
        },
        dependencies: {
            ...baseDependencies,
            ...(currentPkg.dependencies || {})
        },
        devDependencies: {
            ...baseDevDependencies,
            ...(currentPkg.devDependencies || {})
        }
    };

    await fs.writeFile(pkgPath, JSON.stringify(finalPkg, null, 2), 'utf8');
    // 3. tsconfig.json Kontrolü (@/* Path Alias Çözümü)
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    try {
        await fs.stat(tsconfigPath);
    } catch {
        const tsconfigContent = {
            compilerOptions: {
                target: 'es5',
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
                paths: { '@/*': ['./src/*'] }
            },
            include: isNext ? ['next-env.d.ts', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '.next/types/**/*.ts'] : ['src'],
            exclude: ['node_modules', 'manager']
        };
        await fs.writeFile(tsconfigPath, JSON.stringify(tsconfigContent, null, 2), 'utf8');
    }

    // 4. jsconfig.json
    const jsconfigPath = path.join(projectDir, 'jsconfig.json');
    try {
        await fs.stat(jsconfigPath);
    } catch {
        const jsconfigContent = {
            compilerOptions: {
                baseUrl: '.',
                paths: { '@/*': ['./src/*'] }
            }
        };
        await fs.writeFile(jsconfigPath, JSON.stringify(jsconfigContent, null, 2), 'utf8');
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
            await fs.writeFile(globalsCssPath, tailwindBaseContent, 'utf8');
        }

        const nextConfigPath = path.join(projectDir, 'next.config.js');
        try {
            await fs.stat(nextConfigPath);
        } catch {
            const nextConfigContent = `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n};\nmodule.exports = nextConfig;\n`;
            await fs.writeFile(nextConfigPath, nextConfigContent, 'utf8');
        }
    } else {
        const srcIndexCssPath = path.join(projectDir, 'src', 'index.css');
        try {
            await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
            await fs.stat(srcIndexCssPath);
        } catch {
            await fs.writeFile(srcIndexCssPath, tailwindBaseContent, 'utf8');
        }

        const viteConfigPath = path.join(projectDir, 'vite.config.js');
        try {
            await fs.stat(viteConfigPath);
        } catch {
            const viteConfigContent = `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport path from 'path';\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: { '@': path.resolve(__dirname, './src') }\n  }\n});\n`;
            await fs.writeFile(viteConfigPath, viteConfigContent, 'utf8');
        }
    }

    // 6. tailwind.config.ts ve postcss.config.js
    const tailwindConfigPath = path.join(projectDir, 'tailwind.config.ts');
    try {
        await fs.stat(tailwindConfigPath);
    } catch {
        const twConfigContent = `import type { Config } from 'tailwindcss';\n\nconst config: Config = {\n  darkMode: ['class'],\n  content: [\n    './index.html',\n    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/components/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/app/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/**/*.{js,ts,jsx,tsx}',\n  ],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\nexport default config;\n`;
        await fs.writeFile(tailwindConfigPath, twConfigContent, 'utf8');
    }

    const postcssConfigPath = path.join(projectDir, 'postcss.config.js');
    try {
        await fs.stat(postcssConfigPath);
    } catch {
        const postcssContent = `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
        await fs.writeFile(postcssConfigPath, postcssContent, 'utf8');
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
        await fs.writeFile(envExamplePath, envExampleContent, 'utf8');
    }
    // 8. Prisma ve DB İstemcisi Çift Köprü Garantisi (src/lib/prisma.ts <-> src/lib/db.ts)
    if (hasPrisma) {
        const libDir = path.join(projectDir, 'src', 'lib');
        const prismaPath = path.join(libDir, 'prisma.ts');
        const dbPath = path.join(libDir, 'db.ts');

        try {
            await fs.mkdir(libDir, { recursive: true });
            const prismaExists = await fs.stat(prismaPath).then(() => true).catch(() => false);
            const dbExists = await fs.stat(dbPath).then(() => true).catch(() => false);

            if (!prismaExists && !dbExists) {
                const defaultPrismaClient = `import { PrismaClient } from '@prisma/client';\n\nconst globalForPrisma = globalThis as unknown as {\n  prisma: PrismaClient | undefined;\n};\n\nexport const prisma = globalForPrisma.prisma ?? new PrismaClient();\nexport const db = prisma;\n\nif (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;\n\nexport default prisma;\n`;
                await fs.writeFile(prismaPath, defaultPrismaClient, 'utf8');
                await fs.writeFile(dbPath, `import { prisma, db } from './prisma';\nexport * from './prisma';\nexport { prisma, db };\nexport default prisma;\n`, 'utf8');
            } else if (prismaExists && !dbExists) {
                const dbBridgeContent = `import { prisma } from './prisma';\nexport * from './prisma';\nexport const db = prisma;\nexport default prisma;\n`;
                await fs.writeFile(dbPath, dbBridgeContent, 'utf8');
            } else if (dbExists && !prismaExists) {
                const prismaBridgeContent = `import { db } from './db';\nexport * from './db';\nexport const prisma = db;\nexport default db;\n`;
                await fs.writeFile(prismaPath, prismaBridgeContent, 'utf8');
            }
        } catch {}
    }

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
    const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
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
                if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;
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
