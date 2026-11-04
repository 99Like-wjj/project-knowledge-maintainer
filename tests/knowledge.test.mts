import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {initialize,save,recover} from '../src/writer.mjs';
import {loadKnowledge,PENDING,gitState} from '../src/store.mjs';
import {compare} from '../src/changes.mjs';
import {KnowledgeError,bytes,digest,parseHeader} from '../src/contract.mjs';
import {topic,source,seedFiles,request} from './fixture.mjs';
const exec=promisify(execFile),code=(expected:string)=>(e:unknown)=>e instanceof KnowledgeError&&e.code===expected;
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pkm-synthetic-'));t.after(async()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('pkm-synthetic-'));await fs.rm(directory,{recursive:true,force:true});});
 const root=path.join(directory,'knowledge'),initial=await initialize(root,{projectName:'完全合成项目A',projectId:'synthetic-project-a'}),history=path.join(directory,'retained');
 return{directory,root,initial,history};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const seed=(f:Fixture,files:Record<string,unknown>=seedFiles())=>save(f.root,request(f.initial.header,f.initial.snapshotSha256,files,f.history));
test('user configuration saves without rule, role, environment or source registration and keeps arbitrary attributes opaque',async t=>{
 const f=await fixture(t),a={items:[{id:'minimal-account',title:'完全合成账号'},{id:'custom-account',title:'完全合成自定义账号',properties:{环境:'用户自定标签',meta:'plain-user-value',sourceRefs:{any:'free JSON'},roleId:'unregistered',nested:{id:'not-a-record',enabled:true,nullable:null,values:[1,'x']}}}]},p={items:[{id:'one-url',title:'完全合成单站点',properties:{站点:'https://example.invalid/',登录说明:'人工登录'}}]};
 await seed(f,{'accounts.json':a,'project.json':p});const s=await loadKnowledge(f.root);
 assert.deepEqual(s.accounts,a);assert.deepEqual(s.project,p);assert.deepEqual(s.diagnostics,[]);assert.deepEqual(s.sources,[]);assert.equal(s.units.length,3);assert.ok(!s.units.some(u=>u.id==='not-a-record'));
 const before=await fs.readFile(path.join(f.root,'accounts.json'));await save(f.root,request(s.header,s.snapshotSha256,{'accounts.json':{items:[]}},f.history));
 assert.deepEqual((await loadKnowledge(f.root)).accounts,{items:[]});assert.deepEqual(await fs.readFile(path.join(f.history,s.snapshotSha256,'accounts.json')),before);
});
test('v3 initializes only identity and empty project, replays without changing bytes, and rejects old format',async t=>{
 const f=await fixture(t),header=await fs.readFile(path.join(f.root,'knowledge.json')),project=await fs.readFile(path.join(f.root,'project.json'));
 assert.equal(f.initial.header.knowledgeFormatVersion,3);assert.deepEqual((await loadKnowledge(f.root)).project?.items,[]);assert.deepEqual((await fs.readdir(f.root)).sort(),['knowledge.json','project.json']);
 assert.equal((await initialize(f.root,{projectName:'完全合成项目A',projectId:'synthetic-project-a'})).created,false);
 assert.deepEqual(await fs.readFile(path.join(f.root,'knowledge.json')),header);assert.deepEqual(await fs.readFile(path.join(f.root,'project.json')),project);
 await assert.rejects(initialize(f.root,{projectName:'Other',projectId:'other'}),code('PROJECT_MISMATCH'));
 assert.throws(()=>parseHeader({...f.initial.header,knowledgeFormatVersion:1}),code('UNSUPPORTED_KNOWLEDGE_FORMAT'));
 await fs.writeFile(path.join(f.root,'knowledge.json'),'broken');await assert.rejects(initialize(f.root,{projectName:'Synthetic'}),code('INVALID_JSON'));
});
test('explicit nonempty target and concurrent initialization preserve foreign files and one identity',async t=>{
 const f=await fixture(t),root=path.join(f.directory,'new');await fs.mkdir(root);await fs.writeFile(path.join(root,'README.md'),'Synthetic skeleton');
 await assert.rejects(initialize(root,{projectName:'Synthetic'}),code('NONEMPTY_DIRECTORY_REQUIRES_EXPLICIT_TARGET'));
 const receipts=await Promise.all([initialize(root,{projectName:'Synthetic',projectId:'p-b',allowExistingDirectory:true}),initialize(root,{projectName:'Synthetic',projectId:'p-b',allowExistingDirectory:true})]);
 assert.equal(receipts.filter(r=>r.created).length,1);assert.equal(receipts[0]!.header.knowledgeId,receipts[1]!.header.knowledgeId);assert.equal(await fs.readFile(path.join(root,'README.md'),'utf8'),'Synthetic skeleton');
 const collision=path.join(f.directory,'collision');await fs.mkdir(collision);await fs.writeFile(path.join(collision,'project.json'),'{}');await assert.rejects(initialize(collision,{projectName:'Synthetic',allowExistingDirectory:true}),code('INITIALIZATION_FILE_COLLISION'));
});
test('all four v3 categories save with stable references, stale snapshots and undeclared paths are refused',async t=>{
 const f=await fixture(t),receipt=await seed(f),s=await loadKnowledge(f.root);
 assert.equal(s.diagnostics.length,0);assert.equal(s.snapshotSha256,receipt.snapshotSha256);assert.equal(s.map?.modules.length,1);assert.equal(s.accounts?.items.length,1);assert.equal(s.topics[0]?.entries.length,2);
 await assert.rejects(save(f.root,request(s.header,s.snapshotSha256,JSON.parse('{"__proto__":{"synthetic":true}}'))),code('INVALID_MANAGED_PATH'));
 await assert.rejects(save(f.root,request(s.header,f.initial.snapshotSha256,{'rules/data-scope.json':topic()},f.history)),code('SNAPSHOT_CONFLICT'));
 const removed=topic();removed.entries=[];const m=structuredClone(s.map!);m.modules[0]!.ruleIds=[];m.modules[0]!.roleIds=[];const a={items:[]};
 await assert.rejects(save(f.root,request(s.header,s.snapshotSha256,{'rules/data-scope.json':removed,'feature-map.json':m,'accounts.json':a},f.history)),code('RETIRE_ENTRY_INSTEAD_OF_REMOVING'));
 assert.equal((await loadKnowledge(f.root)).snapshotSha256,s.snapshotSha256);
});
test('every changed category retains old bytes outside Git and metadata requires a real change reason',async t=>{
 const f=await fixture(t);await seed(f);const s=await loadKnowledge(f.root),changed=topic(),st=changed.entries[0]!.statements[0]!;
 st.text+=' 完全合成的新解释。';await assert.rejects(save(f.root,request(s.header,s.snapshotSha256,{'rules/data-scope.json':changed},f.history)),code('CHANGE_PROVENANCE_REQUIRED'));
 st.meta.updatedAt='2026-11-03T01:00:00Z';st.meta.changeReason='依据完全合成原文补充。';
 await assert.rejects(save(f.root,request(s.header,s.snapshotSha256,{'rules/data-scope.json':changed})),code('PREVIOUS_CONTENT_RETENTION_REQUIRED'));
 const before=await fs.readFile(path.join(f.root,'rules/data-scope.json'));await save(f.root,request(s.header,s.snapshotSha256,{'rules/data-scope.json':changed},f.history));
 assert.deepEqual(await fs.readFile(path.join(f.history,s.snapshotSha256,'rules/data-scope.json')),before);
 const current=await loadKnowledge(f.root);await assert.rejects(save(f.root,request(current.header,current.snapshotSha256,{'sources/manual-v1.json':{...source,locator:'Another document'}},f.history)),code('SOURCE_VERSION_ID_IMMUTABLE'));
});
test('pending publication is recoverable with explicit transaction and does not replay business operations',async t=>{
 const f=await fixture(t);await assert.rejects(save(f.root,request(f.initial.header,f.initial.snapshotSha256,seedFiles(),f.history),{afterPublish:async()=>{throw new Error('synthetic interruption');}}),/synthetic interruption/);
 await assert.rejects(loadKnowledge(f.root),code('KNOWLEDGE_WRITE_PENDING'));const status=await recover(f.root);await assert.rejects(recover(f.root,{complete:true}),code('TRANSACTION_ID_REQUIRED'));
 const receipt=await recover(f.root,{transactionId:status.transactionId,complete:true});assert.ok('saved'in receipt);assert.equal((await loadKnowledge(f.root)).diagnostics.length,0);await assert.rejects(fs.stat(path.join(f.root,PENDING)));
});
test('recovery refuses external edits and preserves the pending marker and external contents',async t=>{
 const f=await fixture(t);await assert.rejects(save(f.root,request(f.initial.header,f.initial.snapshotSha256,seedFiles(),f.history),{afterPublish:async()=>{throw new Error('synthetic interruption');}}));
 const status=await recover(f.root),file=path.join(f.root,'project.json'),p=JSON.parse(await fs.readFile(file,'utf8'));p.items[0].title='Synthetic external edit';await fs.writeFile(file,bytes(p));
 await assert.rejects(recover(f.root,{transactionId:status.transactionId,complete:true}),code('CONCURRENT_FILE_CHANGE'));assert.equal(JSON.parse(await fs.readFile(file,'utf8')).items[0].title,'Synthetic external edit');assert.ok(await fs.stat(path.join(f.root,PENDING)));
});
test('rule references and unsafe typed navigation URLs remain checked without configuration models',async t=>{
 const f=await fixture(t),bad=seedFiles();bad['feature-map.json'].modules[0]!.roleIds=['unknown-role'];
 await assert.rejects(seed(f,bad),code('INVALID_REFERENCES'));
 const url=seedFiles();url['feature-map.json'].modules[0]!.entryPoints[0]!.url='https://example.invalid/?code=synthetic';await assert.rejects(seed(f,url),code('AUTHENTICATION_IN_URL'));
 const extra=seedFiles() as Record<string,unknown>;extra['accounts.json']={items:[{id:'bad',title:'完全合成',unexpected:true}]};await assert.rejects(seed(f,extra),code('INVALID_STRUCTURE'));
 const secret=seedFiles();secret['feature-map.json'].modules[0]!.summary='Bearer '+'x'.repeat(32);await assert.rejects(seed(f,secret),code('POSSIBLE_CREDENTIAL'));
 assert.equal((await loadKnowledge(f.root)).snapshotSha256,f.initial.snapshotSha256);
});
test('state promotion needs new basis and a bare observation cannot become a confirmed rule',async t=>{
 const f=await fixture(t),values=seedFiles();values['rules/data-scope.json'].entries[0]!.statements[0]!.meta.state='observed';await seed(f,values);const s=await loadKnowledge(f.root),changed=topic();changed.entries[0]!.statements[0]!.meta.updatedAt='2026-11-03T02:00:00Z';changed.entries[0]!.statements[0]!.meta.changeReason='合成审核。';
 await assert.rejects(save(f.root,request(s.header,s.snapshotSha256,{'rules/data-scope.json':changed},f.history)),code('PROMOTION_REQUIRES_NEW_BASIS'));
 const bad=topic();bad.entries[0]!.statements[0]!.meta.sourceRefs=[{sourceId:'observation-only',locator:'Synthetic'}];
 await assert.rejects(save(f.root,request(s.header,s.snapshotSha256,{'rules/data-scope.json':bad,'sources/observation-only.json':{...source,id:'observation-only',kind:'observation'}},f.history)),code('INVALID_REFERENCES'));
});
test('directory links are refused for source and backup targets without altering original knowledge',async t=>{
 const f=await fixture(t),alias=path.join(f.directory,'alias');await fs.symlink(f.root,alias,process.platform==='win32'?'junction':'dir');
 await assert.rejects(initialize(alias,{projectName:'Synthetic'}),code('SYMLINK_PATH'));await fs.unlink(alias);
});
test('Git dirtiness includes project/map/accounts, pinned nested reads and three-way conflicts remain read-only',async t=>{
 const f=await fixture(t);await seed(f);const git=(...args:string[])=>exec('git',['-C',f.directory,...args],{windowsHide:true});
 await git('init');await git('config','user.email','synthetic@example.invalid');await git('config','user.name','Synthetic Fixture');await git('add','knowledge');await git('commit','-m','Synthetic base');const base=(await git('rev-parse','HEAD')).stdout.trim();
 await git('checkout','-b','left');const left=topic();left.entries[0]!.statements[0]!.text+=' Left synthetic rule.';await fs.writeFile(path.join(f.root,'rules/data-scope.json'),bytes(left));await git('add','knowledge');await git('commit','-m','Synthetic left');const ours=(await git('rev-parse','HEAD')).stdout.trim();
 await git('checkout','-b','right',base);const right=topic();right.entries[0]!.statements[0]!.text+=' Right synthetic rule.';await fs.writeFile(path.join(f.root,'rules/data-scope.json'),bytes(right));await git('add','knowledge');await git('commit','-m','Synthetic right');const theirs=(await git('rev-parse','HEAD')).stdout.trim();
 const file=path.join(f.root,'rules/data-scope.json'),before=digest(await fs.readFile(file)),result=await compare(f.root,{base,ours,theirs});assert.ok(result.changes.some(c=>c.id==='rule-owned-data'&&c.kind==='conflict'));assert.equal(digest(await fs.readFile(file)),before);assert.equal((await loadKnowledge(f.root,{commit:base})).map?.modules.length,1);
 const projectFile=path.join(f.root,'project.json'),config=JSON.parse(await fs.readFile(projectFile,'utf8'));config.items[0].properties['自定义业务配置']={label:'Right synthetic setting',values:[1,false,null]};await fs.writeFile(projectFile,bytes(config));await git('add','knowledge/project.json');await git('commit','-m','Synthetic free configuration right');const configRight=(await git('rev-parse','HEAD')).stdout.trim();
 await git('checkout','left');config.items[0].properties['自定义业务配置']={label:'Left synthetic setting',extra:{custom:true}};await fs.writeFile(projectFile,bytes(config));await git('add','knowledge/project.json');await git('commit','-m','Synthetic free configuration left');const configLeft=(await git('rev-parse','HEAD')).stdout.trim();
 const configurationComparison=await compare(f.root,{base,ours:configLeft,theirs:configRight,ids:['synthetic-uat']});assert.equal(configurationComparison.changes[0]!.kind,'conflict');assert.match(JSON.stringify(configurationComparison.changes[0]!.ours),/Left synthetic setting/);assert.match(JSON.stringify(configurationComparison.changes[0]!.theirs),/Right synthetic setting/);
 const a=path.join(f.root,'accounts.json'),av=JSON.parse(await fs.readFile(a,'utf8'));av.items[0].title='Synthetic working draft';await fs.writeFile(a,bytes(av));assert.equal((await gitState(f.root)).draft,true);assert.notEqual((await loadKnowledge(f.root,{commit:base})).accounts?.items[0]?.title,av.items[0].title);
});
