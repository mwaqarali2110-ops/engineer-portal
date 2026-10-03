import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosCatalogItem, BosLine } from '../../types/domain';
import { resolveWireRate } from './catalog';
import {applicableBrand} from './brandOptions';

export const standardBosTemplates = [{ id: 'general', label: 'General site worksheet', families: ['AC Cable','DC Cable','AC Breaker / MCCB','AC SPD','ATS Changeover','DB','Earth Wire','Cu Rod','MC4 Connector','PVC Pipe','White Duct','O-Lug'] }];
export const frequentFamilies = standardBosTemplates[0].families;
export function familyKey(item: BosCatalogItem) { return item.familyName ?? `Legacy · ${item.name}`; }
export function catalogItems(catalog: BosCatalogData) { return catalog.categories.flatMap(c => c.items).filter(i => i.active); }
export function families(catalog: BosCatalogData) {
  const result = new Map<string, BosCatalogItem[]>();
  for (const item of catalogItems(catalog)) { const key = familyKey(item); result.set(key,[...(result.get(key) ?? []),item]); }
  return result;
}
export function searchItems(items: BosCatalogItem[], query: string) {
  const tokens=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item=>tokens.every(token=>[familyKey(item),item.specification,item.sourceDescription,item.categoryLabel,...(item.searchAliases ?? [])].join(' ').toLowerCase().includes(token)));
}
export function lineIdentity(line: BosLine) { return [line.catalogItemId,line.kind==='wire' ? line.wireSizeId ?? '' : '',line.brandId ?? '',line.unit].join('|'); }
export function duplicateLine(lines: BosLine[], candidate: BosLine) { return lines.find(line=>line.id!==candidate.id && lineIdentity(line)===lineIdentity(candidate)); }
export function createWorksheetLine(item: BosCatalogItem, id: string, catalog: BosCatalogData | null, previous?: BosLine): BosLine {
  const base = { id, catalogItemId:item.id,name:item.name,categoryId:item.categoryId,familyName:item.familyName,specification:item.specification,sourceDescription:item.sourceDescription,sourceKey:item.sourceKey,notes:previous?.notes };
  const hintedBrand=catalog?.wireBrands.find(b=>b.active && b.name===item.brandHint)?.id ?? null;
  if(item.kind==='wire') return priceLine({ ...base,kind:'wire',unit:'m',wireSizeId: item.fixedWireMm2 ? catalog?.wireSizes.find(s=>s.active && s.mm2===item.fixedWireMm2)?.id ?? null : null,brandId:hintedBrand,ratePerMeter:null,lengthMeters:previous ? previous.kind==='wire' ? previous.lengthMeters : previous.quantity : null },catalog);
  return priceLine({ ...base,kind:'quantity',unit:item.defaultUnit,quantity:previous ? previous.kind==='quantity' ? previous.quantity : previous.lengthMeters : null,unitPrice:null,brandId:null },catalog);
}
export function priceLine(line: BosLine,catalog: BosCatalogData | null): BosLine {
  if(line.kind==='quantity' && !line.brandId && catalog?.itemBrands?.some(a=>a.itemId===line.catalogItemId && a.active
    && catalog.wireBrands.some(b=>b.id===a.brandId && b.active)))return {...line,unitPrice:null,configuredRate:true,rateProvisional:false};
  if(line.brandId && catalog && !applicableBrand(catalog,line.catalogItemId,line.brandId))return line.kind==='wire'
    ? {...line,ratePerMeter:null,rateProvisional:false} : {...line,unitPrice:null,configuredRate:true,rateProvisional:false};
  if(line.kind==='wire') {
    const rate=catalog?.wireBrandRates.find(r=>r.active && r.wireItemId===line.catalogItemId && r.wireSizeId===line.wireSizeId && r.brandId===line.brandId);
    const exactItem=catalog?.categories.flatMap(c=>c.items).find(i=>i.id===line.catalogItemId);
    return {...line,ratePerMeter:exactItem?.sourceKey ? rate?.ratePerMeter ?? null : resolveWireRate(catalog?.wireBrandRates ?? [],{wireItemId:line.catalogItemId,wireSizeId:line.wireSizeId,brandId:line.brandId}),rateProvisional:rate?.provisional ?? false};
  }
  const rate=catalog?.quantityRates.find(r=>r.itemId===line.catalogItemId && r.brandId===(line.brandId ?? null) && r.unit===line.unit);
  const item=catalog?.categories.flatMap(c=>c.items).find(i=>i.id===line.catalogItemId);
  return {...line,unitPrice:rate?.unitPrice ?? (item?.sourceKey || line.configuredRate ? null : line.unitPrice),configuredRate:!!rate,rateProvisional:rate?.provisional ?? false};
}
