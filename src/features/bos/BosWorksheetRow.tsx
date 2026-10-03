import { Trash2 } from 'lucide-react';
import { Field } from '../../components/ui/Field';
import { NumberInput } from '../../components/ui/NumberInput';
import { Select } from '../../components/ui/Select';
import { formatPkr } from '../../lib/format';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosCatalogItem, BosLine, BosUnit, QuantityBosLine, WireBosLine } from '../../types/domain';
import { familyKey, catalogItems } from './worksheet';
import {BosBrandChoice} from './BosBrandChoice';

export function BosWorksheetRow({line,amount,catalog,catalogItem,onUpdateWire,onUpdateQuantity,onRemove,onSpecification,focused}:{line:BosLine;amount:number;catalog:BosCatalogData;catalogItem?:BosCatalogItem;onUpdateWire:(id:string,patch:Partial<WireBosLine>)=>void;onUpdateQuantity:(id:string,patch:Partial<QuantityBosLine>)=>void;onRemove:(id:string)=>void;onSpecification:(id:string,item:BosCatalogItem)=>void;focused:boolean}) {
  const variants=catalogItem ? catalogItems(catalog).filter(i=>familyKey(i)===familyKey(catalogItem)) : [];
  const quantityBrands=catalog.quantityRates.filter(r=>r.itemId===line.catalogItemId && r.unit===line.unit && r.brandId).map(r=>r.brandId);
  const brands=catalog.wireBrands.filter(b=>b.active && (line.kind==='wire' ? !catalogItem?.brandHint || b.name===catalogItem.brandHint : quantityBrands.includes(b.id)));
  const rate=line.kind==='wire' ? line.ratePerMeter : line.unitPrice;
  return <article id={line.id} tabIndex={-1} className={`bos-worksheet-row${focused ? ' bos-row-focused' : ''}`}>
    <div className="bos-row-heading"><strong>{line.familyName ?? line.name}</strong><button type="button" className="line-remove" aria-label={`Remove ${line.familyName ?? line.name}`} onClick={()=>onRemove(line.id)}><Trash2 size={15}/></button></div>
    <div className="bos-row-fields">
      <Field label="Specification" htmlFor={`${line.id}-spec`}><Select id={`${line.id}-spec`} value={line.specificationPending ? '' : line.catalogItemId} placeholder="Choose specification" options={variants.length ? variants.map(i=>({value:i.id,label:i.specification ?? i.name})) : [{value:line.catalogItemId,label:line.specification ?? line.name}]} onValueChange={value=>{const item=variants.find(i=>i.id===value);if(item)onSpecification(line.id,item);}}/></Field>
      {line.kind==='wire' && !catalogItem?.fixedWireMm2 && <Field label="Wire size" htmlFor={`${line.id}-size`}><Select id={`${line.id}-size`} value={line.wireSizeId ?? ''} placeholder="Select size" options={catalog.wireSizes.filter(s=>s.active).map(s=>({value:s.id,label:s.label}))} onValueChange={v=>onUpdateWire(line.id,{wireSizeId:v || null})}/></Field>}
      <BosBrandChoice line={line} catalog={catalog} onChange={brandId=>line.kind==='wire' ? onUpdateWire(line.id,{brandId}) : onUpdateQuantity(line.id,{brandId})}/>
      <Field label={line.unit==='m' ? 'Length' : 'Quantity'} htmlFor={`${line.id}-qty`}><NumberInput id={`${line.id}-qty`} value={line.kind==='wire' ? line.lengthMeters : line.quantity} suffix={line.unit} onChange={v=>line.kind==='wire' ? onUpdateWire(line.id,{lengthMeters:v}) : onUpdateQuantity(line.id,{quantity:v})}/></Field>
      {line.kind==='quantity' && !catalogItem?.sourceKey && (catalogItem?.allowedUnits.length ?? 0)>1 && <Field label="Legacy unit" htmlFor={`${line.id}-unit`}><Select id={`${line.id}-unit`} value={line.unit} options={(catalogItem?.allowedUnits ?? [line.unit]).map(u=>({value:u,label:u}))} onValueChange={v=>onUpdateQuantity(line.id,{unit:v as BosUnit})}/></Field>}
      <Field label="Rate">{line.kind==='quantity' && !catalogItem?.sourceKey && !line.configuredRate ? <NumberInput value={line.unitPrice} prefix="Rs" onChange={v=>onUpdateQuantity(line.id,{unitPrice:v})}/> : <div className="bos-row-rate">{line.specificationPending || rate===null ? 'Rate not configured' : `${formatPkr(rate)}/${line.unit}`}<small>{line.rateProvisional ? 'Provisional · verify before finalizing' : rate!==null && !line.specificationPending ? 'Verified' : 'Admin pricing required'}</small></div>}</Field>
      <div className="bos-row-amount"><span>Amount</span><strong>{line.specificationPending || rate===null ? '—' : formatPkr(amount)}</strong></div>
    </div>
    {!catalogItem && <p className="bos-catalog-hint">Saved item is unavailable. Your draft selection is preserved.</p>}
    {catalogItem?.unitReviewNote && <details className="bos-source-note"><summary>Source / unit note</summary>{catalogItem.unitReviewNote}<br/>{catalogItem.sourceDescription}</details>}
    {catalogItem?.supportsNotes && <input className="bos-row-note" aria-label="Site notes" placeholder="Site notes" value={line.notes ?? ''} onChange={e=>line.kind==='quantity' ? onUpdateQuantity(line.id,{notes:e.target.value}) : onUpdateWire(line.id,{notes:e.target.value})}/>}
  </article>;
}
