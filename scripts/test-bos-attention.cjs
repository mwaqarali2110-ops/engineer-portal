const fs=require('fs'),assert=require('node:assert/strict'),ts=require('../node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const root=require('path').join(__dirname,'../src/features/bos');
const {bosAttentionItems,incompleteSiteLines}=require(root+'/attention.ts'),{isLinePriced,estimateTotal}=require(root+'/calculations.ts'),{activeSiteLines,removePreset,resetPreset}=require(root+'/presets.ts');
const base={id:'a',catalogItemId:'item',name:'AC Breaker',kind:'quantity',unit:'pcs',quantity:2,unitPrice:null,presetIds:['p'],specification:'63A · 2P'};
const item={id:'item',name:'AC Breaker',categoryLabel:'Electrical',kind:'quantity',active:true,defaultUnit:'pcs',allowedUnits:['pcs']};
const catalog={categories:[{items:[item]}],wireBrands:[{id:'chint',name:'CHINT',active:true}],wireSizes:[],wireBrandRates:[],quantityRates:[],itemBrands:[{itemId:'item',brandId:'chint',active:true}]};
const presets={presets:[{id:'p',name:'Single Phase Hybrid System',code:'common',active:true}],items:[{id:'m',preset_id:'p',bos_item_id:'item',default_quantity:2,active:true}]};
const detail=l=>bosAttentionItems([l],catalog,presets)[0];
assert.equal(detail(base).reasons.length,2);assert.equal(bosAttentionItems([base],catalog,presets).length,1);
assert(detail({...base,brandId:'chint'}).reasons.some(r=>r.label==='Selected brand has no configured rate'));
assert(detail({...base,quantity:-1}).reasons.some(r=>r.label.includes('Quantity')));
assert(detail({...base,unit:'m',quantity:-1}).reasons.some(r=>r.label.includes('Length')));
assert(detail({...base,specificationPending:true}).reasons.some(r=>r.label==='Required specification missing'));
assert(detail({...base,unitPrice:50,rateProvisional:true}).reasons.some(r=>r.label==='Provisional rate blocks finalization'));
assert.equal(bosAttentionItems([{...base,quantity:null}],catalog,presets).length,0,'Intentional unused site line remains excluded');
for(const quantity of [null,0,-1,1,Infinity,NaN])for(const unitPrice of [null,0,10,Infinity,NaN]){
 const l={...base,quantity,unitPrice};assert.equal(incompleteSiteLines([l]).length,activeSiteLines([l]).filter(l=>!isLinePriced(l)).length);
}
assert.equal(bosAttentionItems(Array.from({length:4},(_,i)=>({...base,id:'l'+i})),catalog,presets).length,4);
const wires=['Black','Red','Blue','Yellow'].map((name,i)=>({id:'w'+i,catalogItemId:'wire'+i,name,kind:'wire',unit:'m',wireSizeId:'size',brandId:'chint',lengthMeters:10,ratePerMeter:i===3 ? null : 50,quantityGroupKey:'g',presetIds:['p']}));
const groupPresets={...presets,items:wires.map(l=>({preset_id:'p',bos_item_id:l.catalogItemId,quantity_group_key:'g',quantity_group_label:'6 mm² AC Cable — 4 Wire Set',active:true}))};
for(const size of [4,6,10]){
 const p={...groupPresets,items:groupPresets.items.map(i=>({...i,quantity_group_label:`${size} mm² AC Cable — 4 Wire Set`}))};
 const details=bosAttentionItems(wires,catalog,p);assert.equal(details.length,1);assert.equal(details[0].line.name,'Yellow');assert.equal(details[0].brandName,'CHINT');assert(details[0].groupTitle.startsWith(String(size)));
}
assert(bosAttentionItems(wires.map((l,i)=>i===3 ? {...l,lengthMeters:null} : l),catalog,groupPresets).find(i=>i.line.id==='w3').reasons.some(r=>r.label==='Length missing'));
assert(detail({...wires[0],wireSizeId:null,brandId:null}).reasons.some(r=>r.label==='Wire size missing'));
const four=Array.from({length:4},(_,i)=>({...base,id:'l'+i,catalogItemId:'i'+i}));assert.equal(estimateTotal(four.map(l=>({...l,unitPrice:50}))),400);
assert.equal(removePreset({lines:four,selectedPresetIds:['p']},'p').lines.length,0);
assert.equal(resetPreset({lines:[base],selectedPresetIds:['p']},'p',presets,catalog,()=> 'reset').lines[0].quantity,2);
assert.equal(bosAttentionItems([{...base,presetIds:['removed']}],catalog,{presets:[],items:[]}).length,1);
console.log('PASS attention model: original predicate matrix, four unique lines, multiple reasons once, quantity/length/rate/brand/spec/size/provisional labels, intentional unused lines excluded, 4/6/10 cable conductor identification, unchanged totals/reset/remove, unavailable preset safety.');

