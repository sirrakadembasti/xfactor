import crypto from 'crypto';
import fsSync from 'fs';
import path from 'path';
import { writeDurum, writeRapor } from '../fileProtocol.js';
import { getAgent, runDeterministicProjectAudit } from '../../agents/index.js';
import { db } from '../../db.js';
import { ensureProjectScaffold, listProjectTree, writeSourceFile } from '../codeGenerator.js';
import { buildCoderProjectContext } from '../coderContext.js';
import { assertWorkflowLease } from '../../workflowAttempts.js';
import { getProject as readProjectState } from '../../projectRepository.js';
import { generateProjectReadme } from '../readmeGenerator.js';
import { collectArtifactFiles } from '../../artifactInventory.js';
import { fingerprintArtifactFiles } from '../resumeStage.js';
import { reserveWorkerValidation, snapshotHash } from '../workerRepairs.js';
import { executeStaticRepairLoop, executeTesterAdvisoryRepairs, resolveStaticAuditRepairIssues } from './repairStage.js';
import { mergeGeneratedProjectFiles, isExecutionActive, checkPause } from '../workflowSupport.js';

// Stage 6: static audit, bounded repairs, worker Reviewer acceptance and the
// Tester report. Returns true when the workflow must stop before dependency
// preparation; terminalStatus/executionError are reported through `outcome`.
export async function runQualityStage(ctx, outcome) {
    const {
        abortController,
        approvedResumeContract,
        assertWorkflowContract,
        attemptId,
        callAgent,
        effectiveLeaseOwner,
        generatedProjectFiles,
        plan,
        projectDir,
        projectId,
        protocolOptions,
        recordLLMDiagnostic,
        recordTokenUsage,
        repairTargetFiles,
        sourceFence,
        state,
        workerBatch,
        workerSession,
        workflowLogEvent,
        workflowWriteState,
        wsHub
    } = ctx;
    if (isExecutionActive(await checkPause(projectId, abortController.signal))) {
        // 1. Tüm fiziksel disk dosyalarını topla (Önceki dalgalarda üretilmiş tüm dosyalar dahil!)
        const allDiskFiles = await listProjectTree(projectDir);
        generatedProjectFiles.splice(
            0,
            generatedProjectFiles.length,
            ...mergeGeneratedProjectFiles(generatedProjectFiles, allDiskFiles)
        );

        // Scaffold package.json ve yardımcı dosyaları değiştirebilir; denetim her
        // zaman diskten yeniden yüklenmiş en güncel içerikle yapılır.
        if (!workerSession) await ensureProjectScaffold(projectDir, state, plan, sourceFence);
        generatedProjectFiles.splice(
            0,
            generatedProjectFiles.length,
            ...mergeGeneratedProjectFiles(generatedProjectFiles, await listProjectTree(projectDir))
        );

        if (approvedResumeContract && !workerSession) {
            const pendingAdvisoryIssues = db.prepare(`SELECT id, detail_json FROM repair_issues
                WHERE project_id = ? AND contract_id = ? AND status = 'open'
                  AND requirement_id IS NULL
                  AND origin = 'static_audit'
                ORDER BY created_at, id`).all(projectId, approvedResumeContract.id);
            await executeTesterAdvisoryRepairs({ projectDir, contractId: approvedResumeContract.id,
                contractHash: approvedResumeContract.contract_hash, workflow: state.workflow,
                repairIssues: pendingAdvisoryIssues, generatedProjectFiles, repairTargetFiles: [...repairTargetFiles],
                persistWorkflow: () => workflowWriteState(projectId, state), callAgent,
                signal: abortController.signal, onUsage: recordTokenUsage, onDiagnostic: recordLLMDiagnostic, sourceFence });
            generatedProjectFiles.splice(0, generatedProjectFiles.length,
                ...mergeGeneratedProjectFiles(generatedProjectFiles, await listProjectTree(projectDir)));
        }
        let deterministicAudit = runDeterministicProjectAudit(generatedProjectFiles);

        // Worker corrections have their own durable budget. Static failures
        // cannot escape it by entering the generic static Coder loop.
        if (workerSession && !deterministicAudit.passed) throw new Error(`Worker repair requires Manager revision: fresh deterministic audit failed: ${deterministicAudit.issues.join('; ')}`);

        if (!deterministicAudit.passed) {
            const repairResult = await executeStaticRepairLoop({
                projectId,
                projectDir,
                projectTitle: state.title,
                generatedProjectFiles,
                repairTargetFiles: [...repairTargetFiles],
                plan,
                state,
                callAgent,
                wsHub,
                workflowLog: workflowLogEvent,
                recordDiagnostic: recordLLMDiagnostic,
                onUsage: recordTokenUsage,
                signal: abortController.signal,
                sourceFence
            });
            deterministicAudit = repairResult.audit;
        }

        let allQualityIssues = !deterministicAudit.passed ? [...deterministicAudit.issues] : [];
        const isQualityPassed = deterministicAudit.passed;

        if (workerSession) {
            workerSession.assertCurrent();
            const reviewReservation = await reserveWorkerValidation({ workflow: state.workflow, contract: approvedResumeContract,
                batchFingerprint: workerBatch.batchFingerprint, sourceSnapshotHash: snapshotHash(workerSession.expected),
                stage: 'reviewer_acceptance', persistWorkflow: () => workflowWriteState(projectId, state) });
            if (reviewReservation.phase !== 'passed') {
                const reviewContext = await buildCoderProjectContext({ projectDir, files: generatedProjectFiles,
                    dependencyTargetFiles: workerSession.targets.flatMap(target => target.dependencies),
                    targetFiles: workerSession.targets.map(target => target.target) });
                if (reviewContext.includes('OMITTED CONTEXT')) throw new Error('Worker Reviewer context omitted files; Manager revision required.');
                workerSession.assertCurrent();
                const reviewer = getAgent('reviewer');
                const reviewPrompt = workerSession.targets.map(target => reviewer.buildPrompt(target.owner.spec.title,
                    [target.target], generatedProjectFiles.filter(file => file.path === target.target),
                    `${target.owner.spec.description}\n${JSON.stringify(target.issues.map(issue => issue.detail.diagnostic))}`, reviewContext)).join('\n');
                const review = await callAgent('reviewer', reviewPrompt, { signal: abortController.signal,
                    taskId: 'worker-repair.review', maxAttempts: 1, onUsage: recordTokenUsage, onDiagnostic: recordLLMDiagnostic });
                workerSession.assertCurrent();
                reviewReservation.result = { approved: review?.approved === true, summary: String(review?.summary || '').slice(0, 2048) };
                reviewReservation.phase = review?.approved === true ? 'passed' : 'failed';
                await workflowWriteState(projectId, state);
                if (reviewReservation.phase !== 'passed') throw new Error('Worker repair requires Manager revision: fresh Reviewer rejected the repaired source.');
            }
        }

        await workflowLogEvent(
            wsHub,
            projectId,
            "Tester",
            "start",
            "",
            "Proje statik incelemesi ve kaynak denetimi başlatılıyor...",
            "tester-qa",
            "manager"
        );

        const testerAgent = getAgent('tester');
        const testerPrompt = testerAgent.buildPrompt(state.title, plan.talimatname, generatedProjectFiles, {
            deterministicAudit
        }) + (workerSession ? `\nFresh repaired source (reference data):\n${JSON.stringify(generatedProjectFiles.filter(file =>
            workerBatch.issues.some(issue => issue.detail.filePath === file.path)))}` : '');
        workerSession?.assertCurrent();
        const staticReservation = workerSession ? await reserveWorkerValidation({ workflow: state.workflow,
            contract: approvedResumeContract, batchFingerprint: workerBatch.batchFingerprint,
            sourceSnapshotHash: snapshotHash(workerSession.expected), stage: 'static_acceptance',
            persistWorkflow: () => workflowWriteState(projectId, state) }) : null;
        workerSession?.assertCurrent();
        let testerAdvisory = staticReservation?.phase === 'passed' ? staticReservation.result : await callAgent('tester', testerPrompt, {
            signal: abortController.signal,
            taskId: 'tester.static-audit',
            onUsage: recordTokenUsage,
            onDiagnostic: recordLLMDiagnostic,
            ...(workerSession ? { maxAttempts: 1 } : {})
        });
        workerSession?.assertCurrent();
        if (!testerAdvisory || typeof testerAdvisory !== 'object') {
            testerAdvisory = { approved: false, summary: "Tester geri bildirimi alınamadı.", issues: [] };
        }
        testerAdvisory.issues = Array.isArray(testerAdvisory.issues) ? testerAdvisory.issues : [];
        if (testerAdvisory.approved === false && testerAdvisory.issues.length === 0) {
            testerAdvisory.issues = [testerAdvisory.summary || 'Tester veto nedeni veya somut dosya hedefi alınamadı.'];
        }

        const testResult = {
            approved: isQualityPassed && (testerAdvisory.approved !== false),
            summary: isQualityPassed ? (testerAdvisory.summary || 'Deterministik kaynak denetimi tamamlandı; izole runtime doğrulaması bekliyor.') : `[Kritik Statik Kalite Hataları]: ${allQualityIssues.join(' | ')}`,
            issues: isQualityPassed ? testerAdvisory.issues : [...testerAdvisory.issues, ...allQualityIssues]
        };

        const finalRapor = `# RAPOR: ${state.title}\n\n## 1. Proje Özeti\n${plan.summary || state.title}\n\n## 2. Statik Üretim Denetimi\n- Sonuç: ${testResult.approved ? 'STATİK DENETİM GEÇTİ — İZOLE RUNTIME DOĞRULAMASI BEKLİYOR' : 'REDDEDİLDİ / KRİTİK HATALAR MEVCUT'}\n- Detay: ${testResult.summary}\n- Sınır: Bu aşama yalnızca JSON, AST, ithalat ve sözleşme denetimidir; gerçek clean install, Prisma generate/db push/seed, TypeScript, framework build ve runtime smoke başarısını iddia etmez.\n${testResult.issues.length > 0 ? `\n### Tespit Edilen Kritik Sorunlar:\n${testResult.issues.map(i => `- ${i}`).join('\n')}\n` : ''}\n## 3. Üretilen Dosyalar\n${generatedProjectFiles.map(f => `- \`${f.path}\``).join('\n')}\n`;
        if (!workerSession) await writeRapor(projectDir, finalRapor, protocolOptions);
        if (staticReservation) {
            testResult.approved = testResult.approved && testerAdvisory.approved === true;
            staticReservation.result = { approved: testResult.approved, summary: String(testResult.summary || '').slice(0, 2048), issues: [] };
            staticReservation.phase = testResult.approved ? 'passed' : 'failed';
            await workflowWriteState(projectId, state);
            if (!testResult.approved) throw new Error(`Worker repair requires Manager revision: fresh static acceptance rejected: ${testResult.summary}`);
        }

        if (!testResult.approved) {
            await writeDurum(
                projectDir,
                'BASARISIZ',
                `Proje statik denetimi geçemedi: ${testResult.summary}`,
                protocolOptions
            );
            await workflowLogEvent(
                wsHub,
                projectId,
                "Tester",
                "error",
                "",
                `Proje statik denetimi geçemedi: ${testResult.summary}`,
                "tester-qa",
                "manager"
            );

            db.exec('BEGIN IMMEDIATE;');
            try {
                assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
                assertWorkflowContract();
                const latestContract = db.prepare(`
                    SELECT id FROM project_contracts
                    WHERE project_id = ? AND status = 'approved'
                    ORDER BY revision DESC LIMIT 1
                `).get(projectId);
                if (latestContract) {
                    for (const issue of testResult.issues) {
                        const issueText = String(issue);
                        const issueId = `repair-${crypto.randomUUID()}`;
                        const fingerprint = crypto.createHash('md5')
                            .update(issueText)
                            .digest('hex');
                        db.prepare(`
                            INSERT INTO repair_issues (
                                id, project_id, contract_id, run_id,
                                fingerprint, severity, status, detail_json,
                                attempt_id, lease_owner, origin
                            ) VALUES (?, ?, ?, NULL, ?, 'critical', 'open', ?, ?, ?, 'static_audit')
                        `).run(
                            issueId,
                            projectId,
                            latestContract.id,
                            fingerprint,
                            JSON.stringify({ issue: issueText }),
                            attemptId,
                            effectiveLeaseOwner
                        );
                    }
                }
                db.exec('COMMIT;');
            } catch (repairError) {
                try { db.exec('ROLLBACK;'); } catch {}
                throw repairError;
            }
            outcome.terminalStatus = 'rejected';
            outcome.executionError = `Proje statik denetimi geçemedi: ${testResult.summary}`;

            const failedState = await readProjectState(projectId);
            if (failedState) {
                failedState.last_error = outcome.executionError;
                const failurePaths = {
                    implementing: [
                        'implementation_finished',
                        'verification_pending',
                        'verification_running',
                        'verification_failed'
                    ],
                    implementation_finished: [
                        'verification_pending',
                        'verification_running',
                        'verification_failed'
                    ],
                    verification_pending: [
                        'verification_running',
                        'verification_failed'
                    ],
                    verification_running: ['verification_failed']
                };
                const failurePath = failurePaths[failedState.status] || ['verification_failed'];
                for (const status of failurePath.slice(0, -1)) {
                    failedState.status = status;
                    await workflowWriteState(projectId, failedState);
                }

                failedState.status = failurePath.at(-1);
                const now = new Date();
                const formattedDate = now.toLocaleDateString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                const formattedTime = now.toLocaleTimeString('tr-TR', {
                    hour12: false
                });

                if (!failedState.chatHistory) failedState.chatHistory = [];
                failedState.chatHistory.push({
                    role: 'model',
                    parts: [{
                        text: `⚠️ **Tester Kalite Kapısı Uyarısı:**\n\nStatik inceleme veya kaynak denetimi başarısız oldu; proje verification_failed durumunda. Bağımsız worker kabul doğrulaması henüz tamamlanmadı:\n\n${testResult.issues.map(issue => `- ${issue}`).join('\n')}\n\nSüreci düzeltip devam ettirmek için üst menüdeki **'Projeyi Devam Ettir (Resume)'** butonuna basabilir veya bana revizyon bildirebilirsiniz.`
                    }],
                    timestamp: `${formattedDate} ${formattedTime}`,
                    created_at: now.toISOString()
                });
                await workflowWriteState(projectId, failedState);
                wsHub?.publish({ type: 'project_state_updated', projectId });
            }
            return true;
        }

        db.exec('BEGIN IMMEDIATE;');
        try {
            assertWorkflowLease(attemptId, effectiveLeaseOwner, { projectId });
            assertWorkflowContract();
            const approvedContract = db.prepare(`
                SELECT id FROM project_contracts
                WHERE project_id = ? AND status = 'approved'
                ORDER BY revision DESC LIMIT 1
            `).get(projectId);
            if (approvedContract) resolveStaticAuditRepairIssues(db, projectId, approvedContract.id);
            db.exec('COMMIT;');
        } catch (repairError) {
            try { db.exec('ROLLBACK;'); } catch {}
            throw repairError;
        }

        await workflowLogEvent(
            wsHub,
            projectId,
            "Tester",
            "finish",
            "",
            `Proje statik denetimi tamamlandı; bağımsız worker kabul doğrulaması bekliyor: ${testResult.summary}`,
            "tester-qa",
            "manager"
        );

        // Product completion is evidence-authorized exclusively by completeVerifiedProject.
        // Workflow output remains advisory until artifact verification supplies these IDs.
        // Otomatik Proje İskeleti ve Çalıştırılabilirlik Koruması (Scaffold Guard)
        if (!workerSession) await ensureProjectScaffold(projectDir, state, plan, sourceFence);

        // Otomatik Çalıştırma ve Kurulum Kılavuzu (Kapsamlı README.md)
        // P7 Task 5: stack-aware dynamic README — inspects package.json,
        // .env.example and Prisma presence instead of a hardcoded template.
        let managerTalimat = plan.talimatname || '';
        if (!managerTalimat) {
            try {
                const talimatPath = path.join(projectDir, 'manager', 'TALIMATNAME.md');
                if (fsSync.existsSync(talimatPath)) {
                    managerTalimat = fsSync.readFileSync(talimatPath, 'utf8');
                }
            } catch {}
        }

        const readmeContent = await generateProjectReadme({
            projectTitle: state.title,
            summary: plan.summary,
            talimatname: managerTalimat,
            projectDir,
            manifest: plan.service_manifest || plan.serviceManifest || null,
            detectedStack: plan.stack || plan.detectedStack || null,
            lockfileExpected: true,
            management: plan.management || null,
        });
        if (!workerSession) await writeSourceFile(projectDir, path.join(projectDir, 'README.md'), readmeContent, 'utf8', sourceFence);

        const approvedContract = db.prepare(`
            SELECT id, contract_hash FROM project_contracts
            WHERE project_id = ? AND status = 'approved'
            ORDER BY revision DESC LIMIT 1
        `).get(projectId);
        if (approvedContract) {
            const artifactFiles = await collectArtifactFiles(projectDir);
            state.workflow.dependencyPreparation = {
                stage: 'dependency_preparation',
                contractId: approvedContract.id,
                contractHash: approvedContract.contract_hash,
                artifactHash: fingerprintArtifactFiles(artifactFiles)
            };
            await workflowWriteState(projectId, state);
        }
    }
}
