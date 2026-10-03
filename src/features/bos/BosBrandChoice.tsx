import {useEffect,useRef,useState} from 'react';
import {Select} from '../../components/ui/Select';
import {formatPkr} from '../../lib/format';
import type {BosCatalogData} from '../../services/bosCatalogService';
import type {BosLine} from '../../types/domain';
import {brandOptions} from './brandOptions';
export function BosBrandChoice({line,catalog,onChange}:{line:BosLine;catalog:BosCatalogData;onChange:(id:string|null)=>void}){
  const options=brandOptions(line,catalog),[comparing,setComparing]=useState(false),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(comparing)dialog.current?.showModal();else dialog.current?.close();},[comparing]);
  const unbranded=line.kind==='quantity' && !options.length && catalog.quantityRates.some(r=>r.itemId===line.catalogItemId && r.unit===line.unit && r.brandId===null);
  if(line.kind!=='wire' && !options.length && !line.brandId)return null;
  return <div><Select aria-label={`Brand for ${line.name}`} value={line.brandId ?? ''} placeholder="Choose customer brand" options={[
    ...(unbranded ? [{value:'',label:'Unbranded · configured rate'}] : []),
    ...options.map(b=>({value:b.id,label:`${b.name} · ${b.rate===null ? 'Rate not configured' : formatPkr(b.rate)+'/'+line.unit}`,disabled:b.rate===null})),
    ...(line.brandId && !options.some(b=>b.id===line.brandId) ? [{value:line.brandId,label:'Saved brand unavailable'}] : [])
  ]} onValueChange={id=>onChange(id || null)}/>
  {!!options.length && <button type="button" onClick={()=>setComparing(true)} style={{fontSize:11,marginTop:4}}>Compare brands</button>}
  <dialog ref={dialog} className="bos-catalog-dialog" aria-label={`Compare brands for ${line.name}`} onCancel={()=>setComparing(false)} onClose={()=>setComparing(false)}>
    <div className="bos-drawer-head"><h3>{line.familyName ?? line.name} · {line.specification}</h3><button type="button" onClick={()=>setComparing(false)}>Close</button></div>
    <p>Select the customer's preferred brand. Prices are current; finalization freezes the selected rate.</p>
    {options.map(b=><button type="button" key={b.id} disabled={b.rate===null} className="bos-spec-option" onClick={()=>{onChange(b.id);setComparing(false);}}><strong>{b.name}</strong><span>{b.rate===null ? 'Rate not configured' : `${formatPkr(b.rate)} / ${line.unit}`}{b.provisional ? ' · Provisional — cannot finalize' : ''}</span></button>)}
  </dialog></div>;
}
