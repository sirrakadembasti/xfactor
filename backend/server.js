import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';


import { readProjectState, writeProjectState, executeProjectTasks, getProjectDir } from './orchestrator.js';
import { getAllProjects, getProjectLogs, updateProject, deleteProject, syncProjectsWithDisk } from './db.js';
import { generateLLMResponse } from './llm.js';
import { validateRuntimeConfig } from './config.js';
import {
    isSafeWebSocketUrl,
    validateChatPayload,
    validateLoginPayload,
    validateProjectTitle,
    extractWebSocketToken,
    isAllowedOrigin,
    isSafeProjectPath
} from './security.js';
import {
    authenticateUser,
    findUserByUsername,
    getUserProjects,
    getProjectRole,
    canViewProject,
    canEditProject,
    canDeleteProject,
    canTransitionProjectStatus
} from './auth.js';
import { generateRequestId, buildStructuredLog, buildErrorResponse } from './observability.js';

const execFileAsync = promisify(execFile);

// TLS REJECT hack removed.

// Proxy ayarlarının silinmesi kaldırıldı (Production riski oluşturduğu için).

dotenv.config();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use((req, res, next) => {
    req.requestId = generateRequestId();
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (isAllowedOrigin(origin, allowedOrigins)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());

// API Rate Limiter (Saldırı / Spam Koruması)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 dakika
    max: 50, // 1 dakikada dışarıdan en fazla 50 istek yapılabilir
    message: { error: "Sunucuya çok fazla istek yapıldı, lütfen biraz bekleyin." },
    skip: (req) => {
        // Kullanıcının kendi bilgisayarından (localhost) yaptığı istekleri sınırlamadan muaf tut (ÖNEMLİ)
        const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    }
});

// Limitleyiciyi tüm /api/ isteklerine uygula
app.use('/api/', apiLimiter);

// Global Path Traversal Koruması
app.use((req, res, next) => {
    try {
        const decodedPath = decodeURIComponent(req.path);
        const resolvedPath = path.posix.resolve('/', decodedPath.replace(/^\/+/, ''));
        if (resolvedPath !== '/' + decodedPath.replace(/^\/+/, '') && decodedPath !== '/') {
            return res.status(400).json({ error: "Geçersiz veya tehlikeli istek dizini." });
        }
    } catch (e) {
        return res.status(400).json({ error: "Geçersiz URL formatı." });
    }
    next();
});

// Path Traversal Koruması: id parametresi sadece alfanümerik ve tire/altçizgi içerebilir
app.param('id', (req, res, next, id) => {
    if (!/^[a-zA-Z0-9-_]+$/.test(id)) {
        return res.status(400).json({ error: "Geçersiz veya tehlikeli proje ID formatı." });
    }
    next();
});


const runtimeConfig = validateRuntimeConfig(process.env);
const JWT_SECRET = runtimeConfig.JWT_SECRET;
const ADMIN_USER = runtimeConfig.ADMIN_USER;
const ADMIN_PASS = runtimeConfig.ADMIN_PASS;

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/logs' });
const wsClients = new Set();

// WebSocket Auth Check
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tokenFromQuery = url.searchParams.get('token');
    const authHeader = req.headers.authorization;
    const subprotocol = req.headers['sec-websocket-protocol'];

    if (!isSafeWebSocketUrl(req.url)) {
        ws.close(1008, 'Token query string güvenli değil. Authorization header veya secure subprotocol kullanın.');
        return;
    }

    if (tokenFromQuery) {
        ws.close(1008, 'Token query string güvenli değil. Authorization header veya secure subprotocol kullanın.');
        return;
    }

    const secureToken = extractWebSocketToken(Array.isArray(subprotocol) ? subprotocol : [subprotocol].filter(Boolean));
    const token = secureToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

    if (!token) {
        ws.close(1008, 'Token gerekli');
        return;
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        ws.user = payload;
        wsClients.add(ws);
        ws.on('close', () => wsClients.delete(ws));
    } catch (e) {
        ws.close(1008, 'Geçersiz token');
    }
});

// Kimlik Doğrulama Middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Yetkisiz erişim. Token bulunamadı." });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Geçersiz veya süresi dolmuş token." });
    }
};

const projectAccess = (requiredRole = 'viewer') => (req, res, next) => {
    const projectId = req.params.id;
    const user = req.user || {};
    const userId = user.userId || user.id;
    const isAdmin = user.username === ADMIN_USER;

    if (isAdmin) {
        return next();
    }

    const role = getProjectRole(userId, projectId);
    if (!role) {
        return res.status(403).json({ error: "Bu projeye erişim yetkiniz yok." });
    }

    const rolePriority = { viewer: 1, editor: 2, owner: 3 };
    const requiredPriority = rolePriority[requiredRole] || 1;
    const rolePriorityValue = rolePriority[role] || 0;

    if (rolePriorityValue < requiredPriority) {
        return res.status(403).json({ error: "Bu işlemi yapma yetkiniz yok." });
    }

    const permissionCheckMap = {
        viewer: canViewProject,
        editor: canEditProject,
        owner: canDeleteProject
    };
    const check = permissionCheckMap[requiredRole] || canViewProject;
    if (!check(userId, projectId)) {
        return res.status(403).json({ error: "Bu işlemi yapma yetkiniz yok." });
    }

    return next();
};

const requireProjectAccess = projectAccess('viewer');

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!validateLoginPayload({ username, password })) {
        return res.status(400).json({ error: "Geçersiz kullanıcı adı veya şifre formatı." });
    }

    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const dbUser = cleanUsername ? findUserByUsername(cleanUsername) : null;
    const credentialsMatch = dbUser ? authenticateUser(cleanUsername, password) : false;
    const envAdminMatch = cleanUsername === ADMIN_USER && password === ADMIN_PASS;

    if (credentialsMatch || envAdminMatch) {
        const payload = dbUser
            ? { userId: dbUser.id, username: dbUser.username }
            : { username: ADMIN_USER };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ token, user: payload });
    }

    return res.status(401).json({ error: "Kullanıcı adı veya şifre hatalı." });
});

// Gemini Kurulumu - Her istekte dinamik olarak kontrol edeceğiz ki sunucu yeniden başlatılmadan algılasın.
import fsSync from 'fs';

function buildManagerChatSystemPrompt(state, projectDir) {
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
const SYSTEM_PROMPT = buildManagerChatSystemPrompt({ status: 'planning' }, '.');

// 1. Projeleri Listele (Korumalı)
app.get('/api/projects', requireAuth, async (req, res) => {
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
app.post('/api/projects', requireAuth, async (req, res) => {
    let { title } = req.body || {};
    if (!validateProjectTitle(title || '')) {
        return res.status(400).json({ error: "Geçerli bir proje başlığı (title) gerekli." });
    }
    // Sadece harf, rakam, boşluk, tire ve Türkçe karakterlere izin ver
    title = title.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s-_]/g, '').trim();
    if (!title) title = "İsimsiz Proje";

    const id = `project-${Date.now()}`;
    const initialState = {
        id,
        title,
        status: 'planning', // planning, pending_approval, running, paused, completed
        chatHistory: [
            { role: 'model', parts: [{ text: `Merhaba Boss! "${title}" projesi için ben Manager (Kıdemli Mimar). Bu uygulamada tam olarak hangi özellikleri istiyorsun? Beyin fırtınasına başlayalım.` }] }
        ],
        plan: null
    };

    const ownerUser = req.user?.userId ? req.user.userId : null;
    await writeProjectState(id, initialState);

    if (ownerUser) {
        const { db } = await import('./db.js');
        const existing = db.prepare('SELECT 1 FROM project_owners WHERE project_id = ? AND user_id = ?').get(id, ownerUser);
        if (!existing) {
            db.prepare('UPDATE projects SET owner_id = ? WHERE id = ?').run(ownerUser, id);
            db.prepare('INSERT INTO project_owners (project_id, user_id, role) VALUES (?, ?, ?)').run(id, ownerUser, 'owner');
        }
    }

    res.json(initialState);
});

// 3. Proje Detayı ve State
app.get('/api/projects/:id', requireAuth, requireProjectAccess, async (req, res) => {
    const state = await readProjectState(req.params.id);
    if (!state) return res.status(404).json({ error: "Project not found" });
    res.json(state);
});

// Proje Dosyalarını Getir (IDE ve ZIP için)
app.get('/api/projects/:id/files', requireAuth, projectAccess('viewer'), async (req, res) => {
    try {
        const dir = getProjectDir(req.params.id);
        
        const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB limit
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
                    if (file.name.startsWith('.')) continue; // Gizli dosya/klasörleri atla (ör: .git, .env)
                    
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
                            if (stat.size > MAX_FILE_SIZE) continue; // Boyut kontrolü
                            
                            const content = await fs.readFile(resPath, 'utf8');
                            results.push({ path: relPath, content });
                        } catch (readErr) {
                            console.error(`Dosya okunamadı: ${resPath}`, readErr);
                        }
                    }
                }
            } catch (err) {
                // Klasör yoksa boş döner
            }
            return results;
        }
        
        const files = await getFiles(dir);
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Projeye Ait Geçmiş Logları Getir
app.get('/api/projects/:id/logs', requireAuth, projectAccess('viewer'), async (req, res) => {
    try {
        const logs = getProjectLogs(req.params.id);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Sohbet (Mesaj Gönderme)
app.post('/api/projects/:id/chat', requireAuth, projectAccess('editor'), async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    if (!validateChatPayload({ message })) {
        return res.status(400).json({ error: 'Geçersiz mesaj içeriği.' });
    }

    const state = await readProjectState(id);
    if (!state) return res.status(404).json({ error: "Project not found" });

    // Disk durum doğrulaması: RAPOR.md varsa proje %100 bitmiştir
    const projectDir = getProjectDir(id);
    const isCompletedOnDisk = fsSync.existsSync(path.join(projectDir, 'RAPOR.md'));
    if (isCompletedOnDisk) {
        state.status = 'completed';
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });
    const timestampStr = `${formattedDate} ${formattedTime}`;

    // Boss'un mesajını ekle
    state.chatHistory.push({
        role: 'user',
        parts: [{ text: message }],
        timestamp: timestampStr,
        created_at: now.toISOString()
    });
    await writeProjectState(id, state);

    // Dinamik Sistem Promptu oluştur (Projenin güncel durumuna ve diskteki RAPOR.md'ye göre)
    const dynamicPrompt = buildManagerChatSystemPrompt(state, projectDir);
    // Çoklu Sağlayıcı Altyapısı (Multi-Provider Infrastructure) - llm.js üzerinden
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
        
        // YALNIZCA planlama aşamasındayken onay tespiti yap
        // YALNIZCA proje başlangıç planlama aşamasındayken ve bitmemişken onay tespiti yap
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

// 5. Planı Onayla ve Başlat (Start Execution)
app.post('/api/projects/:id/approve', requireAuth, projectAccess('owner'), async (req, res) => {
    const { id } = req.params;
    const state = await readProjectState(id);
    if (!state || !canTransitionProjectStatus(state.status, 'running')) return res.status(400).json({ error: "Geçersiz işlem" });

    state.status = 'running';
    await writeProjectState(id, state);
    
    // Arka planda çalışmayı başlat
    executeProjectTasks(id, wsClients).catch(console.error);

    res.json(state);
});

// 5b. Süreci Devam Ettir (Resume Execution)
app.post('/api/projects/:id/resume', requireAuth, projectAccess('owner'), async (req, res) => {
    const { id } = req.params;
    const state = await readProjectState(id);
    if (!state) return res.status(404).json({ error: "Proje bulunamadı." });
    if (!canTransitionProjectStatus(state.status, 'running')) {
        return res.status(400).json({ error: `Bu durumdan (${state.status}) çalışır duruma geçilemez.` });
    }

    state.status = 'running';
    state.chatHistory.push({ role: 'model', parts: [{ text: "▶️ Süreç kaldığı yerden devam ettiriliyor..." }] });
    await writeProjectState(id, state);
    
    // Arka planda otonom DAG sürecini devam ettir
    executeProjectTasks(id, wsClients).catch(console.error);

    res.json(state);
});

// 6. Duraklat (Pause)
app.post('/api/projects/:id/pause', requireAuth, projectAccess('owner'), async (req, res) => {
    const { id } = req.params;
    const state = await readProjectState(id);
    if (!state || !canTransitionProjectStatus(state.status, 'paused')) return res.status(400).json({ error: "Geçersiz işlem" });

    state.status = 'paused';
    state.chatHistory.push({ role: 'model', parts: [{ text: "Süreç tarafınızdan duraklatıldı. Hangi ajanların veya mimarinin değişmesini istersiniz?" }] });
    await writeProjectState(id, state);

    res.json(state);
});

// 7. Proje Güncelle (Yeniden Adlandırma / Pinleme)
app.patch('/api/projects/:id', requireAuth, projectAccess('editor'), async (req, res) => {
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

// 8. Proje Sil
app.delete('/api/projects/:id', requireAuth, projectAccess('owner'), async (req, res) => {
    const { id } = req.params;
    try {
        deleteProject(id);
        res.json({ success: true, message: "Proje başarıyla silindi." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Disk ve DB Senkronizasyonu
app.post('/api/projects/sync', requireAuth, async (req, res) => {
    try {
        const result = syncProjectsWithDisk();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.use((err, req, res, next) => {
    const requestId = req.requestId || generateRequestId();
    const payload = buildErrorResponse(err, 'İşlem başarısız oldu.');
    payload.requestId = requestId;

    console.error(JSON.stringify(buildStructuredLog('api.error', {
        requestId,
        status: 500,
        message: err && err.message ? err.message : 'Unknown error'
    })));

    res.status(500).json(payload);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Backend hazır: http://127.0.0.1:${PORT}`);
});
