import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { TaskDAG } from '../engine/dag.js';
import {
    setupRootProtocol,
    setupDirectorProtocol,
    setupTeamleaderProtocol,
    setupCoderProtocol,
    writeDurum,
    writeRapor,
    checkTodoItem
} from '../engine/fileProtocol.js';
import { writeGeneratedFiles, listProjectTree, ensureProjectScaffold } from '../engine/codeGenerator.js';
import { executeCorrectionLoop } from '../engine/selfCorrection.js';
import { runDeterministicProjectAudit } from '../agents/tester.js';
import {
    validateManagerPlan,
    validateDirectorSpec,
    validateTeamleaderTasks,
    validateCoderFiles,
    validateReviewResult
} from '../agents/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================");
console.log("🚀 XFactor Uçtan Uca (E2E) Otonom Pipeline Testi");
console.log("==================================================");

async function runE2E() {
    const projectId = `e2e-test-${Date.now()}`;
    const projectDir = path.join(__dirname, '../projects', projectId);
    await fs.mkdir(projectDir, { recursive: true });

    console.log(`[Adım 1] Proje Dizini Oluşturuldu: ${projectId}`);

    // 1. MANAGER AŞAMASI
    const mockManagerPlan = {
        summary: "E2E Test Projesi — Modern Kanban Panosu",
        talimatname: "# E2E Kanban Şartnamesi\n\nBu şartname React frontend ve Express backend mimarisini tanımlar.",
        domains: [
            { name: "Frontend", prefix: "frontend", description: "React Kanban Arayüzü" },
            { name: "Backend", prefix: "backend", description: "Express REST API" }
        ]
    };

    assert.strictEqual(validateManagerPlan(mockManagerPlan), true, "Manager planı geçerli olmalı");
    await setupRootProtocol(projectDir, mockManagerPlan.talimatname, mockManagerPlan.domains);

    const talimatExists = await fs.stat(path.join(projectDir, 'manager', 'TALIMATNAME.md')).then(() => true).catch(() => false);
    assert.ok(talimatExists, "manager/TALIMATNAME.md oluşturulmuş olmalı");
    console.log("  ✓ Manager: manager/TALIMATNAME.md ve manager/TODO.md oluşturuldu.");
    const generatedFiles = [];

    // 2. DIRECTORS AŞAMASI
    for (const domain of mockManagerPlan.domains) {
        const mockDirectorSpec = {
            domain: domain.name,
            altTalimatname: `# Alt Şartname: ${domain.name}\n\nDetaylı mimari kurallar.`,
            teamleaders: [
                { name: `${domain.prefix}-core-lead`, prefix: domain.prefix, mission: `${domain.name} temel modüllerini geliştir.` }
            ]
        };

        assert.strictEqual(validateDirectorSpec(mockDirectorSpec), true);
        const directorDir = await setupDirectorProtocol(
            projectDir,
            domain.prefix,
            `# Görev: ${domain.name}`,
            mockDirectorSpec.altTalimatname,
            mockDirectorSpec.teamleaders
        );

        console.log(`  ✓ Director [${domain.name}]: ALT-TALIMATNAME.md oluşturuldu.`);

        // 3. TEAMLEADERS AŞAMASI
        for (const tl of mockDirectorSpec.teamleaders) {
            const mockTasks = [
                {
                    id: `${tl.prefix}-task-1`,
                    title: `${domain.name} Model Tanımı`,
                    description: "Veri modellerini tanımla",
                    dependencies: [],
                    targetFiles: [`${domain.prefix}/models.js`]
                },
                {
                    id: `${tl.prefix}-task-2`,
                    title: `${domain.name} Controller / View`,
                    description: "İş mantığını uygula",
                    dependencies: [`${tl.prefix}-task-1`],
                    targetFiles: [`${domain.prefix}/app.js`]
                }
            ];

            assert.strictEqual(validateTeamleaderTasks({ tasks: mockTasks }), true);

            const tlDir = await setupTeamleaderProtocol(
                directorDir,
                tl.name,
                `# Görev: ${tl.name}`,
                mockTasks
            );

            console.log(`  ✓ Teamleader [${tl.name}]: Görevler DAG'a aktarıldı.`);

            // 4. DAG ÇÖZÜMLEME
            // 4. DAG ÇÖZÜMLEME & DALGA YÜRÜTME
            const dag = new TaskDAG();
            mockTasks.forEach(t => dag.addTask(t));
            const execOrder = dag.getExecutionOrder();
            const waves = dag.getExecutionWaves();
            assert.deepStrictEqual(execOrder, [`${tl.prefix}-task-1`, `${tl.prefix}-task-2`], "Topolojik sıralama doğru olmalı");
            assert.strictEqual(waves.length, 2, "2 yürütme dalgası olmalı");
            for (const taskId of execOrder) {
                const task = dag.getTask(taskId);
                const coderDir = await setupCoderProtocol(
                    tlDir,
                    taskId,
                    task.title,
                    `# Görev: ${task.title}`
                );

                const coderFiles = [
                    {
                        path: task.targetFiles[0],
                        content: `// ${task.title}\nexport const version = "1.0.0";\nconsole.log("${task.title} loaded");`
                    }
                ];

                assert.strictEqual(validateCoderFiles({ files: coderFiles }), true);

                await writeGeneratedFiles(projectDir, coderDir, coderFiles);
                generatedFiles.push(...coderFiles);

                // Reviewer Onayı
                const reviewResult = {
                    approved: true,
                    summary: `${task.title} kodları standartlara uygundur.`
                };
                assert.strictEqual(validateReviewResult(reviewResult), true);

                await writeDurum(coderDir, 'TAMAMLANDI', reviewResult.summary);
                await writeRapor(coderDir, `# Rapor: ${task.title}\n${reviewResult.summary}`);
                await checkTodoItem(path.join(tlDir, 'TODO.md'), task.title);

                dag.setTaskStatus(taskId, 'completed', { files: coderFiles });
                console.log(`    ✓ Coder + Reviewer [${taskId}]: Kod yazıldı ve onaylandı.`);
            }

            await writeDurum(tlDir, 'TAMAMLANDI', 'Tüm görevler tamamlandı.');
            await checkTodoItem(path.join(directorDir, 'TODO.md'), tl.name);
        }

        await writeDurum(directorDir, 'TAMAMLANDI', 'Domain tamamlandı.');
        await checkTodoItem(path.join(projectDir, 'manager', 'TODO.md'), domain.name);
    }

    // 6. SCAFFOLD GUARD & DETERMINISTIK TESTER DENETİMİ
    await ensureProjectScaffold(projectDir, { title: 'E2E Test Projesi' }, mockManagerPlan);
    const auditResult = runDeterministicProjectAudit(generatedFiles);
    assert.strictEqual(auditResult.passed, true, "Deterministik proje denetimi başarılı olmalı");

    const testerResult = {
        approved: true,
        summary: `Kabul kriterleri başarıyla doğrulandı. ${generatedFiles.length} dosya hatasız üretildi.`
    };
    assert.strictEqual(validateReviewResult(testerResult), true);

    const finalRapor = `# RAPOR: ${mockManagerPlan.summary}\n\n## Test Sonucu\n${testerResult.summary}\n\n## Dosyalar:\n${generatedFiles.map(f => `- ${f.path}`).join('\n')}`;
    await writeRapor(projectDir, finalRapor);
    await writeDurum(projectDir, 'TAMAMLANDI', 'Proje tamamlandı.');
    console.log("  ✓ Tester & Scaffold Guard: Deterministik kabul denetimi ve final rapor (RAPOR.md) onaylandı.");
    // 7. PROJE AĞACI DOĞRULAMA (IDE & ZIP İÇİN)
    const tree = await listProjectTree(projectDir);
    assert.ok(tree.some(f => f.path.includes('frontend/models.js')), "Frontend models bulunmalı");
    assert.ok(tree.some(f => f.path.includes('backend/app.js')), "Backend app bulunmalı");
    assert.ok(await fs.stat(path.join(projectDir, 'manager', 'TALIMATNAME.md')).then(() => true).catch(() => false), "manager/TALIMATNAME.md bulunmalı");
    console.log(`  ✓ Dosya Ağacı: Toplam ${tree.length} adet dosya başarıyla doğrulandı.`);

    // Temizlik
    await fs.rm(projectDir, { recursive: true, force: true });

    console.log("\n==================================================");
    console.log("🎉 E2E Otonom Pipeline Başarıyla Tamamlandı!");
    console.log("==================================================");
}

runE2E().catch(err => {
    console.error("E2E Hata:", err);
    process.exit(1);
});
