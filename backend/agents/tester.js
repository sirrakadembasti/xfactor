import { extractAndParseJSON, validateReviewResult, normalizeReviewResult } from './schemas.js';

export const TESTER_SYSTEM_PROMPT = `
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
}
`;

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

    // 3. Dosya Boyut ve İçerik Kontrolü
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
