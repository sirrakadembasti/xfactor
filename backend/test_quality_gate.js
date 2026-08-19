import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { runDeterministicProjectAudit, parseTesterResponse } from './agents/tester.js';
import { normalizeReviewResult } from './agents/schemas.js';
import { isTaskCompleted } from './engine/fileProtocol.js';
import { ensureProjectScaffold } from './engine/codeGenerator.js';
import { getProjectState, saveProjectState } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==================================================");
console.log("⚡ XFactor Faz 0-4 Kalite Kapısı & Deterministik Doğrulama Süiti");
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
// 1. Deterministik Şema & Uyumsuzluk Denetimi
// ----------------------------------------------------
console.log("\n--- 1. Deterministik Prisma & JSON Denetimi ---");

test("1.1 Prisma model uyumsuzluğu (Bozuk proje vakası) tespit edilmeli ve onay engellenmeli", () => {
    const brokenFiles = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel Word { id String @id }\nmodel Score { id String @id }'
        },
        {
            path: 'src/app/api/leaderboard/route.ts',
            content: 'import { prisma } from "@/lib/prisma";\nexport async function GET() {\n  return prisma.leaderboard.findMany();\n}'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0"}'
        }
    ];

    const audit = runDeterministicProjectAudit(brokenFiles);
    assert.strictEqual(audit.passed, false, "Prisma model uyumsuzluğu olan proje audit'ten geçmemeli");
    assert.ok(audit.issues.some(i => i.includes('leaderboard') && i.includes('schema.prisma')));

    // Tester response fail-closed testi
    const parsed = parseTesterResponse('{"approved": true, "summary": "Harika görünüyor"}', audit);
    assert.strictEqual(parsed.approved, false, "Deterministik hata varken approved false olmalıdır");
});

test("1.2 Geçerli Prisma ve API route uyumu başarılı geçmeli", () => {
    const validFiles = [
        {
            path: 'prisma/schema.prisma',
            content: 'datasource db { provider = "sqlite" url = env("DATABASE_URL") }\nmodel Leaderboard { id String @id score Int }\nmodel Word { id String @id }'
        },
        {
            path: 'src/app/api/leaderboard/route.ts',
            content: 'import { prisma } from "@/lib/prisma";\nexport async function GET() {\n  return prisma.leaderboard.findMany();\n}'
        },
        {
            path: 'package.json',
            content: '{"name": "app", "version": "1.0.0"}'
        }
    ];

    const audit = runDeterministicProjectAudit(validFiles);
    assert.strictEqual(audit.passed, true, "Geçerli modellerde audit başarılı olmalı");
});

test("1.3 Bozuk JSON dosyaları deterministik olarak yakalanmalı", () => {
    const invalidJsonFiles = [
        { path: 'package.json', content: '{"name": "broken", incomplete' }
    ];
    const audit = runDeterministicProjectAudit(invalidJsonFiles);
    assert.strictEqual(audit.passed, false);
    assert.ok(audit.issues.some(i => i.includes('Geçersiz JSON')));
});

// ----------------------------------------------------
// 2. Reviewer & Tester Fail-Closed Normalizasyonu
// ----------------------------------------------------
console.log("\n--- 2. Fail-Closed Onay Normalizasyonu ---");

test("2.1 Tanımsız veya sessiz onaylar fail-closed olarak false dönmeli", () => {
    const emptyReview = normalizeReviewResult({});
    assert.strictEqual(emptyReview.approved, false, "Boş obje onaylanmamalı");

    const feedbackReview = normalizeReviewResult({ feedback: "Düzeltilmesi gereken syntax hatası var" });
    assert.strictEqual(feedbackReview.approved, false, "Feedback varken approved false olmalı");

    const validApproval = normalizeReviewResult({ approved: true, summary: "Mükemmel kod" });
    assert.strictEqual(validApproval.approved, true);
});

// ----------------------------------------------------
// 3. Hedef Dosyalar ile Checkpoint Doğrulaması
// ----------------------------------------------------
console.log("\n--- 3. Hedef Dosya Varlık Denetimi (Checkpoint) ---");

await asyncTest("3.1 RAPOR.md olsa bile hedef dosya diskte yoksa görev tamamlandı sayılmamalı", async () => {
    const testDir = path.join(__dirname, '../projects/test-checkpoint-guard');
    const coderDir = path.join(testDir, 'coder-task');
    await fs.mkdir(coderDir, { recursive: true });

    // RAPOR.md yaz
    await fs.writeFile(path.join(coderDir, 'RAPOR.md'), '# Rapor\nKod yazıldı');

    // Hedef dosya src/App.jsx diskte henüz YOK
    const isDoneWithoutFile = await isTaskCompleted(coderDir, testDir, ['src/App.jsx']);
    assert.strictEqual(isDoneWithoutFile, false, "Hedef dosya diskte yoksa isTaskCompleted false dönmeli");

    // Hedef dosyayı oluştur
    const appPath = path.join(testDir, 'src/App.jsx');
    await fs.mkdir(path.dirname(appPath), { recursive: true });
    await fs.writeFile(appPath, 'export default function App() { return null; }');

    const isDoneWithFile = await isTaskCompleted(coderDir, testDir, ['src/App.jsx']);
    assert.strictEqual(isDoneWithFile, true, "Hedef dosya diskte varsa isTaskCompleted true dönmeli");

    // Temizlik
    await fs.rm(testDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 4. Dinamik Scaffold Guard
// ----------------------------------------------------
console.log("\n--- 4. Dinamik Scaffold Guard ---");

await asyncTest("4.1 Vite React projelerinde Vite şablonu ve Next.js kirliliği olmaması", async () => {
    const viteProjectDir = path.join(__dirname, '../projects/test-vite-scaffold');
    await fs.mkdir(viteProjectDir, { recursive: true });

    await ensureProjectScaffold(viteProjectDir, { title: 'Vite Mini App' }, { summary: 'Vite React SPA projesi' });

    const pkgRaw = await fs.readFile(path.join(viteProjectDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);

    assert.ok(pkg.devDependencies['vite'], "Vite bağımlılığı eklenmiş olmalı");
    assert.strictEqual(pkg.scripts.dev, 'vite', "Dev scripti vite olmalı");
    assert.strictEqual(pkg.dependencies['next'], undefined, "Vite projesinde next dependency olmamalı");

    const viteConfigExists = await fs.stat(path.join(viteProjectDir, 'vite.config.js')).then(() => true).catch(() => false);
    assert.ok(viteConfigExists, "vite.config.js üretilmiş olmalı");

    await fs.rm(viteProjectDir, { recursive: true, force: true });
});

// ----------------------------------------------------
// 5. Workflow State DB Kalıcılığı
// ----------------------------------------------------
console.log("\n--- 5. Workflow State Kalıcılığı ---");

await asyncTest("5.1 state.workflow objesi SQLite'a yazılmalı ve okunmalı", async () => {
    const projectId = `test-wf-state-${Date.now()}`;
    const testState = {
        id: projectId,
        title: "Workflow Test Projesi",
        status: "running",
        plan: { summary: "Plan" },
        workflow: {
            directorSpecs: { frontend: { altTalimatname: "Alt" } },
            teamleaderPlans: { "frontend.tl": { tasks: [{ id: "t1", title: "Task 1" }] } }
        },
        chatHistory: []
    };

    saveProjectState(testState);

    const loadedState = getProjectState(projectId);
    assert.ok(loadedState && loadedState.workflow, "loadedState.workflow tanımlı olmalı");
    assert.strictEqual(loadedState.workflow.directorSpecs.frontend.altTalimatname, "Alt");
    assert.strictEqual(loadedState.workflow.teamleaderPlans["frontend.tl"].tasks[0].id, "t1");
});

console.log("\n==================================================");
console.log(`🎉 Kalite Kapısı Test Sonuçları: ${passed} Başarılı, ${failed} Hatalı`);
console.log("==================================================");

if (failed > 0) {
    process.exit(1);
}
