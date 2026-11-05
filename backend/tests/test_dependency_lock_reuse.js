import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import { loadRecordedDependencyLock } from '../verification/dependencyLockReuse.js';
import { digest } from '../verification/workerFailures.js';
import { createTestHarness } from './testHarness.js';
const { runAsyncTest, finish } = createTestHarness();
async function fixture(test) {
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'xfactor-lock-reuse-')),database=new DatabaseSync(':memory:');
    try {
        database.exec(`CREATE TABLE project_contracts(id,project_id,status,revision,contract_hash);
            CREATE TABLE artifacts(id,project_id,contract_id,path,sha256,size,status,verification_run_id);
            CREATE TABLE artifact_files(artifact_id,contract_id,path,sha256,size);
            INSERT INTO project_contracts VALUES('c','p','approved',3,'${'a'.repeat(64)}');`);
        const packageBytes=Buffer.from(JSON.stringify({name:'fixture',version:'1.0.0',dependencies:{'is-number':'7.0.0'}}));
        const lockBytes=Buffer.from(JSON.stringify({name:'fixture',version:'1.0.0',lockfileVersion:3,packages:{'':{name:'fixture',version:'1.0.0',dependencies:{'is-number':'7.0.0'}}}}));
        const zip=new JSZip();zip.file('package.json',packageBytes);zip.file('package-lock.json',lockBytes);const archive=await zip.generateAsync({type:'nodebuffer'}),filename=path.join(root,'fixture.zip');await fs.writeFile(filename,archive);
        database.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?)').run('a','p','c',filename,digest(archive),archive.length,'rejected','old-run');
        for(const [name,bytes] of [['package.json',packageBytes],['package-lock.json',lockBytes]])database.prepare('INSERT INTO artifact_files VALUES(?,?,?,?,?)').run('a','c',name,digest(bytes),bytes.length);
        const read=changes=>loadRecordedDependencyLock({projectId:'p',contractId:'c',packageJsonBytes:packageBytes,database,artifactsRoot:root,...changes});
        await test({root,database,packageBytes,lockBytes,filename,read});
    }finally{database.close();await fs.rm(root,{recursive:true,force:true});}
}
await runAsyncTest('same approved package reuses immutable lock bytes only as input, never old PASS evidence',()=>fixture(async f=>{
    const value=await f.read();assert.deepEqual(value.bytes,f.lockBytes);assert.equal(value.artifactId,'a');assert.equal(value.runId,'old-run');
    assert.equal(value.sha256,digest(f.lockBytes));assert.equal(value.reusedInput,true);assert.equal(value.passed,undefined);assert.equal(value.status,undefined);
}));
await runAsyncTest('changed package, missing lock, another project/contract and unpublished artifacts are not reusable',async()=>{
    await fixture(async f=>{assert.equal(await f.read({packageJsonBytes:Buffer.from('{}')}),null);assert.equal(await f.read({projectId:'other'}),null);assert.equal(await f.read({contractId:'other'}),null);});
    await fixture(async f=>{f.database.exec("DELETE FROM artifact_files WHERE path='package-lock.json'");assert.equal(await f.read(),null);});
    await fixture(async f=>{f.database.exec("UPDATE artifacts SET status='draft',verification_run_id=NULL");assert.equal(await f.read(),null);});
});
await runAsyncTest('archive hash, entry inventory and project-root boundaries fail closed',async()=>{
    await fixture(async f=>{await fs.appendFile(f.filename,'tamper');await assert.rejects(f.read());});
    await fixture(async f=>{f.database.exec("UPDATE artifact_files SET sha256='wrong' WHERE path='package-lock.json'");await assert.rejects(f.read());});
    await fixture(async f=>{f.database.prepare('UPDATE artifacts SET path=?').run(path.join(f.root,'..','outside.zip'));await assert.rejects(f.read());});
    await fixture(async f=>{const target=path.join(f.root,'linked.zip');await fs.symlink(f.filename,target);f.database.prepare('UPDATE artifacts SET path=?').run(target);await assert.rejects(f.read());});
});
await runAsyncTest('an unapproved contract never authorizes a previous lock input',()=>fixture(async f=>{
    f.database.exec("UPDATE project_contracts SET status='pending_approval'");assert.equal(await f.read(),null);
}));
finish();
