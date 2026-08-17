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
} from './fileProtocol.js';
import { getAgent } from '../agents/index.js';
import { generateLLMResponse } from '../llm.js';
import { getProjectState, saveProjectState, dbEvents, saveProjectLog } from '../db.js';
import { ensureProjectScaffold } from './codeGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || path.join(__dirname, '../../projects');

export const getProjectDir = (projectId) => path.join(PROJECTS_ROOT, projectId);

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

                const executionOrder = dag.getExecutionOrder();

                for (const taskId of executionOrder) {
                    if (await checkPause(projectId) !== 'running') return;

                    const task = dag.getTask(taskId);
                    const coderNodeId = `${tlId}.${taskId}`;
                    const coderDir = path.join(tlDir, taskId);

                    // AKILLI DEVAM KONTROLÜ: Görev daha önce başarıyla tamamlandı mı?
                    const alreadyCompleted = await isTaskCompleted(coderDir);
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
                        continue;
                    }

                    await logEvent(wsClients, projectId, "Teamleader", "delegate", "", `Görev "${task.title}" Coder'a iletildi. Kod üretiliyor...`, coderNodeId, tlId);

                    await setupCoderProtocol(
                        tlDir,
                        taskId,
                        task.title,
                        `# Atomik Görev: ${task.title}\n\nAçıklama: ${task.description}\nHedef Dosyalar: ${JSON.stringify(task.targetFiles)}`
                    );

                    // Coder LLM çağrısı
                    const coderAgent = getAgent('coder');
                    const coderPrompt = coderAgent.buildPrompt(taskId, task.title, task.description, task.targetFiles);
                    let coderOutput = await callAgentLLM('coder', coderPrompt);

                    // Dosyaları hem coder klasörüne hem de proje köküne yaz
                    for (const file of coderOutput.files) {
                        const coderFilePath = path.join(coderDir, path.basename(file.path));
                        await fs.writeFile(coderFilePath, file.content, 'utf8');

                        const rootFilePath = path.join(projectDir, file.path);
                        await fs.mkdir(path.dirname(rootFilePath), { recursive: true });
                        await fs.writeFile(rootFilePath, file.content, 'utf8');

                        generatedProjectFiles.push({ path: file.path, content: file.content });
                    }

                    await logEvent(wsClients, projectId, "Coder", "write", task.targetFiles.join(', '), `Kod başarıyla yazıldı. Reviewer inceliyor...`, coderNodeId, tlId);

                    // 5. AŞAMA: REVIEWER & SELF-CORRECTION
                    const reviewerAgent = getAgent('reviewer');
                    const reviewPrompt = reviewerAgent.buildPrompt(task.title, task.targetFiles, coderOutput.files);
                    const reviewResult = await callAgentLLM('reviewer', reviewPrompt);

                    if (!reviewResult.approved && reviewResult.feedback) {
                        await logEvent(wsClients, projectId, "Reviewer", "feedback", "", `Düzeltme istendi: ${reviewResult.feedback}. Coder yeniden kodluyor...`, coderNodeId, tlId);

                        // 1 Tur Self-Correction
                        const fixPrompt = `${coderPrompt}\n\nÖnceki İnceleme Geri Bildirimi:\n"""\n${reviewResult.feedback}\n"""\nLütfen hataları düzelterek kodları yeniden üret.`;
                        coderOutput = await callAgentLLM('coder', fixPrompt);

                        for (const file of coderOutput.files) {
                            const coderFilePath = path.join(coderDir, path.basename(file.path));
                            await fs.writeFile(coderFilePath, file.content, 'utf8');

                            const rootFilePath = path.join(projectDir, file.path);
                            await fs.mkdir(path.dirname(rootFilePath), { recursive: true });
                            await fs.writeFile(rootFilePath, file.content, 'utf8');

                            generatedProjectFiles.push({ path: file.path, content: file.content });
                        }
                    }

                    // Coder görevini tamamla
                    await writeDurum(coderDir, 'TAMAMLANDI', `Görev başarıyla tamamlandı: ${coderOutput.summary}`);
                    await writeRapor(coderDir, `# Rapor: ${task.title}\n\n${coderOutput.summary}\n\nÜretilen Dosyalar: ${JSON.stringify(task.targetFiles)}`);
                    await checkTodoItem(path.join(tlDir, 'TODO.md'), task.title);

                    dag.setTaskStatus(taskId, 'completed', coderOutput);
                    await logEvent(wsClients, projectId, "Coder", "finish", "", `Görev "${task.title}" tamamlandı.`, coderNodeId, tlId);
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

            const testerAgent = getAgent('tester');
            const testerPrompt = testerAgent.buildPrompt(state.title, plan.talimatname, generatedProjectFiles);
            const testResult = await callAgentLLM('tester', testerPrompt);
            const finalRapor = `# RAPOR: ${state.title}\n\n## 1. Proje Özeti\n${plan.summary}\n\n## 2. Test & Kalite Doğrulaması\n- Sonuç: ${testResult.approved ? 'BAŞARILI' : 'UYARI'}\n- Detay: ${testResult.summary}\n\n## 3. Üretilen Dosyalar\n${generatedProjectFiles.map(f => `- \`${f.path}\``).join('\n')}\n`;

            await writeRapor(projectDir, finalRapor);
            await writeDurum(projectDir, 'TAMAMLANDI', 'Proje üretimi ve test doğrulaması başarıyla sonuçlandı.');

            // Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (Scaffold Guard)
            await ensureProjectScaffold(projectDir, state, plan);

            // Otomatik Çalıştırma ve Kurulum Kılavuzu (README.md)
            const readmeContent = `# 🚀 ${state.title}

${plan.summary || 'XFactor Otonom Ajan Platformu tarafından üretilmiştir.'}

---

## 🛠️ Kurulum ve Çalıştırma Rehberi

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları uygulayın:

### 1. Bağımlılıkları Yükleyin
\`\`\`bash
npm install
\`\`\`

### 2. Veritabanı Şemasını Hazırlayın (Prisma / SQLite)
\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`

### 3. Geliştirme Sunucusunu Başlatın
\`\`\`bash
npm run dev
\`\`\`
Uygulamanız \`http://localhost:3000\` adresinde hazır olacaktır.

---

## 📁 Mimari ve Domain Yapısı
${(plan.domains || []).map(d => `- **${typeof d === 'string' ? d : d.name}**: ${typeof d === 'string' ? d : (d.description || d.name)}`).join('\n')}

## 📑 Test ve Kabul Doğrulaması
- **Sonuç:** ${testResult.approved ? '✅ BAŞARILI' : '⚠️ UYARI'}
- **Detay:** ${testResult.summary}

---
*XFactor Otonom AI Ajan Orkestrasyon Platformu tarafından üretilmiştir.*
`;
            await fs.writeFile(path.join(projectDir, 'README.md'), readmeContent, 'utf8');

            const finalState = await readProjectState(projectId);
            finalState.status = 'completed';
            await writeProjectState(projectId, finalState);

            await logEvent(wsClients, projectId, "Manager", "finish", "RAPOR.md, README.md", "Tüm süreç ve testler başarıyla tamamlandı! Proje IDE'de incelenebilir veya ZIP olarak indirilebilir.", "manager");
        }
    } catch (error) {
        console.error("Workflow Execution Error:", error);
        await logEvent(wsClients, projectId, "System", "error", "", `Süreç hatası: ${error.message}`, "system");
        const failedState = await readProjectState(projectId);
        if (failedState) {
            failedState.status = 'paused';
            await writeProjectState(projectId, failedState);
        }
    }
}
