import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { readProjectState, writeProjectState, executeProjectTasks, getProjectDir, normalizeWorkflowState } from '../engine/index.js';
import { createProject, deleteProject, assertVerifiedArtifactEvidence, syncProjectsWithDisk, getAllProjects, updateProject, getProjectsRoot, rehydrateProjectLogsFromDisk, getProject, appendProjectActionMessages } from '../projectRepository.js';
import { acquireWorkflowLease, getActiveWorkflowAttempt, releaseWorkflowLease } from '../workflowAttempts.js';
import { abortProjectExecution } from '../engine/cancellation.js';
import { db, getProjectLogs } from '../db.js';
import { generateLLMResponse } from '../llm.js';
import { validateChatPayload, validateProjectTitle, isSafeProjectPath, isSymlinkDirent, assertPathInsideRoot, asyncHandler } from '../security.js';
import { loadAgentPromptFromDocs, loadOrkestrasyonTalimatnamesi } from '../agents/agentLoader.js';
import { extractAndParseJSON, normalizeManagerPlan } from '../agents/schemas.js';
import { logError, logWarning, redactSensitiveText, redactSensitiveValue, getGateMetrics, getStackMetrics, getTrendMetrics, getFailureMetrics, deriveCheckpointId, collectDownstreamTaskIds } from '../observability.js';
import {
    canTransitionProjectStatus,
    getUserProjects,
    canViewProject
} from '../auth.js';
import { PROJECT_STATUS } from '../engine/stateMachine.js';
import { runProjectVerification } from '../verification/qualityPolicy.js';
import { buildCompletionReport } from '../verification/reportGenerator.js';
import { listArtifacts } from '../repositories/artifactRepository.js';


import { authorizeArtifactDownload } from './artifactDownloadAuthorization.js';
const getActionId = req => {
    const supplied = req.get('X-XFactor-Action-Id');
    if (supplied !== undefined && (
        !supplied.trim()
        || supplied.length > 128
    )) {
        const error = new Error('Invalid X-XFactor-Action-Id header.');
        error.status = 400;
        throw error;
    }
    return supplied || `server-${crypto.randomUUID()}`;
};

const appendWorkflowAction = (projectId, actionId, action, options = {}) => appendProjectActionMessages(projectId, {
    actionId,
    userText: action.userText,
    modelText: action.modelText,
    ...options
});

const respondIdempotentWorkflow = (res, projectId, attempt) => res.json({
    ...getProject(projectId),
    attemptId: attempt?.id,
    idempotent: true
});

const APPROVAL_PUBLICATION_TIMEOUT_MS = 1000;
const APPROVAL_PUBLICATION_INTERVAL_MS = 10;

const hasRecentActionPair = projectId => {
    const rows = db.prepare(`
        SELECT action_key
        FROM chat_history
        WHERE project_id = ? AND action_key IS NOT NULL
        ORDER BY id DESC
        LIMIT 2
    `).all(projectId);
    if (rows.length !== 2) return false;
    const [model, user] = rows;
    if (!model.action_key.endsWith(':model') || !user.action_key.endsWith(':user')) return false;
    return model.action_key.slice(0, -':model'.length) === user.action_key.slice(0, -':user'.length);
};

const waitForApprovalPublication = async projectId => {
    const deadline = Date.now() + APPROVAL_PUBLICATION_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const state = await readProjectState(projectId);
        const attempt = getActiveWorkflowAttempt(projectId);
        if (!attempt || !isApprovalAttempt(attempt)) return { ready: false, timedOut: false };
        if (state?.status === PROJECT_STATUS.IMPLEMENTING && hasRecentActionPair(projectId)) {
            return { ready: true, attempt };
        }
        await new Promise(resolve => setTimeout(resolve, APPROVAL_PUBLICATION_INTERVAL_MS));
    }
    return { ready: false, timedOut: true };
};
const isApprovalAttempt = attempt => String(attempt?.lease_owner || '').startsWith('http-approve-');

function findFailedReports(dir, projectDir) {
    const reports = [];
    try {
        if (!fsSync.existsSync(dir)) return reports;
        const entries = fsSync.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                reports.push(...findFailedReports(fullPath, projectDir));
            } else if (entry.name === 'RAPOR.md') {
                const content = fsSync.readFileSync(fullPath, 'utf8');
                if (content.includes('REDDEDILDI') || content.includes('Reviewer Reddi') || content.includes('Hata')) {
                    const relPath = path.relative(projectDir, fullPath);
                    reports.push({ file: relPath, content });
                }
            }
        }
    } catch {}
    return reports;
}

function normalizeManagerPlanFromText(title, responseText) {
    const standardRequirements = [
        { id: 'REQ-1', statement: 'Veritabanı modelleri, şema ve başlangıç verisi (Prisma SQLite)', mandatory: true, kind: 'functional', priority: 'high' },
        { id: 'REQ-2', statement: 'REST API CRUD rotaları, veri doğrulama ve sunucu mantığı', mandatory: true, kind: 'functional', priority: 'high' },
        { id: 'REQ-3', statement: 'Kullanıcı arayüzü bileşenleri, vitrin, listeleme ve sayfalar', mandatory: true, kind: 'functional', priority: 'high' },
        { id: 'REQ-4', statement: 'Yönetim paneli, filtreleme, arama ve kullanıcı etkileşimi', mandatory: true, kind: 'functional', priority: 'high' }
    ];
    return normalizeManagerPlan({
        summary: `Mimari Plan: ${title}`,
        talimatname: `# ${title} (Mimari Şartname)\n\n${responseText.replace(/\[PLAN_HAZIR\]/g, '').trim()}`,
        domains: [
            {
                name: 'backend',
                prefix: 'backend',
                description: 'Veritabanı şeması, Prisma SQLite ve REST API servisleri'
            },
            {
                name: 'frontend',
                prefix: 'frontend',
                description: 'Kullanıcı arayüzü, sayfalar, bileşenler ve Tailwind stilleri'
            }
        ],
        requirements: standardRequirements
    });
}

export function buildManagerChatSystemPrompt(state, projectDir) {
    const status = state?.status || 'planning';
    const title = state?.title || 'Proje';

    let extraContext = '';

    if (status === 'completed') {
        let reportContent = '';
        try {
            const raporPath = path.join(projectDir, 'RAPOR.md');
            if (fsSync.existsSync(raporPath)) {
                reportContent = fsSync.readFileSync(raporPath, 'utf8');
            }
        } catch {}

        extraContext = `
[GÜNCEL DURUM: PROJE TAMAMLANDI / İNCELEME & REVİZYON MODU]
- "${title}" projesi daha önce üretildi.
${reportContent ? `\nMEVCUT PROJE RAPORU:\n"""\n${reportContent}\n"""\n` : ''}

KRİTİK DÜRÜSTLÜK VE EYLEM KURALI (ASLA YALAN SÖYLEME):
- Sen bir sohbet ajanısın; sohbet sırasında doğrudan diskteki dosyaları DEĞİŞTİREMEZSİN veya arka planda kod YAZAMAZSIN.
- ASLA "Hemen düzelttim", "Dosyaları güncelledim, yeni pakette hazır", "Mekan şablonunu temizledim" gibi SAHTE / YALAN iddialarda bulunma. Bu kullanıcıyı aldatmaktır ve KESİNLİKLE YASAKTIR.
- Eğer Boss projede bir hata, yanlış şablon veya mimari revizyon bildirirse:
  1. Hatayı ve eksikleri dürüstçe kabul et.
  2. İstenen yeni/düzeltilmiş mimariyi ve şartnameyi (modeller, sayfalar, rotalar) net şekilde özetle.
  3. Yanıtının sonuna mutlaka "[PLAN_HAZIR]" etiketini ekleyerek Boss'a "Revizyon planını hazırladım. Kodların DAG motoru tarafından sıfırdan üretilmesi için lütfen aşağıdaki 'Planı Onayla ve Başlat' butonuna tıklayınız." de.
`;
    } else if (status === 'running') {
        extraContext = `
[GÜNCEL DURUM: KODLAMA VE GELİŞTİRME CANLI DEVAM EDİYOR]
- Ekipler görevleri sırayla kodluyor ve test ediyor.
- Boss'a sürecin canlı aktığını, üst menüden 'Canlı DAG Grafiği' sekmesine geçerek ajanların kod üretimini ve logları canlı izleyebileceğini söyle.
`;
    } else if (status === 'paused') {
        extraContext = `
[GÜNCEL DURUM: PROJE DURAKLATILDI / MÜDAHALE MODU]
- Proje şu an duraklatılmış vaziyette.
- Boss bir mimari revizyon veya değişiklik isterse bunu değerlendir ve planı güncelle.
- Eğer devam etmek istiyorsa arayüzdeki yeşil "Projeyi Devam Ettir (Resume)" butonuna basabileceğini hatırlat.
`;
    } else if (status === 'pending_approval') {
        extraContext = `
[GÜNCEL DURUM: MİMARİ PLAN HAZIR - ONAY BEKLENİYOR]
- Mimari plan: ${state?.plan?.summary || title}
- Boss planı onaylarsa "Planı Onayla ve Başlat" butonuna tıklayarak otonom üretimi başlatabilir.
`;
    } else {
        extraContext = `
[GÜNCEL DURUM: PLANLAMA VE BEYİN FIRTINASI]
- Boss ile samimi, vizyoner ve zeki bir yazılım mimarı olarak beyin fırtınası yap.
- İhtiyaçları, sayfaları, veri modellerini ve teknoloji tercihlerini (Next.js, Tailwind, Prisma vb.) netleştir.
- Her şey netleştiğinde kapsamlı mimari şartnameyi özetle ve Boss'a planı onaylayabileceğini belirt.
`;
    }

    let attempt = null;
    if (state?.id) {
        try {
            attempt = db.prepare(`
                SELECT id, status, error, started_at, ended_at 
                FROM workflow_attempts 
                WHERE project_id = ? 
                ORDER BY id DESC LIMIT 1
            `).get(state.id);
        } catch {}
    }

    const rawError = attempt?.error || state?.last_error;
    const realError = rawError
        ? String(rawError)
            .replace(/\s*\.?\s*Referans:\s*[a-f0-9\-]+/gi, '')
            .replace(/\[[a-f0-9]{8,}\]/gi, '')
            .trim()
        : null;
    let errorSection = '';
    if (realError) {
        const attemptStatus = attempt?.status || state?.status || 'unknown';
        errorSection = `
### ⚠️ SON GERÇEK MOTOR HATASI VE TEKNİK DETAY (DOĞRULANMIŞ SİSTEM TELEMETRİSİ):
- Son İş Akışı Durumu: ${attemptStatus}
- Gerçek Hata: ${realError}

KRİTİK TALİMAT VE DÜRÜSTLÜK KURALI (HALÜSİNASYON YASAKTIR):
Boss sana süreç hatası veya duraklatma hakkında soru sorduğunda; ASLA "TypeScript tipi uyuşmazlığı", "Prisma şeması uyuşmazlığı" gibi hayali ezbere teoriler uydurma.
YUKARIDAKİ GERÇEK HATAYI temel alarak konuş. Hata mesajını şeffafça açıkla ve gerçek teknik kök nedeni belirt.
`;
    }

    // Canlı Telemetri, Son Loglar ve Alt Ajan Raporları
    const logs = state?.id ? getProjectLogs(state.id) : [];
    const failedReports = findFailedReports(projectDir, projectDir);
    let telemetrySection = '';
    if (logs.length > 0 || failedReports.length > 0) {
        const recentLogs = logs.slice(0, 15);
        telemetrySection = `
### 📡 CANLI PROJE TELEMETRİSİ VE HATA GÖZLEMİ (GERÇEK VERİLER):
${recentLogs.length > 0 ? `**Son Ajan ve Sistem Logları:**\n${recentLogs.map(l => `- [${l.agent}] [${(l.action || '').toUpperCase()}] ${l.file ? `(${l.file}) ` : ''}${l.message}`).join('\n')}` : ''}
${failedReports.length > 0 ? `\n**Alt Ajan Hata / Veto Raporları:**\n${failedReports.map(r => `--- ${r.file} ---\n${r.content}`).join('\n')}` : ''}

### 🧠 İÇ MUHAKEME VE ALT AJAN TEŞHİS PROTOKOLÜ (ÇOK ÖNEMLİ):
Boss süreçteki bir duraklama, hata, veto veya log kaydı hakkında soru sorduğunda; Manager KESİNLİKLE genel-geçer ezbere varsayımlar söylemez veya "arka planda yapılıyor" gibi yanıltıcı iddialarda bulunmaz.
Aşağıdaki 4 adımlı yapılandırılmış iç muhakeme zincirini işleterek Boss'a net bir rapor sunar:

1. 🎯 **Mevcut Durum ve Ajan Teşhisi:** Hangi domain (Frontend/Backend), hangi takım lideri ve hangi atomik görevde durulduğu, sorunlu hedef dosyalar.
2. 🧠 **Alt Ajanların Durumu (İç Sorgulama):**
   - *Teamleader:* Bu göreve hangi dosyalar atanmış?
   - *Coder:* Kod üretimi nerede ve hangi satırda/fonksiyonda kesilmiş?
   - *Reviewer:* Reviewer incelemesinde hangi sözdizimi, eksik JSX veya import hatasını yakalayıp veto vermiş?
3. 🔍 **Gerçek Kök Neden:** Sorunun gerçek teknik sebebi (örneğin: tek bir göreve birden fazla devasa sayfa atanması sonucu LLM'in token sınırına takılması, sözdizimi hatası, vb.).
4. 🚀 **Bundan Sonra Ne Yapılmalı (Çözüm ve Seçenekler):** Boss'a somut bir eylem planı sun (örneğin: "Görevi iki ayrı atomik göreve bölmek", "sayfayı alt bileşenlere dağıtmak" veya "'Devam Et (Resume)' butonuna basarak süreci sürdürmek").
`;
    }

    const managerDoc = loadAgentPromptFromDocs('manager', 'Sen XFactor platformunun Manager adlı kıdemli yazılım mimarısın.');
    const orkestrasyonDoc = loadOrkestrasyonTalimatnamesi();

    return `${managerDoc}

${orkestrasyonDoc ? `### PLATFORM ORKESTRASYON ANAYASASI (docs/ORKESTRASYON-TALIMATNAMESI.md):\n"""\n${orkestrasyonDoc.slice(0, 3000)}\n"""\n` : ''}

### GÜNCEL PROJE DURUMU VE TALİMATLAR:
${extraContext}
${errorSection}
${telemetrySection}

### 💬 MANAGER SOHBET VE İLETİŞİM PROTOKOLÜ:
1. **İletişim Şekli:**
   - Boss ile samimi, zeki, vizyoner bir kıdemli yazılım mimarı olarak Türkçe doğal dilde ve Markdown formatında konuş.
   - SOHBET PENCERESİNE KESİNLİKLE ÇIPLAK/HAM JSON KOD BLOKLARI (örn: \`\`\`json { ... } \`\`\`) BASMA. Mimariyi başlıklar, listeler ve maddeler halinde doğal Türkçe ile anlat.
2. **Plan Hazırlandığında ve Onay Aşamasında:**
   - Boss bir proje kapsamı belirttiğinde veya "başla", "tamamdır", "onaylıyorum", "inşa et" vb. dediğinde:
     a) Mimariyi (sayfalar, bileşenler, API rotaları, veritabanı modelleri, kullanılacak teknolojiler: Next.js/React, Tailwind, Prisma SQLite) net bir şekilde özetle.
     b) Yanıtının EN SONUNA mutlaka "[PLAN_HAZIR]" etiketini ekle.
     c) Boss'a: "Mimari planı ve şartnameyi hazırladım. Üretimi otonom olarak başlatmak için lütfen aşağıdaki **'Planı Onayla ve Başlat'** butonuna tıklayınız." de.
3. **Dürüstlük ve Gerçek Zaman Kuralı (ASLA YALAN SÖYLEME):**
   - Boss arayüzdeki yeşil "Planı Onayla ve Başlat" butonuna basmadan önce ASLA "Ekipler kodlamaya başladı", "Backend ve frontend çalışıyor", "İşler bittiğinde haber vereceğim" gibi GERÇEK DIŞI iddialarda BULUNMA.
   - Üretimin sadece Boss butona bastığında başlayacağını belirt ve Boss'u butona yönlendir.`;
}

export function createProjectRouter({
    requireAuth,
    projectAccess,
    wsHub,
    lifecycle = null,
    verificationRunner = runProjectVerification
}) {
    const router = Router();

    // 1. Projeleri Listele (Korumalı - Saf GET, yan etki yok)
    router.get('/', requireAuth, async (req, res, next) => {
        try {
            const rawProjects = req.user.isAdmin
                ? getAllProjects()
                : getUserProjects(req.user.id);
            const projectsRoot = getProjectsRoot(process.env);
            const projects = rawProjects.map(p => {
                let existsOnDisk = false;
                try {
                    const projectDir = getProjectDir(p.id, process.env);
                    existsOnDisk = fsSync.existsSync(projectDir);
                } catch {
                    existsOnDisk = fsSync.existsSync(path.join(projectsRoot, p.id));
                }
                const enriched = {
                    ...p,
                    existsOnDisk
                };
                if (!existsOnDisk) {
                    enriched.missingOnDisk = true;
                }
                return enriched;
            });
            res.json(projects);
        } catch (error) {
            next(error);
        }
    });

    // 2. Yeni Proje Oluştur
    router.post('/', requireAuth, async (req, res, next) => {
        try {
            const { title } = req.body || {};
            const project = await createProject({
                title,
                ownerUserId: req.user.id
            });
            res.json(project);
        } catch (err) {
            if (err.message && err.message.includes('Geçerli bir proje başlığı')) {
                return res.status(400).json({ error: err.message });
            }
            next(err);
        }
    });
    // 3. Proje Senkronizasyonu (Disk ile İki Yönlü Reconcile & Auto-register)
    router.post('/sync', requireAuth, async (req, res, next) => {
        try {
            const actionId = getActionId(req);
            const syncResult = await syncProjectsWithDisk({ autoRegister: true, env: process.env });
            const activeProjectId = req.body?.activeProjectId;
            const canAuditActiveProject = typeof activeProjectId === 'string'
                && activeProjectId.trim()
                && (req.user?.isAdmin === true || canViewProject(req.user?.id, activeProjectId));
            if (syncResult?.success && canAuditActiveProject) {
                const registered = Array.isArray(syncResult.autoRegistered)
                    ? syncResult.autoRegistered.length
                    : 0;
                const missing = Array.isArray(syncResult.missingOnDisk)
                    ? syncResult.missingOnDisk.length
                    : 0;
                appendProjectActionMessages(activeProjectId, {
                    actionId,
                    userText: '🔄 Diskteki projeleri uygulamayla senkronize ettim.',
                    modelText: `Senkronizasyon tamamlandı: ${registered} yeni, ${missing} eksik, ${Number(syncResult.updatedCount) || 0} güncellenen proje.`
                });
            }
            res.json(syncResult);
        } catch (error) {
            next(error);
        }
    });


    // 4. Proje Detayı
    router.get('/:id', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const state = await readProjectState(req.params.id);
        if (!state) return res.status(404).json({ error: "Project not found" });
        res.json(state);
    }));

    // 5. Proje Dosyalarını Getir
    // 5. Proje Dosyalarını Getir (Limitli ve Korumalı)
    router.get('/:id/files', requireAuth, projectAccess('viewer'), async (req, res, next) => {
        try {
            const dir = getProjectDir(req.params.id);
            const MAX_FILE_SIZE = 2 * 1024 * 1024;
            const MAX_TOTAL_FILES = 500;
            const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
            const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif']);
            const ALLOWED_EXTENSIONS = new Set([
                '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.html',
                '.prisma', '.sql', '.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp',
                '.gif', '.txt', '.yaml', '.yml', '.graphql', '.gql'
            ]);
            const ALLOWED_DOT_FILES = new Set(['.env.example', '.gitignore']);
            const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
            const IGNORED_FILES = new Set(['package-lock.json', 'bun.lockb', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);

            const results = [];
            let totalBytes = 0;
            async function getFiles(targetDir, relativePath = '') {
                if (results.length >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) {
                    return;
                }
                try {
                    const list = await fs.readdir(targetDir, { withFileTypes: true });
                    for (const file of list) {
                        if (results.length >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) break;
                        if (isSymlinkDirent(file)) continue;
                        if (file.name.startsWith('.') && !ALLOWED_DOT_FILES.has(file.name)) continue;
                        const resPath = path.join(targetDir, file.name);
                        const relPath = path.join(relativePath, file.name).replace(/\\/g, '/');
                        if (!isSafeProjectPath(relPath, dir)) continue;
                        if (file.isDirectory()) {
                            if (!IGNORED_DIRS.has(file.name)) {
                                await getFiles(resPath, relPath);
                            }
                        } else {
                            if (IGNORED_FILES.has(file.name)) continue;
                            const ext = path.extname(file.name).toLowerCase();
                            if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_DOT_FILES.has(file.name) && ext !== '') continue;
                            try {
                                const stat = await fs.stat(resPath);
                                if (stat.size > MAX_FILE_SIZE) continue;
                                await assertPathInsideRoot(resPath, dir);
                                const isBinary = BINARY_EXTENSIONS.has(ext);
                                const rawContent = await fs.readFile(resPath);
                                totalBytes += stat.size;
                                results.push({
                                    path: relPath,
                                    content: isBinary ? rawContent.toString('base64') : rawContent.toString('utf8'),
                                    encoding: isBinary ? 'base64' : 'utf8',
                                    size: stat.size
                                });
                            } catch (error) {
                                logWarning('api.project_file_read_failed', error, { projectId: req.params.id, file: relPath });
                            }
                        }
                    }
                } catch (err) {}
            }

            await getFiles(dir);
            res.json(results);
        } catch (error) {
            next(error);
        }
    });

    // 6. Proje Loglarını Getir (Cursor Pagination Destekli)
    router.get('/:id/logs', requireAuth, projectAccess('viewer'), async (req, res, next) => {
        try {
            const { cursor, limit } = req.query || {};
            let logs = getProjectLogs(req.params.id, { cursor, limit });

            if (logs.length === 0) {
                try {
                    const projectDir = getProjectDir(req.params.id);
                    if (fsSync.existsSync(projectDir)) {
                        rehydrateProjectLogsFromDisk(projectDir, { projectId: req.params.id });
                        logs = getProjectLogs(req.params.id, { cursor, limit });
                    }
                } catch (rehydrateError) {
                    logWarning('api.logs_rehydration_failed', rehydrateError, { projectId: req.params.id });
                }
            }

            res.json(logs);
        } catch (error) {
            next(error);
        }
    });
    // 7. Manager Sohbeti
    router.post('/:id/chat', requireAuth, projectAccess('editor'), asyncHandler(async (req, res, next) => {
        const { id } = req.params;
        const { message } = req.body;

        if (!validateChatPayload({ message })) {
            return res.status(400).json({ error: 'Geçersiz mesaj içeriği.' });
        }

        const state = await readProjectState(id);
        if (!state) return res.status(404).json({ error: "Project not found" });

        const projectDir = getProjectDir(id);
        const { appendProjectChatMessage } = await import('../projectRepository.js');

        const now = new Date();
        const userMsg = appendProjectChatMessage(id, 'user', message, now.toISOString());
        state.chatHistory.push(userMsg);

        const dynamicPrompt = buildManagerChatSystemPrompt(state, projectDir);
        const messages = [{ role: 'system', content: dynamicPrompt }];
        state.chatHistory.slice(0, -1).forEach(msg => {
            messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.parts ? msg.parts[0].text : (msg.text_content || '') });
        });
        messages.push({ role: 'user', content: message });

        let responseText = await generateLLMResponse(messages);
            // 1. Gelen yanıtta JSON planı var mı ayrıştır ve kurtar
            let parsedPlan = null;
            try {
                const extracted = extractAndParseJSON(responseText);
                if (extracted && typeof extracted === 'object' && (extracted.talimatname || extracted.domains || extracted.summary)) {
                    parsedPlan = normalizeManagerPlan(extracted);
                }
            } catch {}

            // Eğer LLM doğrudan ham JSON bastıysa, sohbet balonunda çirkin JSON yerine şık Türkçe özet göster
            const trimmedResp = responseText.trim();
            if (parsedPlan && (trimmedResp.startsWith('{') || trimmedResp.startsWith('```json') || trimmedResp.startsWith('```\n{'))) {
                const domainsText = (parsedPlan.domains || []).map(d => `- **${d.name}**: ${d.description || d.name}`).join('\n');
                responseText = `📋 **Mimari Plan ve Şartname Hazırlandı!**\n\n**Özet:**\n${parsedPlan.summary}\n\n**Domainler:**\n${domainsText}\n\n---\nMimari plan hazırlandı. Otonom ajanların kod üretimine başlaması için lütfen aşağıdaki **"Planı Onayla ve Başlat"** butonuna tıklayınız.\n\n[PLAN_HAZIR]`;
            }

            const modelNow = new Date();
            const modelMsg = appendProjectChatMessage(id, 'model', responseText, modelNow.toISOString());

            // Güncel state'i yeniden oku (LLM çağrısı sırasında yapılan checkpoint veya durum değişikliklerini ezmemek için)
            const freshState = await readProjectState(id);
            if (!freshState) return res.status(404).json({ error: "Project not found" });

            const userTrimmed = (message || '').toLowerCase().trim();
            const isUserStarting = ['başla', 'basla', 'başlayalım', 'baslayalim', 'onay', 'onayla', 'onaylıyorum', 'onayliyorum', 'tamam', 'tamamdır', 'tamamdir', 'olur', 'inşa et', 'insa et', 'üret', 'uret', 'başlat', 'baslat', 'projeyi başlat', 'projeyi baslat', 'üretime geç', 'uretime gec', 'yap', 'yapalım', 'hadi'].some(kw => userTrimmed === kw || userTrimmed.startsWith(kw + ' ') || userTrimmed.endsWith(' ' + kw));
            const revisableStatuses = new Set([
                PROJECT_STATUS.PLANNING,
                PROJECT_STATUS.PENDING_APPROVAL,
                PROJECT_STATUS.CAPABILITY_BLOCKED,
                PROJECT_STATUS.PAUSED,
                PROJECT_STATUS.VERIFICATION_FAILED,
                PROJECT_STATUS.FAILED
            ]);
            const remediationKeywords = [
                'talimat ver', 'talimat', 'düzelt', 'duzelt', 'onar', 'hatayı çöz', 'hatayi coz',
                'devam et', 'resume', 'tamir et', 'remediation', 'çöz', 'coz', 'düzeltme'
            ];
            const isRemediationRequested = remediationKeywords.some(kw => userTrimmed.includes(kw));
            const wasPaused = freshState.status === PROJECT_STATUS.PAUSED;

            const isPlanReady = !!parsedPlan ||
                                responseText.includes("[PLAN_HAZIR]") ||
                                responseText.toLowerCase().includes("onaylıyor") ||
                                responseText.toLowerCase().includes("planı onayla") ||
                                responseText.toLowerCase().includes("üretime başla") ||
                                responseText.toLowerCase().includes("revizyon planı") ||
                                responseText.toLowerCase().includes("onayınız bekleniyor") ||
                                responseText.toLowerCase().includes("onayınıza sunuldu") ||
                                responseText.toLowerCase().includes("başlatabilirsiniz") ||
                                responseText.toLowerCase().includes("başlatabilirsin") ||
                                responseText.toLowerCase().includes("onaylayabilirsiniz") ||
                                responseText.toLowerCase().includes("onaylayabilirsin") ||
                                (isUserStarting && revisableStatuses.has(freshState.status));


            if (isPlanReady && revisableStatuses.has(freshState.status) && !(wasPaused && isRemediationRequested && !isUserStarting)) {
                const draftPlan = parsedPlan || normalizeManagerPlanFromText(
                    freshState.title,
                    responseText
                );
                const { createContractRevision } = await import('../contracts/projectContract.js');
                createContractRevision(id, draftPlan, modelMsg.id);

                freshState.status = PROJECT_STATUS.PENDING_APPROVAL;
                freshState.plan = draftPlan;
                freshState.remediation = null;
                if (freshState.workflow) freshState.workflow.remediation = null;
                freshState.last_error = null;
                try {
                    const oldRapor = path.join(projectDir, 'RAPOR.md');
                    if (fsSync.existsSync(oldRapor)) fsSync.unlinkSync(oldRapor);
                } catch {}
                await writeProjectState(id, freshState);
            }


            if (freshState.status === PROJECT_STATUS.PAUSED && isRemediationRequested) {
                freshState.remediation = {
                    ready: true,
                    instruction: message,
                    timestamp: new Date().toISOString()
                };
                await writeProjectState(id, freshState);
            }

        const finalResponseState = await readProjectState(id);
        res.json(finalResponseState);
    }));

    // 8. Planı Onayla ve Başlat
    router.post('/:id/approve', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const actionId = getActionId(req);
            lifecycle?.assertGenerationAllowed();
            const state = await readProjectState(id);
            const leaseOwner = `http-approve-${req.user.id}`;
            const activeLease = state ? getActiveWorkflowAttempt(id) : null;
            if (!state || !canTransitionProjectStatus(
                state.status,
                PROJECT_STATUS.CONTRACT_APPROVED
            )) {
                if (activeLease && isApprovalAttempt(activeLease)) {
                    const publication = await waitForApprovalPublication(id);
                    if (publication.ready) {
                        return respondIdempotentWorkflow(res, id, publication.attempt);
                    }
                    return res.status(409).json({
                        error: publication.timedOut
                            ? 'Onaylanan proje durumunun yayınlanması zaman aşımına uğradı.'
                            : 'Onaylanan proje yürütmesi tamamlanamadı.',
                        code: publication.timedOut ? 'APPROVAL_PUBLICATION_TIMEOUT' : 'APPROVAL_PUBLICATION_FAILED'
                    });
                }
                return res.status(400).json({ error: "Geçersiz işlem" });
            }

            const {
                approveContractRevision,
                getLatestRevision,
                rejectContractForCapabilities,
                validateContractCapabilities
            } = await import('../contracts/projectContract.js');
            const latestRevision = getLatestRevision(id);
            if (!latestRevision || latestRevision.status !== 'pending_approval') {
                const currentAttempt = getActiveWorkflowAttempt(id);
                const currentState = await readProjectState(id);
                if (
                    currentAttempt
                    && isApprovalAttempt(currentAttempt)
                    && [PROJECT_STATUS.CONTRACT_APPROVED, PROJECT_STATUS.IMPLEMENTING].includes(currentState?.status)
                ) {
                    const publication = await waitForApprovalPublication(id);
                    if (publication.ready) {
                        return respondIdempotentWorkflow(res, id, publication.attempt);
                    }
                    return res.status(409).json({
                        error: publication.timedOut
                            ? 'Onaylanan proje durumunun yayınlanması zaman aşımına uğradı.'
                            : 'Onaylanan proje yürütmesi tamamlanamadı.',
                        code: publication.timedOut ? 'APPROVAL_PUBLICATION_TIMEOUT' : 'APPROVAL_PUBLICATION_FAILED'
                    });
                }
                return res.status(400).json({
                    error: "Onaylanacak bekleyen bir plan bulunamadı."
                });
            }

            const capabilityCheck = validateContractCapabilities(
                latestRevision.contract_json
            );
            if (!capabilityCheck.valid) {
                const blocked = rejectContractForCapabilities({
                    projectId: id,
                    revision: latestRevision.revision,
                    expectedProjectRevision: state.revision,
                    errors: capabilityCheck.errors
                });
                return res.status(400).json({
                    error: 'Unsupported architecture stack',
                    status: blocked.status,
                    details: capabilityCheck.errors
                });
            }

            const lease = acquireWorkflowLease(id, leaseOwner);
            if (!lease.acquired) {
                const publication = await waitForApprovalPublication(id);
                if (publication.ready) {
                    return respondIdempotentWorkflow(res, id, publication.attempt);
                }
                return res.status(409).json({
                    error: publication.timedOut
                        ? 'Onaylanan proje durumunun yayınlanması zaman aşımına uğradı.'
                        : 'Onaylanan proje yürütmesi tamamlanamadı.',
                    code: publication.timedOut ? 'APPROVAL_PUBLICATION_TIMEOUT' : 'APPROVAL_PUBLICATION_FAILED'
                });
            }

            await lifecycle?.afterWorkflowLeaseAcquired?.({
                projectId: id,
                attemptId: lease.attempt.id
            });

            let transactionOpen = false;
            try {
                db.exec('BEGIN IMMEDIATE;');
                transactionOpen = true;
                approveContractRevision(id, latestRevision.revision, { inTransaction: true });
                state.status = PROJECT_STATUS.CONTRACT_APPROVED;
                await writeProjectState(id, state, {
                    attemptId: lease.attempt.id,
                    leaseOwner,
                    inTransaction: true
                });
                state.status = PROJECT_STATUS.IMPLEMENTING;
                state.workflow = normalizeWorkflowState(null);
                await writeProjectState(id, state, {
                    attemptId: lease.attempt.id,
                    leaseOwner,
                    inTransaction: true,
                    onTransaction: () => appendWorkflowAction(id, actionId, {
                        userText: '✅ Mimari planı onayladım. Uygulama üretimini başlat.',
                        modelText: '🚀 Plan onaylandı. Otonom üretim süreci başlatılıyor.'
                    }, { inTransaction: true })
                });
                db.exec('COMMIT;');
                transactionOpen = false;
            } catch (error) {
                if (transactionOpen) {
                    try { db.exec('ROLLBACK;'); } catch {}
                }
                releaseWorkflowLease(lease.attempt.id, 'failed', {
                    error: error.message,
                    leaseOwner
                });
                throw error;
            }
            const canonicalState = getProject(id);
            const operation = lifecycle?.begin('generation', {
                cancel: () => abortProjectExecution(id, 'SHUTDOWN')
            });
            executeProjectTasks(id, wsHub, lease.attempt.id, leaseOwner)
                .catch(error => {
                    logError('workflow.background_execution_failed', error, {
                        projectId: id,
                        attemptId: lease.attempt.id
                    });
                })
                .finally(() => operation?.end());
            res.json({ ...canonicalState, attemptId: lease.attempt.id });
        } catch (err) {
            if (err?.code === 'SERVER_SHUTTING_DOWN') {
                return res.status(503).json({ error: 'Server is shutting down.', code: err.code });
            }
            next(err);
        }
    });

    router.post('/:id/verify', requireAuth, projectAccess('owner'), asyncHandler(async (req, res) => {
        const { id } = req.params;
        const state = await readProjectState(id);
        if (!state) {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (![PROJECT_STATUS.IMPLEMENTATION_FINISHED, PROJECT_STATUS.VERIFICATION_PENDING].includes(state.status)) {
            return res.status(409).json({
                error: `Verification cannot start from project state ${state.status}.`
            });
        }

        const result = await verificationRunner({
            projectId: id,
            projectDir: getProjectDir(id)
        });
        res.json(result);
    }));


    router.get('/:id/verification-summary', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const { contractId, runId } = req.query || {};
        if (
            typeof contractId !== 'string' ||
            contractId.trim().length === 0 ||
            typeof runId !== 'string' ||
            runId.trim().length === 0
        ) {
            return res.status(400).json({
                error: 'contractId and runId query parameters are required'
            });
        }
        try {
            const report = buildCompletionReport({
                projectId: req.params.id,
                contractId,
                runId
            });
            res.json(redactSensitiveValue(report));
        } catch (error) {
            if (error.code === 'VERIFICATION_RUN_NOT_FOUND') {
                return res.status(404).json({ error: error.message });
            }
            throw error;
        }
    }));
    // P3.1 Observability read-only endpoints
    router.get('/:id/contracts', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const rows = db.prepare(`
            SELECT id, revision, status, contract_hash, approved_at, created_at
            FROM project_contracts WHERE project_id = ? ORDER BY revision ASC
        `).all(req.params.id);
        const result = rows.map(r => ({
            id: r.id,
            revision: r.revision,
            status: r.status,
            contract_hash: r.contract_hash,
            approved_at: r.approved_at,
            created_at: r.created_at
        }));
        res.json(result);
    }));
    router.get('/:id/verification-runs', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        // Validate limit: scalar, integer 1..100, trimmed raw must match /^\d+$/
        let rawLimit = req.query.limit;
        if (Array.isArray(rawLimit)) rawLimit = rawLimit[0];
        let limit = 20;
        if (rawLimit !== undefined) {
            const trimmed = String(rawLimit).trim();
            if (!/^\d+$/.test(trimmed)) {
                return res.status(400).json({ error: 'Invalid limit' });
            }
            const parsed = parseInt(trimmed, 10);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
                return res.status(400).json({ error: 'Invalid limit' });
            }
            limit = parsed;
        }
        let rawCursor = req.query.cursor;
        if (Array.isArray(rawCursor)) rawCursor = rawCursor[0];
        let cursorStartedAt = null;
        let cursorId = null;
        if (rawCursor !== undefined && rawCursor !== null && String(rawCursor).length > 0) {
            const cursorStr = String(rawCursor);
            // cursor is base64url encoded JSON { id, started_at }
            let decoded;
            try {
                const json = Buffer.from(cursorStr, 'base64url').toString('utf8');
                decoded = JSON.parse(json);
            } catch {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
            if (!decoded || typeof decoded.id !== 'string' || typeof decoded.started_at !== 'string') {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
            // verify cursor belongs to this project and exists
            const cursorRow = db.prepare(`
                SELECT started_at FROM verification_runs WHERE id = ? AND project_id = ?
            `).get(decoded.id, req.params.id);
            if (!cursorRow || cursorRow.started_at !== decoded.started_at) {
                return res.status(400).json({ error: 'Invalid cursor' });
            }
            cursorStartedAt = decoded.started_at;
            cursorId = decoded.id;
        }
        let rows;
        if (cursorStartedAt !== null) {
            rows = db.prepare(`
                SELECT id, contract_id, status, policy_version, started_at, ended_at
                FROM verification_runs
                WHERE project_id = ?
                  AND (started_at < ? OR (started_at = ? AND id > ?))
                ORDER BY started_at DESC, id ASC
                LIMIT ?
            `).all(req.params.id, cursorStartedAt, cursorStartedAt, cursorId, limit + 1);
        } else {
            rows = db.prepare(`
                SELECT id, contract_id, status, policy_version, started_at, ended_at
                FROM verification_runs
                WHERE project_id = ?
                ORDER BY started_at DESC, id ASC
                LIMIT ?
            `).all(req.params.id, limit + 1);
        }
        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        let nextCursor = null;
        if (hasMore) {
            const last = slice[slice.length - 1];
            nextCursor = Buffer.from(JSON.stringify({ id: last.id, started_at: last.started_at })).toString('base64url');
        }
        const runs = slice.map(r => ({
            id: r.id,
            contract_id: r.contract_id,
            status: r.status,
            policy_version: r.policy_version,
            started_at: r.started_at,
            ended_at: r.ended_at
        }));
        res.json({ runs, nextCursor });
    }));
    router.get('/:id/verification-runs/:runId', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const run = db.prepare(`
            SELECT id, contract_id, status, policy_version, started_at, ended_at
            FROM verification_runs WHERE id = ? AND project_id = ?
        `).get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Verification run not found' });
        const checks = db.prepare(`
            SELECT id, gate_name, applicability, status, exit_code, stdout_digest, stderr_digest, started_at, ended_at, timed_out
            FROM verification_checks WHERE run_id = ? AND contract_id = ? ORDER BY started_at ASC, id ASC
        `).all(run.id, run.contract_id);
        const mappedChecks = checks.map(c => ({
            id: c.id,
            gate_name: c.gate_name,
            applicability: c.applicability,
            status: c.status,
            exit_code: c.exit_code,
            stdout_digest: c.stdout_digest,
            stderr_digest: c.stderr_digest,
            started_at: c.started_at,
            ended_at: c.ended_at,
            timed_out: c.timed_out
        }));
        res.json({ run: { id: run.id, contract_id: run.contract_id, status: run.status, policy_version: run.policy_version, started_at: run.started_at, ended_at: run.ended_at }, checks: mappedChecks });
    }));
    router.get('/:id/verification-runs/:runId/checks/:checkId/log', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const run = db.prepare(`
            SELECT id, contract_id FROM verification_runs WHERE id = ? AND project_id = ?
        `).get(req.params.runId, req.params.id);
        if (!run) return res.status(404).json({ error: 'Verification run not found' });
        const check = db.prepare(`
            SELECT id, gate_name, evidence_json FROM verification_checks WHERE id = ? AND run_id = ? AND contract_id = ?
        `).get(req.params.checkId, run.id, run.contract_id);
        if (!check) return res.status(404).json({ error: 'Check not found' });
        let stdout = '';
        let stderr = '';
        try {
            const ev = check.evidence_json ? JSON.parse(check.evidence_json) : {};
            // documented schema: { reason, requirementIds, evidence: { stdout, stderr, ... } }
            if (ev.evidence && typeof ev.evidence === 'object') {
                stdout = typeof ev.evidence.stdout === 'string' ? ev.evidence.stdout : '';
                stderr = typeof ev.evidence.stderr === 'string' ? ev.evidence.stderr : '';
                // fallback if evidence holds value wrapper
                if (!stdout && typeof ev.stdout === 'string') stdout = ev.stdout;
                if (!stderr && typeof ev.stderr === 'string') stderr = ev.stderr;
            } else {
                stdout = typeof ev.stdout === 'string' ? ev.stdout : '';
                stderr = typeof ev.stderr === 'string' ? ev.stderr : '';
            }
        } catch { stdout = ''; stderr = ''; }
        res.json({ id: check.id, gate_name: check.gate_name, stdout: redactSensitiveText(stdout), stderr: redactSensitiveText(stderr) });
    }));
    router.get('/:id/repair-issues', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const rows = db.prepare(`
            SELECT id, contract_id, requirement_id, severity, status, resolved_at
            FROM repair_issues WHERE project_id = ? ORDER BY created_at DESC
        `).all(req.params.id);
        const result = rows.map(r => ({
            id: r.id,
            contract_id: r.contract_id,
            requirement_id: r.requirement_id,
            severity: r.severity,
            status: r.status,
            resolved_at: r.resolved_at
        }));
        res.json(result);
    }));
    router.get('/:id/artifacts', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const result = listArtifacts({ projectId: req.params.id }).map(artifact => ({
            id: artifact.id,
            kind: artifact.kind,
            sha256: artifact.sha256,
            size: artifact.size,
            status: artifact.status,
            verificationRunId: artifact.verificationRunId
        }));
        res.json(result);
    }));
    // P3.2 Metrics APIs - read-only, scoped, finite
    function rejectRepeatedQuery(req, res) {
        for (const v of Object.values(req.query || {})) {
            if (Array.isArray(v)) return true;
        }
        // also detect raw query string containing duplicate keys (e.g., ?foo=1&foo=2 where express collapses to last string but url still has duplicates)
        const rawUrl = req.originalUrl || req.url || '';
        const qIdx = rawUrl.indexOf('?');
        if (qIdx !== -1) {
            const qs = rawUrl.slice(qIdx+1);
            const keys = qs.split('&').map(p=> decodeURIComponent(p.split('=')[0]));
            if (new Set(keys).size !== keys.length) return true;
        }
        return false;
    }
    router.get('/:id/metrics/gates', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        if (rejectRepeatedQuery(req,res)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getGateMetrics(req.params.id, db);
        res.json(result);
    }));
    router.get('/:id/metrics/stacks', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        if (rejectRepeatedQuery(req,res)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getStackMetrics(req.params.id, db);
        res.json(result);
    }));
    router.get('/:id/metrics/trends', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        if (rejectRepeatedQuery(req,res)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getTrendMetrics(req.params.id, db);
        res.json(result);
    }));
    router.get('/:id/metrics/failures', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        if (rejectRepeatedQuery(req,res)) return res.status(400).json({ error: 'Repeated query parameters' });
        const result = getFailureMetrics(req.params.id, db);
        res.json(result);
    }));
    router.get('/:id/requirements/:reqId/impact', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const projectId = req.params.id;
        const reqId = req.params.reqId;
        const row = db.prepare(`
            SELECT r.id as reqId, r.contract_id as contractId
            FROM requirements r
            JOIN project_contracts pc ON pc.id = r.contract_id
            WHERE r.id = ? AND pc.project_id = ?
        `).get(reqId, projectId);
        if (!row) return res.status(404).json({ error: 'Requirement not found' });
        const contractId = row.contractId;
        // impacted tasks direct
        const taskRows = db.prepare(`
            SELECT ct.id as taskId, ct.stable_key as stableKey, ct.task_spec_json as taskSpecJson
            FROM contract_tasks ct
            JOIN requirement_task_links rtl ON rtl.task_id = ct.id AND rtl.contract_id = ct.contract_id
            WHERE rtl.contract_id = ? AND rtl.requirement_id = ?
        `).all(contractId, reqId);
        const taskMap = new Map();
        for (const tr of taskRows) {
            if (taskMap.has(tr.taskId)) continue;
            let title = null;
            try {
                const spec = JSON.parse(tr.taskSpecJson);
                if (typeof spec.title === 'string' && spec.title.trim().length>0) title = spec.title.trim();
            } catch {}
            if (!title) title = tr.stableKey;
            taskMap.set(tr.taskId, { taskId: tr.taskId, taskTitle: title });
        }
        const impactedTasks = Array.from(taskMap.values()).sort((a,b)=> a.taskId.localeCompare(b.taskId));
        // impacted files direct
        const fileRows = db.prepare(`
            SELECT DISTINCT path FROM requirement_file_links WHERE contract_id = ? AND requirement_id = ?
        `).all(contractId, reqId);
        const fileSet = new Set();
        for (const fr of fileRows) fileSet.add(fr.path);
        const impactedFiles = Array.from(fileSet).sort().map(p=> ({ path: p }));
        // impacted checkpoints for directly linked tasks
        const taskIds = impactedTasks.map(t=> t.taskId);
        let impactedCheckpoints = [];
        if (taskIds.length>0) {
            const placeholders = taskIds.map(()=>'?').join(',');
            const cpRows = db.prepare(`
                SELECT project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version
                FROM task_checkpoints
                WHERE project_id = ? AND contract_id = ? AND status = 'completed' AND task_id IN (${placeholders})
            `).all(projectId, contractId, ...taskIds);
            const cpSet = new Set();
            for (const r of cpRows) {
                const id = deriveCheckpointId(r);
                cpSet.add(id);
            }
            impactedCheckpoints = Array.from(cpSet).sort().map(id=> ({ checkpointId: id }));
        }
        res.json({ requirementId: reqId, impactedTasks, impactedCheckpoints, impactedFiles });
    }));
    router.post('/:id/rebuild-preview', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const projectId = req.params.id;
        const body = req.body;
        // strict body validation
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            return res.status(400).json({ error: 'Invalid body' });
        }
        const keys = Object.keys(body);
        if (keys.length !== 1 || keys[0] !== 'changedRequirementKeys') {
            return res.status(400).json({ error: 'Invalid body' });
        }
        const val = body.changedRequirementKeys;
        if (!Array.isArray(val)) return res.status(400).json({ error: 'Invalid changedRequirementKeys' });
        // validate elements trimmed unique nonempty strings
        const trimmed = [];
        for (const el of val) {
            if (typeof el !== 'string') return res.status(400).json({ error: 'Invalid requirement key' });
            const t = el.trim();
            if (t.length===0) return res.status(400).json({ error: 'Empty requirement key' });
            trimmed.push(t);
        }
        if (new Set(trimmed).size !== trimmed.length) return res.status(400).json({ error: 'Duplicate requirement keys' });
        // resolve latest approved contract revision DESC, id ASC tie-break
        // Execute dependent reads in one synchronous SQLite read transaction with guaranteed COMMIT/ROLLBACK
        let latest, contractId, reqRows, directTaskIds, allTasks, tasksToReRun, invalidatedCheckpointIds;
        let inTx = false;
        try {
            db.exec('BEGIN');
            inTx = true;
            latest = db.prepare(`
                SELECT id FROM project_contracts WHERE project_id = ? AND status='approved' ORDER BY revision DESC, id ASC LIMIT 1
            `).get(projectId);
            if (!latest) {
                db.exec('ROLLBACK');
                inTx = false;
                return res.status(404).json({ error: 'No approved contract' });
            }
            contractId = latest.id;
            if (trimmed.length===0) {
                db.exec('COMMIT');
                inTx = false;
                return res.json({ willRebuild:false, invalidatedCheckpointIds:[], tasksToReRun:[] });
            }
            const placeholders = trimmed.map(()=>'?').join(',');
            reqRows = db.prepare(`
                SELECT id, stable_key FROM requirements WHERE contract_id = ? AND stable_key IN (${placeholders})
            `).all(contractId, ...trimmed);
            const foundKeys = new Set(reqRows.map(r=> r.stable_key));
            for (const k of trimmed) if (!foundKeys.has(k)) {
                db.exec('ROLLBACK');
                inTx = false;
                return res.status(400).json({ error: `Unknown requirement key ${k}` });
            }
            const requirementIds = reqRows.map(r=> r.id);
            let directIds = [];
            let linkedFilePaths = [];
            if (requirementIds.length>0) {
                const reqPlace = requirementIds.map(()=>'?').join(',');
                const rows = db.prepare(`
                    SELECT DISTINCT task_id FROM requirement_task_links WHERE contract_id = ? AND requirement_id IN (${reqPlace})
                `).all(contractId, ...requirementIds);
                directIds = rows.map(r=> r.task_id);
                const fileRows = db.prepare(`
                    SELECT DISTINCT path FROM requirement_file_links WHERE contract_id = ? AND requirement_id IN (${reqPlace})
                `).all(contractId, ...requirementIds);
                linkedFilePaths = fileRows.map(row => row.path);
            }
            directTaskIds = directIds;
            allTasks = db.prepare(`SELECT id, task_spec_json FROM contract_tasks WHERE contract_id = ?`).all(contractId);
            try {
                tasksToReRun = collectDownstreamTaskIds(allTasks, directTaskIds, linkedFilePaths);
            } catch (e) {
                try { db.exec('ROLLBACK'); } catch {}
                inTx = false;
                return res.status(409).json({ error: e.message || 'Graph validation failed' });
            }
            invalidatedCheckpointIds = [];
            if (tasksToReRun.length>0) {
                const tp = tasksToReRun.map(()=>'?').join(',');
                const cpRows = db.prepare(`
                    SELECT project_id, task_id, contract_id, plan_hash, task_spec_hash, input_hash, output_hash, gate_version
                    FROM task_checkpoints WHERE project_id = ? AND contract_id = ? AND status='completed' AND task_id IN (${tp})
                `).all(projectId, contractId, ...tasksToReRun);
                const idSet = new Set();
                for (const r of cpRows) idSet.add(deriveCheckpointId(r));
                invalidatedCheckpointIds = Array.from(idSet).sort();
            }
            db.exec('COMMIT');
            inTx = false;
        } catch (e) {
            if (inTx) try { db.exec('ROLLBACK'); } catch {}
            throw e;
        } finally {
            if (inTx) try { db.exec('ROLLBACK'); } catch {}
        }
        const willRebuild = tasksToReRun.length>0;
        res.json({ willRebuild, invalidatedCheckpointIds, tasksToReRun });
    }));
    router.get('/:id/contracts/:contractId/artifacts/:artifactId/download', requireAuth, projectAccess('viewer'), asyncHandler(async (req, res) => {
        const { id, contractId, artifactId } = req.params;
        const { getArtifact } = await import('../repositories/artifactRepository.js');
        const artifact = getArtifact({ projectId: id, contractId, artifactId });
        const authorization = authorizeArtifactDownload({
            artifact,
            assertEvidence: () => assertVerifiedArtifactEvidence({ projectId: id, contractId, artifactId, strict: true })
        });
        if (authorization.status !== 200) {
            return res.status(authorization.status).json({ error: authorization.error });
        }
        const actionId = getActionId(req);
        appendProjectActionMessages(id, {
            actionId,
            userText: '📥 Doğrulanmış proje ZIP paketini indirdim.',
            modelText: 'Doğrulanmış artefakt başarıyla indirildi.'
        });
        res.download(artifact.path, path.basename(artifact.path));
    }));

    router.post('/:id/resume', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const actionId = getActionId(req);
            lifecycle?.assertGenerationAllowed();
            const state = await readProjectState(id);
            if (!state) return res.status(404).json({ error: "Proje bulunamadı." });
            const canResume = state.status === PROJECT_STATUS.PAUSED
                || state.status === PROJECT_STATUS.IMPLEMENTING
                || state.status === PROJECT_STATUS.VERIFICATION_FAILED
                || canTransitionProjectStatus(state.status, PROJECT_STATUS.IMPLEMENTING);
            if (!canResume) {
                return res.status(400).json({ error: `Bu durumdan (${state.status}) çalışır duruma geçilemez.` });
            }

            const leaseOwner = `http-resume-${req.user.id}`;
            const lease = acquireWorkflowLease(id, leaseOwner);
            if (!lease.acquired) {
                return res.json({
                    ...getProject(id),
                    attemptId: lease.attempt.id,
                    idempotent: true
                });
            }

            let transactionOpen = false;
            try {
                db.exec('BEGIN IMMEDIATE;');
                transactionOpen = true;
                if (state.status === PROJECT_STATUS.VERIFICATION_FAILED) {
                    state.status = PROJECT_STATUS.PAUSED;
                    await writeProjectState(id, state, {
                        attemptId: lease.attempt.id,
                        leaseOwner,
                        inTransaction: true
                    });
                }
                state.status = PROJECT_STATUS.IMPLEMENTING;
                await writeProjectState(id, state, {
                    attemptId: lease.attempt.id,
                    leaseOwner,
                    inTransaction: true,
                    onTransaction: () => appendWorkflowAction(id, actionId, {
                        userText: '▶️ Süreci kaldığı yerden devam ettir.',
                        modelText: 'Süreç kaldığı görevden devam ettiriliyor.'
                    }, { inTransaction: true })
                });
                db.exec('COMMIT;');
                transactionOpen = false;
            } catch (error) {
                if (transactionOpen) {
                    try { db.exec('ROLLBACK;'); } catch {}
                }
                releaseWorkflowLease(lease.attempt.id, 'failed', {
                    error: error.message,
                    leaseOwner
                });
                throw error;
            }
            const canonicalState = getProject(id);

            const operation = lifecycle?.begin('generation', {
                cancel: () => abortProjectExecution(id, 'SHUTDOWN')
            });

            executeProjectTasks(id, wsHub, lease.attempt.id, leaseOwner)
                .catch(error => {
                    logError('workflow.background_execution_failed', error, { projectId: id, attemptId: lease.attempt.id });
                })
                .finally(() => {
                    operation?.end();
                });

            res.json({ ...canonicalState, attemptId: lease.attempt.id });
        } catch (err) {
            if (err?.code === 'SERVER_SHUTTING_DOWN') {
                return res.status(503).json({ error: 'Server is shutting down.', code: err.code });
            }
            next(err);
        }
    });

    // 10. Duraklat (Pause)
    router.post('/:id/pause', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const actionId = getActionId(req);
            const state = await readProjectState(id);
            if (!state || !canTransitionProjectStatus(state.status, 'paused')) {
                return res.status(400).json({ error: "Geçersiz işlem" });
            }

            const activeLease = getActiveWorkflowAttempt(id);
            abortProjectExecution(id, 'PAUSED');

            let transactionOpen = false;
            try {
                db.exec('BEGIN IMMEDIATE;');
                transactionOpen = true;
                state.status = 'paused';
                await writeProjectState(
                    id,
                    state,
                    activeLease
                        ? {
                            attemptId: activeLease.id,
                            leaseOwner: activeLease.lease_owner,
                            inTransaction: true,
                            onTransaction: () => appendWorkflowAction(id, actionId, {
                                userText: '⏸️ Üretim sürecini duraklat.',
                                modelText: 'Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.'
                            }, { inTransaction: true })
                        }
                        : {
                            inTransaction: true,
                            onTransaction: () => appendWorkflowAction(id, actionId, {
                                userText: '⏸️ Üretim sürecini duraklat.',
                                modelText: 'Süreç duraklatıldı. Revizyon talebinizi iletebilirsiniz.'
                            }, { inTransaction: true })
                        }
                );
                db.exec('COMMIT;');
                transactionOpen = false;
            } catch (error) {
                if (transactionOpen) {
                    try { db.exec('ROLLBACK;'); } catch {}
                }
                throw error;
            }

            res.json(getProject(id));
        } catch (err) {
            next(err);
        }
    });

    // 11. Proje Güncelle (Yeniden Adlandırma / Pinleme)
    router.patch('/:id', requireAuth, projectAccess('editor'), async (req, res, next) => {
        const { id } = req.params;
        const { title, is_pinned, isPinned } = req.body || {};
        const hasPinChange = typeof is_pinned !== 'undefined' || typeof isPinned !== 'undefined';

        if (title && !validateProjectTitle(title)) {
            return res.status(400).json({ error: "Geçersiz proje başlığı formatı." });
        }

        try {
            const actionId = hasPinChange ? getActionId(req) : null;
            const updated = updateProject(id, { title, is_pinned, isPinned });
            if (hasPinChange) {
                const pinned = Boolean(updated?.isPinned);
                appendProjectActionMessages(id, {
                    actionId,
                    userText: pinned
                        ? '📌 Projeyi başa sabitledim.'
                        : '📌 Projenin sabitlemesini kaldırdım.',
                    modelText: pinned
                        ? 'Proje yan menünün üst sırasına taşındı.'
                        : 'Proje normal sıralamaya döndürüldü.'
                });
            }
            res.json(getProject(id));
        } catch (err) {
            next(err);
        }
    });

    // 12. Proje Sil
    router.delete('/:id', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            await deleteProject(id);
            res.json({ success: true, message: "Proje başarıyla silindi." });
        } catch (err) {
            if (err.code === 'PROJECT_LOCKED_RECEIPT') {
                return res.status(409).json({ error: err.message, code: err.code });
            }
            next(err);
        }
    });

    return router;
}
