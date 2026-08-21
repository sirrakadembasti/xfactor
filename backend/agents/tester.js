import path from 'path';
import { extractAndParseJSON, validateReviewResult, normalizeReviewResult } from './schemas.js';
import { loadAgentPromptFromDocs } from './agentLoader.js';

const FALLBACK_TESTER_PROMPT = `
Sen bir "Tester" (QA / Test) ajanısın (tester.agent).
Görevin, üretilen projenin veya kod modülünün çalışabilirliğini, sınır durumlarını ve fonksiyonel gereksinimlerini doğrulamaktır.

MİSYON:
1. Üretilen dosyaları, deterministik denetim sonuçlarını ve proje talimatnamesindeki kabul kriterlerini karşılaştır.
2. Fonksiyonel gereksinimlerin ve şema/API bütünlüğünün karşılandığını doğrula.
3. Çıktını KESİNLİKLE aşağıdaki JSON formatında döndür.

JSON ÇIKTI ŞEMASI:
{
  "approved": true,
  "summary": "Test ve doğrulama özeti",
  "passedCount": 5,
  "failedCount": 0,
  "issues": [],
  "notes": "Tüm kabul kriterleri başarıyla doğrulandı."
`;

export const TESTER_SYSTEM_PROMPT = loadAgentPromptFromDocs('tester', FALLBACK_TESTER_PROMPT);
export function stripStringsAndComments(code) {
    if (typeof code !== 'string') return '';
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')       // Çok satırlı yorumlar (/* ... */)
        .replace(/\/\/[^\n\r]*/g, '')           // Tek satırlı yorumlar (// ...)
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '""') // Template literals (`...`)
        .replace(/"(?:\\[\s\S]|[^\\"])*"/g, '""') // Çift tırnak stringler ("...")
        .replace(/'(?:\\[\s\S]|[^\\'])*'/g, "''"); // Tek tırnak stringler ('...')
}

/**
 * Üretilen projede deterministik şema, JSON ve sözdizimi denetimi yapar
 */
export function runDeterministicProjectAudit(generatedFiles = []) {
    const issues = [];
    let passedCount = 0;
    let failedCount = 0;

    if (!Array.isArray(generatedFiles) || generatedFiles.length === 0) {
        return {
            passed: false,
            issues: ['Hiçbir proje dosyası üretilmemiş.'],
            passedCount: 0,
            failedCount: 1
        };
    }

    // 1. JSON Sözdizimi Kontrolü
    for (const file of generatedFiles) {
        if (file.path && file.path.endsWith('.json') && typeof file.content === 'string') {
            try {
                JSON.parse(file.content);
                passedCount++;
            } catch (err) {
                issues.push(`Geçersiz JSON dosyası: "${file.path}" -> ${err.message}`);
                failedCount++;
            }
        }
    }

    // 2. Prisma Şeması & API Route Bütünlük Kontrolü
    const prismaFile = generatedFiles.find(f => f.path && f.path.endsWith('schema.prisma'));
    if (prismaFile && typeof prismaFile.content === 'string') {
        const modelMatches = Array.from(prismaFile.content.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{/g));
        const definedModels = new Set(modelMatches.map(m => m[1].toLowerCase()));

        for (const file of generatedFiles) {
            if (file.path && (file.path.includes('/api/') || file.path.includes('service') || file.path.includes('routes')) && typeof file.content === 'string') {
                const prismaCalls = Array.from(file.content.matchAll(/prisma\.([a-zA-Z0-9_]+)\.(findMany|findUnique|findFirst|create|update|delete|upsert|count)/g));
                for (const call of prismaCalls) {
                    const usedModel = call[1].toLowerCase();
                    if (!definedModels.has(usedModel) && usedModel !== '$queryraw' && usedModel !== '$executeRaw') {
                        issues.push(`Prisma Şema Uyumsuzluğu: "${file.path}" dosyasında "prisma.${call[1]}" çağrısı yapılmış ancak schema.prisma içinde "${call[1]}" modeli tanımlı değil!`);
                        failedCount++;
                    }
                }
            }
        }
        if (definedModels.size > 0) passedCount++;
    }

    // 3. JS/TS Basit Sözdizimi ve Parantez Dengesi Kontrolü (String/Yorum Temizliği ile)
    for (const file of generatedFiles) {
        if (file.path && (file.path.endsWith('.js') || file.path.endsWith('.jsx') || file.path.endsWith('.ts') || file.path.endsWith('.tsx')) && typeof file.content === 'string') {
            const cleanCode = stripStringsAndComments(file.content);
            let braceCount = 0;
            let parenCount = 0;
            let bracketCount = 0;
            for (const ch of cleanCode) {
                if (ch === '{') braceCount++;
                else if (ch === '}') braceCount--;
                else if (ch === '(') parenCount++;
                else if (ch === ')') parenCount--;
                else if (ch === '[') bracketCount++;
                else if (ch === ']') bracketCount--;
            }
            if (braceCount !== 0 || parenCount !== 0 || bracketCount !== 0) {
                issues.push(`Kritik Sözdizimi Hatası: "${file.path}" dosyasında dengesiz parantez/süslü parantez tespit edildi (Brace: ${braceCount}, Paren: ${parenCount}, Bracket: ${bracketCount})!`);
                failedCount++;
            } else {
                passedCount++;
            }
        }
    }

    // 4. Statik Yerel İthalat ve Dosya Varlık Denetimi (Dead Import / Path Resolution Check)
    const existingLookup = new Set();
    for (const f of generatedFiles) {
        if (!f.path) continue;
        const norm = f.path.replace(/\\/g, '/');
        existingLookup.add(norm);
        const ext = path.extname(norm);
        if (ext) {
            existingLookup.add(norm.slice(0, -ext.length)); // uzantısız halini ekle
        }
        if (norm.endsWith('/index.ts') || norm.endsWith('/index.tsx') || norm.endsWith('/index.js') || norm.endsWith('/index.jsx')) {
            existingLookup.add(path.dirname(norm)); // klasör adıyla import edilebilir
        }
    }

    // Prisma & DB köprüsü eşleştirmesi
    if (existingLookup.has('src/lib/prisma') || existingLookup.has('src/lib/prisma.ts')) {
        existingLookup.add('src/lib/db');
        existingLookup.add('src/lib/db.ts');
    }
    if (existingLookup.has('src/lib/db') || existingLookup.has('src/lib/db.ts')) {
        existingLookup.add('src/lib/prisma');
        existingLookup.add('src/lib/prisma.ts');
    }

    // 5. Harici Paket ve package.json Bağımlılık Denetimi
    let declaredPackages = new Set();
    const pkgFile = generatedFiles.find(f => f.path === 'package.json');
    if (pkgFile && typeof pkgFile.content === 'string') {
        try {
            const parsedPkg = JSON.parse(pkgFile.content);
            declaredPackages = new Set([
                ...Object.keys(parsedPkg.dependencies || {}),
                ...Object.keys(parsedPkg.devDependencies || {})
            ]);
        } catch {}
    }

    const NODE_BUILTIN_MODULES = new Set([
        'fs', 'fs/promises', 'path', 'url', 'http', 'https', 'crypto',
        'events', 'os', 'stream', 'util', 'child_process', 'assert', 'buffer',
        'next', 'next/server', 'next/font', 'next/font/google', 'next/navigation',
        'next/router', 'next/link', 'next/image', 'next/head', 'react', 'react-dom'
    ]);

    for (const file of generatedFiles) {
        if (file.path && (file.path.endsWith('.js') || file.path.endsWith('.jsx') || file.path.endsWith('.ts') || file.path.endsWith('.tsx')) && typeof file.content === 'string') {
            const importMatches = Array.from(file.content.matchAll(/(?:import\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g));
            const currentFileDir = path.dirname(file.path).replace(/\\/g, '/');

            for (const match of importMatches) {
                const specifier = match[1];
                if (!specifier) continue;

                // A. Yerel İthalat Denetimi (@/... veya ./... veya ../...)
                if (specifier.startsWith('@/') || specifier.startsWith('./') || specifier.startsWith('../')) {
                    let targetPath = '';
                    if (specifier.startsWith('@/')) {
                        targetPath = 'src/' + specifier.slice(2);
                    } else {
                        targetPath = path.posix.normalize(path.posix.join(currentFileDir, specifier));
                    }

                    // CSS veya font dosyası değilse varlık kontrolü yap
                    if (!specifier.endsWith('.css') && !specifier.endsWith('.svg') && !specifier.endsWith('.png') && !specifier.endsWith('.ico')) {
                        if (!existingLookup.has(targetPath) && !existingLookup.has(targetPath + '.ts') && !existingLookup.has(targetPath + '.tsx') && !existingLookup.has(targetPath + '.js') && !existingLookup.has(targetPath + '.jsx')) {
                            issues.push(`Kırık Yerel İthalat (Dosya Yok): "${file.path}" dosyasında "${specifier}" import edilmiş ancak hedef dosya (${targetPath}) diskte mevcut değil!`);
                            failedCount++;
                        } else {
                            passedCount++;
                        }
                    }
                }
                // B. Harici Paket Denetimi
                else if (!specifier.startsWith('/') && !NODE_BUILTIN_MODULES.has(specifier)) {
                    let pkgName = specifier;
                    if (specifier.startsWith('@')) {
                        pkgName = specifier.split('/').slice(0, 2).join('/');
                    } else {
                        pkgName = specifier.split('/')[0];
                    }

                    if (pkgName && !NODE_BUILTIN_MODULES.has(pkgName) && declaredPackages.size > 0) {
                        if (!declaredPackages.has(pkgName)) {
                            issues.push(`Eksik NPM Bağımlılığı: "${file.path}" dosyasında "${pkgName}" paketi kullanılmış ancak package.json içinde tanımlı değil!`);
                            failedCount++;
                        } else {
                            passedCount++;
                        }
                    }
                }
            }
        }
    }

    // 6. Dosya Boyut ve İçerik Kontrolü
    for (const file of generatedFiles) {
        if (!file.content || file.content.trim().length === 0) {
            issues.push(`Boş dosya tespit edildi: "${file.path}"`);
            failedCount++;
        } else {
            passedCount++;
        }
    }

    return {
        passed: issues.length === 0,
        issues,
        passedCount,
        failedCount
    };
}

/**
 * Üretilen dosyalardan yapılandırılmış zengin Proje Manifestosu (Project Manifest) çıkarır.
 */
export function extractProjectManifest(generatedFiles = [], projectSpec = '') {
    const manifest = {
        routes: [],
        schemas: [],
        models: [],
        sharedTypes: [],
        envVars: { declared: [], used: [] },
        dependencyGraph: { packages: [], internalLinks: [] }
    };

    const declaredEnvSet = new Set();
    const usedEnvSet = new Set();
    const declaredPkgSet = new Set();
    const internalLinksSet = new Set();

    for (const file of generatedFiles) {
        if (!file || !file.path) continue;
        const normPath = file.path.replace(/\\/g, '/');
        const content = typeof file.content === 'string' ? file.content : '';

        // 1. Rotalar (Routes)
        if (normPath.startsWith('src/app/') || normPath.startsWith('app/') || normPath.startsWith('src/pages/') || normPath.startsWith('pages/')) {
            if (normPath.endsWith('/page.tsx') || normPath.endsWith('/page.jsx') || normPath.endsWith('/page.js') || normPath.endsWith('/page.ts') || normPath === 'src/app/page.tsx' || normPath === 'src/app/page.jsx') {
                let routeUrl = normPath
                    .replace(/^(src\/)?(app|pages)/, '')
                    .replace(/\/page\.(tsx|jsx|js|ts)$/, '')
                    .replace(/\/index\.(tsx|jsx|js|ts)$/, '');
                if (!routeUrl || routeUrl === '') routeUrl = '/';
                manifest.routes.push({ type: 'PAGE', path: routeUrl, file: normPath });
            } else if (normPath.endsWith('/route.ts') || normPath.endsWith('/route.js')) {
                let apiRouteUrl = normPath
                    .replace(/^(src\/)?(app|pages)/, '')
                    .replace(/\/route\.(ts|js)$/, '');
                if (!apiRouteUrl.startsWith('/')) apiRouteUrl = '/' + apiRouteUrl;
                
                // HTTP Metotlarını ayıkla (GET, POST, PUT, DELETE, PATCH)
                const methods = [];
                if (/export\s+(?:async\s+)?function\s+GET\b/.test(content)) methods.push('GET');
                if (/export\s+(?:async\s+)?function\s+POST\b/.test(content)) methods.push('POST');
                if (/export\s+(?:async\s+)?function\s+PUT\b/.test(content)) methods.push('PUT');
                if (/export\s+(?:async\s+)?function\s+DELETE\b/.test(content)) methods.push('DELETE');
                if (/export\s+(?:async\s+)?function\s+PATCH\b/.test(content)) methods.push('PATCH');

                manifest.routes.push({ type: 'API', path: apiRouteUrl, methods, file: normPath });
            }
        }

        // 2. Prisma Modelleri (Models)
        if (normPath.endsWith('schema.prisma')) {
            const modelMatches = Array.from(content.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g));
            for (const [_, modelName, modelBody] of modelMatches) {
                const fields = [];
                const lines = modelBody.split('\n');
                for (const l of lines) {
                    const clean = l.trim();
                    if (!clean || clean.startsWith('//') || clean.startsWith('@@')) continue;
                    const tokens = clean.split(/\s+/);
                    if (tokens.length >= 2) {
                        fields.push(`${tokens[0]}: ${tokens[1]}`);
                    }
                }
                manifest.models.push({ name: modelName, fields });
            }
        }

        // 3. Validasyon Şemaları (Schemas)
        if (normPath.includes('validation') || normPath.includes('schema') || content.includes('z.object')) {
            const zodMatches = Array.from(content.matchAll(/(?:export\s+)?const\s+([A-Za-z0-9_]+Schema|[A-Za-z0-9_]+Input)\s*=\s*z\.object/g));
            for (const m of zodMatches) {
                manifest.schemas.push({ name: m[1], file: normPath });
            }
        }

        // 4. Paylaşılan Tipler (Shared Types)
        if (normPath.includes('types') || normPath.endsWith('.d.ts')) {
            const typeMatches = Array.from(content.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g));
            for (const tm of typeMatches) {
                manifest.sharedTypes.push({ name: tm[1], file: normPath });
            }
        }

        // 5. Ortam Değişkenleri (Env Vars)
        if (normPath === '.env' || normPath === '.env.example') {
            const envLines = content.split('\n');
            for (const el of envLines) {
                const match = el.match(/^\s*([A-Za-z0-9_]+)\s*=/);
                if (match) declaredEnvSet.add(match[1]);
            }
        }
        const envCalls = Array.from(content.matchAll(/process\.env\.([A-Za-z0-9_]+)/g));
        for (const ec of envCalls) {
            usedEnvSet.add(ec[1]);
        }

        // 6. Bağımlılık Grafiği (Dependency Graph)
        if (normPath === 'package.json') {
            try {
                const pkg = JSON.parse(content);
                Object.keys(pkg.dependencies || {}).forEach(p => declaredPkgSet.add(p));
                Object.keys(pkg.devDependencies || {}).forEach(p => declaredPkgSet.add(p));
            } catch {}
        }

        const importMatches = Array.from(content.matchAll(/(?:import\s+(?:[\s\S]*?from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g));
        for (const im of importMatches) {
            const spec = im[1];
            if (spec.startsWith('@/') || spec.startsWith('./') || spec.startsWith('../')) {
                internalLinksSet.add(`${path.basename(normPath)} -> ${spec}`);
            }
        }
    }

    manifest.envVars.declared = Array.from(declaredEnvSet);
    manifest.envVars.used = Array.from(usedEnvSet);
    manifest.dependencyGraph.packages = Array.from(declaredPkgSet);
    manifest.dependencyGraph.internalLinks = Array.from(internalLinksSet);

    return manifest;
}

export function buildTesterPrompt(projectTitle, acceptanceCriteria, generatedFiles, options = {}) {
    const audit = options.deterministicAudit || runDeterministicProjectAudit(generatedFiles);
    const buildResults = options.buildResults || null;
    const manifest = options.manifest || extractProjectManifest(generatedFiles, acceptanceCriteria);

    return `PROJE DOĞRULAMA & KABUL TESTİ (QA AUDIT)
==================================================
Proje Başlığı: ${projectTitle}

1. MİMARİ VE KABUL KRİTERLERİ (Project Spec):
"""
${acceptanceCriteria}
"""

2. PROJE MANİFESTOSU (Project Manifest):
--------------------------------------------------
A. Rotalar ve API Uç Noktaları (Routes):
${manifest.routes.length > 0 ? manifest.routes.map(r => `- [${r.type}] ${r.path} ${r.methods && r.methods.length > 0 ? `(Metotlar: ${r.methods.join(', ')})` : ''}`).join('\n') : '- Rota bulunamadı.'}

B. Veritabanı Modelleri (Prisma Models):
${manifest.models.length > 0 ? manifest.models.map(m => `- ${m.name} [Alanlar: ${m.fields.slice(0, 8).join(', ')}${m.fields.length > 8 ? ' ...' : ''}]`).join('\n') : '- Prisma modeli tanımlı değil.'}

C. Doğrulama Şemaları (Validation Schemas):
${manifest.schemas.length > 0 ? manifest.schemas.map(s => `- ${s.name} (${s.file})`).join('\n') : '- Özel validasyon şeması bulunamadı.'}

D. Paylaşılan Tipler & Arayüzler (Shared Types):
${manifest.sharedTypes.length > 0 ? manifest.sharedTypes.map(t => `- ${t.name} (${t.file})`).join('\n') : '- Özel tip dosyası bulunamadı.'}

E. Ortam Değişkenleri (Environment Variables):
- Tanımlı Değişkenler: ${manifest.envVars.declared.length > 0 ? manifest.envVars.declared.join(', ') : 'Yok'}
- Kodda Kullanılanlar: ${manifest.envVars.used.length > 0 ? manifest.envVars.used.join(', ') : 'Yok'}

F. Bağımlılık ve Paket Grafiği (Dependency Graph):
- Paketler: ${manifest.dependencyGraph.packages.join(', ') || 'Yok'}
- Kritik Modül Köprüleri: ${manifest.dependencyGraph.internalLinks.length > 0 ? manifest.dependencyGraph.internalLinks.slice(0, 15).join('; ') : 'Yok'}

3. DETERMINISTIK STATIK DENETİM SONUÇLARI:
--------------------------------------------------
- Durum: ${audit.passed ? 'BAŞARILI' : 'HATALAR TESPİT EDİLDİ'}
- Başarılı Kontroller: ${audit.passedCount}, Başarısız Kontroller: ${audit.failedCount}
${audit.issues.length > 0 ? `Tespit Edilen Kritik Sorunlar:\n${audit.issues.map(i => `- ${i}`).join('\n')}` : '- Kritik şema/JSON/import hatası tespit edilmedi.'}

4. COMPILER / BUILD DOĞRULAMA SONUÇLARI:
--------------------------------------------------
${buildResults ? (buildResults.passed ? '- Derleyici / Tip Denetimi: BAŞARILI (TypeScript/Prisma/Build hatasız).' : `- Derleyici / Tip Denetimi Hataları:\n${buildResults.issues.map(i => `- ${i}`).join('\n')}`) : '- Derleyici ve sözdizimi denetimi tamamlandı.'}

Lütfen yukarıdaki kapsamlı Proje Manifestosu, Derleyici Sonuçları ve Kabul Kriterlerini karşılaştırarak projenin fonksiyonel bütünlüğünü, semantik uyumunu ve çalışabilirliğini JSON formatında nihai QA kararı olarak raporla.`;
}

export function parseTesterResponse(rawText, deterministicAudit = null) {
    let data;
    try {
        data = extractAndParseJSON(rawText);
    } catch {
        data = { summary: rawText };
    }
    const normalized = normalizeReviewResult(data);

    if (deterministicAudit && !deterministicAudit.passed && deterministicAudit.issues.length > 0) {
        normalized.approved = false;
        normalized.issues = [...(normalized.issues || []), ...deterministicAudit.issues];
        normalized.summary = `Deterministik Hatalar Tespit Edildi: ${deterministicAudit.issues.join(' | ')}. ${normalized.summary || ''}`;
    }

    return normalized;
}
