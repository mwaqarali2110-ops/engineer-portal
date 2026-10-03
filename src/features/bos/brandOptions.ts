import type {BosCatalogData} from '../../services/bosCatalogService';
import type {BosLine} from '../../types/domain';
export function applicableBrand(catalog:BosCatalogData,itemId:string,brandId:string){
  if(!catalog.wireBrands.some(b=>b.id===brandId && b.active))return false;
  const item=catalog.categories.flatMap(c=>c.items).find(i=>i.id===itemId);
  if(item?.brandHint && !catalog.wireBrands.some(b=>b.id===brandId && b.name===item.brandHint))return false;
  return catalog.itemBrands ? catalog.itemBrands.some(a=>a.itemId===itemId && a.brandId===brandId && a.active)
    : catalog.wireBrandRates.some(r=>r.wireItemId===itemId && r.brandId===brandId && r.active)
      || catalog.quantityRates.some(r=>r.itemId===itemId && r.brandId===brandId);
}
/** Catalog order only; never sort by price or automatically choose a brand. */
export function brandOptions(line:BosLine,catalog:BosCatalogData){
  return catalog.wireBrands.filter(b=>b.active && applicableBrand(catalog,line.catalogItemId,b.id)).map(b=>{
    const wire=line.kind==='wire' ? catalog.wireBrandRates.find(r=>r.active && r.wireItemId===line.catalogItemId && r.wireSizeId===line.wireSizeId && r.brandId===b.id) : null;
    const quantity=line.kind==='quantity' ? catalog.quantityRates.find(r=>r.itemId===line.catalogItemId && r.unit===line.unit && r.brandId===b.id) : null;
    return {...b,rate:wire?.ratePerMeter ?? quantity?.unitPrice ?? null,provisional:wire?.provisional ?? quantity?.provisional ?? false};
  });
}
export function commonGroupBrands(lines:BosLine[],catalog:BosCatalogData){
  return lines.length ? brandOptions(lines[0],catalog).filter(b=>b.rate!==null && lines.every(l=>brandOptions(l,catalog).some(o=>o.id===b.id && o.rate!==null))) : [];
}
