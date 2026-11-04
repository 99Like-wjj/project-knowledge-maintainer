import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';import {Ajv2020} from 'ajv/dist/2020.js';import {fullFormats} from 'ajv-formats/dist/formats.js';import {parseDocument} from '../src/contract.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const validator=async()=>new Ajv2020({formats:fullFormats,strict:true}).compile(JSON.parse(await fs.readFile(path.join(root,'schemas/project-knowledge.schema.json'),'utf8')));
test('external v3 schema and runtime agree on every document, including the shared configuration shape',async()=>{
 const validate=await validator();
 for(const name of ['knowledge.json','project.json','feature-map.json','accounts.json','sources/manual-v1.json','rules/data-scope.json']){
  const value=JSON.parse(await fs.readFile(path.join(root,'examples/knowledge.synthetic',name),'utf8'));assert.equal(validate(value),true,JSON.stringify(validate.errors));assert.doesNotThrow(()=>parseDocument(name,value));
  const extra={...value,unexpected:'synthetic'};assert.equal(validate(extra),false);assert.throws(()=>parseDocument(name,extra));
  for(const key of Object.keys(value)){const missing={...value};delete missing[key];assert.equal(validate(missing),false,name+': '+key);assert.throws(()=>parseDocument(name,missing));}
 }
});
test('minimal and unrelated user attributes remain plain JSON instead of becoming metadata or foreign keys',async()=>{
 const validate=await validator();
 const cases=[
  {items:[{id:'minimal',title:'完全合成名称'}]},
  {items:[{id:'custom',title:'完全合成自定义属性',properties:{组织自由说明:'馆甲',meta:'user-defined',sourceRefs:null,nested:{id:'not-an-indexed-record',roleId:'unregistered'},values:[null,false,true,1.5,'text',{a:[2]}]}}]},
  JSON.parse('{"items":[{"id":"proto-example","title":"Completely synthetic","properties":{"__proto__":{"synthetic":true}}}]}')
 ];
 for(const v of cases)for(const name of ['project.json','accounts.json']){assert.equal(validate(v),true,JSON.stringify(validate.errors));assert.deepEqual(parseDocument(name,v),v);}
 for(const value of [undefined,Infinity,NaN,()=>true]){const bad={items:[{id:'bad',title:'完全合成',properties:{custom:value}}]};assert.equal(validate(bad),false);assert.throws(()=>parseDocument('accounts.json',bad));}
 for(const bad of [{items:[{title:'no id'}]},{items:[{id:'no-title'}]},{items:[{id:'bad',title:'Synthetic',properties:[]}]},{accounts:[],checks:[],issues:[]}]){assert.equal(validate(bad),false);assert.throws(()=>parseDocument('accounts.json',bad));}
 assert.equal(({} as {synthetic?:boolean}).synthetic,undefined);
});
test('rule dates, confirmation basis shape and obsolete fields are still strictly checked',async()=>{
 const validate=await validator(),data=JSON.parse(await fs.readFile(path.join(root,'examples/knowledge.synthetic/rules/data-scope.json'),'utf8'));
 const variants=[structuredClone(data),structuredClone(data),structuredClone(data)];
 variants[0].entries[0].statements[0].meta.updatedAt='2026-02-30T00:00:00Z';
 variants[1].entries[0].statements[0].meta.sourceRefs=[];
 variants[2].entries[0].statements[0].scopeIds=['obsolete-scope'];
 for(const v of variants){assert.equal(validate(v),false);assert.throws(()=>parseDocument('rules/data-scope.json',v));}
});
