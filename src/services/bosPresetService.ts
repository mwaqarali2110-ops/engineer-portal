import { isMockMode } from '../lib/env';
import { requireSupabaseClient } from '../lib/supabase';
import source from '../data/bosPresetSource.json';
export type BosPreset = {id:string;code:string;name:string;sort_order:number;active:boolean};
export type BosPresetItem = {id:string;preset_id:string;bos_item_id:string;default_quantity:number;sort_order:number;quantity_group_key:string | null;quantity_group_label:string | null;active:boolean;source_description:string;display_name?:string | null};
export type BosPresetData = {presets:BosPreset[];items:BosPresetItem[];deploymentRequired?:boolean};
export const presetCardOrder=[['net_billing','Net-Metering / Net-Billing'],['three_phase_hybrid','3 Phase Hybrid System'],['single_phase_hybrid','Single Phase Hybrid System'],['ac_cables','AC Cables'],['earthing','Earthing'],['fittings_075','0.75" Fittings'],['fittings_1','1" Fittings'],['fittings_125','1.25" Fittings'],['fittings_15','1.5" Fittings'],['common','Common / Miscellaneous']] as const;
export async function loadBosPresets():Promise<BosPresetData>{
  if(isMockMode)return {presets:source.presets.map(p=>({id:p.code,code:p.code,name:p.name,sort_order:p.sort_order,active:true})),items:source.presets.flatMap(p=>p.items.map(r=>({id:`${p.code}:${r.source_row}`,preset_id:p.code,bos_item_id:r.identity,default_quantity:r.default_quantity,sort_order:r.sort_order,quantity_group_key:r.quantity_group_key,quantity_group_label:r.quantity_group_label,active:true,source_description:r.source_description,display_name:r.display_name})))};
  const supabase=requireSupabaseClient();
  const [presets,items]=await Promise.all([supabase.from('bos_presets').select('id,code,name,sort_order,active').eq('active',true).order('sort_order'),supabase.from('bos_preset_items').select('id,preset_id,bos_item_id,default_quantity,sort_order,quantity_group_key,quantity_group_label,active,source_description,display_name').eq('active',true).order('sort_order')]);
  const errors=[presets.error,items.error].filter(Boolean);
  if(errors.length){if(errors.every(e=>['PGRST205','42P01'].includes(e!.code)))return {presets:[],items:[],deploymentRequired:true};throw new Error(`BOS presets could not be loaded: ${errors[0]!.message}`);}
  return {presets:presets.data as BosPreset[],items:(items.data ?? []).map(r=>({...r,default_quantity:Number(r.default_quantity)})) as BosPresetItem[]};
}
