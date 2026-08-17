import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { TaskDAG } from './engine/dag.js';
import { extractAndParseJSON } from './agents/schemas.js';
import { isSafeProjectPath } from './security.js';
import {
    createUser,
    createProjectForUser,
    setProjectRole,
    canViewProject,
    canEditProject,
    canDeleteProject,
    canTransitionProjectStatus
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================");
console.log("🔄 XFactor Tur 2: Derin Edge-Case ve Stres Testi");
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

// ----------------------------------------------------
// TUR 2.1: DAG KARMAŞIK VE KENDİNE BAĞIMLI (SELF-LOOP) GRAFLAR
// ----------------------------------------------------
console.log("\n--- Tur 2.1: DAG İleri Düzey Döngü ve Ayrık Graf Stresi ---");

test("2.1a Self-Loop (Görev kendine bağımlı)", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 'task-self', title: 'Self Loop', dependencies: ['task-self'] });
    assert.strictEqual(dag.detectCycles(), true, "Kendi kendine bağımlı görev döngü olarak tespit edilmeli");
});

test("2.1b 5 Düğümlü Geniş Halka Döngüsü (A -> B -> C -> D -> E -> A)", () => {
    const dag = new TaskDAG();
    dag.addTask({ id: 'A', title: 'Task A', dependencies: ['E'] });
    dag.addTask({ id: 'B', title: 'Task B', dependencies: ['A'] });
    dag.addTask({ id: 'C', title: 'Task C', dependencies: ['B'] });
    dag.addTask({ id: 'D', title: 'Task D', dependencies: ['C'] });
    dag.addTask({ id: 'E', title: 'Task E', dependencies: ['D'] });

    assert.strictEqual(dag.detectCycles(), true, "5 düğümlü döngü tespit edilmeli");
});

test("2.1c Ayrık İki Graf (Birinde Döngü Var, Diğerinde Yok)", () => {
    const dag = new TaskDAG();
    // Graf 1: Temiz
    dag.addTask({ id: 'clean-1', title: 'Clean 1', dependencies: [] });
    dag.addTask({ id: 'clean-2', title: 'Clean 2', dependencies: ['clean-1'] });
    // Graf 2: Döngülü
    dag.addTask({ id: 'dirty-1', title: 'Dirty 1', dependencies: ['dirty-2'] });
    dag.addTask({ id: 'dirty-2', title: 'Dirty 2', dependencies: ['dirty-1'] });

    assert.strictEqual(dag.detectCycles(), true, "Ayrık grafın birindeki döngü tüm DAG'ı yakalamalı");
});

// ----------------------------------------------------
// TUR 2.2: JSON PARSER GÜRÜLTÜ VE PARÇALANMA DİRENCİ
// ----------------------------------------------------
console.log("\n--- Tur 2.2: JSON Parser İleri Düzey Gürültü ve Kurtarma ---");

test("2.2a Çoklu Kod Bloğu ve Çift JSON Ayrıştırma", () => {
    const multiBlock = `İlk deneme başarısız:\n\`\`\`json\n{"attempt": 1}\n\`\`\`\nİşte nihai geçerli plan:\n\`\`\`json\n{\n  "summary": "Nihai Plan",\n  "talimatname": "# Kurallar",\n  "domains": [{"name": "backend", "description": "API"}]\n}\n\`\`\``;
    const parsed = extractAndParseJSON(multiBlock);
    assert.ok(parsed, "JSON bloğu başarıyla çıkarılmalı");
});

test("2.2b Bozuk Başlangıç/Bitiş Karakterli JSON Metni Kurtarma", () => {
    const brokenEdges = `>>>>> Yanıt Başlangıcı <<<<<\n{ "summary": "Kurtarılan Plan", "talimatname": "# Ok", "domains": [{"name": "fe", "description": "UI"}] }\n<<<<< Yanıt Bitişi >>>>>`;
    const parsed = extractAndParseJSON(brokenEdges);
    assert.strictEqual(parsed.summary, "Kurtarılan Plan");
});

test("2.2c Hiçbir Şekilde JSON İçermeyen Metinde Anlamlı Hata Fırlatma", () => {
    assert.throws(() => extractAndParseJSON("Üzgünüm, bu isteği yerine getiremiyorum."), /JSON ayrıştırma hatası/i);
});

// ----------------------------------------------------
// TUR 2.3: PATH TRAVERSAL VE İZOLASYON ZORLAMA
// ----------------------------------------------------
console.log("\n--- Tur 2.3: Gelişmiş Path Traversal & Enjeksiyon Girişimleri ---");

test("2.3a Karışık Bölü İşaretleri ve Null Byte Saldırısı", () => {
    const root = 'F:/projeler/xfactor/projects/p1';
    assert.strictEqual(isSafeProjectPath("src/../..//windows/system32", root), false);
    assert.strictEqual(isSafeProjectPath("src\\..\\..\\secret.key", root), false);
    assert.strictEqual(isSafeProjectPath("src/valid.js\0malicious", root), false);
    assert.strictEqual(isSafeProjectPath("/etc/shadow", root), false);
    assert.strictEqual(isSafeProjectPath("..", root), false);
    assert.strictEqual(isSafeProjectPath(".", root), false);
    assert.strictEqual(isSafeProjectPath("components/Button.jsx", root), true);
});

// ----------------------------------------------------
// TUR 2.4: RBAC (ROLE-BASED ACCESS CONTROL) TAM MATRİSİ
// ----------------------------------------------------
console.log("\n--- Tur 2.4: RBAC Yetkilendirme Matrisi Doğrulaması ---");

test("2.4a Owner, Editor ve Viewer Yetki Ayrımı", () => {
    const owner = createUser(`own_${Date.now()}`, 'StrongPassword!2026');
    const editor = createUser(`edt_${Date.now()}`, 'StrongPassword!2026');
    const viewer = createUser(`viw_${Date.now()}`, 'StrongPassword!2026');
    const stranger = createUser(`str_${Date.now()}`, 'StrongPassword!2026');

    const project = createProjectForUser(owner.id, 'RBAC Test Project');
    setProjectRole(project.id, editor.id, 'editor');
    setProjectRole(project.id, viewer.id, 'viewer');

    // Okuma (canViewProject)
    assert.strictEqual(canViewProject(owner.id, project.id), true, "Owner görüntüleyebilmeli");
    assert.strictEqual(canViewProject(editor.id, project.id), true, "Editor görüntüleyebilmeli");
    assert.strictEqual(canViewProject(viewer.id, project.id), true, "Viewer görüntüleyebilmeli");
    assert.strictEqual(canViewProject(stranger.id, project.id), false, "Yetkisiz kullanıcı görememeli");

    // Düzenleme (canEditProject)
    assert.strictEqual(canEditProject(owner.id, project.id), true, "Owner düzenleyebilmeli");
    assert.strictEqual(canEditProject(editor.id, project.id), true, "Editor düzenleyebilmeli");
    assert.strictEqual(canEditProject(viewer.id, project.id), false, "Viewer düzenleyememeli");
    assert.strictEqual(canEditProject(stranger.id, project.id), false, "Yetkisiz düzenleyememeli");

    // Silme (canDeleteProject)
    assert.strictEqual(canDeleteProject(owner.id, project.id), true, "Owner silebilmeli");
    assert.strictEqual(canDeleteProject(editor.id, project.id), false, "Editor projeyi silememeli");
    assert.strictEqual(canDeleteProject(viewer.id, project.id), false, "Viewer projeyi silememeli");

    // Yaşam Döngüsü Durum Geçişleri (canTransitionProjectStatus)
    assert.strictEqual(canTransitionProjectStatus('planning', 'pending_approval'), true, "planning -> pending_approval geçerli olmalı");
    assert.strictEqual(canTransitionProjectStatus('pending_approval', 'running'), true, "pending_approval -> running geçerli olmalı");
    assert.strictEqual(canTransitionProjectStatus('running', 'paused'), true, "running -> paused geçerli olmalı");
    assert.strictEqual(canTransitionProjectStatus('paused', 'running'), true, "paused -> running geçerli olmalı");
    assert.strictEqual(canTransitionProjectStatus('completed', 'running'), false, "completed -> running yasak olmalı");
});

console.log("\n==================================================");
console.log(`🎉 Tur 2 Sonuç: ${passed} Başarılı, ${failed} Hatalı`);
console.log("==================================================");

if (failed > 0) {
    process.exit(1);
}
