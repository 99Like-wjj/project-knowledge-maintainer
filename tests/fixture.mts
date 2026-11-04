import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {Header,Topic,Source,Project,FeatureMap,Accounts} from '../src/contract.mjs';
const base=new URL('../../examples/knowledge.synthetic/',import.meta.url);
const read=<T,>(name:string)=>JSON.parse(fs.readFileSync(fileURLToPath(new URL(name,base)),'utf8')) as T;
export const source=read<Source>('sources/manual-v1.json');
export const project=read<Project>('project.json');
export const featureMap=read<FeatureMap>('feature-map.json');
export const accounts=read<Accounts>('accounts.json');
export const topic=()=>structuredClone(read<Topic>('rules/data-scope.json'));
export const seedFiles=()=>({'project.json':structuredClone(project),'feature-map.json':structuredClone(featureMap),'accounts.json':structuredClone(accounts),'sources/manual-v1.json':structuredClone(source),'rules/data-scope.json':topic()});
export function request(header:Header,expectedSnapshotSha256:string,files:Record<string,unknown>,backupDir:string|null=null){return{projectId:header.projectId,knowledgeId:header.knowledgeId,expectedSnapshotSha256,files,reason:'整理完全合成的通用知识。',backupDir};}
