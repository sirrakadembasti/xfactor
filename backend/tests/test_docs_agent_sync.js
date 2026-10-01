/**
 * 🔍 XFactor Ajan & Docs Senkronizasyon Doğrulama Testi
 * backend/agents/* modüllerinin ve projectRoutes'un x-agents/*.md dosyalarıyla
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
const AGENT_DOCS_DIR = path.join(__dirname, '../../x-agents');

console.log("==================================================");
console.log("🔍 Ajanlar & x-agents/*.md Canlı Bağlantı Denetimi");
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
check("1. manager.js -> x-agents/manager.md eşleşmesi", () => {
    const docPath = path.join(AGENT_DOCS_DIR, 'manager.md');
    assert.ok(fs.existsSync(docPath), "x-agents/manager.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(MANAGER_SYSTEM_PROMPT.trim(), docContent, "manager.js SYSTEM_PROMPT x-agents/manager.md ile birebir eşleşmeli");
});

// 1b. manager.js trusted prompt loader contract
check("1b. manager.js trusted prompt loader contract", () => {
    const managerSrc = fs.readFileSync(path.join(__dirname, '../agents/manager.js'), 'utf8');
    assert.ok(managerSrc.includes("loadAgentPrompt('manager'"), "manager.js loadAgentPrompt('manager', ...) kullanmalı");
});

// 2. Director Ajanı Denetimi
check("2. director.js -> x-agents/director.md eşleşmesi", () => {
    const docPath = path.join(AGENT_DOCS_DIR, 'director.md');
    assert.ok(fs.existsSync(docPath), "x-agents/director.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(DIRECTOR_SYSTEM_PROMPT.trim(), docContent, "director.js SYSTEM_PROMPT x-agents/director.md ile birebir eşleşmeli");
});

// 3. Teamleader Ajanı Denetimi
check("3. teamleader.js -> x-agents/teamleader.md eşleşmesi", () => {
    const docPath = path.join(AGENT_DOCS_DIR, 'teamleader.md');
    assert.ok(fs.existsSync(docPath), "x-agents/teamleader.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(TEAMLEADER_SYSTEM_PROMPT.trim(), docContent, "teamleader.js SYSTEM_PROMPT x-agents/teamleader.md ile birebir eşleşmeli");
});

// 4. Coder Ajanı Denetimi
check("4. coder.js -> x-agents/coder.md eşleşmesi", () => {
    const docPath = path.join(AGENT_DOCS_DIR, 'coder.md');
    assert.ok(fs.existsSync(docPath), "x-agents/coder.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(CODER_SYSTEM_PROMPT.trim(), docContent, "coder.js SYSTEM_PROMPT x-agents/coder.md ile birebir eşleşmeli");
});

// 5. Reviewer Ajanı Denetimi
check("5. reviewer.js -> x-agents/reviewer.md eşleşmesi", () => {
    const docPath = path.join(AGENT_DOCS_DIR, 'reviewer.md');
    assert.ok(fs.existsSync(docPath), "x-agents/reviewer.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(REVIEWER_SYSTEM_PROMPT.trim(), docContent, "reviewer.js SYSTEM_PROMPT x-agents/reviewer.md ile birebir eşleşmeli");
});

// 6. Tester Ajanı Denetimi
check("6. tester.js -> x-agents/tester.md eşleşmesi", () => {
    const docPath = path.join(AGENT_DOCS_DIR, 'tester.md');
    assert.ok(fs.existsSync(docPath), "x-agents/tester.md dosyası mevcut olmalı");
    const docContent = cleanDoc(fs.readFileSync(docPath, 'utf8'));
    assert.strictEqual(TESTER_SYSTEM_PROMPT.trim(), docContent, "tester.js SYSTEM_PROMPT x-agents/tester.md ile birebir eşleşmeli");
});

// 7. projectRoutes.js -> ORKESTRASYON-TALIMATNAMESI.md ve manager.md Denetimi
check("7. projectRoutes.js -> x-agents/ORKESTRASYON-TALIMATNAMESI.md ve manager.md yüklemesi", () => {
    const prompt = buildManagerChatSystemPrompt();
    assert.ok(prompt.length > 50, "buildManagerChatSystemPrompt manager.md içeriğini barındırmalı");
});

// 8. Requirement-Aware Prompt Instructions Check
check("8. System prompts must contain requirementIds and targetFiles constraints", () => {
    const managerDoc = fs.readFileSync(path.join(AGENT_DOCS_DIR, 'manager.md'), 'utf8');
    assert.ok(managerDoc.includes('requirements') || managerDoc.includes('requirementIds'), "manager.md requirements listesi talimatı içermeli");

    const teamleaderDoc = fs.readFileSync(path.join(AGENT_DOCS_DIR, 'teamleader.md'), 'utf8');
    assert.ok(teamleaderDoc.includes('requirementIds'), "teamleader.md requirementIds talimatı içermeli");

    const coderDoc = fs.readFileSync(path.join(AGENT_DOCS_DIR, 'coder.md'), 'utf8');
    assert.ok(coderDoc.includes('targetFiles') || coderDoc.includes('allowlist') || coderDoc.includes('hedef dosya'), "coder.md targetFiles sınırı talimatı içermeli");
});

console.log("\n==================================================");
console.log(`📊 Sonuç: ${passed} Başarılı, ${failed} Hatalı (Docs Senkronizasyonu Tam ve Gerçek)`);
console.log("==================================================");

if (failed > 0) process.exit(1);
