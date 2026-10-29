/**
 * ⚡ XFactor Gerçek Çalışma Zamanı (Runtime) Doğrulama Test Süiti
 * Referans: yeni-analiz.md Faz 1-8 Denetimleri
 */

import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import { TaskDAG } from '../engine/dag.js';
import { isTaskCompleted, writeDurum, writeRapor } from '../engine/fileProtocol.js';
import { runDeterministicProjectAudit } from '../agents/tester.js';
import { extractCoderFilesFromText, extractAndParseJSON } from '../agents/schemas.js';
import { getAgent } from '../agents/index.js';
import { ensureProjectScaffold } from '../engine/codeGenerator.js';
import { executeCorrectionLoop } from '../engine/selfCorrection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================");
console.log("⚡ XFactor Gerçek Çalışma Zamanı Doğrulama Süiti");
console.log("==================================================");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}:`, e.message);
        failed++;
    }
}

async function asyncTest(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}:`, e.message);
        failed++;
    }
}

// ----------------------------------------------------
// 1. Sentaks ve String/Yorum Temizliği Doğrulaması
// ----------------------------------------------------
console.log("\n--- 1. Sentaks & String/Yorum Temizliği ---");

test("1.1 String içindeki süslü parantezler ve yorumlar temizlenmeli (False-Positive Engeli)", () => {
    const rawCode = `
        // Yorum satırı { [ (
        /* Çok satırlı 
           yorum { } */
        const template = \`Değer: \${x} ve {süslü parantez}\`;
        const str1 = "Tek tırnak '(' ve '{'";
        const str2 = 'Çift tırnak "}" ve ")"';
        function test() {
            return { valid: true };
        }
    `;

    const audit = runDeterministicProjectAudit([
        { path: 'src/validComponent.jsx', content: rawCode }
    ]);
    assert.strictEqual(audit.passed, true, "String içi parantez içeren geçerli kod deterministik denetimden geçmeli");
    assert.strictEqual(audit.issues.length, 0, "Geçerli kaynakta sözdizimi veya auth uyarısı olmamalı");
});

test("1.2 Gerçekten dengesiz/bozuk parantez içeren kod yakalanmalı", () => {
    const brokenCode = `
        function broken() {
            const a = [1, 2, 3;
            return a;
    `;
    const audit = runDeterministicProjectAudit([
        { path: 'src/broken.js', content: brokenCode }
    ]);
    assert.strictEqual(audit.passed, false, "Kapatılmamış parantez hata olarak yakalanmalı");
    assert.ok(audit.issues.some(i => i.includes('Sözdizimi Hatası')), "Açık sözdizimi hatası raporlanmalı");
});


// ----------------------------------------------------
// 2. Checkpoint & Veto Durum Denetimi
// ----------------------------------------------------
console.log("\n--- 2. Checkpoint & Veto Durum Denetimi ---");

await asyncTest("2.1 Reddedilmiş (BASARISIZ) görevde RAPOR.md olsa dahi tamamlandı sayılmamalı", async () => {
    const testDir = path.join(os.tmpdir(), 'test-failed-checkpoint');
    await fs.rm(testDir, { recursive: true, force: true });
    const coderDir = path.join(testDir, 'coder-vetoed');
    await fs.mkdir(coderDir, { recursive: true });

    // Önceki denemeden kalan RAPOR.md
    await fs.writeFile(path.join(coderDir, 'RAPOR.md'), '# Hata Raporu\nReviewer reddetti.');
    await writeDurum(coderDir, 'BASARISIZ', 'Reviewer kalite kapısını geçemedi.');

    const targetPath = path.join(testDir, 'src/api.js');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, 'console.log("broken");');

    const completed = await isTaskCompleted(coderDir, testDir, ['src/api.js']);
    assert.strictEqual(completed, false, "BASARISIZ durumundaki görev tamamlanmış sayılmamalı");

    await fs.rm(testDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 3. Çoklu Dalga (Execution Waves) Doğrulaması
// ----------------------------------------------------
console.log("\n--- 3. DAG Dalga Seviyelendirme ---");

test("3.1 4 Seviyeli Kompleks Elmas DAG Dalgaları", () => {
    const dag = new TaskDAG();
    // Seviye 0
    dag.addTask({ id: 'base-1', title: 'Base 1', dependencies: [] });
    dag.addTask({ id: 'base-2', title: 'Base 2', dependencies: [] });
    // Seviye 1
    dag.addTask({ id: 'mid-1', title: 'Mid 1', dependencies: ['base-1'] });
    dag.addTask({ id: 'mid-2', title: 'Mid 2', dependencies: ['base-1', 'base-2'] });
    // Seviye 2
    dag.addTask({ id: 'top-1', title: 'Top 1', dependencies: ['mid-1', 'mid-2'] });
    // Seviye 3
    dag.addTask({ id: 'final', title: 'Final', dependencies: ['top-1'] });

    const waves = dag.getExecutionWaves();
    assert.strictEqual(waves.length, 4, "4 yürütme dalgası oluşmalı");
    assert.deepStrictEqual(new Set(waves[0]), new Set(['base-1', 'base-2']));
    assert.deepStrictEqual(new Set(waves[1]), new Set(['mid-1', 'mid-2']));
    assert.deepStrictEqual(waves[2], ['top-1']);
    assert.deepStrictEqual(waves[3], ['final']);
});

// ----------------------------------------------------
// 4. Esnek JSON & Coder Çıktı Ayrıştırıcı
// ----------------------------------------------------
console.log("\n--- 4. Esnek Parser Sıra Bağımsızlığı ---");

test("4.1 'content' anahtarı 'path' anahtarından önce geldiğinde dosyayı ayıklayabilmeli", () => {
    const reverseJSON = `{
        "summary": "Ters sıra ile üretilmiş dosya",
        "files": [
            {
                "content": "export const message = 'Hello World';",
                "path": "src/hello.js"
            }
        ]
    }`;

    const parsed = extractCoderFilesFromText(reverseJSON);
    assert.ok(parsed, "Ters sıralı JSON parse edilmeli");
    assert.strictEqual(parsed.files.length, 1);
    assert.strictEqual(parsed.files[0].path, "src/hello.js");
    assert.ok(parsed.files[0].content.includes("Hello World"));
});

// ----------------------------------------------------
// 5. Scaffold Guard İzolasyonu
// ----------------------------------------------------
console.log("\n--- 5. Scaffold Guard İzolasyonu ---");

await asyncTest("5.1 Saf Express API projesinde Next.js ve Tailwind enjekte edilmemeli", async () => {
    const expressTestDir = path.join(os.tmpdir(), 'test-pure-express');
    await fs.rm(expressTestDir, { recursive: true, force: true });
    await fs.mkdir(expressTestDir, { recursive: true });

    await ensureProjectScaffold(expressTestDir, { title: 'User REST API' }, { summary: 'Express REST API server projesi' });

    const pkg = JSON.parse(await fs.readFile(path.join(expressTestDir, 'package.json'), 'utf8'));
    assert.strictEqual(Boolean(pkg.dependencies['next']), false, "Express projesinde Next.js olmamalı");

    await fs.rm(expressTestDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 6. ENG-1 & ENG-3: 1. İterasyon Scope Validasyonu ve callAgent Enjeksiyonu
// ----------------------------------------------------
console.log("\n--- 6. ENG-1 & ENG-3: Scope & callAgent ---");

await asyncTest("6.1 executeCorrectionLoop 1. iterasyonda kapsam dışı dosyayı yakalamalı ve reddetmeli", async () => {
    let coderCalled = 0;
    const reviewerSysPrompt = getAgent('reviewer').systemPrompt;
    const fakeGenerate = async (messages) => {
        const msgList = Array.isArray(messages) ? messages : [];
        const sys = msgList.find(m => m.role === 'system')?.content || '';
        if (sys === reviewerSysPrompt) {
            // Yanlışlıkla approved dönen bir reviewer taklidi
            return '```json\n{"approved": true, "summary": "Looks good!", "feedback": ""}\n```';
        }
        coderCalled++;
        return '```json\n{"summary": "Fixed", "files": [{"path": "src/Expected.jsx", "content": "export const ok = true;"}]}\n```';
    };

    const loopResult = await executeCorrectionLoop({
        taskId: 'test-scope-task',
        taskTitle: 'Scope Test',
        taskDescription: 'Generate Expected.jsx',
        targetFiles: ['src/Expected.jsx'],
        initialCoderOutput: {
            files: [{ path: 'src/Wrong.jsx', content: 'export const wrong = 1;' }]
        },
        coderPrompt: 'Produce code for src/Expected.jsx',
        projectContext: '',
        maxRetries: 2,
        generate: fakeGenerate
    });

    assert.strictEqual(loopResult.approved, true, "Sonuçta coder düzeltmesiyle onaylanmalı");
    assert.strictEqual(loopResult.finalOutput.files[0].path, 'src/Expected.jsx', "Nihai dosya targetFiles ile uyumlu olmalı");
    assert.ok(loopResult.iterations >= 2, "1. iterasyondaki Wrong.jsx reddedilmeli ve 2. iterasyona geçilmeli");
    assert.ok(coderCalled >= 1, "Coder düzeltme için çağrılmış olmalı");
});

await asyncTest("6.2 executeCorrectionLoop callAgent fonksiyonunu kullanmalı", async () => {
    const rolesCalled = [];
    const customCallAgent = async (role, prompt, options) => {
        rolesCalled.push(role);
        if (role === 'reviewer') {
            return { approved: true, summary: 'All good', feedback: '' };
        }
        if (role === 'coder') {
            return { summary: 'Code generated', files: [{ path: 'src/Expected.jsx', content: 'export const y = 2;' }] };
        }
        throw new Error(`Unexpected role: ${role}`);
    };

    const loopResult = await executeCorrectionLoop({
        taskId: 'test-callagent-task',
        taskTitle: 'CallAgent Test',
        taskDescription: 'Generate Expected.jsx',
        targetFiles: ['src/Expected.jsx'],
        initialCoderOutput: {
            files: [{ path: 'src/Expected.jsx', content: 'export const y = 2;' }]
        },
        coderPrompt: 'Produce code for src/Expected.jsx',
        projectContext: '',
        maxRetries: 2,
        callAgent: customCallAgent
    });

    assert.strictEqual(loopResult.approved, true);
    assert.ok(rolesCalled.includes('reviewer'), "callAgent üzerinden reviewer çağrılmış olmalı");
});

console.log("\n==================================================");
console.log(`🎉 Çalışma Zamanı Testleri: ${passed} Başarılı, ${failed} Hatalı`);
console.log("==================================================");

if (failed > 0) {
    process.exit(1);
}
