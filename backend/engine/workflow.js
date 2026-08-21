/**
 * XFactor Otonom DAG İş Akışı Motoru (Workflow Engine)
 * Referans: Archon Deterministic Engine & Agency-Agents
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TaskDAG } from './dag.js';
import {
    ensureDir,
    setupRootProtocol,
    setupDirectorProtocol,
    setupTeamleaderProtocol,
    setupCoderProtocol,
    writeDurum,
    writeRapor,
    checkTodoItem,
    isTaskCompleted,
    isFolderCompleted,
    readAltTalimatname,
    readTasksFromTodoFile
} from './fileProtocol.js';
import { getAgent, runDeterministicProjectAudit } from '../agents/index.js';
import { getProjectState, saveProjectState, dbEvents, saveProjectLog } from '../db.js';
import { ensureProjectScaffold } from './codeGenerator.js';
import { executeCorrectionLoop } from './selfCorrection.js';
import { generateLLMResponse } from '../llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || path.join(__dirname, '../../projects');

export const getProjectDir = (projectId) => path.join(PROJECTS_ROOT, projectId);
export const getStatePath = (projectId) => path.join(getProjectDir(projectId), 'state.json');
export async function readProjectState(projectId) {
    try {
        return getProjectState(projectId);
    } catch (e) {
        console.error("DB Read Error:", e);
        return null;
    }
}

export async function writeProjectState(projectId, stateData) {
    const dir = getProjectDir(projectId);
    await fs.mkdir(dir, { recursive: true });
    saveProjectState(stateData);
}

export async function logEvent(wsClients, projectId, agentType, action, filePath, message, nodeId, parentNodeId = null) {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });
    const event = {
        projectId,
        timestamp: `${formattedDate} ${formattedTime}`,
        time_only: formattedTime,
        created_at: now.toISOString(),
        agent: agentType,
        action: action,
        file: filePath,
        message: message,
        node_id: nodeId,
        parent_node_id: parentNodeId
    };

    try {
        saveProjectLog(event);
    } catch (e) {
        console.error("Log kaydetme hatası:", e);
    }

    if (wsClients && wsClients.size > 0) {
        const eventString = JSON.stringify(event);
        for (const client of wsClients) {
            if (client.readyState === 1) {
                client.send(eventString);
            }
        }
    }
}

/**
 * Projenin duraklatma (pause) durumunu kontrol eder
 */
export async function checkPause(projectId) {
    let state = await readProjectState(projectId);
    if (!state || state.status !== 'paused') return state?.status;

    return new Promise((resolve) => {
        const onStateChange = (newStatus) => {
            if (newStatus !== 'paused') {
                dbEvents.off(`stateChange:${projectId}`, onStateChange);
                resolve(newStatus);
            }
        };
        dbEvents.on(`stateChange:${projectId}`, onStateChange);
    });
}

/**
 * Güvenli LLM Ajan Çağrısı
 */
async function callAgentLLM(agentRole, userPrompt) {
    const agent = getAgent(agentRole);
    const messages = [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    const rawResponse = await generateLLMResponse(messages);
    return agent.parseResponse(rawResponse);
}

/**
 * Ana Otonom İş Akışı Yürütücüsü (Workflow Engine)
 */
export async function executeProjectTasks(projectId, wsClients = new Set()) {
    const projectDir = getProjectDir(projectId);
    const state = await readProjectState(projectId);

    if (!state) return;

    try {
        await logEvent(wsClients, projectId, "Manager", "start", "", "Otonom DAG orkestrasyon süreci başlatıldı.", "manager");

        // 1. AŞAMA: MANAGER & ROOT PROTOKOLÜ
        await checkPause(projectId);
        let plan = state.plan;

        if (!plan || !plan.domains || plan.domains.length === 0) {
            const managerAgent = getAgent('manager');
            const managerPrompt = managerAgent.buildPrompt(state.title, state.chatHistory ? state.chatHistory.map(m => ({ role: m.role, content: m.parts ? m.parts[0].text : '' })) : []);
            plan = await callAgentLLM('manager', managerPrompt);
            state.plan = plan;
            await writeProjectState(projectId, state);
        }

        const domainList = plan.domains.map(d => ({
            name: typeof d === 'string' ? d : d.name,
            prefix: typeof d === 'string' ? d : (d.prefix || d.name),
            description: typeof d === 'string' ? `${d} domaini` : (d.description || `${d.name} domaini`)
        }));

        await setupRootProtocol(projectDir, plan.talimatname, domainList);
        await logEvent(wsClients, projectId, "Manager", "write", "TALIMATNAME.md", "Ana şartname ve kök TODO.md protokolü oluşturuldu.", "manager");

        const generatedProjectFiles = [];

        const managerDir = path.join(projectDir, 'manager');
        await ensureDir(managerDir);

        // 2. AŞAMA: DİREKTÖRLER (DIRECTORS - manager/ altında yuvalanır)
        for (const domain of domainList) {
            if (await checkPause(projectId) !== 'running') return;

            const directorId = `${domain.prefix}.director`;
            let directorDir = path.join(managerDir, `${domain.prefix}.director`);
            const legacyDirectorDir = path.join(projectDir, `${domain.prefix}.director`);

            let altTalimatOnDisk = await readAltTalimatname(directorDir);
            if (!altTalimatOnDisk && await readAltTalimatname(legacyDirectorDir)) {
                altTalimatOnDisk = await readAltTalimatname(legacyDirectorDir);
                directorDir = legacyDirectorDir;
            }

            // PLAN SAKLAMA / DEVAM: Eğer director şartnamesi önceden varsa tekrar LLM çağırma!
            let directorSpec = state.workflow?.directorSpecs?.[domain.prefix];
            if (!directorSpec) {
                if (altTalimatOnDisk) {
                    directorSpec = {
                        domain: domain.name,
                        altTalimatname: altTalimatOnDisk,
                        teamleaders: [{ name: `${domain.prefix}.teamleader`, prefix: domain.prefix, mission: `${domain.name} geliştirme` }]
                    };
                } else {
                    await logEvent(wsClients, projectId, "Director", "start", "", `${domain.name} Director görevi devraldı. Şartname hazırlanıyor...`, directorId, "manager");
                    const directorAgent = getAgent('director');
                    const directorPrompt = directorAgent.buildPrompt(domain.name, domain.description, plan.talimatname);
                    directorSpec = await callAgentLLM('director', directorPrompt);
                }

                if (!state.workflow) state.workflow = {};
                if (!state.workflow.directorSpecs) state.workflow.directorSpecs = {};
                state.workflow.directorSpecs[domain.prefix] = directorSpec;
                await writeProjectState(projectId, state);
            }

            const teamleaders = directorSpec.teamleaders && directorSpec.teamleaders.length > 0
                ? directorSpec.teamleaders
                : [{ name: `${domain.prefix}.teamleader`, prefix: domain.prefix, mission: `${domain.name} geliştirme` }];

            if (!altTalimatOnDisk) {
                directorDir = await setupDirectorProtocol(
                    managerDir,
                    domain.prefix,
                    `# Görev: ${domain.name}\n\n${domain.description}`,
                    directorSpec.altTalimatname,
                    teamleaders
                );
                await logEvent(wsClients, projectId, "Director", "write", "ALT-TALIMATNAME.md", `${domain.name} için ALT-TALIMATNAME.md üretildi.`, directorId, "manager");
            }
            // 3. AŞAMA: TAKIM LİDERLERİ (TEAMLEADERS)
            for (const tl of teamleaders) {
                if (await checkPause(projectId) !== 'running') return;

                const tlId = `${domain.prefix}.${tl.name}`;
                const tlDir = path.join(directorDir, tl.name);
                const tlTodoPath = path.join(tlDir, 'TODO.md');

                // PLAN SAKLAMA / DEVAM: Eğer teamleader görev planı önceden varsa tekrar LLM çağırma!
                let taskPlan = state.workflow?.teamleaderPlans?.[tlId];
                const tasksOnDisk = await readTasksFromTodoFile(tlTodoPath);

                if (!taskPlan) {
                    if (tasksOnDisk && tasksOnDisk.length > 0) {
                        taskPlan = { tasks: tasksOnDisk };
                    } else {
                        await logEvent(wsClients, projectId, "Teamleader", "start", "", `${tl.name} görevleri atomik parçalara (DAG) ayırıyor...`, tlId, directorId);
                        const tlAgent = getAgent('teamleader');
                        const tlPrompt = tlAgent.buildPrompt(tl.name, tl.mission, directorSpec.altTalimatname);
                        taskPlan = await callAgentLLM('teamleader', tlPrompt);
                    }

                    if (!state.workflow) state.workflow = {};
                    if (!state.workflow.teamleaderPlans) state.workflow.teamleaderPlans = {};
                    state.workflow.teamleaderPlans[tlId] = taskPlan;
                    await writeProjectState(projectId, state);
                }

                if (!tasksOnDisk || tasksOnDisk.length === 0) {
                    await setupTeamleaderProtocol(
                        directorDir,
                        tl.name,
                        `# Görev: ${tl.name}\n\nMisyon: ${tl.mission}`,
                        taskPlan.tasks
                    );
                }

                // 4. AŞAMA: DAG KURULUMU VE CODER / REVIEWER YÜRÜTÜCÜSÜ
                const dag = new TaskDAG();
                for (const t of taskPlan.tasks) {
                    dag.addTask({
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        dependencies: t.dependencies || [],
                        targetFiles: t.targetFiles || []
                    });
                }

                // DAG Dalgaları (Execution Waves): Bağımsız görevler paralel dalgalarda kontrollü çalışır
                const executionWaves = dag.getExecutionWaves ? dag.getExecutionWaves() : [dag.getExecutionOrder()];
                let waveHasFatalFailure = false;

                for (const wave of executionWaves) {
                    if (await checkPause(projectId) !== 'running') return;
                    if (waveHasFatalFailure) break;

                    // Eşzamanlılık Sınırlandırıcı (Max 2 LLM görevi paralel çalışır, Rate-Limit koruması)
                    const CONCURRENCY_LIMIT = 2;
                    const waveTaskResults = [];

                    const processSingleTask = async (taskId) => {
                        if (await checkPause(projectId) !== 'running') return { success: false, paused: true };

                        const task = dag.getTask(taskId);
                        const coderNodeId = `${tlId}.${taskId}`;
                        const coderDir = path.join(tlDir, taskId);

                        // AKILLI DEVAM KONTROLÜ: Görev ve hedef dosyalar daha önce başarıyla tamamlandı mı?
                        const alreadyCompleted = await isTaskCompleted(coderDir, projectDir, task.targetFiles);
                        if (alreadyCompleted) {
                            dag.setTaskStatus(taskId, 'completed');
                            await logEvent(
                                wsClients,
                                projectId,
                                "Coder",
                                "skip",
                                task.targetFiles ? task.targetFiles.join(', ') : '',
                                `Görev "${task.title}" önceden tamamlanmış, atlanıyor.`,
                                coderNodeId,
                                tlId
                            );
                            return { success: true, taskId, skipped: true };
                        }

                        await logEvent(wsClients, projectId, "Teamleader", "delegate", "", `Görev "${task.title}" Coder'a iletildi. Kod üretiliyor...`, coderNodeId, tlId);

                        await setupCoderProtocol(
                            tlDir,
                            taskId,
                            task.title,
                            `# Atomik Görev: ${task.title}\n\nAçıklama: ${task.description}\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`
                        );

                        // Yapılandırılmış Proje Bağlamı (Şemalar, Tipler, Route'lar)
                        const contextFiles = generatedProjectFiles.filter(f => 
                            f.path.includes('schema.prisma') || 
                            f.path.endsWith('.d.ts') || 
                            f.path.includes('types') || 
                            f.path.includes('validations') ||
                            f.path.includes('/api/') ||
                            f.path.includes('service')
                        );
                        let projectContext = '';
                        if (contextFiles.length > 0) {
                            projectContext = contextFiles.map(f => {
                                const snippet = f.content.length > 2000 ? f.content.slice(0, 2000) + '\n// ... [kesildi]' : f.content;
                                return `Dosya: ${f.path}\n\`\`\`\n${snippet}\n\`\`\``;
                            }).join('\n\n');
                        }

                        // Coder LLM çağrısı
                        const coderAgent = getAgent('coder');
                        const coderPrompt = coderAgent.buildPrompt(taskId, task.title, task.description, task.targetFiles, projectContext);
                        let coderOutput = await callAgentLLM('coder', coderPrompt);

                        await logEvent(wsClients, projectId, "Coder", "write", task.targetFiles.join(', '), `İlk kod bloğu üretildi. Reviewer denetim döngüsü başlatılıyor...`, coderNodeId, tlId);

                        // 5. AŞAMA: REVIEWER & SELF-CORRECTION DÖNGÜSÜ
                        const loopResult = await executeCorrectionLoop({
                            taskId,
                            taskTitle: task.title,
                            targetFiles: task.targetFiles,
                            initialCoderOutput: coderOutput,
                            coderPrompt,
                            maxRetries: 2,
                            onFeedback: async ({ iteration, feedback, summary }) => {
                                await logEvent(
                                    wsClients,
                                    projectId,
                                    "Reviewer",
                                    "feedback",
                                    "",
                                    `[${iteration}. Tur İnceleme] Düzeltme istendi: ${feedback || summary}. Coder yeniden kodluyor...`,
                                    coderNodeId,
                                    tlId
                                );
                            }
                        });

                        coderOutput = loopResult.finalOutput;

                        // VETO KONTROLÜ: Reviewer onay vermezse zarifçe fail durumuna al
                        if (!loopResult.approved) {
                            const failReason = loopResult.review?.feedback || loopResult.review?.summary || 'Reviewer kalite kapısını geçemedi.';
                            await writeDurum(coderDir, 'BASARISIZ', `Görev Reviewer tarafından reddedildi: ${failReason}`);
                            await writeRapor(coderDir, `# Hata Raporu: ${task.title}\n\nReviewer Reddi:\n${failReason}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: REDDEDILDI\n\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`);
                            dag.setTaskStatus(taskId, 'failed', { error: failReason });
                            await logEvent(
                                wsClients,
                                projectId,
                                "Reviewer",
                                "veto",
                                task.targetFiles.join(', '),
                                `[VETO] Görev "${task.title}" kalite kapısından geçemedi: ${failReason}`,
                                coderNodeId,
                                tlId
                            );
                            return { success: false, taskId, error: failReason };
                        }

                        // Nihai onaylı dosyaları hem coder klasörüne hem de proje köküne yaz
                        const writtenFiles = [];
                        for (const file of coderOutput.files) {
                            const coderFilePath = path.join(coderDir, path.basename(file.path));
                            await fs.writeFile(coderFilePath, file.content, 'utf8');

                            const rootFilePath = path.join(projectDir, file.path);
                            await fs.mkdir(path.dirname(rootFilePath), { recursive: true });
                            await fs.writeFile(rootFilePath, file.content, 'utf8');
                            writtenFiles.push({ path: file.path, content: file.content });
                        }

                        const statusDetail = `Görev başarıyla tamamlandı ve Reviewer tarafından onaylandı: ${coderOutput.summary}`;
                        await writeDurum(coderDir, 'TAMAMLANDI', statusDetail);
                        await writeRapor(coderDir, `# Rapor: ${task.title}\n\n${statusDetail}\n\nİnceleme Turları: ${loopResult.iterations}\nOnay Durumu: ONAYLANDI\n\nÜretilen Dosyalar: ${JSON.stringify(task.targetFiles)}`);
                        await checkTodoItem(path.join(tlDir, 'TODO.md'), task.title);

                        dag.setTaskStatus(taskId, 'completed', coderOutput);
                        await logEvent(
                            wsClients,
                            projectId,
                            "Coder",
                            "finish",
                            task.targetFiles.join(', '),
                            `Görev "${task.title}" tamamlandı (Reviewer Onaylı).`,
                            coderNodeId,
                            tlId
                        );

                        return { success: true, taskId, files: writtenFiles };
                    };

                    // Dalga görevlerini Concurrency Pool (Limitli Havuz) ile yürüt
                    const executing = [];
                    for (const taskId of wave) {
                        const p = processSingleTask(taskId).then(res => {
                            waveTaskResults.push(res);
                            return res;
                        });
                        executing.push(p);
                        if (executing.length >= CONCURRENCY_LIMIT) {
                            await Promise.race(executing);
                        }
                    }
                    await Promise.all(executing);

                    // Dalga tamamlandığında üretilen dosyaları atomik olarak ana listeye birleştir
                    for (const res of waveTaskResults) {
                        if (res && res.success && Array.isArray(res.files)) {
                            for (const file of res.files) {
                                const existingIdx = generatedProjectFiles.findIndex(f => f.path === file.path);
                                if (existingIdx !== -1) {
                                    generatedProjectFiles[existingIdx] = { path: file.path, content: file.content };
                                } else {
                                    generatedProjectFiles.push({ path: file.path, content: file.content });
                                }
                            }
                        } else if (res && !res.success && !res.skipped && !res.paused) {
                            waveHasFatalFailure = true;
                        }
                    }
                    if (waveHasFatalFailure) {
                        const failedList = waveTaskResults
                            .filter(r => r && !r.success && !r.skipped && !r.paused)
                            .map(r => `• [${r.taskId}] ${r.error || 'Reviewer vetosu'}`)
                            .join('\n');
                        const errorDetail = `[DALGA VETOSU] Dalga içindeki şu görevler kalite kapısından geçemedi ve veto edildi:\n${failedList}\n\nSüreç güvenli modda duraklatıldı. Manager ile mimariyi düzenleyebilir veya 'Devam Et (Resume)' butonuna basarak yeniden deneyebilirsiniz.`;
                        await logEvent(wsClients, projectId, "Workflow", "error", "", errorDetail, tlId);
                        throw new Error(`Orkestrasyon duraklatıldı: Görevler kalite kapısını geçemedi.`);
                    }
                }
                // Teamleader tamamlandı
                await writeDurum(tlDir, 'TAMAMLANDI', 'Tüm coder görevleri başarıyla tamamlandı.');
                await writeRapor(tlDir, `# Rapor: ${tl.name}\n\nDomain alt görevlerinin tamamı başarıyla üretildi.`);
                await checkTodoItem(path.join(directorDir, 'TODO.md'), tl.name);
            }

            // Director tamamlandı
            await writeDurum(directorDir, 'TAMAMLANDI', `${domain.name} domaini başarıyla tamamlandı.`);
            await writeRapor(directorDir, `# Rapor: ${domain.name} Director\n\nTüm takım lideri görevleri tamamlandı.`);
            await checkTodoItem(path.join(managerDir, 'TODO.md'), domain.name);
            if (fsSync.existsSync(path.join(projectDir, 'TODO.md'))) {
                await checkTodoItem(path.join(projectDir, 'TODO.md'), domain.name);
            }
        }

        // 6. AŞAMA: TESTER AJANI VE NİHAİ KONSOLİDE RAPOR
        if (await checkPause(projectId) === 'running') {
            await logEvent(wsClients, projectId, "Tester", "start", "", "Tüm proje kabul kriterleri Tester ajanı tarafından doğrulanıyor...", "tester", "manager");

            let deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);

            // Eğer deterministik hatalar varsa (Syntax/Prisma vb.), Coder'a 1 tur otomatik onarım döngüsü uygula
            if (!deterministicAudit.passed) {
                await logEvent(
                    wsClients,
                    projectId,
                    "Tester",
                    "feedback",
                    "",
                    `[Tester Kalite Uyarısı] Deterministik hatalar tespit edildi (${deterministicAudit.issues.join(' | ')}). Coder otomatik onarım döngüsü başlatılıyor...`,
                    "tester",
                    "manager"
                );

                const coderAgent = getAgent('coder');
                const repairPrompt = `# PROJE GENELİ ONARIM GÖREVİ: ${state.title}\n\nTester Denetiminde Aşağıdaki Kritik Hatalar Tespit Edildi:\n"""\n${deterministicAudit.issues.map(i => `- ${i}`).join('\n')}\n"""\n\nLütfen yalnızca hatalı olan dosyaları eksiksiz ve hatasız biçimde düzelterek JSON formatında yeniden üret.`;
                
                try {
                    const rawRepair = await callAgentLLM('coder', repairPrompt);
                    if (rawRepair && Array.isArray(rawRepair.files) && rawRepair.files.length > 0) {
                        for (const file of rawRepair.files) {
                            const rootFilePath = path.join(projectDir, file.path);
                            await fs.mkdir(path.dirname(rootFilePath), { recursive: true });
                            await fs.writeFile(rootFilePath, file.content, 'utf8');
                            
                            const existingIdx = generatedProjectFiles.findIndex(f => f.path === file.path);
                            if (existingIdx !== -1) {
                                generatedProjectFiles[existingIdx] = { path: file.path, content: file.content };
                            } else {
                                generatedProjectFiles.push({ path: file.path, content: file.content });
                            }
                        }
                        // Yeniden denetle
                        deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);
                    }
                } catch (repairErr) {
                    console.warn("Otomatik onarım çağrısı başarısız:", repairErr.message);
                }
            }

            const testerAgent = getAgent('tester');
            const testerPrompt = testerAgent.buildPrompt(state.title, plan.talimatname, generatedProjectFiles);
            const testResult = await callAgentLLM('tester', testerPrompt);

            if (!deterministicAudit.passed) {
                testResult.approved = false;
                testResult.issues = [...(testResult.issues || []), ...deterministicAudit.issues];
                testResult.summary = `[Kritik Hatalar Giderilemedi]: ${deterministicAudit.issues.join(' | ')}. ${testResult.summary || ''}`;
            }

            const finalRapor = `# RAPOR: ${state.title}\n\n## 1. Proje Özeti\n${plan.summary}\n\n## 2. Test & Kalite Doğrulaması\n- Sonuç: ${testResult.approved ? 'BAŞARILI' : 'REDDEDİLDİ / KRİTİK HATALAR MEVCUT'}\n- Detay: ${testResult.summary}\n${testResult.issues && testResult.issues.length > 0 ? `\n### Tespit Edilen Kritik Sorunlar:\n${testResult.issues.map(i => `- ${i}`).join('\n')}\n` : ''}\n## 3. Üretilen Dosyalar\n${generatedProjectFiles.map(f => `- \`${f.path}\``).join('\n')}\n`;
            await writeRapor(projectDir, finalRapor);

            if (!testResult.approved) {
                await writeDurum(projectDir, 'BASARISIZ', `Proje kabul testlerini geçemedi: ${testResult.summary}`);
                await logEvent(wsClients, projectId, "Tester", "error", "", `Proje kabul testlerini geçemedi: ${testResult.summary}`, "tester", "manager");
                state.status = 'failed';
                await writeProjectState(projectId, state);
                return;
            }

            await writeDurum(projectDir, 'TAMAMLANDI', 'Proje üretimi ve test doğrulaması başarıyla sonuçlandı.');
            // Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (Scaffold Guard)
            await ensureProjectScaffold(projectDir, state, plan);

            // Otomatik Çalıştırma ve Kurulum Kılavuzu (Kapsamlı README.md)
            let managerTalimat = plan.talimatname || '';
            if (!managerTalimat) {
                try {
                    const talimatPath = path.join(projectDir, 'manager', 'TALIMATNAME.md');
                    if (fsSync.existsSync(talimatPath)) {
                        managerTalimat = fsSync.readFileSync(talimatPath, 'utf8');
                    }
                } catch {}
            }

            const cleanTalimat = managerTalimat.replace(/^#\s+[^\n]+\n/, '').trim();
            const domainSummary = (plan.domains || []).map(d => `- **${typeof d === 'string' ? d : d.name}**: ${typeof d === 'string' ? d : (d.description || d.name)}`).join('\n');

            const readmeContent = `# 🚀 ${state.title}

> ${plan.summary || 'XFactor Otonom AI Ajan Orkestrasyon Platformu tarafından üretilmiştir.'}

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:

### 1. Adım: Bağımlılıkları Yükleyin
\`\`\`bash
npm install
\`\`\`

### 2. Adım: Veritabanı ve Şemayı Hazırlayın (Prisma / SQLite)
> **Not:** Projede \`.env\` dosyası hazır olarak \`DATABASE_URL="file:./dev.db"\` şeklinde tanımlıdır.
\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`

### 3. Adım: (Varsa) Tohum / Örnek Verileri Yükleyin
\`\`\`bash
npx prisma db seed
\`\`\`

### 4. Adım: Uygulamayı Başlatın
\`\`\`bash
npm run dev
\`\`\`
Uygulamanız varsayılan olarak \`http://localhost:3000\` adresinde çalışacaktır.

---

## 📋 Proje Şartnamesi ve Mimari Detaylar (Manager TALIMATNAME)

${cleanTalimat || `### Mimari ve Domain Dağılımı\n${domainSummary}`}

---

## 🧪 Test ve Kalite Kapısı Doğrulaması
- **Kabul Durumu:** ${testResult.approved ? '✅ Onaylandı (Kusursuz)' : '⚠️ Uyarılar ile Tamamlandı'}
- **Test Özeti:** ${testResult.summary}
- **Rapor Dosyası:** \`RAPOR.md\`

---
*Bu proje **XFactor Otonom AI Ajan Orkestrasyon Platformu** tarafından uçtan uca otonom olarak inşa edilmiştir.*
`;
            await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent, 'utf8');

            const finalState = await readProjectState(projectId);
            finalState.status = 'completed';

            const now = new Date();
            const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const formattedTime = now.toLocaleTimeString('tr-TR', { hour12: false });

            const completionMsg = `🎉 **Tebrikler Boss! "${state.title}" Projesi Başarıyla Tamamlandı!**
Tüm alt ekipler (Backend, Frontend) kod üretimini eksiksiz bitirdi ve Tester kalite kapısı onaylandı.

### 📁 Üretilen Mimari Katmanları:
${domainSummary}

### 🧪 Test ve Kabul Doğrulaması:
- **Sonuç:** ${testResult.approved ? '✅ Onaylandı (Kusursuz)' : '⚠️ Tamamlandı'}
- **Detay:** ${testResult.summary}
- **Oluşturulan Raporlar:** \`RAPOR.md\` ve \`README.md\`

---
🚀 **Sonraki Adımlar:**
1. Üst menüden **'Kod Editörü'** sekmesine geçerek tüm kaynak kodları inceleyebilirsiniz.
2. Sağ üstteki **'Projeyi (ZIP) İndir'** butonuna tıklayarak uygulamanızı bilgisayarınıza indirebilirsiniz.`;

            if (!finalState.chatHistory) finalState.chatHistory = [];
            finalState.chatHistory.push({
                role: 'model',
                parts: [{ text: completionMsg }],
                timestamp: `${formattedDate} ${formattedTime}`,
                created_at: now.toISOString()
            });

            await writeProjectState(projectId, finalState);

            await logEvent(wsClients, projectId, "Manager", "finish", "RAPOR.md, README.md", "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.", "manager");
        }
    } catch (error) {
        console.error("Workflow Execution Error:", error);
        await logEvent(wsClients, projectId, "System", "error", "", `Süreç hatası: ${error.message}`, "system");
        const failedState = await readProjectState(projectId);
        if (failedState) {
            failedState.status = 'paused';
            const errNow = new Date();
            const errDate = errNow.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const errTime = errNow.toLocaleTimeString('tr-TR', { hour12: false });

            if (!failedState.chatHistory) failedState.chatHistory = [];
            failedState.chatHistory.push({
                role: 'model',
                parts: [{ text: `⚠️ **Süreç Duraklatıldı (Müdahale Gerekli):**\n\nAlt ajanların görev üretiminde bir kalite kapısı engeli ile karşılaşıldı ve proje güvenli modda duraklatıldı.\n\n- Ayrıntıları üst menüdeki **'Canlı Süreç Logları'** veya **'Canlı DAG Grafiği'** sekmesinden inceleyebilirsiniz.\n- Bana buradan *"Hata neydi, ne yapmalıyız?"* diye sorabilir veya hazır olduğunuzda üstteki **'Devam Et (Resume)'** butonuna tıklayabilirsiniz.` }],
                timestamp: `${errDate} ${errTime}`,
                created_at: errNow.toISOString()
            });
            await writeProjectState(projectId, failedState);
        }
    }
}
