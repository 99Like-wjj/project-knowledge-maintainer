/** Three-way knowledge comparison only. Git remains responsible for merging branches. */
import {loadKnowledge} from './store.mjs';
import {canonical,object,text,fail,strings,bytes,indexLibrary} from './contract.mjs';
import type {Snapshot} from './store.mjs';
function units(s:Snapshot):Map<string,unknown>{
  const out=new Map<string,unknown>([['$header',s.header]]);
  for(const u of indexLibrary(s)){
    const value=structuredClone(u.content);
    for(const key of ['statements','descriptions','entryPoints','entries'])if(Array.isArray(value[key]))value[key]=(value[key] as {id:string}[]).map(v=>v.id);
    out.set(u.id,{parentId:u.parentId,kind:u.kind,...value});
  }
  return out;
}
function integer(v:unknown,fallback:number,min:number,max:number){if(v===undefined)return fallback;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)fail('INVALID_COMPARE_LIMIT');return v;}
export async function compare(root:string,input:unknown){
  const r=object(input,['base','ours','theirs','ids','offset','limit','maxBytes'],['base','ours','theirs']);
  const offset=integer(r.offset,0,0,100000),limit=integer(r.limit,10,1,50),maxBytes=integer(r.maxBytes,24000,2048,200000),selected=r.ids===undefined?[]:strings(r.ids);
  const [base,ours,theirs]=await Promise.all([loadKnowledge(root,{commit:text(r.base)}),loadKnowledge(root,{commit:text(r.ours)}),loadKnowledge(root,{commit:text(r.theirs)})]);
  if([ours,theirs].some(s=>s.header.projectId!==base.header.projectId||s.header.knowledgeId!==base.header.knowledgeId))fail('PROJECT_MISMATCH');
  const b=units(base),o=units(ours),t=units(theirs),diagnostics=[...base.diagnostics,...ours.diagnostics,...theirs.diagnostics];
  const all=[...new Set([...b.keys(),...o.keys(),...t.keys()])].sort().filter(id=>!selected.length||selected.includes(id)).flatMap(id=>{
    const before=b.get(id)??null,left=o.get(id)??null,right=t.get(id)??null,lc=canonical(before)!==canonical(left),rc=canonical(before)!==canonical(right);
    return lc||rc?[{id,kind:lc&&rc&&canonical(left)!==canonical(right)?'conflict':lc&&rc?'same_change':lc?'ours_only':'theirs_only',base:before,ours:left,theirs:right}]:[];
  });
  const changes:{id:string;kind:string;base:unknown;ours:unknown;theirs:unknown}[]=[];
  const preview=(v:unknown)=>{const s=bytes(v);return Buffer.byteLength(s)<4096?v:{excerpt:s.slice(0,700),valueTruncated:true};};
  const result=()=>({comparisonVersion:1,base:base.version,ours:ours.version,theirs:theirs.version,diagnosticCount:diagnostics.length,diagnostics:diagnostics.slice(0,5).map(d=>({...d,affectedIds:d.affectedIds.slice(0,3)})),diagnosticsTruncated:diagnostics.length>5||diagnostics.some(d=>d.affectedIds.length>3),changeCount:all.length,offset,nextOffset:offset+changes.length<all.length?offset+changes.length:null,truncated:offset+changes.length<all.length,changes,caveat:'ID/text differences only, not business judgment. Some values may be previews; exact contents remain at the supplied Git commits. Nonconflicting files can still contain conflicting rules. No merge or write was performed.'});
  for(const c of all.slice(offset,offset+limit)){changes.push({...c,base:preview(c.base),ours:preview(c.ours),theirs:preview(c.theirs)});if(Buffer.byteLength(bytes(result()))>maxBytes){changes.pop();break;}}
  if(Buffer.byteLength(bytes(result()))>maxBytes)fail('OUTPUT_BUDGET_TOO_SMALL');
  return result();
}
