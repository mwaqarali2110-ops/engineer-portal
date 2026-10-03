import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosPresetData } from '../../services/bosPresetService';
import type { BosCatalogItem,BosLine } from '../../types/domain';
import { catalogItems,createWorksheetLine,duplicateLine,priceLine } from './worksheet';
export type PresetWorksheet={lines:BosLine[];selectedPresetIds:string[]};
export function siteQuantity(line:BosLine){return line.kind==='wire' ? line.lengthMeters : line.quantity;}
export function setSiteQuantity(line:BosLine,value:number | null):BosLine{return line.kind==='wire' ? {...line,lengthMeters:value} : {...line,quantity:value};}
export function activeSiteLines(lines:BosLine[]){return lines.filter(l=>Number.isFinite(siteQuantity(l)) && (siteQuantity(l) ?? 0)>0);}
export function invalidSiteQuantity(lines:BosLine[]){return lines.some(l=>siteQuantity(l)!==null && (!Number.isFinite(siteQuantity(l)) || (siteQuantity(l) ?? 0)<0));}
function linkLine(lines:BosLine[],candidate:BosLine,presetId:string,defaultQuantity?:number){
  let existing=duplicateLine(lines,candidate);
  // Preset defaults do not pick a cable brand. Reuse a sole already-branded
  // material selection, preserving its actual length/rate instead of doubling.
  if(!existing && !candidate.brandId){const matches=lines.filter(l=>l.catalogItemId===candidate.catalogItemId && l.unit===candidate.unit && (l.kind!=='wire' || candidate.kind==='wire' && l.wireSizeId===candidate.wireSizeId));if(matches.length>1)throw new Error('Multiple brands already exist for this material. Resolve the selection before adding this preset.');existing=matches[0];}
  if(existing)return lines.map(l=>l.id===existing!.id ? {...l,presetIds:[...new Set([...(l.presetIds ?? []),presetId])],presetDefaultQuantities:{...(l.presetDefaultQuantities ?? {}),...(defaultQuantity===undefined ? {} : {[presetId]:defaultQuantity})},quantityGroupKey:candidate.quantityGroupKey ?? l.quantityGroupKey,quantityGroupPresetId:candidate.quantityGroupPresetId ?? l.quantityGroupPresetId} : l);
  return [...lines,{...candidate,presetIds:[presetId],presetDefaultQuantities:defaultQuantity===undefined ? {} : {[presetId]:defaultQuantity}}];
}
export function addPreset(state:PresetWorksheet,presetId:string,data:BosPresetData,catalog:BosCatalogData,makeId:()=>string):PresetWorksheet{
  if(state.selectedPresetIds.includes(presetId))return state;
  if(!data.presets.some(p=>p.active && p.id===presetId))throw new Error('Preset is unavailable. Refresh the catalog.');
  let lines=[...state.lines];const items=catalogItems(catalog);
  for(const mapping of data.items.filter(i=>i.active && i.preset_id===presetId)){
    const item=items.find(i=>i.id===mapping.bos_item_id);if(!item)throw new Error(`Preset material is unavailable: ${mapping.source_description}`);
    const candidate={...setSiteQuantity(createWorksheetLine(item,makeId(),catalog),mapping.default_quantity>0 ? mapping.default_quantity : null),quantityGroupKey:mapping.quantity_group_key,quantityGroupPresetId:mapping.quantity_group_key ? presetId : null};
    lines=linkLine(lines,candidate,presetId,mapping.default_quantity);
  }
  return {lines,selectedPresetIds:[...state.selectedPresetIds,presetId]};
}
export function removePreset(state:PresetWorksheet,presetId:string):PresetWorksheet{
  return {selectedPresetIds:state.selectedPresetIds.filter(id=>id!==presetId),lines:state.lines.flatMap(line=>{if(!line.presetIds?.includes(presetId))return [line];const ids=line.presetIds.filter(id=>id!==presetId);if(!ids.length)return [];const defaults={...line.presetDefaultQuantities};delete defaults[presetId];return [{...line,presetIds:ids,presetDefaultQuantities:defaults,...(line.quantityGroupPresetId===presetId ? {quantityGroupKey:null,quantityGroupPresetId:null} : {})}];})};
}
export function resetPreset(state:PresetWorksheet,presetId:string,data:BosPresetData,catalog:BosCatalogData,makeId:()=>string){
  const next=addPreset(removePreset(state,presetId),presetId,data,catalog,makeId);return {...next,selectedPresetIds:state.selectedPresetIds};
}
export function addCustomItem(state:PresetWorksheet,item:BosCatalogItem,presetId:string,catalog:BosCatalogData,makeId:()=>string,data?:BosPresetData){
  const grouped=data?.items.find(i=>i.active && i.preset_id===presetId && i.bos_item_id===item.id && i.quantity_group_key);
  if(grouped && data){let lines=[...state.lines];for(const mapping of data.items.filter(i=>i.active && i.preset_id===presetId && i.quantity_group_key===grouped.quantity_group_key)){
    const member=catalogItems(catalog).find(i=>i.id===mapping.bos_item_id);if(!member)throw new Error('A conductor in this cable set is unavailable. Refresh the catalog.');
    const candidate={...setSiteQuantity(createWorksheetLine(member,makeId(),catalog),mapping.default_quantity>0 ? mapping.default_quantity : null),quantityGroupKey:mapping.quantity_group_key,quantityGroupPresetId:presetId};
    lines=linkLine(lines,candidate,presetId,mapping.default_quantity);
  }return {...state,lines};}
  return {...state,lines:linkLine(state.lines,createWorksheetLine(item,makeId(),catalog),presetId)};
}
export function updateSiteLine(state:PresetWorksheet,id:string,patch:Partial<BosLine>,catalog:BosCatalogData):PresetWorksheet{
  const current=state.lines.find(l=>l.id===id);if(!current)return state;
  const next=priceLine({...current,...patch} as BosLine,catalog);if(duplicateLine(state.lines,next))throw new Error('That exact material/brand already exists. Increase its quantity instead.');
  return {...state,lines:state.lines.map(l=>l.id===id ? next : l)};
}
export function updateSynchronizedLength(state:PresetWorksheet,key:string,value:number | null):PresetWorksheet{return {...state,lines:state.lines.map(l=>l.quantityGroupKey===key ? setSiteQuantity(l,value) : l)};}
export function updateSynchronizedBrand(state:PresetWorksheet,key:string,brandId:string | null,catalog:BosCatalogData):PresetWorksheet{
  if(brandId && state.lines.filter(l=>l.quantityGroupKey===key).some(l=>{
    const priced=priceLine({...l,brandId},catalog);return priced.kind!=='wire' || priced.ratePerMeter===null;
  }))throw new Error('This brand has no applicable rate for every conductor. Review individual conductor options; no brands were substituted.');
  const next={...state,lines:state.lines.map(l=>l.quantityGroupKey===key ? priceLine({...l,brandId},catalog) : l)};
  if(next.lines.some(l=>l.quantityGroupKey===key && duplicateLine(next.lines,l)))throw new Error('That branded conductor already exists. Resolve the overlapping selection first.');
  return next;
}
export function synchronizedLength(lines:BosLine[]){const values=lines.map(siteQuantity);return values.length && values.every(v=>v===values[0]) ? values[0] : null;}
export function invalidSynchronizedGroups(lines:BosLine[],data:BosPresetData){
  return [...new Set(lines.map(l=>l.quantityGroupKey).filter((key):key is string=>!!key))].some(key=>{
    const group=lines.filter(l=>l.quantityGroupKey===key),positive=activeSiteLines(group);if(!positive.length)return false;
    const expected=new Set(data.items.filter(i=>i.active && i.quantity_group_key===key).map(i=>i.bos_item_id));
    return expected.size!==4 || group.length!==expected.size || group.some(l=>!expected.has(l.catalogItemId)) || positive.length!==group.length || synchronizedLength(group)===null;
  });
}
