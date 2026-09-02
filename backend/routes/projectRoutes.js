import { Router } from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { readProjectState, writeProjectState, executeProjectTasks, getProjectDir, normalizeWorkflowState } from '../engine/index.js';
import { createProject, deleteProject } from '../projectRepository.js';
import { acquireWorkflowLease, releaseWorkflowLease } from '../workflowAttempts.js';
import { abortProjectExecution } from '../engine/cancellation.js';
import { db, getAllProjects, getProjectLogs, updateProject, syncProjectsWithDisk } from '../db.js';
import { generateLLMResponse } from '../llm.js';
import { validateChatPayload, validateProjectTitle, isSafeProjectPath, isSymlinkDirent, assertPathInsideRoot, asyncHandler } from '../security.js';
import { loadAgentPromptFromDocs, loadOrkestrasyonTalimatnamesi } from '../agents/agentLoader.js';
import { extractAndParseJSON, normalizeManagerPlan } from '../agents/schemas.js';
import { logError, logWarning, redactSensitiveText, redactSensitiveValue, getGateMetrics, getStackMetrics, getTrendMetrics, getFailureMetrics, deriveCheckpointId, collectDownstreamTaskIds } from '../observability.js';
import {
    getProjectRole,
    canViewProject,
    canEditProject,
    canDeleteProject,
    canTransitionProjectStatus,
    getUserProjects
} from '../auth.js';
import { PROJECT_STATUS } from '../engine/stateMachine.js';
import { runProjectVerification } from '../verification/qualityPolicy.js';
import { buildCompletionReport } from '../verification/reportGenerator.js';

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
    return {
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
        ]
    };
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
    verificationRunner = runProjectVerification
}) {
    const router = Router();

    // 1. Projeleri Listele (Korumalı - Saf GET, yan etki yok)
    router.get('/', requireAuth, async (req, res, next) => {
        try {
            const projects = req.user.isAdmin
                ? getAllProjects()
                : getUserProjects(req.user.id);
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
            const ALLOWED_EXTENSIONS = new Set([
                '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.html',
                '.prisma', '.sql', '.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp',
                '.txt', '.yaml', '.yml', '.graphql', '.gql'
            ]);
            const ALLOWED_DOT_FILES = new Set(['.env.example', '.gitignore']);
            const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
            const IGNORED_FILES = new Set(['package-lock.json', 'bun.lockb', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);

            let totalBytes = 0;
            async function getFiles(targetDir, relativePath = '') {
                let results = [];
                if (results.length >= MAX_TOTAL_FILES || totalBytes >= MAX_TOTAL_BYTES) {
                    return results;
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
                                results = results.concat(await getFiles(resPath, relPath));
                            }
                        } else {
                            if (IGNORED_FILES.has(file.name)) continue;
                            const ext = path.extname(file.name).toLowerCase();
                            if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_DOT_FILES.has(file.name) && ext !== '') continue;
                            try {
                                const stat = await fs.stat(resPath);
                                if (stat.size > MAX_FILE_SIZE) continue;
                                await assertPathInsideRoot(resPath, dir);
                                const content = await fs.readFile(resPath, 'utf8');
                                totalBytes += stat.size;
                                results.push({ path: relPath, content });
                            } catch (error) {
                                logWarning('api.project_file_read_failed', error, { projectId: req.params.id, file: relPath });
                            }
                        }
                    }
                } catch (err) {}
                return results;
            }

            const files = await getFiles(dir);
            res.json(files);
        } catch (error) {
            next(error);
        }
    });

    // 6. Proje Loglarını Getir (Cursor Pagination Destekli)
    router.get('/:id/logs', requireAuth, projectAccess('viewer'), async (req, res, next) => {
        try {
            const { cursor, limit } = req.query || {};
            const logs = getProjectLogs(req.params.id, { cursor, limit });
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
                PROJECT_STATUS.CAPABILITY_BLOCKED
            ]);

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

            if (isPlanReady && revisableStatuses.has(freshState.status)) {
                const draftPlan = parsedPlan || normalizeManagerPlanFromText(
                    freshState.title,
                    responseText
                );
                const { createContractRevision } = await import('../contracts/projectContract.js');
                createContractRevision(id, draftPlan, modelMsg.id);

                freshState.status = PROJECT_STATUS.PENDING_APPROVAL;
                freshState.plan = draftPlan;
                try {
                    const oldRapor = path.join(projectDir, 'RAPOR.md');
                    if (fsSync.existsSync(oldRapor)) fsSync.unlinkSync(oldRapor);
                } catch {}
                await writeProjectState(id, freshState);
            }

        const finalResponseState = await readProjectState(id);
        res.json(finalResponseState);
    }));

    // 8. Planı Onayla ve Başlat
    router.post('/:id/approve', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const state = await readProjectState(id);
            if (!state || !canTransitionProjectStatus(
                state.status,
                PROJECT_STATUS.CONTRACT_APPROVED
            )) {
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

            approveContractRevision(id, latestRevision.revision);
            state.status = PROJECT_STATUS.CONTRACT_APPROVED;
            await writeProjectState(id, state);

            const lease = acquireWorkflowLease(id, `http-approve-${req.user.id}`);
            if (!lease.acquired) {
                return res.json({
                    ...state,
                    attemptId: lease.attempt.id,
                    idempotent: true
                });
            }

            const approvedState = await readProjectState(id);
            if (!canTransitionProjectStatus(
                approvedState.status,
                PROJECT_STATUS.IMPLEMENTING
            )) {
                releaseWorkflowLease(lease.attempt.id, 'failed', {
                    error: 'Invalid implementing transition'
                });
                return res.status(409).json({
                    error: 'Proje uygulama durumuna geçirilemedi.'
                });
            }
            approvedState.status = PROJECT_STATUS.IMPLEMENTING;
            approvedState.workflow = normalizeWorkflowState(null);
            await writeProjectState(id, approvedState);

            executeProjectTasks(id, wsHub, lease.attempt.id).catch(error => {
                logError('workflow.background_execution_failed', error, {
                    projectId: id,
                    attemptId: lease.attempt.id
                });
            });
            res.json({ ...state, attemptId: lease.attempt.id });
        } catch (err) {
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
        const rows = db.prepare(`
            SELECT id, kind, path, sha256, size, status, verification_run_id
            FROM artifacts WHERE project_id = ? ORDER BY created_at DESC
        `).all(req.params.id);
        const result = rows.map(r => ({
            id: r.id,
            kind: r.kind,
            path: r.path,
            sha256: r.sha256,
            size: r.size,
            status: r.status,
            verification_run_id: r.verification_run_id
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
        if (!artifact) {
            return res.status(404).json({ error: 'Artifact not found' });
        }

        const latestApprovedContract = db.prepare(`
            SELECT id FROM project_contracts
            WHERE project_id = ? AND status = 'approved'
            ORDER BY revision DESC LIMIT 1
        `).get(id);

        if (!latestApprovedContract || latestApprovedContract.id !== contractId) {
            return res.status(404).json({ error: 'Artifact contract is not the latest approved contract' });
        }

        if (artifact.status !== 'verified' || !artifact.verification_run_id) {
            return res.status(409).json({ error: 'Artifact is not verified for download' });
        }

        res.download(artifact.path, path.basename(artifact.path));
    }));

    router.post('/:id/resume', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const state = await readProjectState(id);
            if (!state) return res.status(404).json({ error: "Proje bulunamadı." });
            if (!canTransitionProjectStatus(state.status, 'running')) {
                return res.status(400).json({ error: `Bu durumdan (${state.status}) çalışır duruma geçilemez.` });
            }

            const lease = acquireWorkflowLease(id, `http-resume-${req.user.id}`);
            if (!lease.acquired) {
                return res.json({ ...state, attemptId: lease.attempt.id, idempotent: true });
            }

            state.status = 'running';
            state.chatHistory.push({ role: 'model', parts: [{ text: "▶️ Süreç kaldığı yerden devam ettiriliyor..." }] });
            await writeProjectState(id, state);

            executeProjectTasks(id, wsHub, lease.attempt.id).catch(error => {
                logError('workflow.background_execution_failed', error, { projectId: id, attemptId: lease.attempt.id });
            });
            res.json({ ...state, attemptId: lease.attempt.id });
        } catch (err) {
            next(err);
        }
    });

    // 10. Duraklat (Pause)
    router.post('/:id/pause', requireAuth, projectAccess('owner'), async (req, res, next) => {
        const { id } = req.params;
        try {
            const state = await readProjectState(id);
            if (!state || !canTransitionProjectStatus(state.status, 'paused')) {
                return res.status(400).json({ error: "Geçersiz işlem" });
            }

            abortProjectExecution(id, 'PAUSED');

            state.status = 'paused';
            state.chatHistory.push({ role: 'model', parts: [{ text: "Süreç tarafınızdan duraklatıldı. Hangi ajanların veya mimarinin değişmesini istersiniz?" }] });
            await writeProjectState(id, state);

            res.json(state);
        } catch (err) {
            next(err);
        }
    });
    // 11. Proje Güncelle (Yeniden Adlandırma / Pinleme)
    router.patch('/:id', requireAuth, projectAccess('editor'), async (req, res, next) => {
        const { id } = req.params;
        const { title, is_pinned, isPinned } = req.body || {};

        if (title && !validateProjectTitle(title)) {
            return res.status(400).json({ error: "Geçersiz proje başlığı formatı." });
        }

        try {
            const updated = updateProject(id, { title, is_pinned, isPinned });
            res.json(updated);
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
            next(err);
        }
    });

    return router;
}
