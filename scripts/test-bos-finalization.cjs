// Isolated transport/idempotency tests. No accounts, network or database writes.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('node:assert/strict');
const ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const memory=new Map();global.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
let mode='lost',calls=[];
const result={estimate:{id:'estimate',total_pkr:13600,status:'finalized'},quotation:{id:'quote',version:2}};
const client={rpc:async(name,args)=>{calls.push({name,args});if(mode==='lost')throw Error('Response lost');if(mode==='invalid')return {error:{code:'22023',message:'Rate changed'}};if(mode==='partial')return {data:{}};return {data:result};}};
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='../lib/env')return {isMockMode:false};
 if(name==='../lib/supabase')return {requireSupabaseClient:()=>client};
 return original.call(this,name,parent,isMain);
};
const service=require('../src/services/bosFinalizationService.ts');
(async()=>{
 const preview={quotation:{version:2},submittedLines:[{itemId:'wire',unit:'m',quantity:40,rate:340,brandId:'brand',wireSizeId:'size',configuredRate:true,notes:''}]};
 const request=service.persistFinalization('engineer','booking',preview);
 assert.equal(service.persistFinalization('engineer','booking',preview).key,request.key);
 await assert.rejects(()=>service.finalizeBosQuotation('engineer',request),/Response lost/);
 const restored=service.loadPendingFinalization('engineer','booking');assert.deepEqual(restored,request);
 mode='partial';await assert.rejects(()=>service.finalizeBosQuotation('engineer',restored),/incomplete/);
 assert.deepEqual(service.loadPendingFinalization('engineer','booking'),request);
 mode='success';assert.equal(await service.finalizeBosQuotation('engineer',restored),result);
 assert.equal(service.loadPendingFinalization('engineer','booking'),null);
 assert.ok(calls.every(c=>c.name==='finalize_bos_and_create_quotation'));
 assert.ok(calls.every(c=>c.args.p_request_key===request.key));
 assert.ok(calls.every(c=>JSON.stringify(c.args.p_lines)===JSON.stringify(request.lines)));
 const next=service.persistFinalization('engineer','booking',preview);assert.notEqual(next.key,request.key);
 mode='invalid';await assert.rejects(()=>service.finalizeBosQuotation('engineer',next),/Rate changed/);
 assert.equal(service.loadPendingFinalization('engineer','booking'),null);
 assert.equal(service.loadPendingFinalization('other-engineer','booking'),null);
 console.log('PASS: durable request key, lost-response retry, incomplete-response retry, exact payload reuse, success cleanup, validation rollback, engineer isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
