import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosPresetData } from '../../services/bosPresetService';
import type { BosCatalogItem,BosLine } from '../../types/domain';
import {createId} from '../../lib/id';
import {estimateTotal} from './calculations';
import {createWorksheetLine,priceLine} from './worksheet';
import {activeSiteLines,addCustomItem,addPreset,removePreset,resetPreset,updateSiteLine,updateSynchronizedLength,updateSynchronizedBrand,type PresetWorksheet} from './presets';
export function usePresetEstimate(catalog:BosCatalogData | null,presets:BosPresetData | null){
  const [state,setState]=useState<PresetWorksheet>({lines:[],selectedPresetIds:[]});
  const [notice,setNotice]=useState('');const [focusId,setFocusId]=useState<string | null>(null);
  const catalogRef=useRef(catalog);catalogRef.current=catalog;
  const restore=useCallback((lines:BosLine[],selectedPresetIds:string[]=[])=>setState({lines:catalogRef.current ? lines.map(l=>priceLine(l,catalogRef.current)) : lines,selectedPresetIds}),[]);
  useEffect(()=>{if(catalog)setState(s=>({...s,lines:s.lines.map(l=>priceLine(l,catalog))}));},[catalog]);
  useEffect(()=>{if(focusId)requestAnimationFrame(()=>{document.getElementById(`bos-preset-${focusId}`)?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById(`bos-preset-${focusId}`)?.focus();setFocusId(null);});},[focusId]);
  const apply=useCallback((operation:(s:PresetWorksheet)=>PresetWorksheet)=>setState(s=>operation(s)),[]);
  function loadCategory(id:string){if(!catalog || !presets)return;if(state.selectedPresetIds.includes(id)){setNotice('Already added. Existing site quantities are preserved.');setFocusId(id);return;}try{const next=addPreset(state,id,presets,catalog,()=>createId('bos'));setState(next);setNotice('Category added. Defaults are editable; blank quantities are site-dependent.');setFocusId(id);}catch(e){setNotice(e instanceof Error ? e.message : 'Category unavailable.');}}
  function resetCategory(id:string){if(!catalog || !presets)return;try{setState(resetPreset(state,id,presets,catalog,()=>createId('bos')));setNotice('Category defaults restored. Shared materials keep quantities used by other categories.');}catch(e){setNotice(e instanceof Error ? e.message : 'Reset failed.');}}
  function addItem(item:BosCatalogItem,presetId:string){if(!catalog)return;try{setState(addCustomItem(state,item,presetId,catalog,()=>createId('bos'),presets ?? undefined));setNotice('Item added or reused; existing site quantities are preserved. Colored AC conductors restore their complete synchronized set.');}catch(e){setNotice(e instanceof Error ? e.message : 'Item could not be added.');}}
  function updateLine(id:string,patch:Partial<BosLine>){if(!catalog)return;try{setState(updateSiteLine(state,id,patch,catalog));setNotice('');}catch(e){setNotice(e instanceof Error ? e.message : 'Selection could not be changed.');}}
  function removeLine(id:string){const line=state.lines.find(l=>l.id===id);apply(s=>({...s,lines:s.lines.filter(l=>line?.quantityGroupKey ? l.quantityGroupKey!==line.quantityGroupKey : l.id!==id)}));}
  const total=useMemo(()=>estimateTotal(activeSiteLines(state.lines)),[state.lines]);
  function updateGroupBrand(key:string,brandId:string | null){if(!catalog)return;try{setState(updateSynchronizedBrand(state,key,brandId,catalog));setNotice('');}catch(e){setNotice(e instanceof Error ? e.message : 'Brand selection failed.');}}
  return {...state,total,notice,restore,loadCategory,resetCategory,addItem,updateLine,removeLine,updateGroupBrand,changeLegacySpecification:(id:string,item:BosCatalogItem)=>{const previous=state.lines.find(l=>l.id===id);if(previous && catalog)updateLine(id,createWorksheetLine(item,id,catalog,previous));},removeCategory:(id:string)=>apply(s=>removePreset(s,id)),updateGroupLength:(key:string,value:number | null)=>apply(s=>updateSynchronizedLength(s,key,value))};
}
