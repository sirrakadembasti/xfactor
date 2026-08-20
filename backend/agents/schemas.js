/**
 * XFactor Ajan JSON Şemaları ve Yapılandırılmış Çıktı Doğrulayıcıları
 * Referans: agency-agents & Archon structured execution
 */

/**
 * JSON metnindeki geçersiz kaçış dizilerini (örn: JS regex \d, \w veya tek ters bölü) onarır.
 */
function sanitizeEscapeSequences(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
}

function sliceJSONBoundaries(str) {
    if (typeof str !== 'string') return str;
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    const firstBracket = str.indexOf('[');
    const lastBracket = str.lastIndexOf(']');

    let candidate = str;
    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        candidate = str.slice(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
        candidate = str.slice(firstBracket, lastBracket + 1);
    } else if (firstBrace !== -1) {
        // Açılmış ama kapanmamış JSON objesi
        candidate = str.slice(firstBrace);
    } else if (firstBracket !== -1) {
        candidate = str.slice(firstBracket);
    }
    return candidate;
}

/**
 * Kesilmiş veya kapatılmamış JSON metinlerini (Unterminated string & unclosed braces) otomatik onarır.
 */
export function repairTruncatedJSON(raw) {
    if (typeof raw !== 'string') return '';
    let str = raw.trim();
    // Hem baştaki hem sondaki markdown kod bloklarını temizle
    str = str.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let inString = false;
    let isEscaped = false;
    const stack = [];
    let cleaned = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i];

        if (inString) {
            if (isEscaped) {
                cleaned += char;
                isEscaped = false;
            } else if (char === '\\') {
                cleaned += char;
                isEscaped = true;
            } else if (char === '"') {
                cleaned += char;
                inString = false;
            } else if (char === '\n') {
                cleaned += '\\n';
            } else if (char === '\r') {
                cleaned += '\\r';
            } else if (char === '\t') {
                cleaned += '\\t';
            } else {
                cleaned += char;
            }
        } else {
            cleaned += char;
            if (char === '"') {
                inString = true;
            } else if (char === '{') {
                stack.push('}');
            } else if (char === '[') {
                stack.push(']');
            } else if (char === '}' || char === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === char) {
                    stack.pop();
                }
            }
        }
    }

    if (inString) {
        if (isEscaped) cleaned += '\\';
        cleaned += '"';
    }

    while (stack.length > 0) {
        cleaned += stack.pop();
    }

    return sanitizeEscapeSequences(cleaned);
}
/**
 * Ham veya kaçışsız (JSX className="...", raw double quotes vb.) metinlerden dosya bloklarını eksiksiz çıkarır.
 */
export function extractCoderFilesFromText(rawText) {
    if (typeof rawText !== 'string') return null;
    const files = [];
    let summary = "Otomatik üretilen kod dosyaları";

    // 1. Summary extraction
    const sumMatch = rawText.match(/"summary"\s*:\s*"([\s\S]*?)"\s*,\s*"files"/);
    if (sumMatch) {
        summary = sumMatch[1].trim();
    } else {
        const altSum = rawText.match(/"summary"\s*:\s*"([^"]+)"/);
        if (altSum) summary = altSum[1].trim();
    }

    // 2. Deneme: "path" ve "content" ikililerini sıra bağımsız yakala
    // Standart format: "path" önce
    const segments = rawText.split(/"path"\s*:\s*["'`]/);
    for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        const pathMatch = seg.match(/^([^"'`\n]+)["'`]/);
        if (!pathMatch) continue;

        const filePath = pathMatch[1].trim();
        const afterFilePath = seg.slice(pathMatch[0].length);

        const contentMatch = afterFilePath.match(/"content"\s*:\s*(["'`])/);
        if (!contentMatch) continue;

        const contentQuote = contentMatch[1];
        const contentStartIdx = contentMatch.index + contentMatch[0].length;
        let content = afterFilePath.slice(contentStartIdx);

        // Strip trailing JSON delimiters accurately
        const closingPattern = new RegExp(`(?:${contentQuote}|["'\`])?\\s*\\}\\s*(?:,\\s*\\{?|\\]\\s*\\}?)?\\s*(\`\`\`.*)?$`);
        content = content.replace(closingPattern, '').trim();

        if (content.endsWith(contentQuote)) {
            content = content.slice(0, -contentQuote.length).trim();
        }

        if (content.includes('\\n') && !content.includes('\n')) {
            content = content
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
        }

        if (filePath && content) {
            files.push({ path: filePath, content });
        }
    }

    // 3. Fallback: Eğer "content" önce geldiyse ters sıra ile dene
    if (files.length === 0) {
        const altSegments = rawText.split(/"content"\s*:\s*(["'`])/);
        for (let i = 1; i < altSegments.length; i += 2) {
            const quote = altSegments[i];
            const rest = altSegments[i + 1] || '';
            const pathIdx = rest.indexOf('"path"');
            if (pathIdx !== -1) {
                let content = rest.slice(0, pathIdx).trim();
                if (content.endsWith(quote)) content = content.slice(0, -quote.length).trim();
                if (content.endsWith(',')) content = content.slice(0, -1).trim();
                if (content.endsWith(quote)) content = content.slice(0, -quote.length).trim();

                const pathPart = rest.slice(pathIdx);
                const pathMatch = pathPart.match(/"path"\s*:\s*["'`]([^"'`\n]+)["'`]/);
                if (pathMatch && pathMatch[1]) {
                    const filePath = pathMatch[1].trim();
                    files.push({ path: filePath, content });
                }
            }
        }
    }

    if (files.length > 0) {
        return { summary, files };
    }
    return null;
}

/**
 * Aşırı bozuk veya kesilmiş LLM çıktılarından dosya bloklarını kurtarır.
 */
export function extractFilesFromRawCoderOutput(text) {
    return extractCoderFilesFromText(text);
}

/**
 * JSON bloğunu (markdown fence veya çıplak JSON) güvenle ayıklar, geçersiz kaçışları ve kesilmeleri onarır ve parse eder.
 */
export function extractAndParseJSON(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('Geçersiz veya boş LLM çıktısı.');
    }

    // Baştaki ve sondaki markdown kalıntılarını temizle
    const strippedText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    // 1. Markdown ```json ... ``` bloğunu ara
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)(?:\n?```|$)/i;
    const match = text.match(jsonBlockRegex);
    const rawCandidate = match ? match[1].trim() : strippedText;

    // Deneme 1: Doğrudan parse
    try {
        return JSON.parse(rawCandidate);
    } catch (e1) {
        // Deneme 2: Kaçış dizilerini onararak parse
        try {
            return JSON.parse(sanitizeEscapeSequences(rawCandidate));
        } catch (e2) {
            // Deneme 3: { } veya [ ] sınırlarına kırpıp doğrudan parse
            const sliced = sliceJSONBoundaries(rawCandidate);
            try {
                return JSON.parse(sliced);
            } catch (e3) {
                // Deneme 4: Sınırlarına kırpılmış metnin kaçış dizilerini onararak parse
                try {
                    return JSON.parse(sanitizeEscapeSequences(sliced));
                } catch (e4) {
                    // Deneme 5: Kesilmiş / Kapatılmamış JSON onarıcısı (Unterminated string repair)
                    try {
                        return JSON.parse(repairTruncatedJSON(sliced));
                    } catch (e5) {
                        // Deneme 6: Tüm metin üzerinden tam onarım
                        try {
                            const fullSliced = sliceJSONBoundaries(strippedText);
                            return JSON.parse(repairTruncatedJSON(fullSliced));
                        } catch (e6) {
                            // Deneme 7: Coder dosya kurtarıcı (Fallback extractor)
                            const fallbackResult = extractFilesFromRawCoderOutput(text);
                            if (fallbackResult && fallbackResult.files.length > 0) {
                                return fallbackResult;
                            }

                            throw new Error(`JSON ayrıştırma hatası: ${e1.message}. Ham metin: ${text.slice(0, 150)}...`);
                        }
                    }
                }
            }
        }
    }
}

/**
 * Manager Ajanı Çıktı Şeması Doğrulaması ve Otomatik Normalizasyon
 */
export function normalizeManagerPlan(plan) {
    if (!plan || typeof plan !== 'object') {
        plan = {};
    }
    plan.summary = plan.summary || plan.title || 'Proje Mimari Planı';
    plan.talimatname = plan.talimatname || plan.spec || plan.description || '# Proje Talimatnamesi\n';
    
    let rawDomains = plan.domains || plan.domain_list || plan.subdomains || ['frontend', 'backend'];
    if (!Array.isArray(rawDomains) || rawDomains.length === 0) {
        rawDomains = ['frontend', 'backend'];
    }

    plan.domains = rawDomains.map((d, idx) => {
        if (typeof d === 'string') {
            return {
                name: d.trim() || `domain-${idx + 1}`,
                prefix: d.trim() || `domain-${idx + 1}`,
                description: `${d} domaini`
            };
        }
        return {
            name: d.name || d.prefix || `domain-${idx + 1}`,
            prefix: d.prefix || d.name || `domain-${idx + 1}`,
            description: d.description || `${d.name || 'domain'} geliştirme`
        };
    });

    return plan;
}

export function validateManagerPlan(plan) {
    if (!plan || typeof plan !== 'object') {
        throw new Error('Manager planı bir nesne olmalıdır.');
    }
    if (!plan.summary || typeof plan.summary !== 'string') {
        throw new Error('Manager planında "summary" (özet) alanı zorunludur.');
    }
    if (!plan.talimatname || typeof plan.talimatname !== 'string') {
        throw new Error('Manager planında "talimatname" şartname metni zorunludur.');
    }
    if (!Array.isArray(plan.domains) || plan.domains.length === 0) {
        throw new Error('Manager planında en az 1 domain tanımlanmalıdır (örn: ["frontend", "backend"]).');
    }
    for (const domain of plan.domains) {
        const name = typeof domain === 'string' ? domain : domain.name;
        if (!name || typeof name !== 'string') {
            throw new Error('Her domain için geçerli bir "name" belirtilmelidir.');
        }
    }
    return true;
}

/**
 * Director Ajanı Çıktı Şeması Doğrulaması ve Otomatik Normalizasyon
 */
export function normalizeDirectorSpec(spec, fallbackDomain = 'domain') {
    if (!spec || typeof spec !== 'object') {
        spec = {};
    }

    const domain = spec.domain || spec.name || spec.prefix || fallbackDomain;
    spec.domain = typeof domain === 'string' ? domain.trim() : fallbackDomain;

    const altTalimat = spec.altTalimatname || spec.alt_talimatname || spec.altTalimat || spec.spec || spec.talimatname || spec.description || `# ${spec.domain} Alt Şartnamesi`;
    spec.altTalimatname = typeof altTalimat === 'string' ? altTalimat.trim() : `# ${spec.domain} Alt Şartnamesi`;

    let rawTL = spec.teamleaders || spec.team_leaders || spec.teamLeaders || spec.teams || spec.leaders || spec.teamleader;
    if (!rawTL || !Array.isArray(rawTL) || rawTL.length === 0) {
        spec.teamleaders = [{
            name: `${spec.domain}.teamleader`,
            prefix: spec.domain,
            mission: `${spec.domain} geliştirme ve koordinasyon`
        }];
    } else {
        spec.teamleaders = rawTL.map((tl, idx) => {
            if (typeof tl === 'string') {
                return {
                    name: tl.trim() || `${spec.domain}.teamleader-${idx + 1}`,
                    prefix: spec.domain,
                    mission: `${spec.domain} geliştirme`
                };
            }
            return {
                name: tl.name || `${spec.domain}.teamleader-${idx + 1}`,
                prefix: tl.prefix || spec.domain,
                mission: tl.mission || `${spec.domain} geliştirme`
            };
        });
    }

    return spec;
}

export function validateDirectorSpec(spec) {
    if (!spec || typeof spec !== 'object') {
        throw new Error('Director şartnamesi bir nesne olmalıdır.');
    }
    if (!spec.domain || typeof spec.domain !== 'string') {
        throw new Error('Director şartnamesinde "domain" zorunludur.');
    }
    if (!spec.altTalimatname || typeof spec.altTalimatname !== 'string') {
        throw new Error('Director şartnamesinde "altTalimatname" metni zorunludur.');
    }
    if (!Array.isArray(spec.teamleaders) || spec.teamleaders.length === 0) {
        throw new Error('Director şartnamesinde en az bir teamleader tanımlanmalıdır.');
    }
    for (const tl of spec.teamleaders) {
        const name = typeof tl === 'string' ? tl : tl.name;
        if (!name) {
            throw new Error('Her teamleader için "name" ve "mission" zorunludur.');
        }
    }
    return true;
}

/**
 * Teamleader Görev Ayrıştırma (Task Decomposition) Şeması Doğrulaması ve Normalizasyon
 */
export function normalizeTeamleaderTasks(taskList) {
    if (!taskList || typeof taskList !== 'object') {
        taskList = { tasks: [] };
    }

    let rawTasks = taskList.tasks || taskList.taskList || taskList.subtasks || taskList.items || [];
    if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        rawTasks = [{
            id: 'task-1-core-setup',
            title: 'Temel Modül ve Bileşen Kurulumu',
            description: 'Gereksinimlere uygun temel bileşenleri ve modelleri oluştur.',
            dependencies: [],
            targetFiles: ['src/App.jsx']
        }];
    }

    taskList.tasks = rawTasks.map((t, idx) => {
        if (typeof t === 'string') {
            return {
                id: `task-${idx + 1}`,
                title: t,
                description: t,
                dependencies: idx > 0 ? [`task-${idx}`] : [],
                targetFiles: []
            };
        }
        return {
            id: t.id || `task-${idx + 1}`,
            title: t.title || t.name || `Görev ${idx + 1}`,
            description: t.description || t.title || `Görev ${idx + 1} geliştirme`,
            dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
            targetFiles: Array.isArray(t.targetFiles) ? t.targetFiles : (t.target_files || [])
        };
    });

    return taskList;
}

export function validateTeamleaderTasks(taskList) {
    if (!taskList || typeof taskList !== 'object') {
        throw new Error('Teamleader görev listesi bir nesne olmalıdır.');
    }
    if (!Array.isArray(taskList.tasks) || taskList.tasks.length === 0) {
        throw new Error('Teamleader en az bir atomik coder görevi üretmelidir.');
    }
    return true;
}
/**
 * Coder Ajanı Çok Dosyalı Kod Üretim Çıktısı Doğrulaması
 */
export function validateCoderFiles(codeOutput) {
    if (!codeOutput || typeof codeOutput !== 'object') {
        throw new Error('Coder çıktısı bir nesne olmalıdır.');
    }
    if (!Array.isArray(codeOutput.files) || codeOutput.files.length === 0) {
        throw new Error('Coder en az bir dosya ("files" dizisi) üretmelidir.');
    }
    for (const f of codeOutput.files) {
        if (!f.path || typeof f.path !== 'string') {
            throw new Error('Her dosya için geçerli bir "path" (dosya yolu) zorunludur.');
        }
        if (typeof f.content !== 'string') {
            throw new Error(`"${f.path}" dosyası için içerik ("content") metin olmalıdır.`);
        }
    }
    return true;
}

/**
 * Reviewer ve Tester Değerlendirme Şeması Doğrulaması ve Normalizasyon
 */
export function normalizeReviewResult(review) {
    if (!review || typeof review !== 'object') {
        review = {};
    }
    const hasExplicitBool = typeof review.approved === 'boolean';
    const isApprovedTrue = hasExplicitBool
        ? review.approved
        : (typeof review.approved === 'string' && ['true', 'approved', 'onaylandı', 'başarılı'].includes(review.approved.trim().toLowerCase()));

    const hasIssues = (Array.isArray(review.issues) && review.issues.length > 0) || (typeof review.feedback === 'string' && review.feedback.trim().length > 0 && !isApprovedTrue);

    review.approved = Boolean(isApprovedTrue && !hasIssues);
    review.summary = review.summary || review.feedback || review.message || (review.approved ? 'İnceleme başarıyla onaylandı.' : 'Düzeltme gerekli.');
    return review;
}

export function validateReviewResult(review) {
    if (!review || typeof review !== 'object') {
        throw new Error('İnceleme çıktısı bir nesne olmalıdır.');
    }
    if (typeof review.approved !== 'boolean') {
        throw new Error('İnceleme sonucunda "approved" boolean alanı zorunludur.');
    }
    if (!review.summary || typeof review.summary !== 'string') {
        throw new Error('İnceleme sonucunda "summary" metni zorunludur.');
    }
    return true;
}

export const normalizeTesterReport = normalizeReviewResult;
export const validateTesterReport = validateReviewResult;
