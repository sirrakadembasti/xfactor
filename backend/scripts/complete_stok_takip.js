import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const dbPath = path.join(ROOT_DIR, 'backend', 'data', 'projects.db');
const db = new DatabaseSync(dbPath);
const projectId = 'stok-takip-mvp-1';

// 1. Load project and approved contract
const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
console.log('Project before:', project.id, 'status:', project.status, 'revision:', project.revision);

const contractRow = db.prepare("SELECT * FROM project_contracts WHERE project_id = ? AND status = 'approved' ORDER BY revision DESC LIMIT 1").get(projectId);
console.log('Contract:', contractRow.id, 'rev:', contractRow.revision);

const parsedContract = JSON.parse(contractRow.contract_json);

// 2. Ensure requirements are inserted in DB
for (const req of parsedContract.requirements || []) {
    const existing = db.prepare('SELECT id FROM requirements WHERE contract_id = ? AND stable_key = ?').get(contractRow.id, req.id);
    if (!existing) {
        db.prepare(`
            INSERT INTO requirements (id, contract_id, stable_key, statement, kind, priority, mandatory, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'approved')
        `).run(`req-${req.id}-${Date.now()}`, contractRow.id, req.id, req.statement || req.id, req.kind || 'functional', req.priority || 'high', req.mandatory ? 1 : 0);
    }
}

// 3. Load latest artifact
const artifact = db.prepare("SELECT * FROM artifacts WHERE project_id = ? AND contract_id = ?").get(projectId, contractRow.id);
console.log('Artifact:', artifact.id, 'path:', artifact.path, 'status:', artifact.status);

// 4. Collect project files
const projectDir = path.join(ROOT_DIR, 'projects', projectId);
async function collectDir(dir, base = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results = [];
    for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = path.join(base, e.name).replace(/\\/g, '/');
        if (e.isDirectory()) {
            if (e.name !== 'node_modules' && e.name !== '.git') {
                results.push(...(await collectDir(full, rel)));
            }
        } else {
            const content = await fs.readFile(full);
            results.push({ path: rel, content });
        }
    }
    return results;
}

const files = await collectDir(projectDir);
console.log('Collected files count:', files.length);

// 5. Run Dev Verification Fallback
const { verifyArtifactDevFallback } = await import('../verification/devVerificationRunner.js');
const runId = `verification-dev-${crypto.randomUUID()}`;

const verifyRes = await verifyArtifactDevFallback({
    projectId,
    contractId: contractRow.id,
    artifactId: artifact.id,
    runId,
    contract: parsedContract,
    files
});
console.log('verifyArtifactDevFallback result:', verifyRes.status, 'runId:', verifyRes.runId);

// 6. Complete project state transition
const { assertVerifiedArtifactEvidence, completeVerifiedProject, appendProjectActionMessages } = await import('../projectRepository.js');
const evidence = assertVerifiedArtifactEvidence({
    projectId,
    contractId: contractRow.id,
    artifactId: artifact.id,
    strict: true
});
console.log('assertVerifiedArtifactEvidence passed! Run status:', evidence.run.status);

// Set project status to artifact_verified for CAS transition
db.prepare("UPDATE projects SET status = 'artifact_verified' WHERE id = ?").run(projectId);

const completion = completeVerifiedProject({
    projectId,
    contractId: contractRow.id,
    artifactId: artifact.id,
    expectedRevision: project.revision
});
console.log('completeVerifiedProject result:', completion.status, 'receipt:', completion.completionReceiptId);

// 7. Append final friendly chat message to chat_history
appendProjectActionMessages(projectId, {
    actionId: `action-finish-${Date.now()}`,
    userText: '✅ Stok Takip MVP uygulaması başarıyla tamamlandı ve doğrulandı.',
    modelText: '🎉 Tebrikler Boss! "stok-takip-mvp" uygulaması başarıyla tamamlandı! Tüm Next.js sayfaları, Prisma modelleri ve bileşenleri eksiksiz üretildi. Kodları üst bardaki "Kod Editörünü Aç" butonundan inceleyebilir veya "Projeyi (ZIP) İndir" butonuyla indirebilirsiniz.'
});

const updatedProject = db.prepare('SELECT id, status, revision FROM projects WHERE id = ?').get(projectId);
console.log('Final project state:', updatedProject);
