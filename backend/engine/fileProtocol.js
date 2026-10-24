/**
 * XFactor Dosya-Bazlı Ajan Koordinasyon Protokolü ("Agent = Klasör")
 * Referans: x-agents/ORKESTRASYON-TALIMATNAMESI.md
 */

import path from 'path';
import fsSync from 'node:fs';
import { assertProtocolPath, ensureProtocolDir, readProtocolFile, writeProtocolFile } from './protocolIO.js';
import { canonicalizeTaskDependencies } from './dag.js';
import { normalizeGeneratedIdentifier } from '../generatedIdentifiers.js';
import { getLatestCheckpoint } from './checkpointRepository.js';
import { verifyTaskCheckpoint, computeTaskSpecHash } from './checkpointHelper.js';
import { qualifiedTaskId } from './checkpointIdentity.js';
import { writeGeneratedFiles as writeProjectFiles } from './codeGenerator.js';
/**
 * Belirtilen dizinin varlığını garanti eder
 */
export async function ensureDir(dirPath, options = {}) {
    return ensureProtocolDir(dirPath, options);
}

/**
 * Kök dizinde TALIMATNAME.md ve TODO.md oluşturur
 */
export async function setupRootProtocol(projectDir, talimatnameContent, domains = [], options = {}) {
    options = { ...options, projectDir };
    await ensureDir(projectDir, options);

    // Manager Ajanına Özel Klasör (Agent = Klasör İlkesi - Hiyerarşinin Kökü)
    const managerDir = path.join(projectDir, 'manager');
    await ensureDir(managerDir, options);

    const talimatBody = talimatnameContent || '# Proje Talimatnamesi\n';

    // 1. TALIMATNAME.md
    const managerTalimatPath = path.join(managerDir, 'TALIMATNAME.md');
    await writeProtocolFile(managerTalimatPath, talimatBody, options);

    // 2. GOREV.md (Manager için)
    const gorevContent = `# Görev: Manager (Orkestratör)\n\nProje mimarisini tasarla, domainleri belirle ve direktör ajanlarını koordine et.\n`;
    await writeProtocolFile(path.join(managerDir, 'GOREV.md'), gorevContent, options);

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
    try {
        await writeProtocolFile(managerTodoPath, todoContent, { ...options, exclusive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }

    // 4. DURUM.md
    if (await readProtocolFile(path.join(managerDir, 'DURUM.md'), options) === null) {
        await writeDurum(managerDir, 'BASLADI', 'Manager mimari planı hazırladı, direktör katmanına devrediliyor.', options);
    }

    return { talimatPath: managerTalimatPath, todoPath: managerTodoPath, managerDir };
}

/**
 * Director seviyesi klasör ve protokol dosyalarını oluşturur (Manager altında yuvalanır)
 */
export async function setupDirectorProtocol(managerOrProjectDir, domainPrefix, gorevContent, altTalimatnameContent, teamleaders = [], options = {}) {
    assertProtocolPath(managerOrProjectDir, options, true);
    let baseDir = managerOrProjectDir;
    if (!baseDir.endsWith('manager') && !baseDir.endsWith('manager/') && !baseDir.endsWith('manager\\')) {
        baseDir = path.join(baseDir, 'manager');
    }
    options = { ...options, projectDir: options.projectDir || (path.basename(baseDir) === 'manager' ? path.dirname(baseDir) : baseDir) };
    await ensureDir(baseDir, options);

    const cleanPrefix = normalizeGeneratedIdentifier(domainPrefix);
    const directorDir = path.join(baseDir, `${cleanPrefix}.director`);
    await ensureDir(directorDir, options);

    // GOREV.md
    await writeProtocolFile(path.join(directorDir, 'GOREV.md'), gorevContent, options);

    // ALT-TALIMATNAME.md
    await writeProtocolFile(path.join(directorDir, 'ALT-TALIMATNAME.md'), altTalimatnameContent, options);

    // TODO.md (Director Seviyesi)
    let todoContent = `# TODO — ${domainPrefix}.director\n\n| # | Teamleader | Klasör | Durum |\n|---|---|---|---|\n`;
    teamleaders.forEach((tl, i) => {
        todoContent += `| ${i + 1} | ${tl.name} | ${normalizeGeneratedIdentifier(tl.prefix || tl.name)}/ | bekliyor |\n`;
    });
    todoContent += `\n## Durum Çizelgesi\n`;
    teamleaders.forEach((tl, i) => {
        todoContent += `- [ ] ${i + 1}. ${tl.name} (${normalizeGeneratedIdentifier(tl.prefix || tl.name)}/)\n`;
    });
    await writeProtocolFile(path.join(directorDir, 'TODO.md'), todoContent, options);

    // DURUM.md
    await writeDurum(directorDir, 'BASLADI', `${domainPrefix} director şartnameyi hazırladı.`, options);

    return directorDir;
}

/**
 * Teamleader seviyesi klasör ve protokol dosyalarını oluşturur
 */
export async function setupTeamleaderProtocol(directorDir, tlName, gorevContent, tasks = [], options = {}) {
    assertProtocolPath(directorDir, options, true);
    const cleanTlName = normalizeGeneratedIdentifier(tlName);
    const tlDir = path.join(directorDir, cleanTlName);
    await ensureDir(tlDir, options);
    // GOREV.md
    await writeProtocolFile(path.join(tlDir, 'GOREV.md'), gorevContent, options);

    // TODO.md (Teamleader Seviyesi)
    let todoContent = `# TODO — ${tlName}\n\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n`;
    tasks.forEach((t, i) => {
        const deps = canonicalizeTaskDependencies(t.dependencies || []).join(', ') || '—';
        todoContent += `| ${i + 1} | ${t.id} | ${t.title} | ${deps} | bekliyor |\n`;
    });
    todoContent += `\n## Checkbox Görünümü\n`;
    tasks.forEach((t, i) => {
        todoContent += `- [ ] ${i + 1}. ${t.title} → \`${t.id}/\`\n`;
    });
    await writeProtocolFile(path.join(tlDir, 'TODO.md'), todoContent, options);

    // DURUM.md
    await writeDurum(tlDir, 'BASLADI', `${tlName} görevleri atomik parçalara ayırdı.`, options);

    return tlDir;
}

/**
 * Coder seviyesi klasör ve protokol dosyalarını oluşturur
 */
export async function setupCoderProtocol(tlDir, taskId, taskTitle, gorevContent, options = {}) {
    assertProtocolPath(tlDir, options, true);
    const cleanTaskId = normalizeGeneratedIdentifier(taskId);
    const coderDir = path.join(tlDir, cleanTaskId);
    await ensureDir(coderDir, options);
    // GOREV.md
    await writeProtocolFile(path.join(coderDir, 'GOREV.md'), gorevContent, options);

    // DURUM.md
    await writeDurum(coderDir, 'CALISIYOR', `Coder "${taskTitle}" görevine başladı.`, options);

    return coderDir;
}

/**
 * DURUM.md dosyasını günceller
 */
export async function writeDurum(folderPath, durum, detay = '', options = {}) {
    assertProtocolPath(folderPath, options, true);
    const durumFile = path.join(folderPath, 'DURUM.md');
    const content = `# DURUM\n\n- **Durum:** ${durum}\n- **Son Güncelleme:** ${new Date().toISOString()}\n- **Detay:** ${detay}\n`;
    await writeProtocolFile(durumFile, content, options);
}

/**
 * DURUM.md dosyasını okur
 */
export async function readDurum(folderPath, options = {}) {
    try { assertProtocolPath(folderPath, options, true); }
    catch (error) { if (options.strict) throw error; return null; }
    return readProtocolFile(path.join(folderPath, 'DURUM.md'), { strict: false, ...options });
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

export async function readTasksFromTodoFile(todoFilePath, options = {}) {
    return parseTasksFromTodoContent(await readProtocolFile(todoFilePath, options));
}

export async function isTaskCompleted(
    coderDir,
    projectDir = null,
    targetFiles = [],
    options = {}
) {
    try {
        if (options.projectId) {
            // Filesystem summaries cannot substitute for missing DB authority.
            if (!projectDir || !options.task) return false;
            return await isTaskCheckpointValid(projectDir, options.projectId, options.task, options);
        }

        const durum = await readDurum(coderDir, { ...options, projectDir: projectDir || options.projectDir, strict: true });
        if (durum && (durum.includes('BASARISIZ') || durum.includes('REDDEDILDI') || durum.includes('YENIDEN_BASLATILDI'))) {
            return false;
        }

        const raporExists = await readProtocolFile(path.join(coderDir, 'RAPOR.md')) !== null;
        const durumCompleted = Boolean(durum && durum.includes('TAMAMLANDI'));

        if (!raporExists && !durumCompleted) {
            return false;
        }

        if (projectDir && Array.isArray(targetFiles) && targetFiles.length > 0) {
            for (const relPath of targetFiles) {
                if (typeof relPath === 'string' && relPath.trim()) {
                    if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) return false;
                    const fullPath = assertProtocolPath(path.join(projectDir, relPath), { projectDir });
                    const fileExists = fsSync.statSync(fullPath).size > 0;
                    if (!fileExists) {
                        return false;
                    }
                }
            }
        }

        return true;
    } catch (error) {
        if (error.code === 'CHECKPOINT_READ_FAILED') throw error;
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

export async function readAltTalimatname(directorDir, options = {}) {
    assertProtocolPath(directorDir, options, true);
    return readProtocolFile(path.join(directorDir, 'ALT-TALIMATNAME.md'), options);
}

/**
 * RAPOR.md dosyasını kaydeder
 */
export async function writeRapor(folderPath, reportContent, options = {}) {
    assertProtocolPath(folderPath, options, true);
    const raporFile = path.join(folderPath, 'RAPOR.md');
    await writeProtocolFile(raporFile, reportContent, options);
}

/**
 * TODO.md içerisindeki görevi tamamlandı ([x]) olarak işaretler
 */
const todoMutations = new Map();

function updateTodoItem(todoFilePath, selector, checked, options = {}) {
    const resolvedPath = assertProtocolPath(todoFilePath, options);
    const key = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    const previous = todoMutations.get(key) || Promise.resolve();
    const mutation = previous.catch(() => {}).then(async () => {
        let content = await readProtocolFile(resolvedPath, options);
        if (content === null) {
            if (!selector?.restore) return { matched: false, missing: true };
            content = '# TODO\n\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n';
        }
        const result = editTodoContent(content, selector, checked);
        if (result.changed) await writeProtocolFile(resolvedPath, result.content, options);
        return { matched: result.matched, changed: result.changed };
    });
    todoMutations.set(key, mutation);
    return mutation.finally(() => {
        if (todoMutations.get(key) === mutation) todoMutations.delete(key);
    });
}

export async function checkTodoItem(todoFilePath, taskIdOrName, options = {}) {
    return updateTodoItem(todoFilePath, taskIdOrName, true, options);
}

/**
 * TODO.md içerisindeki tamamlanmış görevin işaretini kaldırır ([- [ ]])
 */
export async function uncheckTodoItem(todoFilePath, taskIdOrName, options = {}) {
    return updateTodoItem(todoFilePath, taskIdOrName, false, options);
}

// Table and checkbox are changed in one queued mutation. Explicit locators own
// checkbox identity; stale numbering never selects a different task or folder.
export function editTodoContent(content, selector, checked) {
    const lines = content.split('\n');
    const structured = selector && typeof selector === 'object';
    const rows = lines.map((line, index) => ({ index, cells: line.trim().split('|').slice(1, -1).map(cell => cell.trim()) }))
        .filter(row => /^\d+$/.test(row.cells[0] || ''));
    const matches = rows.filter(({ cells }) => structured
        ? selector.kind === 'task' ? cells[1] === selector.id
            : cells[2] === `${selector.folder}/`
                || (selector.name && cells[1] === selector.name && cells[2] === `${selector.name}/`)
        : cells[1] === selector || cells[2] === `${selector}/` || (cells.length >= 5 && cells[2] === selector));
    if (matches.length > 1) throw Object.assign(new Error('Ambiguous protocol TODO identity'), { code: 'PROTOCOL_IDENTITY_AMBIGUOUS' });
    let row = matches[0];
    const taskRow = structured ? selector.kind === 'task' : row?.cells.length >= 5;
    const locator = structured ? (taskRow ? selector.id : selector.folder)
        : row ? (taskRow ? row.cells[1] : row.cells[2].replace(/\/$/, '')) : selector;
    const labelColumn = taskRow ? 2 : 1;
    const rowLabel = row?.cells[labelColumn];
    const checkboxItems = lines.map((line, index) => {
        const match = line.match(/^- \[[ xX]\] (.*)$/);
        if (!match) return null;
        const body = match[1];
        const ordinal = body.match(/^(\d+)\.\s*/)?.[1];
        const label = body.replace(/^\d+\.\s*/, '').trim();
        const explicitLocator = label.match(/→\s*`([^`]+)\/`\s*$/)?.[1]
            || label.match(/\(([^()]+)\/\)\s*$/)?.[1];
        return { index, body, ordinal, label, explicitLocator };
    }).filter(Boolean);
    const checkboxes = checkboxItems.filter(item => {
        if (item.explicitLocator) return item.explicitLocator === locator;
        // Old task-ID labels are exact identity too (task-1 never task-10).
        if ((taskRow || (!structured && !row)) && (item.label.startsWith(`${locator}:`) || item.label === locator
            || item.label.endsWith(`(${locator})`))) return true;
        if (!row || item.label !== rowLabel) return false;
        // Legacy folder/title-only checkboxes need a unique label in the table.
        // An ordinal cannot disambiguate duplicate labels after partial recovery.
        if (rows.filter(candidate => candidate.cells[labelColumn] === rowLabel).length !== 1) {
            throw Object.assign(new Error('Ambiguous protocol TODO legacy label'), { code: 'PROTOCOL_IDENTITY_AMBIGUOUS' });
        }
        return true;
    });
    if (checkboxes.length > 1) throw Object.assign(new Error('Ambiguous protocol TODO checkbox'), { code: 'PROTOCOL_IDENTITY_AMBIGUOUS' });

    let checkbox = checkboxes[0];
    let restoredRow = null;
    let restoredCheckbox = null;
    if (structured && taskRow && selector.restore) {
        const occupied = new Set([
            ...rows.filter(candidate => candidate !== row).map(candidate => Number(candidate.cells[0])),
            ...checkboxItems.filter(candidate => candidate !== checkbox).map(candidate => Number(candidate.ordinal))
        ].filter(Number.isFinite));
        const preferred = Number(row?.cells[0] || checkbox?.ordinal);
        const ordinal = preferred > 0 && !occupied.has(preferred) ? preferred
            : Math.max(0, ...occupied, ...rows.map(candidate => Number(candidate.cells[0])),
                ...checkboxItems.map(candidate => Number(candidate.ordinal) || 0)) + 1;
        const title = String(selector.title || row?.cells[2] || selector.id).replace(/[|\r\n]/g, ' ');
        if (!row) {
            restoredRow = { cells: [String(ordinal), selector.id, title, '—', 'bekliyor'] };
            row = restoredRow;
        } else row.cells[0] = String(ordinal);
        if (!checkbox) {
            restoredCheckbox = { body: `${ordinal}. ${title} → \`${selector.id}/\`` };
            checkbox = restoredCheckbox;
        } else if (checkbox.ordinal) {
            checkbox.body = `${ordinal}. ${checkbox.label}`;
        }
    }
    if (row) {
        row.cells[row.cells.length - 1] = checked ? 'tamamlandi' : 'bekliyor';
        if (!restoredRow) lines[row.index] = `| ${row.cells.join(' | ')} |`;
    }
    if (checkbox && !restoredCheckbox) lines[checkbox.index] = `- [${checked ? 'x' : ' '}] ${checkbox.body}`;
    if (restoredRow) {
        const tableEnd = rows.length ? rows[rows.length - 1].index
            : lines.findIndex(line => /^\|[-|\s]+\|$/.test(line.trim()));
        lines.splice(tableEnd < 0 ? lines.length : tableEnd + 1, 0, `| ${restoredRow.cells.join(' | ')} |`);
    }
    if (restoredCheckbox) lines.push(`- [${checked ? 'x' : ' '}] ${restoredCheckbox.body}`);
    const updated = lines.join('\n');
    return { content: updated, changed: updated !== content, matched: Boolean(row || checkbox) };
}

/** Explicit runtime ownership; never discover a task by scanning local IDs. */
export async function reconcileTaskCache(context) {
    const { projectDir, localTaskId, teamleaderId, domainPrefix, teamleaderPrefix, checkpointValid } = context || {};
    for (const value of [localTaskId, domainPrefix, teamleaderPrefix]) {
        if (typeof value !== 'string' || !value || normalizeGeneratedIdentifier(value) !== value) {
            throw Object.assign(new Error('Invalid protocol task identity'), { code: 'PROTOCOL_IDENTITY_INVALID' });
        }
    }
    if (teamleaderId !== `${domainPrefix}.${teamleaderPrefix}` || typeof checkpointValid !== 'boolean') {
        throw Object.assign(new Error('Explicit protocol task ownership required'), { code: 'PROTOCOL_IDENTITY_INVALID' });
    }
    const options = { projectDir, sourceFence: context.sourceFence };
    assertProtocolPath(projectDir, options, true);
    const managerDir = path.join(projectDir, 'manager');
    const directorDir = path.join(managerDir, `${domainPrefix}.director`);
    const teamleaderDir = path.join(directorDir, teamleaderPrefix);
    const coderDir = path.join(teamleaderDir, localTaskId);
    for (const [key, expected] of Object.entries({ managerDir, directorDir, teamleaderDir, coderDir })) {
        if (context[key] && path.resolve(context[key]) !== path.resolve(expected)) {
            throw Object.assign(new Error('Protocol location disagrees with task ownership'), { code: 'PROTOCOL_IDENTITY_INVALID' });
        }
        assertProtocolPath(expected, options, true);
    }
    const reset = 'Checkpoint gecersiz veya eksik; gorev yeniden calistirilacak.';
    await writeDurum(coderDir, checkpointValid ? 'TAMAMLANDI' : 'YENIDEN_BASLATILDI', checkpointValid ? 'Gecerli checkpoint dogrulandi.' : reset, options);
    const results = [await updateTodoItem(path.join(teamleaderDir, 'TODO.md'), { kind: 'task', id: localTaskId,
        title: context.task?.title, restore: checkpointValid }, checkpointValid, options)];
    if (!checkpointValid) {
        // No positive ancestor inference from old DURUM/TODO or reports. Runtime
        // promotes these only after every owned child has valid reviewed evidence.
        for (const dir of [teamleaderDir, directorDir, managerDir]) await writeDurum(dir, 'YENIDEN_BASLATILDI', reset, options);
        results.push(await updateTodoItem(path.join(directorDir, 'TODO.md'), { kind: 'folder', folder: teamleaderPrefix, name: context.teamleaderName }, false, options));
        results.push(await updateTodoItem(path.join(managerDir, 'TODO.md'), { kind: 'folder', folder: `${domainPrefix}.director` }, false, options));
        results.push(await updateTodoItem(path.join(projectDir, 'TODO.md'), { kind: 'folder', folder: `${domainPrefix}.director` }, false, options));
    }
    return { checkpointValid, results };
}

/**
 * Görevin CAS kontrolüyle veritabanındaki geçerli checkpoint ile eşleşip eşleşmediğini doğrular.
 */
export async function isTaskCheckpointValid(projectDir, projectId, task, options = {}) {
    try {
        const checkpoint = getLatestCheckpoint(projectId, task.id, { ...options, taskSpecHash: computeTaskSpecHash(task) });
        if (!checkpoint) return false;
        if (options.contractId && checkpoint.contract_id !== options.contractId) return false;

        const acceptanceRetry = options.allowAcceptanceRetry === true
            && checkpoint.status === 'completed'
            && checkpoint.invalidated_at !== null
            && checkpoint.invalidation_reason === null;

        return await verifyTaskCheckpoint({
            projectDir,
            checkpoint: acceptanceRetry ? { ...checkpoint, invalidated_at: null } : checkpoint,
            task,
            expectedIdentity: options.teamleaderId ? { projectId, contractId: options.contractId,
                taskIds: [qualifiedTaskId({ contractId: options.contractId, teamleaderId: options.teamleaderId, localTaskId: task.id }),
                    ...(checkpoint.task_identity_version === 0 ? [task.id] : [])] } : null,
            planHash: options.planHash,
            dependencyTargetFiles: options.dependencyTargetFiles || [],
            gateVersion: options.gateVersion || '1.0.0'
        });
    } catch (cause) {
        // An unreadable checkpoint store is not a cache miss: retrying paid
        // generation here could regenerate every completed task during an outage.
        const error = new Error(`Görev checkpoint kaydı doğrulanamadı (${task?.id || 'unknown'}); yeniden üretim güvenle durduruldu.`, { cause });
        error.code = 'CHECKPOINT_READ_FAILED';
        throw error;
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
        allowedFiles,
        taskContext.sourceFence || null
    );
}
