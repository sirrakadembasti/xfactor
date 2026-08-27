/**
 * 🔍 XFactor Ajan & Docs Senkronizasyon Doğrulama Testi
 * backend/agents/* modüllerinin ve projectRoutes'un docs/*.md dosyalarıyla
 * birebir canlı bağlı olduğunu ve onları esas aldığını kanıtlar.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getAgent, AGENT_REGISTRY } from '../agents/index.js';
import { loadAgentPromptFromDocs, loadOrkestrasyonTalimatnamesi } from '../agents/agentLoader.js';
import { buildManagerChatSystemPrompt } from '../routes/projectRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, '../../docs');

console.log("==================================================");
console.log("🔍 Ajanlar & Docs/*.md Canlı Bağlantı Denetimi");
console.log("==================================================");

let passed = 0;
let failed = 0;

function check(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}:`, e.message);
        failed++;
    }
}

// 1. Manager Ajanı Denetimi
check("1. manager.js -> docs/manager.md eşleşmesi", () => {
    const rawDoc = fs.readFileSync(path.join(DOCS_DIR, 'manager.md'), 'utf8');
    const cleanDoc = rawDoc.replace(/^---[\s\S]*?---\s*/, '').trim();
    const agent = getAgent('manager');
    
    assert.ok(agent.systemPrompt.includes("Sen **manager.agent**'sın"), "manager.md kimlik tanımı yüklenmeli");
    assert.ok(agent.systemPrompt.includes("DATABASE_URL"), "manager.md DATABASE_URL kuralı yüklenmeli");
    assert.strictEqual(agent.systemPrompt, cleanDoc, "manager.js promptu docs/manager.md ile birebir eşit olmalı");
});

// 1b. manager.js fallback prompt source contract
check("1b. manager.js fallback prompt source contract", () => {
    const managerSource = fs.readFileSync(path.join(__dirname, '../agents/manager.js'), 'utf8');

    assert.ok(managerSource.includes('FALLBACK_MANAGER_PROMPT'), 'manager.js fallback prompt tanımlı olmalı');
    assert.ok(managerSource.includes('.env.example'), 'fallback prompt güvenli .env.example sözleşmesini taşımalı');
    assert.ok(managerSource.includes('copy .env'), 'fallback prompt kullanıcı kopyası .env akışını anlatmalı');
    assert.ok(managerSource.includes('NEXTAUTH_SECRET'), 'fallback prompt secret değiştirme zorunluluğunu taşımalı');
    assert.ok(managerSource.includes('DATABASE_URL="file:./dev.db"'), 'fallback prompt DATABASE_URL sözleşmesini korumalı');
});

// 2. Director Ajanı Denetimi
check("2. director.js -> docs/director.md eşleşmesi", () => {
    const rawDoc = fs.readFileSync(path.join(DOCS_DIR, 'director.md'), 'utf8');
    const cleanDoc = rawDoc.replace(/^---[\s\S]*?---\s*/, '').trim();
    const agent = getAgent('director');

    assert.ok(agent.systemPrompt.includes("Sen bir **director.agent**'sın"), "director.md kimlik tanımı yüklenmeli");
    assert.strictEqual(agent.systemPrompt, cleanDoc, "director.js promptu docs/director.md ile birebir eşit olmalı");
});

// 3. Teamleader Ajanı Denetimi
check("3. teamleader.js -> docs/teamleader.md eşleşmesi", () => {
    const rawDoc = fs.readFileSync(path.join(DOCS_DIR, 'teamleader.md'), 'utf8');
    const cleanDoc = rawDoc.replace(/^---[\s\S]*?---\s*/, '').trim();
    const agent = getAgent('teamleader');

    assert.ok(agent.systemPrompt.includes("KRİTİK KURAL (ATOMİK DOSYA LİMİTİ)"), "teamleader.md atomik kuralı yüklenmeli");
    assert.strictEqual(agent.systemPrompt, cleanDoc, "teamleader.js promptu docs/teamleader.md ile birebir eşit olmalı");
});

// 4. Coder Ajanı Denetimi
check("4. coder.js -> docs/coder.md eşleşmesi", () => {
    const rawDoc = fs.readFileSync(path.join(DOCS_DIR, 'coder.md'), 'utf8');
    const cleanDoc = rawDoc.replace(/^---[\s\S]*?---\s*/, '').trim();
    const agent = getAgent('coder');

    assert.ok(agent.systemPrompt.includes("Bileşen Kompozisyonu"), "coder.md bileşen kompozisyonu kuralı yüklenmeli");
    assert.strictEqual(agent.systemPrompt, cleanDoc, "coder.js promptu docs/coder.md ile birebir eşit olmalı");
});

// 5. Reviewer Ajanı Denetimi
check("5. reviewer.js -> docs/reviewer.md eşleşmesi", () => {
    const rawDoc = fs.readFileSync(path.join(DOCS_DIR, 'reviewer.md'), 'utf8');
    const cleanDoc = rawDoc.replace(/^---[\s\S]*?---\s*/, '').trim();
    const agent = getAgent('reviewer');

    assert.ok(agent.systemPrompt.includes("Veto Yetkisi (Fail-Closed)"), "reviewer.md veto kuralı yüklenmeli");
    assert.strictEqual(agent.systemPrompt, cleanDoc, "reviewer.js promptu docs/reviewer.md ile birebir eşit olmalı");
});

// 6. Tester Ajanı Denetimi
check("6. tester.js -> docs/tester.md eşleşmesi", () => {
    const rawDoc = fs.readFileSync(path.join(DOCS_DIR, 'tester.md'), 'utf8');
    const cleanDoc = rawDoc.replace(/^---[\s\S]*?---\s*/, '').trim();
    const agent = getAgent('tester');

    assert.ok(agent.systemPrompt.includes("Deterministik Denetim"), "tester.md deterministik denetim kuralı yüklenmeli");
    assert.strictEqual(agent.systemPrompt, cleanDoc, "tester.js promptu docs/tester.md ile birebir eşit olmalı");
});

// 7. projectRoutes.js -> ORKESTRASYON-TALIMATNAMESI.md ve manager.md Denetimi
check("7. projectRoutes.js -> docs/ORKESTRASYON-TALIMATNAMESI.md ve manager.md yüklemesi", () => {
    const chatPrompt = buildManagerChatSystemPrompt({ status: 'planning', title: 'Test Projesi' }, '.');
    
    assert.ok(chatPrompt.includes("Sen **manager.agent**'sın"), "Chat promptunda docs/manager.md olmalı");
    assert.ok(chatPrompt.includes("docs/ORKESTRASYON-TALIMATNAMESI.md"), "Chat promptunda ORKESTRASYON-TALIMATNAMESI referansı olmalı");
    assert.ok(chatPrompt.includes("Agent = Klasör"), "Orkestrasyon anayasası maddeleri chat promptuna girmeli");
});

console.log("\n==================================================");
console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı (Docs Senkronizasyonu Tam ve Gerçek)`);
console.log("==================================================");

if (failed > 0) process.exit(1);
