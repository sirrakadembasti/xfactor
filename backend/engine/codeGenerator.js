/**
 * Çok Dosyalı Kod Üretim ve Dosya Yazma Modülü (Tool Use & Dark Factory)
 * Referans: Archon Code Generator
 */

import fs from 'fs/promises';
import path from 'path';
import { isSafeProjectPath } from '../security.js';

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
/**
 * Coder tarafından üretilen dosyaları doğrular ve hem ajanın kendi klasörüne
 * hem de projenin kaynak dizinine güvenle yazar.
 */
export async function writeGeneratedFiles(projectDir, coderDir, files = []) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error('Yazılacak geçerli dosya bulunamadı.');
    }

    const writtenFiles = [];

    for (const file of files) {
        if (!file.path || typeof file.content !== 'string') {
            continue;
        }

        // Güvenlik: Path Traversal Kontrolü
        if (!isSafeProjectPath(file.path, projectDir)) {
            console.warn(`Güvenlik Uyarısı: "${file.path}" dosya yolu geçersiz veya sınır dışı.`);
            continue;
        }

        // 1. Proje kök dizinine yaz (örn: src/App.jsx)
        const targetPath = path.join(projectDir, file.path);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, file.content, 'utf8');

        // 2. Ajanın kendi yerel klasörüne izole kopya yaz (Agent = Klasör ilkesi)
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
    // 7. .env ve .env.example (Prisma / Database URL Koruması)
    const envContent = `DATABASE_URL="file:./dev.db"\nNEXTAUTH_SECRET="super-secret-xfactor-key-2026"\nNEXTAUTH_URL="http://localhost:3000"\n`;
    const envPath = path.join(projectDir, '.env');
    const envExamplePath = path.join(projectDir, '.env.example');
    
    try {
        await fs.stat(envPath);
    } catch {
        await fs.writeFile(envPath, envContent, 'utf8');
    }

    try {
        await fs.stat(envExamplePath);
    } catch {
        await fs.writeFile(envExamplePath, envContent, 'utf8');
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
export async function listProjectTree(projectDir) {
    const results = [];
    const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
    const IGNORED_FILES = new Set(['package-lock.json', 'bun.lockb', '.DS_Store', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);

    async function traverse(currentDir, relativeDir = '') {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;
                if (entry.name === '.git' || entry.name === '.DS_Store') continue;

                const resPath = path.join(currentDir, entry.name);
                const relPath = path.join(relativeDir, entry.name).replace(/\\/g, '/');

                if (entry.isDirectory()) {
                    await traverse(resPath, relPath);
                } else {
                    const content = await fs.readFile(resPath, 'utf8');
                    results.push({ path: relPath, content });
                }
            }
        } catch {
            // Klasör yoksa sessizce devam et
        }
    }

    await traverse(projectDir);
    return results;
}
