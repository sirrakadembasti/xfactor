/**
 * XFactor Dosya-Bazlı Ajan Koordinasyon Protokolü ("Agent = Klasör")
 * Referans: docs/ORKESTRASYON-TALIMATNAMESI.md
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Belirtilen dizinin varlığını garanti eder
 */
export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
}

/**
 * Kök dizinde TALIMATNAME.md ve TODO.md oluşturur
 */
export async function setupRootProtocol(projectDir, talimatnameContent, domains = []) {
    await ensureDir(projectDir);

    // Manager Ajanına Özel Klasör (Agent = Klasör İlkesi - Hiyerarşinin Kökü)
    const managerDir = path.join(projectDir, 'manager');
    await ensureDir(managerDir);

    const talimatBody = talimatnameContent || '# Proje Talimatnamesi\n';

    // 1. TALIMATNAME.md
    const managerTalimatPath = path.join(managerDir, 'TALIMATNAME.md');
    await fs.writeFile(managerTalimatPath, talimatBody, 'utf8');

    // 2. GOREV.md (Manager için)
    const gorevContent = `# Görev: Manager (Orkestratör)\n\nProje mimarisini tasarla, domainleri belirle ve direktör ajanlarını koordine et.\n`;
    await fs.writeFile(path.join(managerDir, 'GOREV.md'), gorevContent, 'utf8');

    // 3. TODO.md (Manager Seviyesi)
    let todoContent = `# TODO — Manager (Proje Yönetimi)\n\n| # | Domain / Director | Klasör | Durum |\n|---|---|---|---|\n`;
    domains.forEach((d, i) => {
        todoContent += `| ${i + 1} | ${d.name || d} | ${d.prefix || d}.director/ | bekliyor |\n`;
    });
    todoContent += `\n## Durum Çizelgesi\n`;
    domains.forEach((d, i) => {
        todoContent += `- [ ] ${i + 1}. ${d.name || d} (${d.prefix || d}.director/)\n`;
    });

    const managerTodoPath = path.join(managerDir, 'TODO.md');
    await fs.writeFile(managerTodoPath, todoContent, 'utf8');

    // 4. DURUM.md
    await writeDurum(managerDir, 'BASLADI', 'Manager mimari planı hazırladı, direktör katmanına devrediliyor.');

    return { talimatPath: managerTalimatPath, todoPath: managerTodoPath, managerDir };
}

/**
 * Director seviyesi klasör ve protokol dosyalarını oluşturur (Manager altında yuvalanır)
 */
export async function setupDirectorProtocol(managerOrProjectDir, domainPrefix, gorevContent, altTalimatnameContent, teamleaders = []) {
    let baseDir = managerOrProjectDir;
    if (!baseDir.endsWith('manager') && !baseDir.endsWith('manager/') && !baseDir.endsWith('manager\\')) {
        baseDir = path.join(baseDir, 'manager');
    }
    await ensureDir(baseDir);

    const directorDir = path.join(baseDir, `${domainPrefix}.director`);
    await ensureDir(directorDir);

    // GOREV.md
    await fs.writeFile(path.join(directorDir, 'GOREV.md'), gorevContent, 'utf8');

    // ALT-TALIMATNAME.md
    await fs.writeFile(path.join(directorDir, 'ALT-TALIMATNAME.md'), altTalimatnameContent, 'utf8');

    // TODO.md (Director Seviyesi)
    let todoContent = `# TODO — ${domainPrefix}.director\n\n| # | Teamleader | Klasör | Durum |\n|---|---|---|---|\n`;
    teamleaders.forEach((tl, i) => {
        todoContent += `| ${i + 1} | ${tl.name} | ${tl.name}/ | bekliyor |\n`;
    });
    todoContent += `\n## Durum Çizelgesi\n`;
    teamleaders.forEach((tl, i) => {
        todoContent += `- [ ] ${i + 1}. ${tl.name}\n`;
    });
    await fs.writeFile(path.join(directorDir, 'TODO.md'), todoContent, 'utf8');

    // DURUM.md
    await writeDurum(directorDir, 'BASLADI', `${domainPrefix} director şartnameyi hazırladı.`);

    return directorDir;
}

/**
 * Teamleader seviyesi klasör ve protokol dosyalarını oluşturur
 */
export async function setupTeamleaderProtocol(directorDir, tlName, gorevContent, tasks = []) {
    const tlDir = path.join(directorDir, tlName);
    await ensureDir(tlDir);

    // GOREV.md
    await fs.writeFile(path.join(tlDir, 'GOREV.md'), gorevContent, 'utf8');

    // TODO.md (Teamleader Seviyesi)
    let todoContent = `# TODO — ${tlName}\n\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n`;
    tasks.forEach((t, i) => {
        const deps = t.dependencies && t.dependencies.length > 0 ? t.dependencies.join(', ') : '—';
        todoContent += `| ${i + 1} | ${t.id} | ${t.title} | ${deps} | bekliyor |\n`;
    });
    todoContent += `\n## Checkbox Görünümü\n`;
    tasks.forEach((t, i) => {
        todoContent += `- [ ] ${i + 1}. ${t.title} → \`${t.id}/\`\n`;
    });
    await fs.writeFile(path.join(tlDir, 'TODO.md'), todoContent, 'utf8');

    // DURUM.md
    await writeDurum(tlDir, 'BASLADI', `${tlName} görevleri atomik parçalara ayırdı.`);

    return tlDir;
}

/**
 * Coder seviyesi klasör ve protokol dosyalarını oluşturur
 */
export async function setupCoderProtocol(tlDir, taskId, taskTitle, gorevContent) {
    const coderDir = path.join(tlDir, taskId);
    await ensureDir(coderDir);

    // GOREV.md
    await fs.writeFile(path.join(coderDir, 'GOREV.md'), gorevContent, 'utf8');

    // DURUM.md
    await writeDurum(coderDir, 'CALISIYOR', `Coder "${taskTitle}" görevine başladı.`);

    return coderDir;
}

/**
 * DURUM.md dosyasını günceller
 */
export async function writeDurum(folderPath, durum, detay = '') {
    const durumFile = path.join(folderPath, 'DURUM.md');
    const content = `# DURUM\n\n- **Durum:** ${durum}\n- **Son Güncelleme:** ${new Date().toISOString()}\n- **Detay:** ${detay}\n`;
    await fs.writeFile(durumFile, content, 'utf8');
}

/**
 * DURUM.md dosyasını okur
 */
export async function readDurum(folderPath) {
    try {
        const durumFile = path.join(folderPath, 'DURUM.md');
        return await fs.readFile(durumFile, 'utf8');
    } catch {
        return null;
    }
}

/**
 * TODO.md dosyasından mevcut görev listesini ayıklar (Resume desteği için)
 */
export function parseTasksFromTodoContent(content) {
    if (typeof content !== 'string') return [];
    const tasks = [];
    const lines = content.split('\n');

    // 1. Tablo formatı: | # | ID | Başlık | Bağımlılıklar | Durum |
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && !trimmed.includes('---|---') && !trimmed.toLowerCase().includes('görev id')) {
            const parts = trimmed.split('|').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 3 && !isNaN(parseInt(parts[0], 10))) {
                const id = parts[1];
                const title = parts[2];
                const depsRaw = parts[3] || '—';
                const dependencies = depsRaw !== '—' ? depsRaw.split(',').map(d => d.trim()).filter(Boolean) : [];
                tasks.push({
                    id,
                    title,
                    description: title,
                    dependencies,
                    targetFiles: []
                });
            }
        }
    }

    if (tasks.length > 0) return tasks;

    // 2. Checkbox formatı: - [ ] 1. Title → `id/`
    for (const line of lines) {
        const match = line.match(/- \[[ xX]\] \d+\.\s*(.*?)\s*→\s*`([^`/]+)\/?`/);
        if (match) {
            const title = match[1].trim();
            const id = match[2].trim();
            tasks.push({
                id,
                title,
                description: title,
                dependencies: [],
                targetFiles: []
            });
        }
    }

    return tasks;
}

export async function readTasksFromTodoFile(todoFilePath) {
    try {
        const content = await fs.readFile(todoFilePath, 'utf8');
        return parseTasksFromTodoContent(content);
    } catch {
        return [];
    }
}

export async function isTaskCompleted(coderDir, projectDir = null, targetFiles = []) {
    try {
        const raporExists = await fs.stat(path.join(coderDir, 'RAPOR.md')).then(() => true).catch(() => false);
        const durum = await readDurum(coderDir);
        const durumCompleted = Boolean(durum && durum.includes('TAMAMLANDI'));

        if (!raporExists && !durumCompleted) {
            return false;
        }

        // Eğer projectDir ve targetFiles verilmişse, hedef dosyaların diskte gerçekten var olup olmadığını doğrula
        if (projectDir && Array.isArray(targetFiles) && targetFiles.length > 0) {
            for (const relPath of targetFiles) {
                if (typeof relPath === 'string' && relPath.trim()) {
                    const fullPath = path.join(projectDir, relPath);
                    const fileExists = await fs.stat(fullPath).then(s => s.size > 0).catch(() => false);
                    if (!fileExists) {
                        return false; // Hedef dosya diskte yoksa veya 0 byte ise tamamlanmış sayılamaz
                    }
                }
            }
        }

        return true;
    } catch {
        return false;
    }
}

export async function isFolderCompleted(folderPath) {
    try {
        const durum = await readDurum(folderPath);
        return Boolean(durum && durum.includes('TAMAMLANDI'));
    } catch {
        return false;
    }
}

export async function readAltTalimatname(directorDir) {
    try {
        const filePath = path.join(directorDir, 'ALT-TALIMATNAME.md');
        return await fs.readFile(filePath, 'utf8');
    } catch {
        return null;
    }
}

/**
 * RAPOR.md dosyasını kaydeder
 */
export async function writeRapor(folderPath, reportContent) {
    const raporFile = path.join(folderPath, 'RAPOR.md');
    await fs.writeFile(raporFile, reportContent, 'utf8');
}

/**
 * TODO.md içerisindeki görevi tamamlandı ([x]) olarak işaretler
 */
export async function checkTodoItem(todoFilePath, taskIdOrName) {
    try {
        let content = await fs.readFile(todoFilePath, 'utf8');
        const escaped = taskIdOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`- \\[ \\] (.*${escaped}.*)`, 'g');
        content = content.replace(regex, '- [x] $1');
        await fs.writeFile(todoFilePath, content, 'utf8');
    } catch (e) {
        console.warn(`TODO satırı güncellenemedi: ${todoFilePath}`, e.message);
    }
}
