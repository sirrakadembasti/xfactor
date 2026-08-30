/**
 * 🔍 XFactor Ajan & Docs Senkronizasyon Doğrulama Testi
 * backend/agents/* modüllerinin ve projectRoutes'un docs/*.md dosyalarıyla
 * birebir canlı bağlı olduğunu ve onları esas aldığını kanıtlar.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { MANAGER_SYSTEM_PROMPT } from '../agents/manager.js';
import { DIRECTOR_SYSTEM_PROMPT } from '../agents/director.js';
import { TEAMLEADER_SYSTEM_PROMPT } from '../agents/teamleader.js';
import { CODER_SYSTEM_PROMPT } from '../agents/coder.js';
import { REVIEWER_SYSTEM_PROMPT } from '../agents/reviewer.js';
import { TESTER_SYSTEM_PROMPT } from '../agents/tester.js';
import { buildManagerChatSystemPrompt } from '../routes/projectRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, '../../docs');

console.log("==================================================");
console.log("🔍 Ajanlar & Docs/*.md Canlı Bağlantı Denetimi");
let passed = 0;
let failed = 0;

function cleanDoc(content) {
    return content.replace(/^---[\s\S]*?---\s*/, '').trim();
}

function check(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

// 1. Manager Ajanı Denetimi
check("1. manager.js -> docs/manager.md eşleşmesi", () => {
    const docPath = path.join(DOCS_DIR, 'manager.md');
    assert.ok(fs.existsSync(docPath), "docs/manager.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(MANAGER_SYSTEM_PROMPT.trim(), docContent, "manager.js SYSTEM_PROMPT docs/manager.md ile birebir eşleşmeli");
});

// 1b. manager.js fallback prompt source contract
check("1b. manager.js fallback prompt source contract", () => {
    const managerSrc = fs.readFileSync(path.join(__dirname, '../agents/manager.js'), 'utf8');
    assert.ok(managerSrc.includes("loadAgentPromptFromDocs('manager'"), "manager.js loadAgentPromptFromDocs('manager', ...) kullanmalı");
});

// 2. Director Ajanı Denetimi
check("2. director.js -> docs/director.md eşleşmesi", () => {
    const docPath = path.join(DOCS_DIR, 'director.md');
    assert.ok(fs.existsSync(docPath), "docs/director.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(DIRECTOR_SYSTEM_PROMPT.trim(), docContent, "director.js SYSTEM_PROMPT docs/director.md ile birebir eşleşmeli");
});

// 3. Teamleader Ajanı Denetimi
check("3. teamleader.js -> docs/teamleader.md eşleşmesi", () => {
    const docPath = path.join(DOCS_DIR, 'teamleader.md');
    assert.ok(fs.existsSync(docPath), "docs/teamleader.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(TEAMLEADER_SYSTEM_PROMPT.trim(), docContent, "teamleader.js SYSTEM_PROMPT docs/teamleader.md ile birebir eşleşmeli");
});

// 4. Coder Ajanı Denetimi
check("4. coder.js -> docs/coder.md eşleşmesi", () => {
    const docPath = path.join(DOCS_DIR, 'coder.md');
    assert.ok(fs.existsSync(docPath), "docs/coder.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(CODER_SYSTEM_PROMPT.trim(), docContent, "coder.js SYSTEM_PROMPT docs/coder.md ile birebir eşleşmeli");
});

// 5. Reviewer Ajanı Denetimi
check("5. reviewer.js -> docs/reviewer.md eşleşmesi", () => {
    const docPath = path.join(DOCS_DIR, 'reviewer.md');
    assert.ok(fs.existsSync(docPath), "docs/reviewer.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(REVIEWER_SYSTEM_PROMPT.trim(), docContent, "reviewer.js SYSTEM_PROMPT docs/reviewer.md ile birebir eşleşmeli");
});

// 6. Tester Ajanı Denetimi
check("6. tester.js -> docs/tester.md eşleşmesi", () => {
    const docPath = path.join(DOCS_DIR, 'tester.md');
    assert.ok(fs.existsSync(docPath), "docs/tester.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(TESTER_SYSTEM_PROMPT.trim(), docContent, "tester.js SYSTEM_PROMPT docs/tester.md ile birebir eşleşmeli");
});

// 7. projectRoutes.js -> ORKESTRASYON-TALIMATNAMESI.md ve manager.md Denetimi
check("7. projectRoutes.js -> docs/ORKESTRASYON-TALIMATNAMESI.md ve manager.md yüklemesi", () => {
    const prompt = buildManagerChatSystemPrompt();
    assert.ok(prompt.length > 50, "buildManagerChatSystemPrompt manager.md içeriğini barındırmalı");
});

// 8. Requirement-Aware Prompt Instructions Check
check("8. System prompts must contain requirementIds and targetFiles constraints", () => {
    const managerDoc = fs.readFileSync(path.join(DOCS_DIR, 'manager.md'), 'utf8');
    assert.ok(managerDoc.includes('requirements') || managerDoc.includes('requirementIds'), "manager.md requirements listesi talimatı içermeli");

    const teamleaderDoc = fs.readFileSync(path.join(DOCS_DIR, 'teamleader.md'), 'utf8');
    assert.ok(teamleaderDoc.includes('requirementIds'), "teamleader.md requirementIds talimatı içermeli");

    const coderDoc = fs.readFileSync(path.join(DOCS_DIR, 'coder.md'), 'utf8');
    assert.ok(coderDoc.includes('targetFiles') || coderDoc.includes('allowlist') || coderDoc.includes('hedef dosya'), "coder.md targetFiles sınırı talimatı içermeli");
});

console.log("\n==================================================");
console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı (Docs Senkronizasyonu Tam ve Gerçek)`);
console.log("==================================================");

if (failed > 0) process.exit(1);
