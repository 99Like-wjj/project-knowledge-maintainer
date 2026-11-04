#!/usr/bin/env node
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialize,save,recover} from './writer.mjs';
import {loadKnowledge,regular} from './store.mjs';
import {compare} from './changes.mjs';
import {bytes,KnowledgeError,fail} from './contract.mjs';
export async function main(args:string[]){const[action,...rest]=args;if(!action||action==='--help')return 'init --knowledge-root ABS --request ABS_JSON\nvalidate --knowledge-root ABS\nsave --knowledge-root ABS --request ABS_JSON\ncompare --knowledge-root ABS --request ABS_JSON\nrecover --knowledge-root ABS [--transaction-id ID --complete true]\nContent is curated by the current AI; these commands never infer rules or connect to remotes.';
  const allowed=action==='validate'?['knowledge-root']:action==='recover'?['knowledge-root','transaction-id','complete']:['knowledge-root','request'];
  const flags:Record<string,string>={};for(let i=0;i<rest.length;i+=2){const k=rest[i]?.replace(/^--/,''),v=rest[i+1];if(!rest[i]?.startsWith('--')||!k||!v||v.startsWith('--')||flags[k]||!allowed.includes(k))fail('INVALID_ARGUMENT');flags[k]=v;}const root=flags['knowledge-root'];if(!root)fail('KNOWLEDGE_ROOT_REQUIRED');
  if(action==='validate'){const s=await loadKnowledge(root);return{valid:!s.diagnostics.length,header:s.header,empty:!s.units.some(u=>u.queryable),presence:s.presence,snapshotSha256:s.snapshotSha256,version:s.version,diagnostics:s.diagnostics};}
  if(action==='recover'){if(flags.complete!==undefined&&flags.complete!=='true')fail('INVALID_ARGUMENT');return recover(root,{...(flags['transaction-id']?{transactionId:flags['transaction-id']}:{}),complete:flags.complete==='true'});}
  if(!['init','save','compare'].includes(action)||!flags.request)fail('INVALID_COMMAND');let request:unknown;try{request=JSON.parse((await regular(flags.request)).toString('utf8'));}catch(e){if(e instanceof SyntaxError)fail('INVALID_REQUEST_JSON');throw e;}return action==='init'?initialize(root,request):action==='save'?save(root,request):compare(root,request);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(r=>process.stdout.write(typeof r==='string'?r+'\n':bytes(r))).catch(e=>{process.stderr.write(bytes({error:e instanceof KnowledgeError?e.code:'IO_ERROR'}));process.exitCode=1;});
