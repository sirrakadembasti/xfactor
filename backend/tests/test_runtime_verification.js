/**
 * ⚡ XFactor Gerçek Çalışma Zamanı (Runtime) Doğrulama Test Süiti
 * Referans: yeni-analiz.md Faz 1-8 Denetimleri
 */

import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { TaskDAG } from '../engine/dag.js';
import { isTaskCompleted, writeDurum, writeRapor } from '../engine/fileProtocol.js';
import { stripStringsAndComments, runDeterministicProjectAudit } from '../agents/tester.js';
import { extractCoderFilesFromText, extractAndParseJSON } from '../agents/schemas.js';
import { ensureProjectScaffold } from '../engine/codeGenerator.js';

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

    const cleaned = stripStringsAndComments(rawCode);
    assert.strictEqual(cleaned.includes("Yorum satırı"), false, "Tek satır yorum temizlenmeli");
    assert.strictEqual(cleaned.includes("Çok satırlı"), false, "Çok satırlı yorum temizlenmeli");
    assert.strictEqual(cleaned.includes("{süslü parantez}"), false, "Template literal içi temizlenmeli");

    const audit = runDeterministicProjectAudit([
        { path: 'src/validComponent.jsx', content: rawCode }
    ]);
    assert.strictEqual(audit.passed, true, "String içi parantez içeren geçerli kod deterministik denetimden geçmeli");
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
    assert.ok(audit.issues.some(i => i.includes('dengesiz parantez')), "Dengesiz parantez uyarısı bulunmalı");
});

// ----------------------------------------------------
// 2. Checkpoint & Veto Durum Denetimi
// ----------------------------------------------------
console.log("\n--- 2. Checkpoint & Veto Durum Denetimi ---");

await asyncTest("2.1 Reddedilmiş (BASARISIZ) görevde RAPOR.md olsa dahi tamamlandı sayılmamalı", async () => {
    const testDir = path.join(__dirname, '../projects/test-failed-checkpoint');
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
    const expressTestDir = path.join(__dirname, '../projects/test-pure-express');
    await fs.rm(expressTestDir, { recursive: true, force: true });
    await fs.mkdir(expressTestDir, { recursive: true });

    await ensureProjectScaffold(expressTestDir, { title: 'User REST API' }, { summary: 'Express REST API server projesi' });

    const pkg = JSON.parse(await fs.readFile(path.join(expressTestDir, 'package.json'), 'utf8'));
    assert.strictEqual(Boolean(pkg.dependencies['next']), false, "Express projesinde Next.js olmamalı");

    await fs.rm(expressTestDir, { recursive: true, force: true });
});

console.log("\n==================================================");
console.log(`🎉 Çalışma Zamanı Testleri: ${passed} Başarılı, ${failed} Hatalı`);
console.log("==================================================");

if (failed > 0) {
    process.exit(1);
}
