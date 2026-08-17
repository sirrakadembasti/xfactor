/**
 * Çok Dosyalı Kod Üretim ve Dosya Yazma Modülü (Tool Use & Dark Factory)
 * Referans: Archon Code Generator
 */

import fs from 'fs/promises';
import path from 'path';
import { isSafeProjectPath } from '../security.js';

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
export async function ensureProjectScaffold(projectDir, state = {}, plan = {}) {
    const title = state.title || 'xfactor-app';
    const safeName = title.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';

    // 1. package.json Kontrolü ve Tamamlama
    const pkgPath = path.join(projectDir, 'package.json');
    let pkgExists = false;
    let currentPkg = {};
    try {
        const raw = await fs.readFile(pkgPath, 'utf8');
        currentPkg = JSON.parse(raw);
        pkgExists = true;
    } catch {}

    const standardDependencies = {
        '@prisma/client': '^5.10.0',
        'clsx': '^2.1.0',
        'lucide-react': '^0.344.0',
        'next': '^14.1.0',
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
        'tailwind-merge': '^2.2.1',
        'tailwindcss-animate': '^1.0.7',
        'zod': '^3.22.4'
    };

    const standardDevDependencies = {
        '@types/node': '^20.11.20',
        '@types/react': '^18.2.58',
        '@types/react-dom': '^18.2.19',
        'autoprefixer': '^10.4.17',
        'postcss': '^8.4.35',
        'prisma': '^5.10.0',
        'tailwindcss': '^3.4.1',
        'typescript': '^5.3.3'
    };

    const finalPkg = {
        name: currentPkg.name || safeName,
        version: currentPkg.version || '1.0.0',
        private: true,
        scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint',
            'prisma:generate': 'prisma generate',
            'prisma:push': 'prisma db push',
            ...(currentPkg.scripts || {})
        },
        dependencies: {
            ...standardDependencies,
            ...(currentPkg.dependencies || {})
        },
        devDependencies: {
            ...standardDevDependencies,
            ...(currentPkg.devDependencies || {})
        }
    };

    await fs.writeFile(pkgPath, JSON.stringify(finalPkg, null, 2), 'utf8');

    // 2. tsconfig.json Kontrolü (@/* Path Alias Çözümü)
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    let tsconfigExists = false;
    try {
        await fs.stat(tsconfigPath);
        tsconfigExists = true;
    } catch {}

    if (!tsconfigExists) {
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
                jsx: 'preserve',
                incremental: true,
                plugins: [{ name: 'next' }],
                paths: { '@/*': ['./src/*'] }
            },
            include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '.next/types/**/*.ts'],
            exclude: ['node_modules', 'manager']
        };
        await fs.writeFile(tsconfigPath, JSON.stringify(tsconfigContent, null, 2), 'utf8');
    }

    // 3. jsconfig.json
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

    // 4. src/app/globals.css veya src/index.css
    const appDir = path.join(projectDir, 'src', 'app');
    const globalsCssPath = path.join(appDir, 'globals.css');
    const srcIndexCssPath = path.join(projectDir, 'src', 'index.css');

    const tailwindBaseContent = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  --background: 0 0% 100%;\n  --foreground: 222.2 84% 4.9%;\n}\n\n.dark {\n  --background: 222.2 84% 4.9%;\n  --foreground: 210 40% 98%;\n}\n\nbody {\n  background-color: hsl(var(--background));\n  color: hsl(var(--foreground));\n}\n`;

    try {
        await fs.mkdir(appDir, { recursive: true });
        await fs.stat(globalsCssPath);
    } catch {
        await fs.writeFile(globalsCssPath, tailwindBaseContent, 'utf8');
    }

    try {
        await fs.stat(srcIndexCssPath);
    } catch {
        await fs.writeFile(srcIndexCssPath, tailwindBaseContent, 'utf8');
    }

    // 5. next.config.js
    const nextConfigPath = path.join(projectDir, 'next.config.js');
    try {
        await fs.stat(nextConfigPath);
    } catch {
        const nextConfigContent = `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n};\nmodule.exports = nextConfig;\n`;
        await fs.writeFile(nextConfigPath, nextConfigContent, 'utf8');
    }

    // 6. tailwind.config.ts ve postcss.config.js
    const tailwindConfigPath = path.join(projectDir, 'tailwind.config.ts');
    try {
        await fs.stat(tailwindConfigPath);
    } catch {
        const twConfigContent = `import type { Config } from 'tailwindcss';\n\nconst config: Config = {\n  darkMode: ['class'],\n  content: [\n    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/components/**/*.{js,ts,jsx,tsx,mdx}',\n    './src/app/**/*.{js,ts,jsx,tsx,mdx}',\n  ],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n};\nexport default config;\n`;
        await fs.writeFile(tailwindConfigPath, twConfigContent, 'utf8');
    }

    const postcssConfigPath = path.join(projectDir, 'postcss.config.js');
    try {
        await fs.stat(postcssConfigPath);
    } catch {
        const postcssContent = `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
        await fs.writeFile(postcssConfigPath, postcssContent, 'utf8');
    }

    return true;
}

/**
 * Dosya ağacındaki dosyaları listeler (IDE ve ZIP için)
 */
export async function listProjectTree(projectDir) {
    const results = [];
    const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.env', 'manager', 'frontend.director', 'backend.director']);
    const IGNORED_FILES = new Set(['.env', '.env.local', 'package-lock.json', 'bun.lockb', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);

    async function traverse(currentDir, relativeDir = '') {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || IGNORED.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;

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
