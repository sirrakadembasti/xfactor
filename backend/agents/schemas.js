/**
 * XFactor Ajan JSON Şemaları ve Yapılandırılmış Çıktı Doğrulayıcıları
 * Referans: agency-agents & Archon structured execution
 */
import path from 'path';
import { normalizeGeneratedIdentifier } from '../generatedIdentifiers.js';


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
            const name = d.trim() || `domain-${idx + 1}`;
            return {
                name,
                prefix: normalizeGeneratedIdentifier(name),
                description: `${name} domaini`
            };
        }
        const name = d.name || d.prefix || `domain-${idx + 1}`;
        const prefix = normalizeGeneratedIdentifier(d.prefix || d.name || `domain-${idx + 1}`);
        return {
            name,
            prefix,
            description: d.description || `${name} geliştirme`
        };
    });

    let rawReqs = plan.requirements || plan.requirementIds || [];
    if (!Array.isArray(rawReqs) || rawReqs.length === 0) {
        rawReqs = [{ id: 'REQ-1', statement: 'Temel mimari ve modül gereksinimi', mandatory: true }];
    }
    plan.requirements = rawReqs.map((r, idx) => {
        if (typeof r === 'string') {
            return {
                id: r.trim() || `REQ-${idx + 1}`,
                statement: r.trim() || `Gereksinim ${idx + 1}`,
                mandatory: true,
                kind: 'functional',
                priority: 'high'
            };
        }
        return {
            id: r.id || `REQ-${idx + 1}`,
            statement: r.statement || r.title || r.description || `Gereksinim ${idx + 1}`,
            mandatory: r.mandatory !== undefined ? Boolean(r.mandatory) : true,
            kind: r.kind || 'functional',
            priority: r.priority || 'high'
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
    const reqs = plan.requirements || plan.requirementIds;
    if (!Array.isArray(reqs) || reqs.length === 0) {
        throw new Error('Manager planında en az bir gereksinim ("requirements" veya "requirementIds") tanımlanmalıdır.');
    }
    return true;
}

/**
 * Director Ajanı Çıktı Şeması Doğrulaması ve Otomatik Normalizasyon
 */
export function normalizeDirectorSpec(spec, fallbackDomain = 'domain') {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        spec = {};
    }

    const domain = spec.domain || spec.name || spec.prefix || fallbackDomain;
    spec.domain = typeof domain === 'string' ? domain.trim() : fallbackDomain;

    const altTalimat = spec.altTalimatname || spec.alt_talimatname || spec.altTalimat || spec.spec || spec.talimatname || spec.description || `# ${spec.domain} Alt Şartnamesi`;
    spec.altTalimatname = typeof altTalimat === 'string' ? altTalimat : `# ${spec.domain} Alt Şartnamesi`;

    let rawTL = spec.teamleaders || spec.team_leaders || spec.teamLeaders || spec.teams || spec.leaders || spec.teamleader;
    if (!rawTL || !Array.isArray(rawTL) || rawTL.length === 0) {
        spec.teamleaders = [{
            name: `${spec.domain}.teamleader`,
            prefix: normalizeGeneratedIdentifier(spec.domain),
            mission: `${spec.domain} geliştirme`
        }];
    } else {
        spec.teamleaders = rawTL.map((tl, idx) => {
            if (typeof tl === 'string') {
                return {
                    name: tl.trim() || `${spec.domain}.teamleader-${idx + 1}`,
                    prefix: normalizeGeneratedIdentifier(spec.domain),
                    mission: `${spec.domain} geliştirme`
                };
            }
            return {
                name: tl.name || `${spec.domain}.teamleader-${idx + 1}`,
                prefix: normalizeGeneratedIdentifier(tl.prefix || spec.domain),
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
    const rawInput = Array.isArray(taskList) ? { tasks: taskList } : taskList;
    if (!rawInput || typeof rawInput !== 'object') {
        taskList = { tasks: [] };
    } else {
        taskList = rawInput;
    }

    let rawTasks = taskList.tasks || taskList.taskList || taskList.subtasks || taskList.items || [];
    if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        rawTasks = [{
            id: 'task-1-core-setup',
            title: 'Temel Modül ve Bileşen Kurulumu',
            description: 'Gereksinimlere uygun temel bileşenleri ve modelleri oluştur.',
            dependencies: [],
            targetFiles: ['src/App.jsx'],
            requirementIds: ['REQ-1']
        }];
    }
    taskList.tasks = rawTasks.map((t, idx) => {
        if (typeof t === 'string') {
            const id = normalizeGeneratedIdentifier(`task-${idx + 1}`);
            return {
                id,
                title: t,
                description: t,
                dependencies: idx > 0 ? [normalizeGeneratedIdentifier(`task-${idx}`)] : [],
                targetFiles: [],
                requirementIds: [`REQ-${idx + 1}`]
            };
        }
        const id = normalizeGeneratedIdentifier(t.id || `task-${idx + 1}`);
        const dependencies = Array.isArray(t.dependencies)
            ? t.dependencies.map((dep) => normalizeGeneratedIdentifier(dep))
            : [];
        const reqIds = Array.isArray(t.requirementIds)
            ? t.requirementIds
            : (Array.isArray(t.requirements) ? t.requirements : (t.requirementId ? [t.requirementId] : []));
        return {
            id,
            title: t.title || t.name || `Görev ${idx + 1}`,
            description: t.description || t.title || `Görev ${idx + 1} geliştirme`,
            dependencies,
            targetFiles: Array.isArray(t.targetFiles) ? t.targetFiles : (t.target_files || []),
            requirementIds: reqIds.length > 0 ? reqIds : [`REQ-${idx + 1}`]
        };
    });

    return taskList;
}

export function validateTeamleaderTasks(taskList) {
    const rawInput = Array.isArray(taskList) ? { tasks: taskList } : taskList;
    if (!rawInput || typeof rawInput !== 'object') {
        throw new Error('Teamleader görev listesi bir nesne veya dizi olmalıdır.');
    }
    const tasks = rawInput.tasks;
    if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new Error('Teamleader en az bir atomik coder görevi üretmelidir.');
    }
    for (const task of tasks) {
        const reqIds = task.requirementIds || task.requirements;
        if (!Array.isArray(reqIds) || reqIds.length === 0) {
            throw new Error(`Görev "${task.id || task.title}" için en az bir "requirementIds" belirtilmelidir.`);
        }
    }
    return true;
}
/**
 * Coder Ajanı Çok Dosyalı Kod Üretim Çıktısı Doğrulaması
 */
export function validateCoderFiles(codeOutput, allowedTargetFiles = null) {
    const files = Array.isArray(codeOutput)
        ? codeOutput
        : (codeOutput && Array.isArray(codeOutput.files) ? codeOutput.files : null);

    if (!files || files.length === 0) {
        throw new Error('Coder en az bir dosya ("files" dizisi) üretmelidir.');
    }
    const seenPaths = new Set();
    const allowedSet = Array.isArray(allowedTargetFiles) && allowedTargetFiles.length > 0
        ? new Set(allowedTargetFiles.map(p => path.normalize(p).replace(/\\/g, '/')))
        : null;

    for (const f of files) {
        if (!f || !f.path || typeof f.path !== 'string') {
            throw new Error('Her dosya için geçerli bir "path" (dosya yolu) zorunludur.');
        }
        const normPath = path.normalize(f.path).replace(/\\/g, '/');
        if (seenPaths.has(normPath)) {
            throw new Error(`Coder çıktısında yinelenen dosya yolu tespit edildi: "${f.path}".`);
        }
        seenPaths.add(normPath);

        if (allowedSet && !allowedSet.has(normPath)) {
            throw new Error(`Coder çıktısındaki "${f.path}" dosyası görevin hedef dosya sözleşmesinde (allowlist: ${allowedTargetFiles.join(', ')}) yer almıyor.`);
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

/**
 * Görev bağımlılıklarını (DAG) döngüsel bağımlılık, eksik referans ve self-loop'lara karşı doğrular.
 */
export function validateTaskDependencies(tasks = []) {
    const errors = [];
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { valid: false, errors: ['Görev listesi boş olamaz.'] };
    }

    const taskIds = new Set();
    for (const t of tasks) {
        if (!t?.id || typeof t.id !== 'string') {
            errors.push('Tüm görevlerin geçerli bir "id" değeri olmalıdır.');
            continue;
        }
        if (taskIds.has(t.id)) {
            errors.push(`Yinelenen görev ID'si tespit edildi: "${t.id}".`);
        }
        taskIds.add(t.id);
    }

    // Bağımlılık referans ve self-loop kontrolleri
    for (const t of tasks) {
        if (!t?.id) continue;
        const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
        for (const dep of deps) {
            if (dep === t.id) {
                errors.push(`Görev "${t.id}" kendine bağımlı (Self-loop) olamaz.`);
            }
            if (!taskIds.has(dep)) {
                errors.push(`Tanımsız bağımlılık referansı: "${t.id}" -> "${dep}".`);
            }
        }
    }

    // Döngüsel bağımlılık (Cycle Detection) kontrolü via Kahn's Algorithm
    const inDegree = new Map();
    const adjList = new Map();

    for (const t of tasks) {
        if (!t?.id) continue;
        inDegree.set(t.id, 0);
        adjList.set(t.id, []);
    }

    for (const t of tasks) {
        if (!t?.id) continue;
        const deps = Array.isArray(t.dependencies) ? t.dependencies : [];
        for (const dep of deps) {
            if (taskIds.has(dep) && dep !== t.id) {
                adjList.get(dep).push(t.id);
                inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
            }
        }
    }

    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
        const u = queue.shift();
        visitedCount++;
        for (const v of adjList.get(u) || []) {
            inDegree.set(v, inDegree.get(v) - 1);
            if (inDegree.get(v) === 0) queue.push(v);
        }
    }

    if (visitedCount < taskIds.size) {
        errors.push('Döngüsel bağımlılık (Cycle) tespit edildi. Görevler tamamlanamaz.');
    }

    // Paralel dalga dosya sahipliği ve çakışma (Collision) kontrolü
    const fileOwnerMap = new Map();
    for (const t of tasks) {
        if (!t?.id) continue;
        const targets = Array.isArray(t.targetFiles) ? t.targetFiles : [];
        for (const file of targets) {
            if (typeof file !== 'string') continue;
            const normFile = path.normalize(file).replace(/\\/g, '/');
            if (fileOwnerMap.has(normFile)) {
                const prevTask = fileOwnerMap.get(normFile);
                // Eğer bu görevler birbirine bağımlı değilse (paralel çalışabilirlerse) çakışma hatası ver
                const prevDeps = Array.isArray(t.dependencies) ? t.dependencies : [];
                const otherTask = tasks.find(ot => ot.id === prevTask);
                const otherDeps = otherTask && Array.isArray(otherTask.dependencies) ? otherTask.dependencies : [];
                if (!prevDeps.includes(prevTask) && !otherDeps.includes(t.id)) {
                    errors.push(`Bağımsız görevler arasında dosya sahipliği çakışması: "${normFile}" dosyası hem "${prevTask}" hem de "${t.id}" tarafından hedefleniyor.`);
                }
            } else {
                fileOwnerMap.set(normFile, t.id);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Güvenilmeyen kullanıcı log veya rapor içeriklerindeki prompt ayrıştırıcılarını temizler.
 */
export function escapePromptDelimiters(rawText) {
    if (typeof rawText !== 'string') return '';
    return rawText
        .replace(/<<<UNTRUSTED_/g, '<<<_ESCAPED_UNTRUSTED_')
        .replace(/>>>/g, '___>>>');
}

/**
 * Güvenilmeyen kullanıcı verisini belirteçler (delimiters) ile izole prompt bloğuna sarar.
 */
export function formatUntrustedPromptContext(label, content) {
    const safeLabel = (label || 'DATA').replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    const escapedContent = escapePromptDelimiters(content || '');
    return `<<<UNTRUSTED_${safeLabel}_BEGIN>>>\n${escapedContent}\n<<<UNTRUSTED_${safeLabel}_END>>>`;
}
