// Isolated delivery tests: no network, accounts, Storage writes or RPC calls.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('node:assert/strict');
const root=process.env.ENGINEER_PDF_ROOT || path.resolve(__dirname,'..');
const ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8').replaceAll('import.meta.env.DEV','true'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const frozen={id:'quote-v2',version:2,status:'awaiting_customer_review',bos_estimate_id:'existing-estimate',pdf_path:'owner/existing-booking/v2-bos-v2.pdf',snapshot:{type:'POST_SURVEY',version:2,system:{finalTotal:548050.50,panel:{imageUrl:'https://fixture/panel.png'},inverter:{imageUrl:'https://fixture/inverter.png'},battery:null}}};
const frozenItems=[{position:1,item_name_snapshot:'AC Breaker / MCCB · 63 A · 2P',family_name_snapshot:'AC Breaker / MCCB',specification_snapshot:'63 A · 2P',source_description_snapshot:'AC Breaker 63A 2P',brand_snapshot:'Chint'}];
const before=JSON.stringify(frozen),pdf=new TextEncoder().encode('%PDF-1.7\nfixture');
let exists=false,mode='ok',user=true,reads=0,itemReads=0,renders=0,uploads=[],checks=0,links=0,publishes=0,logs=[];
const storage={exists:async p=>{assert.equal(p,frozen.pdf_path);checks++;return mode==='denied' ? {data:false,error:{status:403,message:'Storage read denied'}} : {data:exists,error:exists ? null : {status:404}};},
 upload:async(p,body,options)=>{uploads.push({p,body,options});if(mode==='upload-error')return {error:{code:'42501',statusCode:403,message:'Insert denied'}};if(mode==='race'){exists=true;return {error:{status:409,message:'Duplicate'}};}if(mode!=='unconfirmed')exists=true;return {data:{path:p},error:null};},
 createSignedUrl:async(p,seconds)=>{assert.equal(p,frozen.pdf_path);assert.equal(seconds,300);assert(exists);links++;return {data:{signedUrl:'https://fixture/exact-v2'},error:null};}};
const client={auth:{getUser:async()=>({data:{user:user ? {id:'engineer'} : null},error:null})},storage:{from:b=>{assert.equal(b,'pre-survey-quotations');return storage;}},rpc:async(name,args)=>{assert.equal(name,'publish_finalized_quotation');assert.equal(args.p_quotation_id,frozen.id);publishes++;return mode==='publish-error' ? {error:{code:'22023',message:'Stage changed'}} : {data:{booking:{current_milestone:'quotation_shared'}},error:null};},from:()=>{throw Error('No writes allowed');}};
global.fetch=async url=>{if(mode==='image-error' && url.includes('panel'))throw Error('Image fetch failed');return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer,blob:async()=>new Blob(['image'])};};
global.createImageBitmap=async()=>({width:2,height:2,close(){}});
global.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:fn=>fn(new Blob(['png']))})};
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='../lib/supabase')return {requireSupabaseClient:()=>client};
 if(name==='./bosFinalizationService')return {
  loadQuotationVersion:async id=>{assert.equal(id,frozen.id);reads++;return structuredClone(frozen);},
  loadFrozenBosItems:async id=>{assert.equal(id,frozen.bos_estimate_id);itemReads++;return structuredClone(frozenItems);}
 };
 if(name==='../quotation/preSurveyPdf')return {renderQuotationPdf:async(snapshot)=>{assert.deepEqual(snapshot,{...frozen.snapshot,bosItems:frozenItems});renders++;if(mode==='unicode')throw new (require(path.join(root,'src/quotation/quotationText.ts')).UnsupportedQuotationTextError)();return mode==='bad-bytes' ? new Uint8Array([1,2]) : pdf;}};
 if(name.endsWith('.pdf?url'))return {default:'https://fixture/approved-master.pdf'};
 return original.call(this,name,parent,isMain);
};
const originalError=console.error;console.error=(...args)=>logs.push(args);
const {prepareUpdatedQuotationPdf:prepare}=require(path.join(root,'src/services/quotationPdfService.ts'));
function reset(next='ok'){exists=false;mode=next;user=true;reads=itemReads=renders=checks=links=publishes=0;uploads=[];logs=[];}
(async()=>{
 reset();const stale={...frozen,snapshot:{...frozen.snapshot,system:{finalTotal:1}}};
 const a=prepare(stale),b=prepare(stale);assert.equal(a,b);assert.equal(await a,'https://fixture/exact-v2');
 assert.equal(reads,1);assert.equal(itemReads,1);assert.equal(renders,1);assert.equal(uploads.length,1);assert.equal(checks,2);assert.equal(publishes,1);
 assert.equal(uploads[0].p,frozen.pdf_path);assert.equal(uploads[0].body.type,'application/pdf');assert.deepEqual(new Uint8Array(await uploads[0].body.arrayBuffer()),pdf);
 assert.deepEqual(uploads[0].options,{contentType:'application/pdf',upsert:false});
 await prepare(frozen);assert.equal(reads,2);assert.equal(itemReads,1);assert.equal(renders,1);assert.equal(uploads.length,1,'Existing object is reused');assert.equal(publishes,2,'Existing PDF safely retries milestone publication');
 reset('upload-error');await assert.rejects(()=>prepare(frozen),/PDF upload failed.*Retry PDF/);assert.equal(links,0);assert.equal(logs[0][1].stage,'upload');assert.equal(logs[0][1].code,'42501');assert(!('message' in logs[0][1]));assert(!('path' in logs[0][1]));
 mode='ok';await prepare(frozen);assert.equal(uploads.length,2,'Failed retry is cleared and can succeed');
 reset('unconfirmed');await assert.rejects(()=>prepare(frozen),/PDF upload failed/);assert.equal(links,0);assert.equal(logs[0][1].stage,'upload confirmation');
 reset('race');await prepare(frozen);assert.equal(uploads.length,1);assert.equal(links,1);
 reset('publish-error');await assert.rejects(()=>prepare(frozen),/Project Journey could not be updated/);assert.equal(publishes,1);assert.equal(links,1);
 reset('denied');await assert.rejects(()=>prepare(frozen),/PDF upload failed/);assert.equal(uploads.length,0);
 reset('image-error');await assert.rejects(()=>prepare(frozen),/saved product image/);assert.equal(uploads.length,0);
 reset('unicode');await assert.rejects(()=>prepare(frozen),e=>e.code==='PDF_TEXT_UNSUPPORTED'&&!e.message.includes('WinAnsi'));assert.equal(uploads.length,0);assert.equal(publishes,0);
 reset('bad-bytes');await assert.rejects(()=>prepare(frozen),/could not be rendered/);assert.equal(uploads.length,0);
 reset();user=false;await assert.rejects(()=>prepare(frozen),/Sign in again/);assert.equal(reads,0);assert.equal(uploads.length,0);
 reset();await assert.rejects(()=>prepare({...frozen,pdf_path:'different-path'}),/existing quotation version/);assert.equal(uploads.length,0);
 assert.equal(JSON.stringify(frozen),before,'Frozen v2 and estimate remain unchanged');
 console.error=originalError;
 console.log('PASS: fresh quotation and frozen BOS reads, exact v2 path/binary/type, upload confirmation, PDF-gated journey publication, publication retry, failure diagnostics, existing reuse, concurrent winner, session denial and render failures; no finalization or direct table writes.');
})().catch(e=>{console.error=originalError;console.error(e);process.exitCode=1;});
