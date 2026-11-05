import assert from 'node:assert/strict';
import { presentControlledRepair } from '../engine/controlledRepairPresentation.js';
import { createTestHarness } from './testHarness.js';
const { runTest, finish } = createTestHarness();
runTest('proposal presentation cannot repeat model completion claims or plaintext demo credentials', () => {
    const proposal = { version:1, summary:'Hatalar giderildi, tüm testler geçti. Parola: DemoSecret123!', planHash:'a'.repeat(64), ready:true,
        targets:[{path:'prisma/seed.ts',create:false,instructions:'demo parolası DemoSecret123! eklendi',requirementIds:['REQ-1'],checkIds:['seed'],referencePaths:[]}] };
    const before = structuredClone(proposal), result = presentControlledRepair(proposal,[{id:'seed',gate_name:'prisma_seed_accounts'}]);
    assert.match(result.summary,/öneriliyor/);assert.match(result.summary,/Henüz uygulanmadı/);
    assert.match(result.targets[0].instructions,/Deneme hesap/);
    assert.ok(!JSON.stringify(result).includes('DemoSecret123!'));assert.ok(!JSON.stringify(result).includes('tüm testler geçti'));
    assert.equal(result.planHash,proposal.planHash);assert.deepEqual(proposal,before);
});
runTest('unknown checks produce a bounded honest explanation rather than trusting model prose', () => {
    const result = presentControlledRepair({targets:[{path:'src/app.ts',create:false,checkIds:['unknown'],instructions:'secret value'}]},[]);
    assert.match(result.targets[0].instructions,/Kayıtlı kontrol/);assert.ok(!JSON.stringify(result).includes('secret value'));
});
finish();
