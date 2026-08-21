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

export function buildTesterPrompt(projectTitle, acceptanceCriteria, generatedFiles) {
    const audit = runDeterministicProjectAudit(generatedFiles);
    
    const filesSummary = generatedFiles.map(f => ({
        path: f.path,
        size: f.content ? f.content.length : 0,
        preview: f.content ? f.content.slice(0, 500) : ""
    }));

    return `Proje Başlığı: ${projectTitle}
Kabul Kriterleri: ${acceptanceCriteria}

Deterministik Ön Doğrulama Sonuçları:
- Durum: ${audit.passed ? 'BAŞARILI' : 'HATALAR TESPİT EDİLDİ'}
- Başarılı Kontroller: ${audit.passedCount}
- Başarısız Kontroller: ${audit.failedCount}
${audit.issues.length > 0 ? `Tespit Edilen Kritik Sorunlar:\n${audit.issues.map(i => `- ${i}`).join('\n')}` : '- Kritik şema/JSON hatası tespit edilmedi.'}

Oluşturulan Proje Dosyaları Özeti:
"""
${JSON.stringify(filesSummary, null, 2)}
"""

Lütfen test ve kabul doğrulamasını gerçekleştirip yukarıdaki tespitleri de dikkate alarak JSON formatında nihai QA kararını raporla.`;
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
