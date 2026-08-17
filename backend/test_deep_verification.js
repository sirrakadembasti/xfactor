import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { TaskDAG } from './engine/dag.js';
import {
    setupRootProtocol,
    setupDirectorProtocol,
    setupTeamleaderProtocol,
    setupCoderProtocol,
    writeDurum,
    writeRapor,
    checkTodoItem,
    isTaskCompleted,
    parseTasksFromTodoContent
} from './engine/fileProtocol.js';
import {
    extractAndParseJSON,
    validateManagerPlan,
    validateDirectorSpec,
    validateTeamleaderTasks,
    validateCoderFiles,
    validateReviewResult
} from './agents/schemas.js';
import { parseCoderResponse } from './agents/coder.js';
import { executeCorrectionLoop } from './engine/selfCorrection.js';
import { writeGeneratedFiles, listProjectTree } from './engine/codeGenerator.js';
import { isSafeProjectPath, isSafeWebSocketUrl, validateLoginPayload, validateProjectTitle } from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================");
console.log("⚡ XFactor Tur 1 & Tur 2 Derin Doğrulama Test Süiti");
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
// 1. DAG MOTORU TESTLERİ (Archon Modeli)
// ----------------------------------------------------
console.log("\n--- 1. Deterministik DAG Motoru Doğrulaması ---");

test("1.1 Basit ve Doğrusal Bağımlılık Topolojik Sıralaması", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 'task-1', title: 'DB Schema', dependencies: [] });
    dag.addTask({ id: 'task-2', title: 'API Endpoints', dependencies: ['task-1'] });
    dag.addTask({ id: 'task-3', title: 'Frontend UI', dependencies: ['task-2'] });

    const order = dag.getExecutionOrder();
    assert.deepStrictEqual(order, ['task-1', 'task-2', 'task-3'], "Sıralama tam olarak task-1 -> task-2 -> task-3 olmalı");
});

test("1.2 Paralel Dallanma ve Elmas (Diamond) Bağımlılık Çözümü", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 'task-1', title: 'Base Config', dependencies: [] });
    dag.addTask({ id: 'task-2a', title: 'Auth Service', dependencies: ['task-1'] });
    dag.addTask({ id: 'task-2b', title: 'Database Service', dependencies: ['task-1'] });
    dag.addTask({ id: 'task-3', title: 'Integration Test', dependencies: ['task-2a', 'task-2b'] });

    const order = dag.getExecutionOrder();
    assert.strictEqual(order[0], 'task-1');
    assert.strictEqual(order[3], 'task-3');
    assert.ok(order.indexOf('task-2a') > order.indexOf('task-1'));
    assert.ok(order.indexOf('task-2b') > order.indexOf('task-1'));
    assert.ok(order.indexOf('task-3') > order.indexOf('task-2a'));
    assert.ok(order.indexOf('task-3') > order.indexOf('task-2b'));
});

test("1.3 Döngüsel Bağımlılık (Cycle Detection) Kilitlenme Önleme", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 'task-a', title: 'Task A', dependencies: ['task-b'] });
    dag.addTask({ id: 'task-b', title: 'Task B', dependencies: ['task-c'] });
    dag.addTask({ id: 'task-c', title: 'Task C', dependencies: ['task-a'] });

    assert.strictEqual(dag.detectCycles(), true, "Döngü tespit edilmeli");
    assert.throws(() => dag.getExecutionOrder(), /döngüsel|circular/i, "Döngü varken getExecutionOrder hata fırlatmalı");
});

test("1.4 Tanımsız Bağımlılık Referansı Hata Yakalama", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 'task-1', title: 'Task 1', dependencies: ['non-existent-task'] });

    assert.throws(() => dag.detectCycles(), /tanımsız|non-existent-task/i);
});

test("1.5 Görev Durum Güncellemeleri ve getReadyTasks", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 't1', title: 'Task 1', dependencies: [] });
    dag.addTask({ id: 't2', title: 'Task 2', dependencies: ['t1'] });

    let ready = dag.getReadyTasks();
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].id, 't1');

    dag.setTaskStatus('t1', 'completed', { output: 'done' });
    ready = dag.getReadyTasks();
    assert.strictEqual(ready.length, 1);
    assert.strictEqual(ready[0].id, 't2');
});

// ----------------------------------------------------
// 2. DOSYA KOORDİNASYON PROTOKOLÜ (Agent = Klasör)
// ----------------------------------------------------
console.log("\n--- 2. Dosya-Bazlı Koordinasyon Protokolü Doğrulaması ---");

await asyncTest("2.1 Hiyerarşik Klasör ve Protokol Dosyaları Üretimi", async () => {
    const testProjectDir = path.join(__dirname, '../projects/test-protocol-project');
    await fs.rm(testProjectDir, { recursive: true, force: true });

    // 1. Manager Kök Protokolü
    await setupRootProtocol(testProjectDir, "# Test Talimatname", [
        { name: "Frontend", prefix: "frontend", description: "UI domain" },
        { name: "Backend", prefix: "backend", description: "API domain" }
    ]);
    const managerDir = path.join(testProjectDir, 'manager');
    const talimatExists = await fs.stat(path.join(managerDir, 'TALIMATNAME.md')).then(() => true).catch(() => false);
    const todoExists = await fs.stat(path.join(managerDir, 'TODO.md')).then(() => true).catch(() => false);
    const durumExists = await fs.stat(path.join(managerDir, 'DURUM.md')).then(() => true).catch(() => false);

    assert.ok(talimatExists, "manager/TALIMATNAME.md bulunmalı");
    assert.ok(todoExists, "manager/TODO.md bulunmalı");
    assert.ok(durumExists, "manager/DURUM.md bulunmalı");

    // 2. Director Protokolü
    const directorDir = await setupDirectorProtocol(
        testProjectDir,
        "frontend",
        "# Görev: Frontend",
        "# Alt Talimatname Frontend",
        [{ name: "ui-teamleader", prefix: "frontend", mission: "Build UI" }]
    );
    const altTalimatExists = await fs.stat(path.join(directorDir, 'ALT-TALIMATNAME.md')).then(() => true).catch(() => false);
    assert.ok(altTalimatExists, "Director ALT-TALIMATNAME.md bulunmalı");

    // 3. Teamleader Protokolü
    const tlDir = await setupTeamleaderProtocol(
        directorDir,
        "ui-teamleader",
        "# Görev: UI Teamleader",
        [{ id: "task-01", title: "Header Component", dependencies: [] }]
    );
    const tlGorevExists = await fs.stat(path.join(tlDir, 'GOREV.md')).then(() => true).catch(() => false);
    assert.ok(tlGorevExists, "Teamleader GOREV.md bulunmalı");

    // 4. Coder Protokolü
    const coderDir = await setupCoderProtocol(
        tlDir,
        "task-01",
        "Header Component",
        "# Atomik Görev: Header Component"
    );
    const coderGorevExists = await fs.stat(path.join(coderDir, 'GOREV.md')).then(() => true).catch(() => false);
    assert.ok(coderGorevExists, "Coder GOREV.md bulunmalı");

    // 5. Durum & Rapor Yazımı ve Checkbox Güncelleme
    await writeDurum(coderDir, 'TAMAMLANDI', 'Header tamamlandı');
    await writeRapor(coderDir, '# Rapor\nHeader tamamlandı');
    await checkTodoItem(path.join(tlDir, 'TODO.md'), "Header Component");

    const tlTodoContent = await fs.readFile(path.join(tlDir, 'TODO.md'), 'utf8');
    assert.ok(tlTodoContent.includes('- [x] 1. Header Component'), "Checkbox işaretlenmiş olmalı");

    // Temizlik
    await fs.rm(testProjectDir, { recursive: true, force: true });
});

await asyncTest("2.2 Görev Tamamlanma Durumu ve TODO.md Ayrıştırma (Checkpoint Resume)", async () => {
    const testProjectDir = path.join(__dirname, '../projects/test-resume-project');
    await fs.rm(testProjectDir, { recursive: true, force: true });
    await fs.mkdir(path.join(testProjectDir, 'task-01'), { recursive: true });

    const coderDir = path.join(testProjectDir, 'task-01');
    assert.strictEqual(await isTaskCompleted(coderDir), false, "Başlangıçta tamamlanmamış olmalı");

    await writeRapor(coderDir, "# Rapor");
    assert.strictEqual(await isTaskCompleted(coderDir), true, "RAPOR.md yazılınca tamamlandı sayılmalı");

    const sampleTodo = "# TODO\n| # | Görev ID | Başlık | Bağımlılıklar | Durum |\n|---|---|---|---|---|\n| 1 | task-01 | Setup | — | bekliyor |\n| 2 | task-02 | Auth | task-01 | bekliyor |\n";
    const tasks = parseTasksFromTodoContent(sampleTodo);
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].id, "task-01");
    assert.strictEqual(tasks[1].id, "task-02");

    await fs.rm(testProjectDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 3. ŞEMA DOĞRULAMA VE JSON AYRIŞTIRMA TESTLERİ
// ----------------------------------------------------
console.log("\n--- 3. Yapılandırılmış JSON Şemaları & Kurtarma ---");

test("3.1 Markdown Kod Blokları İçinden JSON Ayıklama", () => {
    const rawLLMText = "İşte planınız:\n```json\n{\n  \"summary\": \"Örnek Proje\",\n  \"talimatname\": \"# Şartname\",\n  \"domains\": [{\"name\": \"frontend\", \"description\": \"UI\"}]\n}\n```\nBaşarılar dilerim.";
    const parsed = extractAndParseJSON(rawLLMText);
    assert.strictEqual(parsed.summary, "Örnek Proje");
    assert.strictEqual(validateManagerPlan(parsed), true);
});

test("3.2 Çevreleyen Metinler Arasından Ham JSON Nesnesini Kurtarma", () => {
    const noisyText = "Elbette efendim! { \"domain\": \"frontend\", \"altTalimatname\": \"# Alt\", \"teamleaders\": [{\"name\": \"tl1\", \"mission\": \"m1\"}] } Umarız beğenirsiniz.";
    const parsed = extractAndParseJSON(noisyText);
    assert.strictEqual(parsed.domain, "frontend");
    assert.strictEqual(validateDirectorSpec(parsed), true);
});

test("3.3 Geçersiz / Eksik Şemalarda Hata Fırlatma", () => {
    assert.throws(() => validateManagerPlan({ summary: "Eksik" }), /talimatname/i);
    assert.throws(() => validateDirectorSpec({ domain: "backend" }), /altTalimatname/i);
    assert.throws(() => validateTeamleaderTasks({ tasks: "geçersiz" }), /atomik|dizi/i);
    assert.throws(() => validateCoderFiles({ files: [] }), /en az bir|files/i);
    assert.throws(() => validateReviewResult({ approved: "evet" }), /boolean/i);
    assert.throws(() => validateReviewResult({ approved: true }), /summary/i);
});

test("3.4 Kesilmiş ve Kapatılmamış JSON Metinlerini Onarma (Unterminated String Repair)", () => {
    const truncated = `\`\`\`json\n{\n  "summary": "Dashboard UI oluşturuldu",\n  "files": [\n    {\n      "path": "src/app/page.jsx",\n      "content": "import React from 'react';\\nexport default function Page() {\\n  return <div>Dashboard`;
    const parsed = extractAndParseJSON(truncated);
    assert.strictEqual(parsed.summary, "Dashboard UI oluşturuldu");
    assert.ok(parsed.files && parsed.files.length === 1);
    assert.ok(parsed.files[0].content.includes('Dashboard'));
});

test("3.5 JSX ve Kaçışsız Çift Tırnaklı (className=\"px-3\") Coder Çıktılarını Kurtarma", () => {
    const jsxRaw = `\`\`\`json
{
  "summary": "Öğrenci Yönetimi Sayfası (Admin)",
  "files": [
    {
      "path": "src/app/dashboard/students/page.jsx",
      "content": "import React from 'react';
export default function StudentsPage() {
  return (
    <input className="px-3 py-2 border border-slate-200" />
  );
}"
    }
  ]
}
\`\`\``;
    const parsed = parseCoderResponse(jsxRaw);
    assert.strictEqual(parsed.summary, "Öğrenci Yönetimi Sayfası (Admin)");
    assert.strictEqual(parsed.files.length, 1);
    assert.ok(parsed.files[0].content.includes('className="px-3'));
});
console.log("\n--- 4. Self-Correction & Kod Üretim Motoru ---");

await asyncTest("4.1 Path Traversal Koruma ve Çok Dosyalı Yazma", async () => {
    const testDir = path.join(__dirname, '../projects/test-code-gen');
    const coderDir = path.join(testDir, 'coder-work');
    await fs.mkdir(coderDir, { recursive: true });

    const files = [
        { path: 'src/components/Header.jsx', content: 'export default () => <header>Logo</header>;' },
        { path: 'src/index.css', content: 'body { margin: 0; }' },
        { path: '../../malicious.txt', content: 'attack' } // Sınır dışı dosya
    ];

    const written = await writeGeneratedFiles(testDir, coderDir, files);
    assert.strictEqual(written.length, 2, "Zararlı dosya yazılmamalı, sadece 2 güvenli dosya yazılmalı");

    const headerContent = await fs.readFile(path.join(testDir, 'src/components/Header.jsx'), 'utf8');
    assert.ok(headerContent.includes('export default'), "Kaynak dosya başarıyla yazılmış olmalı");

    const tree = await listProjectTree(testDir);
    assert.ok(tree.some(f => f.path === 'src/components/Header.jsx'));
    assert.ok(tree.some(f => f.path === 'src/index.css'));

    await fs.rm(testDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 5. GÜVENLİK VE GİRDİ SANİTİZASYONU
// ----------------------------------------------------
console.log("\n--- 5. Güvenlik, URL & Proje Başlığı Sanitizasyonu ---");

test("5.1 Proje Başlığı Doğrulama (XSS & Enjeksiyon Engeli)", () => {
    assert.strictEqual(validateProjectTitle("Modern Blog 2026"), true);
    assert.strictEqual(validateProjectTitle("<script>alert(1)</script>"), false);
    assert.strictEqual(validateProjectTitle(""), false);
    assert.strictEqual(validateProjectTitle("a".repeat(150)), false);
});

test("5.2 Login Payload Katı Kontrolü", () => {
    const valid = validateLoginPayload({ username: "admin", password: "StrongPassword!2026" });
    assert.strictEqual(valid, true);
    assert.strictEqual(validateLoginPayload({ username: "admin" }), false);
    assert.strictEqual(validateLoginPayload({ username: "a", password: "123" }), false);
});

test("5.3 WebSocket URL ve Path Traversal Sınır Denetimi", () => {
    assert.strictEqual(isSafeWebSocketUrl("ws://localhost:8000/ws/logs"), true);
    assert.strictEqual(isSafeWebSocketUrl("ws://localhost:8000/ws/logs?token=leaked"), false, "Token in query params must be blocked");

    assert.strictEqual(isSafeProjectPath("src/App.jsx", "C:/projects/p1"), true);
    assert.strictEqual(isSafeProjectPath("../../../etc/passwd", "C:/projects/p1"), false);
    assert.strictEqual(isSafeProjectPath("..\\..\\windows\\system32", "C:/projects/p1"), false);
});

console.log("\n==================================================");
console.log(`🎉 Sonuç: ${passed} Başarılı, ${failed} Hatalı`);
console.log("==================================================");

if (failed > 0) {
    process.exit(1);
}
