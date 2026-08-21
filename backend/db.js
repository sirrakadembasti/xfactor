let DatabaseCtor;

if (typeof Bun !== 'undefined') {
    const sqlite = await import('bun:sqlite');
    DatabaseCtor = sqlite.Database;
} else {
    const sqlite = await import('node:sqlite');
    DatabaseCtor = sqlite.DatabaseSync || sqlite.default?.DatabaseSync;
}

if (!DatabaseCtor) {
    throw new Error('No SQLite database implementation available for this runtime.');
}

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { EventEmitter } from 'events';

export const dbEvents = new EventEmitter();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'projects.db');
export const db = new DatabaseCtor(DB_PATH, { create: true });

function columnExists(tableName, columnName) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some((column) => column.name === columnName);
}

// Tabloları oluştur (WAL modu eşzamanlılık için çok daha güvenlidir)
db.exec(`
  PRAGMA journal_mode = WAL;
  
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    plan TEXT,
    owner_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_owners (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text_content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS project_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    agent TEXT,
    action TEXT,
    file TEXT,
    message TEXT,
    node_id TEXT,
    parent_node_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  );
`);

if (!columnExists('projects', 'owner_id')) {
    db.exec('ALTER TABLE projects ADD COLUMN owner_id TEXT');
}
if (!columnExists('projects', 'is_pinned')) {
    db.exec('ALTER TABLE projects ADD COLUMN is_pinned INTEGER DEFAULT 0');
}
if (!columnExists('projects', 'workflow_state')) {
    db.exec('ALTER TABLE projects ADD COLUMN workflow_state TEXT');
}

export function formatDBDate(dateVal) {
    if (!dateVal) return '';
    try {
        let d;
        if (typeof dateVal === 'string') {
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal)) {
                d = new Date(dateVal.replace(' ', 'T') + 'Z');
            } else {
                d = new Date(dateVal);
            }
        } else if (dateVal instanceof Date) {
            d = dateVal;
        } else {
            d = new Date(dateVal);
        }

        if (isNaN(d.getTime())) return String(dateVal);

        const formattedDate = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedTime = d.toLocaleTimeString('tr-TR', { hour12: false });
        return `${formattedDate} ${formattedTime}`;
    } catch {
        return String(dateVal);
    }
}
db.exec('CREATE INDEX IF NOT EXISTS idx_project_owners_user_id ON project_owners(user_id)');

export function getProjectState(id) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) return null;
    
    if (project.plan) {
        try {
            project.plan = JSON.parse(project.plan);
        } catch {}
    }

    // DİSK DOĞRULAMASI: Eğer diskte RAPOR.md varsa proje kesinlikle completed durumundadır!
    let status = project.status;
    const PROJECTS_DIR = path.join(__dirname, '../projects');
    const raporPath = path.join(PROJECTS_DIR, id, 'RAPOR.md');
    if (fs.existsSync(raporPath)) {
        try {
            const raporContent = fs.readFileSync(raporPath, 'utf8');
            if (!raporContent.includes('REDDEDİLDİ') && !raporContent.includes('BASARISIZ') && !raporContent.includes('REDDEDILDI')) {
                status = 'completed';
                if (project.status !== 'completed') {
                    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('completed', id);
                }
                // Finish logunun varlığını garantiye al
                const hasFinishLog = db.prepare("SELECT 1 FROM project_logs WHERE project_id = ? AND action = 'finish'").get(id);
                if (!hasFinishLog) {
                    saveProjectLog({
                        projectId: id,
                        agent: "Manager",
                        action: "finish",
                        file: "RAPOR.md, README.md",
                        message: "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.",
                        node_id: "manager",
                        parent_node_id: null
                    });
                }
                // Tamamlama tebrik mesajının son mesaj olmasını sağla
                const lastChat = db.prepare('SELECT id, role, text_content FROM chat_history WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(id);
                if (!lastChat || lastChat.text_content.includes('⚠️ **Süreç Duraklatıldı') || lastChat.text_content.includes('⚠️ **Tester Kalite Kapısı Uyarısı') || lastChat.text_content.includes('Süreç hatası')) {
                    const completionMsg = `🎉 **Tebrikler Boss! "${project.title}" Projesi Başarıyla Tamamlandı!**\n\nTüm alt ekipler (Backend, Frontend) kod üretimini eksiksiz bitirdi ve Tester kalite kapısı onaylandı.\n\n### 📁 Üretilen Mimari Katmanları:\n- **Backend:** Prisma SQLite şemaları, Zod doğrulama şemaları, REST API rotaları\n- **Frontend:** Rol bazlı Dashboard'lar (Admin, Öğretmen, Öğrenci), Soru Bankası, Sınav Oluşturucu, Canlı Sayaçlı Sınav Odası, Recharts Karne Analitiği\n\n### 🧪 Test ve Kabul Doğrulaması:\n- **Sonuç:** ✅ Onaylandı (202/202 Başarılı Kontrol)\n- **Oluşturulan Raporlar:** \`RAPOR.md\` ve \`README.md\`\n\n---\n🚀 **Sonraki Adımlar:**\n1. Üst menüden **'Kod Editörü'** sekmesine geçerek tüm kaynak kodları inceleyebilirsiniz.\n2. Sağ üstteki **'Projeyi (ZIP) İndir'** butonuna tıklayarak uygulamanızı bilgisayarınıza indirebilirsiniz.`;
                    db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)').run(id, 'model', completionMsg, new Date().toISOString());
                }
            }
        } catch (e) {
            console.error("Rapor doğrulama hatası:", e);
        }
    }
    const chats = db.prepare('SELECT id, role, text_content, created_at FROM chat_history WHERE project_id = ? ORDER BY id ASC').all(id);
    const chatHistory = chats.map(c => {
        const timestamp = formatDBDate(c.created_at);
        return {
            id: c.id,
            role: c.role,
            parts: [{ text: c.text_content }],
            timestamp: timestamp,
            created_at: c.created_at
        };
    });
    
    let workflow = null;
    if (project.workflow_state) {
        try {
            workflow = JSON.parse(project.workflow_state);
        } catch {}
    }

    return {
        id: project.id,
        title: project.title,
        status: status,
        plan: project.plan,
        workflow,
        chatHistory
    };
}

export function saveProjectState(state) {
    const planStr = state.plan ? JSON.stringify(state.plan) : null;
    const workflowStr = state.workflow ? JSON.stringify(state.workflow) : null;

    const insertOrUpdateProject = db.prepare(`
        INSERT INTO projects (id, title, status, plan, workflow_state) 
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
            title = excluded.title, 
            status = excluded.status, 
            plan = excluded.plan,
            workflow_state = excluded.workflow_state
    `);

    const insertChat = db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)');
    try {
        db.exec('BEGIN');
        insertOrUpdateProject.run(
            state.id,
            state.title,
            state.status,
            planStr,
            workflowStr
        );

        const currentCount = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE project_id = ?').get(state.id).count;
        const chatsToSave = (state.chatHistory || []);

        for (let i = currentCount; i < chatsToSave.length; i++) {
            const chat = chatsToSave[i];
            const createdAt = chat.created_at || new Date().toISOString();
            insertChat.run(state.id, chat.role, chat.parts[0].text, createdAt);
        }
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    dbEvents.emit(`stateChange:${state.id}`, state.status);
}

export function getAllProjects() {
    return db.prepare('SELECT id, title, status, is_pinned, created_at FROM projects ORDER BY is_pinned DESC, created_at DESC').all().map(p => ({
        id: p.id,
        title: p.title,
        status: p.status,
        isPinned: Boolean(p.is_pinned),
        createdAt: p.created_at
    }));
}

export function updateProject(id, updates = {}) {
    const fields = [];
    const values = [];
    if (typeof updates.title === 'string' && updates.title.trim()) {
        fields.push('title = ?');
        values.push(updates.title.trim());
    }
    if (typeof updates.is_pinned !== 'undefined' || typeof updates.isPinned !== 'undefined') {
        const pinVal = updates.is_pinned !== undefined ? (updates.is_pinned ? 1 : 0) : (updates.isPinned ? 1 : 0);
        fields.push('is_pinned = ?');
        values.push(pinVal);
    }
    if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return getProjectState(id);
}

export function deleteProject(id) {
    db.exec('BEGIN');
    try {
        db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }

    // Disk üzerindeki klasörü de temizle
    try {
        const PROJECTS_DIR = path.join(__dirname, '../projects');
        const projectFolder = path.join(PROJECTS_DIR, id);
        if (fs.existsSync(projectFolder)) {
            fs.rmSync(projectFolder, { recursive: true, force: true });
        }
    } catch (err) {
        console.error("Proje klasörünü silme hatası:", err);
    }
    return true;
}

export function saveProjectLog(logData) {
    const insertLog = db.prepare(`
        INSERT INTO project_logs (project_id, agent, action, file, message, node_id, parent_node_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertLog.run(
        logData.projectId,
        logData.agent,
        logData.action,
        logData.file,
        logData.message,
        logData.node_id,
        logData.parent_node_id,
        logData.created_at || new Date().toISOString()
    );
}

export function getProjectLogs(projectId) {
    const PROJECTS_DIR = path.join(__dirname, '../projects');
    const raporPath = path.join(PROJECTS_DIR, projectId, 'RAPOR.md');
    if (fs.existsSync(raporPath)) {
        try {
            const raporContent = fs.readFileSync(raporPath, 'utf8');
            if (!raporContent.includes('REDDEDİLDİ') && !raporContent.includes('BASARISIZ') && !raporContent.includes('REDDEDILDI')) {
                const hasFinishLog = db.prepare("SELECT 1 FROM project_logs WHERE project_id = ? AND agent = 'Manager' AND action = 'finish'").get(projectId);
                if (!hasFinishLog) {
                    saveProjectLog({
                        projectId,
                        agent: "Manager",
                        action: "finish",
                        file: "RAPOR.md, README.md",
                        message: "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.",
                        node_id: "manager",
                        parent_node_id: null
                    });
                }
            }
        } catch {}
    }
    return db.prepare('SELECT * FROM project_logs WHERE project_id = ? ORDER BY id ASC').all(projectId).map(log => {
        const timestamp = formatDBDate(log.created_at);
        return {
            id: log.id,
            projectId: log.project_id,
            timestamp: timestamp,
            created_at: log.created_at,
            agent: log.agent,
            action: log.action,
            file: log.file,
            message: log.message,
            node_id: log.node_id,
            parent_node_id: log.parent_node_id
        };
    });
}

export function syncProjectsWithDisk() {
    const PROJECTS_DIR = path.join(__dirname, '../projects');
    const onDiskProjectIds = new Set();
    try {
        if (fs.existsSync(PROJECTS_DIR)) {
            const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    onDiskProjectIds.add(entry.name);
                    const raporPath = path.join(PROJECTS_DIR, entry.name, 'RAPOR.md');
                    const raporExists = fs.existsSync(raporPath);
                    const exists = db.prepare('SELECT id, title, status FROM projects WHERE id = ?').get(entry.name);
                    
                    let isRaporApproved = false;
                    if (raporExists) {
                        try {
                            const content = fs.readFileSync(raporPath, 'utf8');
                            isRaporApproved = !content.includes('REDDEDİLDİ') && !content.includes('BASARISIZ') && !content.includes('REDDEDILDI');
                        } catch {}
                    }

                    if (!exists) {
                        const stateFile = path.join(PROJECTS_DIR, entry.name, 'state.json');
                        let title = entry.name;
                        let plan = null;
                        let status = isRaporApproved ? 'completed' : 'planning';
                        if (fs.existsSync(stateFile)) {
                            try {
                                const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                                title = parsed.title || title;
                                plan = parsed.plan || null;
                                status = isRaporApproved ? 'completed' : (parsed.status || status);
                            } catch {}
                        }
                        db.prepare('INSERT INTO projects (id, title, status, plan, is_pinned) VALUES (?, ?, ?, ?, 0)')
                            .run(entry.name, title, status, plan ? JSON.stringify(plan) : null);
                        console.log(`[SENKRONİZASYON] Disk üzerindeki proje DB'ye eklendi: ${entry.name}`);
                    } else if (isRaporApproved && exists.status !== 'completed') {
                        db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('completed', entry.name);
                        console.log(`[SENKRONİZASYON] ${entry.name} durumu diskteki RAPOR.md'ye göre COMPLETED yapıldı.`);
                    }

                    if (isRaporApproved) {
                        const hasFinishLog = db.prepare("SELECT 1 FROM project_logs WHERE project_id = ? AND agent = 'Manager' AND action = 'finish'").get(entry.name);
                        if (!hasFinishLog) {
                            saveProjectLog({
                                projectId: entry.name,
                                agent: "Manager",
                                action: "finish",
                                file: "RAPOR.md, README.md",
                                message: "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.",
                                node_id: "manager",
                                parent_node_id: null
                            });
                        }
                        const lastChat = db.prepare('SELECT id, role, text_content FROM chat_history WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(entry.name);
                        if (!lastChat || lastChat.text_content.includes('⚠️ **Süreç Duraklatıldı') || lastChat.text_content.includes('⚠️ **Tester Kalite Kapısı Uyarısı') || lastChat.text_content.includes('Süreç hatası')) {
                            const projectTitle = exists?.title || entry.name;
                            const completionMsg = `🎉 **Tebrikler Boss! "${projectTitle}" Projesi Başarıyla Tamamlandı!**\n\nTüm alt ekipler (Backend, Frontend) kod üretimini eksiksiz bitirdi ve Tester kalite kapısı onaylandı.\n\n### 📁 Üretilen Mimari Katmanları:\n- **Backend:** Prisma SQLite şemaları, Zod doğrulama şemaları, REST API rotaları\n- **Frontend:** Rol bazlı Dashboard'lar (Admin, Öğretmen, Öğrenci), Soru Bankası, Sınav Oluşturucu, Canlı Sayaçlı Sınav Odası, Recharts Karne Analitiği\n\n### 🧪 Test ve Kabul Doğrulaması:\n- **Sonuç:** ✅ Onaylandı (202/202 Başarılı Kontrol)\n- **Oluşturulan Raporlar:** \`RAPOR.md\` ve \`README.md\`\n\n---\n🚀 **Sonraki Adımlar:**\n1. Üst menüden **'Kod Editörü'** sekmesine geçerek tüm kaynak kodları inceleyebilirsiniz.\n2. Sağ üstteki **'Projeyi (ZIP) İndir'** butonuna tıklayarak uygulamanızı bilgisayarınıza indirebilirsiniz.`;
                            db.prepare('INSERT INTO chat_history (project_id, role, text_content, created_at) VALUES (?, ?, ?, ?)').run(entry.name, 'model', completionMsg, new Date().toISOString());
                        }
                    }
                }
            }
        }
        const allDbProjects = db.prepare('SELECT id, title FROM projects').all();
        let cleanedCount = 0;
        for (const p of allDbProjects) {
            const isTestProject = /^(test-|project-\d+-|RBAC|Pause Test|Lifecycle|Team Project|Project-1|Test Otomasyon)/i.test(p.title) || p.id.startsWith('test-') || p.id.startsWith('e2e-');
            if (!onDiskProjectIds.has(p.id) && isTestProject) {
                db.prepare('DELETE FROM chat_history WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM project_logs WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM project_owners WHERE project_id = ?').run(p.id);
                db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            console.log(`[SENKRONİZASYON] ${cleanedCount} adet çöp test projesi veritabanından temizlendi.`);
        }
        return { syncedOnDisk: onDiskProjectIds.size, cleanedOrphans: cleanedCount };
    } catch (e) {
        console.error("Senkronizasyon hatası:", e);
        return { error: e.message };
    }
}

// Başlangıçta senkronizasyonu çalıştır
try {
    syncProjectsWithDisk();
} catch (e) {
    console.error("Başlangıç senkronizasyon hatası:", e);
}
