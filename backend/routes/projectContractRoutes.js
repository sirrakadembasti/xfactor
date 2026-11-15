import { asyncHandler } from '../security.js';
import { db } from '../db.js';
import { readProjectState, writeProjectState } from '../engine/index.js';
import { getProject } from '../projectRepository.js';
import { getActiveWorkflowAttempt } from '../workflowAttempts.js';
import { PROJECT_STATUS } from '../engine/stateMachine.js';
import { rejectPendingContractRevision } from '../contracts/projectContract.js';

// Contract draft decisions other than approval. Rejecting a draft only retires that
// pending revision: the approved contract, checkpoints and generated sources stay as they are.
export function registerProjectContractRoutes(router, deps) {
    const { requireAuth, projectAccess, wsHub, activeChatRequests, withPlanScopeReview, getActionId, appendWorkflowAction } = deps;

    router.post('/:id/contracts/:revision/reject', requireAuth, projectAccess('owner'), asyncHandler(async (req, res) => {
        const { id } = req.params;
        const revision = Number(req.params.revision);
        const contractId = req.body?.contractId;
        if (!Number.isInteger(revision) || revision < 1 || typeof contractId !== 'string' || !contractId) {
            return res.status(400).json({ error: 'Geçersiz taslak kimliği.' });
        }
        const actionId = getActionId(req);
        const state = await readProjectState(id);
        if (!state) return res.status(404).json({ error: 'Proje bulunamadı.' });
        if (activeChatRequests.has(id)) {
            return res.status(409).json({ code: 'CONTRACT_DRAFT_BUSY', error: 'Manager sohbeti sürerken taslak reddedilemez.' });
        }
        if (getActiveWorkflowAttempt(id)) {
            return res.status(409).json({ code: 'CONTRACT_DRAFT_BUSY', error: 'Başka bir yürütme sürüyor.' });
        }

        let transactionOpen = false;
        try {
            db.exec('BEGIN IMMEDIATE;');
            transactionOpen = true;
            rejectPendingContractRevision({ projectId: id, contractId, revision });
            const approved = db.prepare(`SELECT revision FROM project_contracts
                WHERE project_id = ? AND status = 'approved' ORDER BY revision DESC LIMIT 1`).get(id);
            const action = {
                userText: `Sözleşme taslağı ${revision}'i reddet; onaylı sözleşmeyle devam et.`,
                modelText: approved
                    ? `Taslak ${revision} reddedildi ve artık onaylanamaz. Onaylı sözleşme ${approved.revision}, kaynaklar ve üretim kayıtları korunuyor.`
                    : `Taslak ${revision} reddedildi ve artık onaylanamaz. Onaylı bir sözleşme yok; Manager ile yeni bir plan hazırlayabilirsiniz.`
            };
            const recordAction = () => appendWorkflowAction(id, actionId, action, { inTransaction: true });
            if (state.status === PROJECT_STATUS.PENDING_APPROVAL) {
                // Without a pending draft the project waits on its approved contract, or plans anew.
                state.status = approved ? PROJECT_STATUS.PAUSED : PROJECT_STATUS.PLANNING;
                await writeProjectState(id, state, { inTransaction: true, onTransaction: recordAction });
            } else {
                recordAction();
            }
            db.exec('COMMIT;');
            transactionOpen = false;
        } catch (error) {
            if (transactionOpen) {
                try { db.exec('ROLLBACK;'); } catch {}
            }
            if (error.code === 'CONTRACT_DRAFT_STALE' || /^CAS Revision conflict/.test(error.message || '')) {
                return res.status(409).json({
                    code: 'CONTRACT_DRAFT_STALE',
                    error: error.code === 'CONTRACT_DRAFT_STALE' ? error.message : 'Proje durumu değişti; sayfayı yenileyin.'
                });
            }
            throw error;
        }
        wsHub?.publish({ type: 'project_state_updated', projectId: id });
        res.json(withPlanScopeReview(getProject(id)));
    }));
}
