const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);

const root=process.env.ENGINEER_PDF_ROOT || path.resolve(__dirname,'..');
const mobileRoot=process.env.MOBILE_ROOT || path.resolve(root,'..','kaamasaan-mobile');
const portalSource=fs.readFileSync(path.join(root,'src/quotation/quotationDocument.ts'),'utf8');
const mobileSource=fs.readFileSync(path.join(mobileRoot,'src/utils/quotationDocument.ts'),'utf8');
assert.equal(portalSource,mobileSource,'Mobile and Engineer Portal quotation contracts must remain byte-identical.');
const {BOS_QUOTATION_DESCRIPTION,buildBosDescription}=require(path.join(root,'src/quotation/quotationDocument.ts'));

const item=(position,family,specification,brand=null,source=null)=>({position,item_name_snapshot:[family,specification].join(' · '),family_name_snapshot:family,
 specification_snapshot:specification,source_description_snapshot:source,wire_size_snapshot:null,brand_snapshot:brand,category_snapshot:''});

assert.equal(buildBosDescription([]),BOS_QUOTATION_DESCRIPTION);
assert.equal(buildBosDescription([item(1,'AC Breaker / MCCB','63 A · 2P',null,null)]),`${BOS_QUOTATION_DESCRIPTION}\n\nSelected BOS Components:\nAC Breaker: AC Breaker / MCCB 63 A 2P`);

const mixed=buildBosDescription([
 item(1,'AC Breaker / MCCB','63 A · 2P','Chint','AC Breaker 63A 2P'),
 item(2,'AC Breaker / MCCB','MCCB · 100 A · 3P','Chint','AC Breaker MCCB 100A 3P'),
 item(3,'DB','8-Way'),item(4,'DB','12-Way'),item(5,'AC SPD','2P','Schneider'),
 item(6,'ATS Changeover','4P','CNC','ATS Change over 4P'),
 item(7,'AC Cable','6 mm² · Black','Fast Cable','AC cable black 6mm'),
 item(8,'DC Cable','4 mm² · Red · XLPO Imported','KUKA Cable','DC cable red 4mm - XLPO Imported (KUKA)'),
 item(9,'Bare Conductor','10 mm²',null,'Bare conductor 10mm'),
]);
for(const expected of [
 'AC Breaker: AC Breaker 63A 2P Chint, AC Breaker MCCB 100A 3P Chint',
 'DB: DB 8-Way, DB 12-Way','AC SPD: AC SPD 2P Schneider','ATS Change over: ATS Change over 4P CNC',
 'AC Cable: AC cable black 6mm Fast Cable','DC Cable: DC cable red 4mm - XLPO Imported (KUKA)',
 'Earthing Cable: Bare conductor 10mm']) assert.ok(mixed.includes(expected),expected);
assert.equal((mixed.match(/^DB:/gm)||[]).length,1,'Multiple DBs share one group row.');
assert.ok(!mixed.includes('Empty Group'),'Empty groups are omitted.');
assert.ok(mixed.indexOf('AC Breaker:')<mixed.indexOf('DB:') && mixed.indexOf('DB:')<mixed.indexOf('AC SPD:'),'Groups use stable business order.');

console.log('PASS: fixed copy, no-items fallback, breaker/MCCB, multiple DBs, SPD, ATS, AC/DC cables, earthing, brands, omission and stable order; mobile/portal contracts aligned.');
