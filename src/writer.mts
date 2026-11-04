/** Local knowledge transactions. AI supplies curated content; this module never extracts rules. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fail,object,text,id,sha,list,bytes,digest,canonical,parseHeader,parseDocument,emptyProject,indexLibrary,checkReferences,checkSecrets,configurationUnit} from './contract.mjs';
import type {Header,Topic,Source,Project,FeatureMap,Accounts,Library} from './contract.mjs';
import {safePath,regular,managed,loadKnowledge,PENDING} from './store.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const existsError=(e:unknown)=>e instanceof Error&&'code'in e&&e.code==='ENOENT';
async function external(root:string,protectedRoots:string[]=[]){const p=await safePath(root,{protectedRoots:[sourceRoot,...protectedRoots]});if(p===path.parse(p).root)fail('FILESYSTEM_ROOT_REFUSED');return p;}
async function absent(file:string){try{await fs.lstat(file);return false;}catch(e){if(existsError(e))return true;throw e;}}
export async function initialize(root:string,input:unknown){
  const r=object(input,['projectName','projectId','allowExistingDirectory','protectedRoots'],['projectName']);text(r.projectName);
  if(r.projectId!==undefined)id(r.projectId);if(r.allowExistingDirectory!==undefined&&typeof r.allowExistingDirectory!=='boolean')fail('INVALID_OPTION');
  const protectedRoots=r.protectedRoots===undefined?[]:list(r.protectedRoots).map(v=>text(v));root=await external(root,protectedRoots);
  const filename=path.join(root,'knowledge.json');
  const reuse=async()=>{const s=await loadKnowledge(root);if(r.projectId!==undefined?s.header.projectId!==r.projectId:s.header.projectName!==r.projectName)fail('PROJECT_MISMATCH');return{created:false,knowledgeRoot:root,header:s.header,snapshotSha256:s.snapshotSha256,empty:!s.units.some(u=>u.queryable),diagnostics:s.diagnostics};};
  if(!await absent(filename))return reuse();
  let names:string[]=[];try{names=await fs.readdir(root);}catch(e){if(!existsError(e))throw e;}
  if(names.includes('knowledge.json'))return reuse();
  if(names.some(n=>['project.json','feature-map.json','accounts.json','rules','sources'].includes(n)))fail('INITIALIZATION_FILE_COLLISION');
  if(names.some(n=>!/^\.pkm-init-[a-f0-9-]+\.tmp$/.test(n))&&!r.allowExistingDirectory)fail('NONEMPTY_DIRECTORY_REQUIRES_EXPLICIT_TARGET');
  const header=parseHeader({knowledgeFormatVersion:3,knowledgeId:crypto.randomUUID(),projectId:r.projectId??crypto.randomUUID(),projectName:r.projectName,createdAt:new Date().toISOString()});
  checkSecrets(header);await fs.mkdir(root,{recursive:true});await safePath(root,{existing:true});
  const temporary=path.join(root,'.pkm-init-'+crypto.randomUUID()+'.tmp'),data=bytes(header);await fs.writeFile(temporary,data,{flag:'wx',mode:0o600});
  try{
    if(digest(await regular(temporary))!==digest(data))fail('STAGING_CHANGED');
    try{await fs.link(temporary,filename);}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='EEXIST'))throw e;return reuse();}
    try{await fs.writeFile(path.join(root,'project.json'),bytes(emptyProject()),{flag:'wx',mode:0o600});}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='EEXIST'))throw e;parseDocument('project.json',JSON.parse((await regular(path.join(root,'project.json'))).toString('utf8')));}
    const saved=await loadKnowledge(root);return{created:true,knowledgeRoot:root,header:saved.header,snapshotSha256:saved.snapshotSha256,empty:!saved.units.some(u=>u.queryable),diagnostics:saved.diagnostics};
  }finally{if(digest(await regular(temporary))===digest(data))await fs.unlink(temporary);}
}
interface Change {name:string;beforeSha256:string|null;afterSha256:string;temp:string}
interface Journal {state:'prepared';transactionId:string;requestSha256:string;baseSnapshotSha256:string;files:Change[];backupDir:string|null;reason:string}
function parseJournal(v:unknown):Journal {
  checkSecrets(v);
  const o=object(v,['state','transactionId','requestSha256','baseSnapshotSha256','files','backupDir','reason']);if(o.state!=='prepared')fail('INCOMPLETE_PREPARATION_REVIEW_REQUIRED');id(o.transactionId);sha(o.requestSha256);sha(o.baseSnapshotSha256);text(o.reason);if(o.backupDir!==null)text(o.backupDir);
  for(const x of list(o.files)){const c=object(x,['name','beforeSha256','afterSha256','temp']);if(!managed(text(c.name)))fail('INVALID_MANAGED_PATH');if(c.beforeSha256!==null)sha(c.beforeSha256);sha(c.afterSha256);if(!/^\.pkm-[a-f0-9-]+-\d+\.tmp$/.test(text(c.temp)))fail('INVALID_STAGING_PATH');}
  return o as unknown as Journal;
}
function parseFiles(files:Record<string,unknown>):Library{
  const header=parseHeader(files['knowledge.json']),sources:Source[]=[],topics:Topic[]=[];let project:Project|null=null,map:FeatureMap|null=null,accounts:Accounts|null=null;
  for(const [name,value]of Object.entries(files)){
    if(!managed(name))fail('INVALID_MANAGED_PATH');const v=parseDocument(name,value);
    if(name==='knowledge.json')continue;
    if(name==='project.json')project=v as Project;else if(name==='feature-map.json')map=v as FeatureMap;else if(name==='accounts.json')accounts=v as Accounts;else{
      const item=v as Source|Topic;if(name!==name.split('/')[0]+'/'+item.id+'.json')fail('FILENAME_ID_MISMATCH');if(name.startsWith('sources/'))sources.push(item as Source);else topics.push(item as Topic);
    }
  }
  const library={header,sources,topics,project,map,accounts},diagnostics=checkReferences(library);if(diagnostics.length)fail('INVALID_REFERENCES',JSON.stringify(diagnostics));return library;
}
function preserveDefinitions(old:Library,next:Library){
  const before=indexLibrary(old),after=new Map(indexLibrary(next).map(u=>[u.id,u]));
  for(const unit of before){
    const replacement=after.get(unit.id);
    if(!replacement){if(configurationUnit(unit))continue;fail(unit.kind==='source'?'SOURCE_REMOVAL_REFUSED':unit.kind==='statement'?'RETIRE_STATEMENT_INSTEAD_OF_REMOVING':unit.kind==='issue'?'ISSUE_REMOVAL_REFUSED':'RETIRE_ENTRY_INSTEAD_OF_REMOVING');}
    if(unit.kind!==replacement.kind)fail('ENTRY_KIND_CHANGED');
    if(unit.kind==='source')for(const key of ['documentId','version','sha256','kind','locator','issuedAt'])if(unit.content[key]!==replacement.content[key])fail('SOURCE_VERSION_ID_IMMUTABLE');
    if(unit.kind==='check'&&canonical(unit.content)!==canonical(replacement.content))fail('CHECK_IMMUTABLE');
    if(unit.meta&&replacement.meta){
      const oldMeta=unit.meta,newMeta=replacement.meta;
      if(oldMeta.state!=='confirmed'&&newMeta.state==='confirmed'&&canonical(oldMeta.sourceRefs)===canonical(newMeta.sourceRefs))fail('PROMOTION_REQUIRES_NEW_BASIS');
      const material=(value:Record<string,unknown>)=>{const copy=structuredClone(value),meta=copy.meta as Record<string,unknown>;delete meta.updatedAt;delete meta.changeReason;return copy;};
      if(canonical(material(unit.content))!==canonical(material(replacement.content))&&(oldMeta.updatedAt===newMeta.updatedAt||oldMeta.changeReason===newMeta.changeReason))fail('CHANGE_PROVENANCE_REQUIRED');
    }
  }
}
async function complete(root:string,journal:Journal,hooks:{afterPublish?:(count:number)=>Promise<void>}={}) {
  const marker=path.join(root,PENDING),markerHash=digest(await regular(marker));let published=0;
  for(const c of journal.files){const target=await safePath(path.join(root,c.name)),temp=path.join(root,c.temp);let actual:string|null=null;try{actual=digest(await regular(target));}catch(e){if(!existsError(e))throw e;}
    if(actual===c.afterSha256)continue;if(actual!==c.beforeSha256)fail('CONCURRENT_FILE_CHANGE');if(digest(await regular(temp))!==c.afterSha256)fail('STAGING_CHANGED');
    await safePath(path.dirname(target));await fs.mkdir(path.dirname(target),{recursive:true});await safePath(target);
    if(c.beforeSha256===null)await fs.link(temp,target);else await fs.rename(temp,target);
    if(digest(await regular(target))!==c.afterSha256)fail('WRITE_READBACK_FAILED');await hooks.afterPublish?.(++published);
  }
  const saved=await loadKnowledge(root,{ignorePending:true});if(saved.diagnostics.length)fail('POST_WRITE_INVALID');
  if(digest(await regular(marker))!==markerHash)fail('TRANSACTION_MARKER_CHANGED');
  for(const c of journal.files){const temp=path.join(root,c.temp);if(!await absent(temp)){if(digest(await regular(temp))!==c.afterSha256)fail('STAGING_CHANGED');await fs.unlink(temp);}}
  await fs.unlink(marker);
  return{saved:true,transactionId:journal.transactionId,knowledgeRoot:root,snapshotSha256:saved.snapshotSha256,changedFiles:journal.files.map(c=>c.name),backupDir:journal.backupDir,businessVerified:false};
}
export async function save(root:string,input:unknown,hooks:{afterPublish?:(count:number)=>Promise<void>}={}){
  const r=object(input,['projectId','knowledgeId','expectedSnapshotSha256','files','reason','backupDir']);id(r.projectId);id(r.knowledgeId);sha(r.expectedSnapshotSha256);text(r.reason);if(r.backupDir!==null)text(r.backupDir);
  checkSecrets(r);
  root=await external(root);const marker=path.join(root,PENDING),transactionId=crypto.randomUUID(),requestSha256=digest(canonical(r));
  await fs.writeFile(marker,bytes({state:'preparing',transactionId,requestSha256}),{flag:'wx',mode:0o600}).catch(e=>{if(e instanceof Error&&'code'in e&&e.code==='EEXIST')fail('RECOVERY_REQUIRED');throw e;});
  const temporary:string[]=[];let prepared=false;
  try {
    const current=await loadKnowledge(root,{ignorePending:true});if(current.header.projectId!==r.projectId||current.header.knowledgeId!==r.knowledgeId)fail('PROJECT_MISMATCH');if(current.snapshotSha256!==r.expectedSnapshotSha256)fail('SNAPSHOT_CONFLICT');if(current.diagnostics.length)fail('CURRENT_KNOWLEDGE_INVALID');
    const supplied=object(r.files,Object.keys((r.files??{}) as object));if(!Object.keys(supplied).length)fail('EMPTY_CHANGE');for(const name of Object.keys(supplied))if(!managed(name))fail('INVALID_MANAGED_PATH');const files:Record<string,unknown>=Object.fromEntries(Object.entries(current.files).map(([n,f])=>[n,f.content]));Object.assign(files,supplied);
    const next=parseFiles(files);if(next.header.projectId!==current.header.projectId||next.header.knowledgeId!==current.header.knowledgeId||next.header.createdAt!==current.header.createdAt)fail('IDENTITY_IMMUTABLE');preserveDefinitions(current,next);
    const changes=Object.entries(supplied).filter(([n,v])=>canonical(v)!==canonical(current.files[n]?.content));
    let backupDir:string|null=null;
    if(changes.some(([n])=>current.files[n])&&!(current.version.available&&!current.version.draft&&current.version.gitCommit)){
      if(r.backupDir===null)fail('PREVIOUS_CONTENT_RETENTION_REQUIRED');backupDir=await external(text(r.backupDir),[root]);await fs.mkdir(backupDir,{recursive:true});
      for(const [name]of changes){if(!current.files[name])continue;const destination=await safePath(path.join(backupDir,current.snapshotSha256,name));await fs.mkdir(path.dirname(destination),{recursive:true});const old=await regular(path.join(root,name));try{await fs.writeFile(destination,old,{flag:'wx',mode:0o600});}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='EEXIST')||digest(await regular(destination))!==digest(old))throw e;}}
    }
    const records:Change[]=[];for(const [index,[name,value]]of changes.entries()){const temp='.pkm-'+transactionId+'-'+index+'.tmp',data=bytes(value),filename=path.join(root,temp);await fs.writeFile(filename,data,{flag:'wx',mode:0o600});temporary.push(filename);if(digest(await regular(filename))!==digest(data))fail('STAGING_CHANGED');records.push({name,beforeSha256:current.files[name]?.sha256??null,afterSha256:digest(data),temp});}
    const recheck=await loadKnowledge(root,{ignorePending:true});if(recheck.snapshotSha256!==current.snapshotSha256)fail('SNAPSHOT_CONFLICT');
    const journal:Journal={state:'prepared',transactionId,requestSha256,baseSnapshotSha256:current.snapshotSha256,files:records,backupDir,reason:text(r.reason)};
    const journalTemp=path.join(root,'.pkm-'+transactionId+'-9999.tmp');await fs.writeFile(journalTemp,bytes(journal),{flag:'wx',mode:0o600});temporary.push(journalTemp);await fs.rename(journalTemp,marker);prepared=true;
    return await complete(root,journal,hooks);
  } catch(e) {if(!prepared){for(const filename of temporary){if(!await absent(filename))await fs.unlink(await safePath(filename));}const lock=JSON.parse((await regular(marker)).toString('utf8')) as {transactionId?:string};if(lock.transactionId===transactionId)await fs.unlink(marker);}throw e;}
}
export async function recover(root:string,{transactionId,complete:finish=false}:{transactionId?:string;complete?:boolean}={}){
  root=await external(root);const journal=parseJournal(JSON.parse((await regular(path.join(root,PENDING))).toString('utf8')));if(transactionId!==undefined&&transactionId!==journal.transactionId)fail('TRANSACTION_MISMATCH');
  if(!finish)return{recoveryRequired:true,transactionId:journal.transactionId,files:journal.files.map(c=>c.name),reason:journal.reason};
  if(transactionId===undefined)fail('TRANSACTION_ID_REQUIRED');return complete(root,journal);
}
