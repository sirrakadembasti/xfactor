import { digest } from '../verification/workerFailures.js';
import { controlledRepairSourceHash as hash } from './controlledRepairPlan.js';
import { evidencePayload } from '../verification/artifactEvidencePolicy.js';
export const CONTROLLED_LINEAGE_LIMIT = 32;
const HASH=/^[a-f0-9]{64}$/;
const need=(value,reason)=>{if(!value)throw Object.assign(Error('Controlled repair lineage blocked: '+reason),{code:'CONTROLLED_REPAIR_LINEAGE_BLOCKED'});};
const snapshot=files=>{
 need(Array.isArray(files)&&files.length>0&&files.length<=4096,'bounded snapshot required');
 const result=files.map(({path,sha256})=>({path,sha256})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 need(result.every(file=>typeof file.path==='string'&&HASH.test(file.sha256||''))&&new Set(result.map(file=>file.path.toLowerCase())).size===result.length,'ambiguous snapshot');
 return result;
};
const contextFor=p=>({projectId:p.projectId,contractId:p.contractId,contractHash:p.contractHash,revision:p.contractRevision});
function assertProposal(p,c){
 const {planHash,...body}=p||{};
 need(HASH.test(planHash||'')&&digest(body)===planHash&&typeof p.ready==='boolean'&&p.projectId===c.projectId&&p.contractId===c.contractId
  &&p.contractHash===c.contractHash&&p.contractRevision===c.revision&&Array.isArray(p.targets)&&p.targets.length>0&&p.targets.length<=12
  &&new Set(p.targets.map(t=>t.path)).size===p.targets.length,'changed proposal/contract');
}
// Only confirmed patched attempts count. A dispatched/proposed fourth target
// remains at its baseline bytes; no proposedOutputSha256 is ever inferred.
export function reconstructControlledRepairOutput(ledger,context){
 assertProposal(ledger.proposal,context);
 const baseline=snapshot(ledger.baseline);
 need(hash(baseline)===ledger.proposal.baselineSourceHash,'baseline changed');
 need(Array.isArray(ledger.attempts||[])&&(ledger.attempts||[]).length<=12,'bounded attempt history required');
 const files=new Map(baseline.map(file=>[file.path,{...file}])),seen=new Set();
 for(const attempt of ledger.attempts||[]){
  if(attempt.phase!=='patched')continue;
  need(ledger.proposal.ready===true,'unready proposal cannot authorize patches');
  const target=ledger.proposal.targets.find(t=>t.path===attempt.target);
  need(target&&!seen.has(target.path)&&HASH.test(attempt.outputSha256||'')&&attempt.planHash===ledger.proposal.planHash
   &&(files.get(target.path)?.sha256||null)===target.sourceSha256,'confirmed patch lost target/source authority');
  seen.add(target.path);files.set(target.path,{path:target.path,sha256:attempt.outputSha256});
 }
 return snapshot([...files.values()]);
}
function eligibleOrigin(issue,p,c){
 const d=evidencePayload(issue.detail_json);
 if(p.ready!==true||d.version!==1||d.contractHash!==c.contractHash)return false;
 if(d.kind==='verification_controller_blocker'){
  const r=d.expectedIdentity;
  return d.authenticatedWorker===false&&r?.projectId===c.projectId&&r.contractId===c.contractId&&r.contractHash===c.contractHash
   &&r.runId===p.baselineRunId&&r.artifactId===p.baselineArtifactId&&r.inputSha256===p.baselineArtifactSha256;
 }
 if(d.authenticatedWorker!==true||d.contractRevision!==c.revision||issue.run_id!==p.baselineRunId||d.runId!==p.baselineRunId
  ||d.artifactId!==p.baselineArtifactId||d.artifactSha256!==p.baselineArtifactSha256||!d.jobId||!d.nonce)return false;
 return d.kind==='worker_verification_blocker'||d.kind==='worker_product_failure'&&p.targets.some(t=>t.path===d.filePath&&t.sourceSha256===d.sourceSha256&&t.checkIds.includes(d.checkId));
}
// Preserve direct-baseline acceptance policy: these exact DB issues were written
// by the controller after outer worker identity authentication. Legacy baselines
// need no invented action receipt. This authority NEVER admits diagnostic runs.
function authenticateOrigin(issue,checks,p,c){
 if(!eligibleOrigin(issue,p,c))return false;
 const d=evidencePayload(issue.detail_json);
 if(d.kind!=='worker_product_failure')return true;
 return checks.some(check=>check.id===d.checkId&&check.run_id===p.baselineRunId&&check.contract_id===c.contractId
  &&['FAIL','BLOCKED'].includes(check.status));
}
function readBaseline(db,p,c,baseline,allowEmptyChecks=false){
 const contract=db.prepare("SELECT id,contract_hash,revision FROM project_contracts WHERE project_id=? AND id=? AND status='approved'").get(c.projectId,c.contractId);
 need(contract?.contract_hash===c.contractHash&&contract.revision===c.revision,'approved contract changed');
 const artifact=db.prepare('SELECT * FROM artifacts WHERE id=? AND project_id=? AND contract_id=?').get(p.baselineArtifactId,c.projectId,c.contractId);
 const run=db.prepare('SELECT * FROM verification_runs WHERE id=? AND project_id=? AND contract_id=?').get(p.baselineRunId,c.projectId,c.contractId);
 need(run?.status==='failed'&&artifact?.verification_run_id===run.id&&artifact.sha256===p.baselineArtifactSha256,'origin artifact/run changed');
 const manifest=snapshot(db.prepare('SELECT path,sha256 FROM artifact_files WHERE artifact_id=? AND contract_id=?').all(artifact.id,c.contractId));
 // Historical ZIP root lock can be a dependency input. Every disk-to-disk link
 // below includes the actual root lock exactly; it is never dropped there.
 const nonLock=files=>files.filter(file=>file.path!=='package-lock.json');
 need(hash(nonLock(manifest))===hash(nonLock(baseline)),'origin source changed');
 const checks=db.prepare('SELECT * FROM verification_checks WHERE run_id=? AND contract_id=? ORDER BY id').all(run.id,c.contractId);
 need((checks.length>0||allowEmptyChecks)&&checks.length<=1024,'bounded origin checks required');
 return {checks,anchor:{manifestHash:hash(manifest),checksHash:digest(checks)}};
}

function diagnosticIdentity(issue,c){
 const d=evidencePayload(issue.detail_json);
 if(d.version!==1||d.contractHash!==c.contractHash)return null;
 if(d.kind==='verification_controller_blocker'&&d.authenticatedWorker===false){
  const r=d.expectedIdentity;
  if(r?.projectId!==c.projectId||r.contractId!==c.contractId||r.contractHash!==c.contractHash||r.revision!==c.revision)return null;
  return r.jobId&&r.nonce&&HASH.test(r.inputSha256||'')?{runId:r.runId,artifactId:r.artifactId,artifactSha256:r.inputSha256}:null;
 }
 if(d.kind!=='worker_verification_blocker'||d.authenticatedWorker!==true||d.contractRevision!==c.revision
  ||issue.run_id!==d.runId||!d.jobId||!d.nonce||!HASH.test(d.artifactSha256||''))return null;
 return {runId:d.runId,artifactId:d.artifactId,artifactSha256:d.artifactSha256};
}
function diagnosticProposal(identity){return {baselineRunId:identity.runId,baselineArtifactId:identity.artifactId,baselineArtifactSha256:identity.artifactSha256};}
// These exact controller-recorded BLOCKERS concern the reconstructed partial
// source. They are pinned as history, never relabelled as worker PASS receipts.
function archiveSameSourceDiagnostics(db,issues,context,knownSnapshots,excludedRuns){
 const groups=new Map();
 for(const issue of issues){
  const identity=diagnosticIdentity(issue,context);
  if(!identity?.runId||excludedRuns.includes(identity.runId))continue;
  for(const source of knownSnapshots)try {
    const {checks,anchor}=readBaseline(db,diagnosticProposal(identity),context,source,true);
    if(evidencePayload(issue.detail_json).authenticatedWorker===true&&!checks.some(row=>['FAIL','BLOCKED'].includes(row.status)))continue;
    const key=digest(identity),group=groups.get(key)||{identity,sourceHash:hash(source),anchor,origins:[]};
    group.origins.push({kind:'controller-recorded-same-source-diagnostic',id:issue.id,runId:issue.run_id,detailHash:digest(evidencePayload(issue.detail_json))});
    groups.set(key,group);break;
   }catch{/* Different snapshots and unauthenticated runs have no closure authority. */}
 }
 need(groups.size<=16,'diagnostic history budget exhausted');return [...groups.values()];
}
function preparationIdentity(issue,c,source){
 const d=evidencePayload(issue.detail_json),r=d.expectedIdentity;
 const packageHash=source.find(file=>file.path==='package.json')?.sha256;
 return d.version===1&&d.kind==='verification_controller_blocker'&&d.authenticatedWorker===false&&d.contractHash===c.contractHash
  &&r?.operation==='prepare_dependencies'&&r.projectId===c.projectId&&r.contractId===c.contractId&&r.contractHash===c.contractHash
  &&r.jobId&&r.nonce&&r.runId&&HASH.test(packageHash||'')&&r.inputSha256===packageHash?r:null;
}
// Entries compacted at once when the history is full; the newer half stays in full.
export const CONTROLLED_LINEAGE_COMPACT_COUNT = 16;
const CHECKPOINT_KINDS=['controller-recorded-baseline','controller-recorded-same-source-diagnostic','controller-recorded-dependency-input'];
const isCheckpoint=entry=>entry?.kind==='checkpoint';
// A full history is never truncated. Its oldest entries are first authenticated in full
// against the database, exactly as acceptance would, and then folded into one checkpoint
// that keeps every authenticated origin (id, run and evidence digest) and the link to the
// next entry. Acceptance re-reads each origin row; nothing unauthenticated enters it.
function compactLineage(db,history,{context,currentSource}){
 const count=Math.min(CONTROLLED_LINEAGE_COMPACT_COUNT+(isCheckpoint(history[0])?1:0),history.length-1);
 const folded=history.slice(0,count),rest=history.slice(count);
 const authenticate=entry=>authenticateLineageEntry(db,context,currentSource,entry);
 for(let i=0;i<folded.length;i++){
  const entry=folded[i],next=folded[i+1]||rest[0],{entryHash,...body}=entry;
  need(digest(body)===entryHash&&entry.nextPlanHash===next.proposal.planHash
   &&entry.nextBaselineSourceHash===next.proposal.baselineSourceHash,'history entry changed before compaction');
  if(!isCheckpoint(entry))need(hash(reconstructControlledRepairOutput(entry,context))===next.proposal.baselineSourceHash,'missing source/proposal link');
  need(authenticate(entry)===true,'origin evidence changed or unauthenticated before compaction');
 }
 const origins=new Map();
 for(const entry of folded){
  const rows=isCheckpoint(entry)?entry.origins:[...entry.origins,...(entry.preparationOrigins||[]),
   ...(entry.diagnostics||[]).flatMap(group=>group.origins)];
  for(const origin of rows)origins.set(`${origin.kind}:${origin.id}`,{kind:origin.kind,id:origin.id,runId:origin.runId??null,detailHash:origin.detailHash});
 }
 need(origins.size<=1024,'checkpoint origin budget exhausted');
 const last=folded.at(-1),previous=isCheckpoint(folded[0])?folded[0]:null;
 const checkpoint={version:1,kind:'checkpoint',
  compactedEntries:(previous?.compactedEntries||0)+folded.length-(previous?1:0),
  compactedHash:digest(folded.map(entry=>entry.entryHash)),
  origins:[...origins.values()].sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:String(a.id)<String(b.id)?-1:1),
  nextPlanHash:last.nextPlanHash,nextBaselineSourceHash:last.nextBaselineSourceHash};
 return [{...checkpoint,entryHash:digest(checkpoint)},...rest];
}
// Called within publication transaction after acquiring the source fence.
// Flat history is never silently truncated. It cannot resolve an issue.
export function archiveControlledRepairLineage(db,{previousLedger,nextProposal,currentSource}){
 if(!previousLedger?.proposal)return [];
 if(previousLedger.phase==='proposed'&&!(previousLedger.attempts||[]).length&&!(previousLedger.lineage||[]).length)return [];
 need((db.isTransaction??db.inTransaction)===true,'publication transaction required');
 const context=contextFor(nextProposal);assertProposal(nextProposal,context);
 let history=structuredClone(previousLedger.lineage||[]);
 need(Array.isArray(history)&&history.length<=CONTROLLED_LINEAGE_LIMIT,`proposal history budget exhausted (limit ${CONTROLLED_LINEAGE_LIMIT})`);
 if(history.length>=CONTROLLED_LINEAGE_LIMIT){
  // The open ledger is the entry after the newest archived one; its proposal closes the last link.
  history=compactLineage(db,[...history,{proposal:previousLedger.proposal}],{context,currentSource}).slice(0,-1);
 }
 const prior=structuredClone(previousLedger);
 if(!prior.baseline&&!(prior.attempts||[]).some(a=>a.phase==='patched'))prior.baseline=snapshot(currentSource);
 const output=reconstructControlledRepairOutput(prior,context);
 need(hash(output)===hash(snapshot(currentSource))&&hash(output)===nextProposal.baselineSourceHash,'partial output does not match source fence');
 const {checks,anchor}=readBaseline(db,prior.proposal,context,prior.baseline);
 const issues=db.prepare("SELECT * FROM repair_issues WHERE project_id=? AND contract_id=? AND status='open' ORDER BY id").all(context.projectId,context.contractId);
 need(issues.length<=256,'origin issue budget exhausted');
 const entry={version:1,proposal:prior.proposal,baseline:snapshot(prior.baseline),
  attempts:structuredClone(prior.attempts||[]),phase:prior.phase,
  controlledAcceptancePolicy:prior.controlledAcceptancePolicy||null,outputSourceHash:prior.outputSourceHash||null,
  reviewedArtifactSourceHash:prior.reviewedArtifactSourceHash||null,
  validations:structuredClone(prior.validations||[]),
  workerReservations:structuredClone([...(prior.workerVerificationHistory||[]),...(prior.validations||[]),
   ...(prior.semanticReviewHistory||[]).flatMap(review=>review.validations||[])].filter(row=>row.stage==='worker_verification')),
  nextPlanHash:nextProposal.planHash,nextBaselineSourceHash:nextProposal.baselineSourceHash,anchor,
  diagnostics:archiveSameSourceDiagnostics(db,issues,context,[prior.baseline,output],[prior.proposal.baselineRunId,nextProposal.baselineRunId]),
  preparationOrigins:issues.filter(issue=>preparationIdentity(issue,context,prior.baseline)).map(issue=>({kind:'controller-recorded-dependency-input',id:issue.id,detailHash:digest(evidencePayload(issue.detail_json))})),
  origins:issues.filter(issue=>authenticateOrigin(issue,checks,prior.proposal,context)).map(issue=>({kind:'controller-recorded-baseline',id:issue.id,runId:issue.run_id,detailHash:digest(evidencePayload(issue.detail_json))}))};
 need(entry.validations.length<=3&&entry.workerReservations.length<=96,'bounded review history required');
 if(history.length)need(history.at(-1).nextPlanHash===prior.proposal.planHash&&history.at(-1).nextBaselineSourceHash===prior.proposal.baselineSourceHash,'missing ancestry link');
 history.push({...entry,entryHash:digest(entry)});return history;
}
// The synchronous authenticator is an internal DB-backed trust boundary.
// A promise, approval flag, or self-authenticating entry is never accepted.
export function inspectControlledRepairLineage({ledger,currentSource,context,authenticateEntry}){
 const history=ledger.lineage||[];
 need(Array.isArray(history)&&history.length<=CONTROLLED_LINEAGE_LIMIT,'invalid history budget');
 if(!history.length)return [];
 need(typeof authenticateEntry==='function','origin authentication required');
 const output=reconstructControlledRepairOutput(ledger,context);
 need(hash(output)===hash(snapshot(currentSource))&&hash(output)===ledger.outputSourceHash,'final source changed');
 const ids=new Set();
 need(history.every((entry,i)=>!isCheckpoint(entry)||i===0),'checkpoint must be the first history entry');
 for(let i=0;i<history.length;i++){
  const entry=history[i],next=history[i+1]||ledger,{entryHash,...body}=entry;
  need(entry.version===1&&digest(body)===entryHash&&Array.isArray(entry.origins)&&entry.origins.length<=(isCheckpoint(entry)?1024:256),'history entry changed');
  need(entry.nextPlanHash===next.proposal.planHash&&entry.nextBaselineSourceHash===next.proposal.baselineSourceHash
   &&(isCheckpoint(entry)||hash(reconstructControlledRepairOutput(entry,context))===next.proposal.baselineSourceHash)
   &&hash(snapshot(next.baseline))===next.proposal.baselineSourceHash,'missing source/proposal link');
  need(authenticateEntry(entry)===true,'origin evidence changed or unauthenticated');
  for(const origin of entry.origins)ids.add(origin.id);
  for(const diagnostic of entry.diagnostics||[])for(const origin of diagnostic.origins)ids.add(origin.id);
  for(const origin of entry.preparationOrigins||[])ids.add(origin.id);
 }
 return [...ids];
}
// Exact closure candidates only: canonical acceptance must still authenticate
// current fresh full worker PASS and semantic proof before atomic close/receipt.
export function readAuthenticatedControlledLineageIssueIds(db,{context,ledger,currentSource}){
 const ids=inspectControlledRepairLineage({context,ledger,currentSource,authenticateEntry:entry=>authenticateLineageEntry(db,context,currentSource,entry)});
 // A dependency input closes only while the current package manifest is still that input. A later
 // package repair leaves such an issue open; it does not invalidate the rest of the history.
 const preparationIds=new Set((ledger.lineage||[]).flatMap(entry=>isCheckpoint(entry)
  ?entry.origins.filter(origin=>origin.kind==='controller-recorded-dependency-input'):entry.preparationOrigins||[]).map(origin=>origin.id));
 return ids.filter(id=>!preparationIds.has(id)||preparationIdentity(
  db.prepare('SELECT * FROM repair_issues WHERE id=? AND project_id=? AND contract_id=?').get(id,context.projectId,context.contractId),context,currentSource));
}
// A checkpoint origin was authenticated in full when it was folded. Each row must still be the same evidence.
function authenticateCheckpoint(db,context,_currentSource,entry){
 return entry.origins.every(origin=>{
  const issue=db.prepare('SELECT * FROM repair_issues WHERE id=? AND project_id=? AND contract_id=?').get(origin.id,context.projectId,context.contractId);
  return CHECKPOINT_KINDS.includes(origin.kind)&&issue&&['open','resolved'].includes(issue.status)
   &&(origin.runId===null||issue.run_id===origin.runId)&&digest(evidencePayload(issue.detail_json))===origin.detailHash;
 });
}
function authenticateLineageEntry(db,context,currentSource,entry){
  if(isCheckpoint(entry))return authenticateCheckpoint(db,context,currentSource,entry);
  const {checks,anchor}=readBaseline(db,entry.proposal,context,entry.baseline);
  if(digest(anchor)!==digest(entry.anchor))return false;
  const baselineValid=entry.origins.every(origin=>{
   const issue=db.prepare('SELECT * FROM repair_issues WHERE id=? AND project_id=? AND contract_id=?').get(origin.id,context.projectId,context.contractId);
   return origin.kind==='controller-recorded-baseline'&&issue&&['open','resolved'].includes(issue.status)&&issue.run_id===origin.runId&&digest(evidencePayload(issue.detail_json))===origin.detailHash
    &&authenticateOrigin(issue,checks,entry.proposal,context);
  });
  if(!baselineValid)return false;
  const preparations=entry.preparationOrigins||[];
  if(!Array.isArray(preparations)||preparations.length>256||!preparations.every(origin=>{
   const issue=db.prepare('SELECT * FROM repair_issues WHERE id=? AND project_id=? AND contract_id=?').get(origin.id,context.projectId,context.contractId);
   return origin.kind==='controller-recorded-dependency-input'&&issue&&['open','resolved'].includes(issue.status)
    &&digest(evidencePayload(issue.detail_json))===origin.detailHash&&preparationIdentity(issue,context,entry.baseline);
  }))return false;
  const output=reconstructControlledRepairOutput(entry,context),diagnostics=entry.diagnostics||[];
  if(!Array.isArray(diagnostics)||diagnostics.length>16)return false;
  return diagnostics.every(group=>{
   const source=[entry.baseline,output].find(files=>hash(files)===group.sourceHash);
   if(!source||!Array.isArray(group.origins)||group.origins.length>256)return false;
   const {checks,anchor:diagnosticAnchor}=readBaseline(db,diagnosticProposal(group.identity),context,source,true);
   if(digest(diagnosticAnchor)!==digest(group.anchor))return false;
   return group.origins.every(origin=>{
    const issue=db.prepare('SELECT * FROM repair_issues WHERE id=? AND project_id=? AND contract_id=?').get(origin.id,context.projectId,context.contractId);
    return origin.kind==='controller-recorded-same-source-diagnostic'&&issue&&['open','resolved'].includes(issue.status)
     &&issue.run_id===origin.runId&&digest(evidencePayload(issue.detail_json))===origin.detailHash
     &&digest(diagnosticIdentity(issue,context))===digest(group.identity)
     &&(evidencePayload(issue.detail_json).authenticatedWorker!==true||checks.some(row=>['FAIL','BLOCKED'].includes(row.status)));
   });
  });
}
