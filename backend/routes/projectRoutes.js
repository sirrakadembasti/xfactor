import { Router } from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { readProjectState, writeProjectState, executeProjectTasks, getProjectDir } from '../orchestrator.js';
import { getAllProjects, getProjectLogs, updateProject, deleteProject, syncProjectsWithDisk } from '../db.js';
import { generateLLMResponse } from '../llm.js';
import { validateChatPayload, validateProjectTitle, isSafeProjectPath } from '../security.js';
import {
    getUserProjects,
    getProjectRole,
    canViewProject,
    canEditProject,
    canDeleteProject,
    canTransitionProjectStatus
} from '../auth.js';

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
[GÜNCEL DURUM: PROJE TAMAMLANDI]
- "${title}" projesinin tüm aşamaları (Frontend, Backend, Veritabanı, Testler) başarıyla tamamlandı.
${reportContent ? `\nKABUL VE TEST RAPORU ÖZETİ:\n"""\n${reportContent}\n"""\n` : ''}

Rehberlik:
- Boss ile doğal, zeki ve samimi bir kıdemli yazılım mimarı olarak konuş. Kalıplaşmış robotik başlıklar ("Sayın Boss", "Dürüst Bilgilendirme" vb.) kullanma.
- Projenin bittiğini, hangi modüllerin oluşturulduğunu anlat. Boss projeyi indirmek isterse üst menüdeki "Projeyi (ZIP) İndir" butonunu, kodları görmek isterse "Kod Editörünü Aç" butonunu kullanabileceğini belirt.
- Yerel çalıştırma adımlarını kısaca özetle (npm install -> npx prisma db push -> npm run dev).
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

    return `Sen XFactor platformunun "Manager" adlı kıdemli yazılım mimarısın. 
Boss ile Türkçe, son derece akıcı, zeki, yapıcı ve doğrudan konuşursun. 
Kalıp veya robotik şablonlar kullanma, doğal bir uzman gibi yanıt ver. Markdown kullan.

${extraContext}`;
}

export function createProjectRouter({ requireAuth, projectAccess, wsClients, ADMIN_USER }) {
    const router = Router();

    // 1. Projeleri Listele (Korumalı)
    router.get('/', requireAuth, async (req, res) => {
        try {
            const user = req.user || {};
            const userId = user.userId || user.id;
            const projects = userId ? getUserProjects(userId) : getAllProjects();
            res.json(projects);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 2. Yeni Proje Oluştur
    router.post('/', requireAuth, async (req, res) => {
        let { title } = req.body || {};
        if (!validateProjectTitle(title || '')) {
            return res.status(400).json({ error: "Geçerli bir proje başlığı (title) gerekli." });
        }
        title = title.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s-_]/g, '').trim();
        if (!title) title = "İsimsiz Proje";

        const id = `project-${Date.now()}`;
        const initialState = {
            id,
            title,
            status: 'planning',
            chatHistory: [
                { role: 'model', parts: [{ text: `Merhaba Boss! "${title}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.` }] }
            ],
            plan: null
        };

        const ownerUser = req.user?.userId ? req.user.userId : null;
        await writeProjectState(id, initialState);

        if (ownerUser) {
            const { db } = await import('../db.js');
            const existing = db.prepare('SELECT 1 FROM project_owners WHERE project_id = ? AND user_id = ?').get(id, ownerUser);
            if (!existing) {
                db.prepare('UPDATE projects SET owner_id = ? WHERE id = ?').run(ownerUser, id);
                db.prepare('INSERT INTO project_owners (project_id, user_id, role) VALUES (?, ?, ?)').run(id, ownerUser, 'owner');
            }
        }

        res.json(initialState);
    });

    // 3. Disk ve DB Senkronizasyonu
    router.post('/sync', requireAuth, async (req, res) => {
        try {
            const result = syncProjectsWithDisk();
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 4. Proje Detayı
    router.get('/:id', requireAuth, projectAccess('viewer'), async (req, res) => {
        const state = await readProjectState(req.params.id);
        if (!state) return res.status(404).json({ error: "Project not found" });
        res.json(state);
    });

    // 5. Proje Dosyalarını Getir
    router.get('/:id/files', requireAuth, projectAccess('viewer'), async (req, res) => {
        try {
            const dir = getProjectDir(req.params.id);
            const MAX_FILE_SIZE = 2 * 1024 * 1024;
            const ALLOWED_EXTENSIONS = new Set([
                '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.html',
                '.prisma', '.sql', '.svg', '.ico', '.png', '.jpg', '.jpeg', '.webp',
                '.txt', '.yaml', '.yml', '.graphql', '.gql', '.env.example'
            ]);
            const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'manager', 'frontend.director', 'backend.director']);
            const IGNORED_FILES = new Set(['.env', '.env.local', 'package-lock.json', 'bun.lockb', 'DURUM.md', 'RAPOR.md', 'TODO.md', 'TALIMATNAME.md', 'GOREV.md', 'ALT-TALIMATNAME.md']);

            async function getFiles(targetDir, relativePath = '') {
                let results = [];
                try {
                    const list = await fs.readdir(targetDir, { withFileTypes: true });
                    for (const file of list) {
                        if (file.name.startsWith('.')) continue;
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
                            if (!ALLOWED_EXTENSIONS.has(ext) && ext !== '') continue;

                            try {
                                const stat = await fs.stat(resPath);
                                if (stat.size > MAX_FILE_SIZE) continue;
                                const content = await fs.readFile(resPath, 'utf8');
                                results.push({ path: relPath, content });
                            } catch (readErr) {
                                console.error(`Dosya okunamadı: ${resPath}`, readErr);
                            }
                        }
                    }
                } catch (err) {}
                return results;
            }

            const files = await getFiles(dir);
            res.json(files);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 6. Proje Loglarını Getir
    router.get('/:id/logs', requireAuth, projectAccess('viewer'), async (req, res) => {
        try {
            const logs = getProjectLogs(req.params.id);
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 7. Manager Sohbeti
    router.post('/:id/chat', requireAuth, projectAccess('editor'), async (req, res) => {
        const { id } = req.params;
        const { message } = req.body;

        if (!validateChatPayload({ message })) {
            return res.status(400).json({ error: 'Geçersiz mesaj içeriği.' });
        }

        const state = await readProjectState(id);
        if (!state) return res.status(404).json({ error: "Project not found" });

        const projectDir = getProjectDir(id);
        const isCompletedOnDisk = fsSync.existsSync(path.join(projectDir, 'RAPOR.md'));
        if (isCompletedOnDisk) {
            state.status = 'completed';
        }

        const now = new Date();
        const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });
        const timestampStr = `${formattedDate} ${formattedTime}`;

        state.chatHistory.push({
            role: 'user',
            parts: [{ text: message }],
            timestamp: timestampStr,
            created_at: now.toISOString()
        });
        await writeProjectState(id, state);

        const dynamicPrompt = buildManagerChatSystemPrompt(state, projectDir);
        try {
            const messages = [{ role: 'system', content: dynamicPrompt }];
            state.chatHistory.slice(0, -1).forEach(msg => {
                messages.push({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.parts[0].text });
            });
            messages.push({ role: 'user', content: message });

            const responseText = await generateLLMResponse(messages);

            const modelNow = new Date();
            const modelDate = modelNow.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const modelTime = modelNow.toLocaleTimeString('tr-TR', { hour12: false });

            state.chatHistory.push({
                role: 'model',
                parts: [{ text: responseText }],
                timestamp: `${modelDate} ${modelTime}`,
                created_at: modelNow.toISOString()
            });

            if (state.status === 'planning' && !isCompletedOnDisk) {
                const isPlanReady = responseText.toLowerCase().includes("onaylıyor") ||
                                    responseText.toLowerCase().includes("planı onayla") ||
                                    responseText.toLowerCase().includes("üretime başla") ||
                                    responseText.includes("[PLAN_HAZIR]");

                if (isPlanReady) {
                    state.status = 'pending_approval';
                    state.plan = {
                        summary: `Proje: ${state.title}`,
                        talimatname: `# ${state.title}\n\n## Mimari Şartname\n\n${responseText}`,
                        domains: [
                            { name: "frontend", prefix: "frontend", description: "Kullanıcı arayüzü ve bileşenler" },
                            { name: "backend", prefix: "backend", description: "REST API ve sunucu servisleri" }
                        ]
                    };
                }
            }

            await writeProjectState(id, state);
            res.json(state);
        } catch (error) {
            console.error("YAPAY ZEKA API HATASI: ", error);
            res.status(500).json({ error: error.message });
        }
    });

    // 8. Planı Onayla ve Başlat
    router.post('/:id/approve', requireAuth, projectAccess('owner'), async (req, res) => {
        const { id } = req.params;
        const state = await readProjectState(id);
        if (!state || !canTransitionProjectStatus(state.status, 'running')) return res.status(400).json({ error: "Geçersiz işlem" });

        state.status = 'running';
        await writeProjectState(id, state);

        executeProjectTasks(id, wsClients).catch(console.error);
        res.json(state);
    });

    // 9. Süreci Devam Ettir (Resume)
    router.post('/:id/resume', requireAuth, projectAccess('owner'), async (req, res) => {
        const { id } = req.params;
        const state = await readProjectState(id);
        if (!state) return res.status(404).json({ error: "Proje bulunamadı." });
        if (!canTransitionProjectStatus(state.status, 'running')) {
            return res.status(400).json({ error: `Bu durumdan (${state.status}) çalışır duruma geçilemez.` });
        }

        state.status = 'running';
        state.chatHistory.push({ role: 'model', parts: [{ text: "▶️ Süreç kaldığı yerden devam ettiriliyor..." }] });
        await writeProjectState(id, state);

        executeProjectTasks(id, wsClients).catch(console.error);
        res.json(state);
    });

    // 10. Duraklat (Pause)
    router.post('/:id/pause', requireAuth, projectAccess('owner'), async (req, res) => {
        const { id } = req.params;
        const state = await readProjectState(id);
        if (!state || !canTransitionProjectStatus(state.status, 'paused')) return res.status(400).json({ error: "Geçersiz işlem" });

        state.status = 'paused';
        state.chatHistory.push({ role: 'model', parts: [{ text: "Süreç tarafınızdan duraklatıldı. Hangi ajanların veya mimarinin değişmesini istersiniz?" }] });
        await writeProjectState(id, state);

        res.json(state);
    });

    // 11. Proje Güncelle (Yeniden Adlandırma / Pinleme)
    router.patch('/:id', requireAuth, projectAccess('editor'), async (req, res) => {
        const { id } = req.params;
        const { title, is_pinned, isPinned } = req.body || {};

        if (title && !validateProjectTitle(title)) {
            return res.status(400).json({ error: "Geçersiz proje başlığı formatı." });
        }

        try {
            const updated = updateProject(id, { title, is_pinned, isPinned });
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 12. Proje Sil
    router.delete('/:id', requireAuth, projectAccess('owner'), async (req, res) => {
        const { id } = req.params;
        try {
            deleteProject(id);
            res.json({ success: true, message: "Proje başarıyla silindi." });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
