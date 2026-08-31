/**
 * XFactor Dosya-Bazlı Ajan Koordinasyon Protokolü ("Agent = Klasör")
 * Referans: docs/ORKESTRASYON-TALIMATNAMESI.md
 */

import fs from 'fs/promises';
import path from 'path';
import { logWarning } from '../observability.js';
import { normalizeGeneratedIdentifier } from '../generatedIdentifiers.js';
import { db } from '../db.js';
import { getLatestCheckpoint } from './checkpointRepository.js';
import { verifyTaskCheckpoint } from './checkpointHelper.js';
import { writeGeneratedFiles as writeProjectFiles } from './codeGenerator.js';
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

    const cleanPrefix = normalizeGeneratedIdentifier(domainPrefix);
    const directorDir = path.join(baseDir, `${cleanPrefix}.director`);
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
    const cleanTlName = normalizeGeneratedIdentifier(tlName);
    const tlDir = path.join(directorDir, cleanTlName);
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
    const cleanTaskId = normalizeGeneratedIdentifier(taskId);
    const coderDir = path.join(tlDir, cleanTaskId);
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

export async function isTaskCompleted(
    coderDir,
    projectDir = null,
    targetFiles = [],
    options = {}
) {
    try {
        const { projectId, taskId } = options;
        if (projectId && taskId) {
            const checkpoint = db.prepare(`
                SELECT invalidated_at FROM task_checkpoints
                WHERE project_id = ? AND task_id = ?
                ORDER BY created_at DESC
                LIMIT 1
            `).get(projectId, taskId);

            if (checkpoint && checkpoint.invalidated_at !== null) {
                return false;
            }
        }

        const durum = await readDurum(coderDir);
        if (durum && (durum.includes('BASARISIZ') || durum.includes('REDDEDILDI'))) {
            return false;
        }

        const raporExists = await fs.stat(path.join(coderDir, 'RAPOR.md'))
            .then(() => true)
            .catch(() => false);
        const durumCompleted = Boolean(durum && durum.includes('TAMAMLANDI'));

        if (!raporExists && !durumCompleted) {
            return false;
        }

        if (projectDir && Array.isArray(targetFiles) && targetFiles.length > 0) {
            for (const relPath of targetFiles) {
                if (typeof relPath === 'string' && relPath.trim()) {
                    const fullPath = path.join(projectDir, relPath);
                    const fileExists = await fs.stat(fullPath)
                        .then(stat => stat.size > 0)
                        .catch(() => false);
                    if (!fileExists) {
                        return false;
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
    } catch (error) {
        logWarning('protocol.todo_update_failed', error, { file: path.basename(todoFilePath) });
    }
}

/**
 * TODO.md içerisindeki tamamlanmış görevin işaretini kaldırır ([- [ ]])
 */
export async function uncheckTodoItem(todoFilePath, taskIdOrName) {
    try {
        let content = await fs.readFile(todoFilePath, 'utf8');
        const escaped = taskIdOrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`- \\[x\\] (.*${escaped}.*)`, 'gi');
        content = content.replace(regex, '- [ ] $1');
        await fs.writeFile(todoFilePath, content, 'utf8');
    } catch (error) {
        logWarning('protocol.todo_uncheck_failed', error, { file: path.basename(todoFilePath) });
    }
}

/**
 * Bir görevin geçersiz kılınan dosya sistemi önbelleğini (DURUM.md ve TODO.md) senkronize eder.
 */
export async function reconcileTaskCache(projectDir, taskId, task = {}) {
    try {
        const domain = task.domain || 'core';
        const coderFolder = normalizeGeneratedIdentifier(taskId, 'coder_task');
        const candidateDirs = [
            path.join(projectDir, domain, coderFolder),
            path.join(projectDir, coderFolder),
            path.join(projectDir, domain, `coder_${taskId}`),
            path.join(projectDir, `coder_${taskId}`)
        ];

        for (const dir of candidateDirs) {
            try {
                await fs.access(dir);
                await writeDurum(dir, 'YENIDEN_BASLATILDI', 'Checkpoint gecersiz kilindi veya degistirildi; gorev yeniden calistirilacak.');
            } catch {}
        }

        // Root TODO.md, domain TODO.md, manager TODO.md dosyalarını tara ve uncheck yap
        const candidateTodos = [
            path.join(projectDir, 'TODO.md'),
            path.join(projectDir, domain, 'TODO.md'),
            path.join(projectDir, 'manager', 'TODO.md')
        ];

        for (const todoPath of candidateTodos) {
            try {
                await fs.access(todoPath);
                await uncheckTodoItem(todoPath, taskId);
            } catch {}
        }
    } catch (error) {
        logWarning('protocol.reconcile_cache_failed', error, { taskId });
    }
}

/**
 * Görevin CAS kontrolüyle veritabanındaki geçerli checkpoint ile eşleşip eşleşmediğini doğrular.
 */
export async function isTaskCheckpointValid(projectDir, projectId, task, options = {}) {
    try {
        const checkpoint = getLatestCheckpoint(projectId, task.id);
        if (!checkpoint) return false;

        return await verifyTaskCheckpoint({
            projectDir,
            checkpoint,
            task,
            planHash: options.planHash,
            dependencyTargetFiles: options.dependencyTargetFiles || [],
            gateVersion: options.gateVersion || '1.0.0'
        });
    } catch {
        return false;
    }
}

function isConfigurationPath(filePath) {
    const normalizedPath = path.normalize(filePath).replace(/\\/g, '/').toLowerCase();
    const fileName = normalizedPath.split('/').pop();
    return (
        fileName === 'package.json' ||
        fileName.endsWith('.prisma') ||
        /^(?:ts|js)config(?:\.[^/]+)*\.json$/.test(fileName) ||
        /\.config\.(?:js|cjs|mjs|ts|cts|mts|json)$/.test(fileName) ||
        /^\.(?:eslintrc|prettierrc)(?:\.[^/]+)?$/.test(fileName)
    );
}

export async function writeGeneratedFiles(taskContext = {}, files = []) {
    function outOfScope(target = 'unknown') {
        const error = new Error(
            `OUT_OF_SCOPE_MUTATION: Repair target "${target}" is not in the active task allowlist`
        );
        error.code = 'OUT_OF_SCOPE_MUTATION';
        return error;
    }

    if (!taskContext || typeof taskContext !== 'object') {
        throw outOfScope();
    }

    const allowedFiles = Array.isArray(taskContext.allowedFiles)
        ? taskContext.allowedFiles
        : (Array.isArray(taskContext.targetFiles) ? taskContext.targetFiles : []);
    if (allowedFiles.some(filePath => typeof filePath !== 'string' || filePath.length === 0)) {
        throw outOfScope();
    }

    const allowedSet = new Set(
        allowedFiles.map(filePath => path.normalize(filePath).replace(/\\/g, '/'))
    );

    for (const file of files) {
        const normalizedPath = typeof file?.path === 'string'
            ? path.normalize(file.path).replace(/\\/g, '/')
            : '';
        if (!normalizedPath || !allowedSet.has(normalizedPath)) {
            throw outOfScope(file?.path);
        }
    }

    if (taskContext.allowConfigMutation !== true) {
        for (const file of files) {
            if (isConfigurationPath(file.path)) {
                const error = new Error(
                    `UNAPPROVED_CONFIG_MUTATION: Repair cannot modify "${file.path}" without planner approval`
                );
                error.code = 'UNAPPROVED_CONFIG_MUTATION';
                throw error;
            }
        }
    }

    return writeProjectFiles(
        taskContext.projectDir,
        taskContext.coderDir || null,
        files,
        allowedFiles
    );
}
