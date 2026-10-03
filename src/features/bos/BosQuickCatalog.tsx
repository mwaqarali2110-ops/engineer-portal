import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosCatalogItem } from '../../types/domain';
import { catalogItems, families, familyKey, frequentFamilies, searchItems, standardBosTemplates } from './worksheet';

export function BosQuickCatalog({catalog,onAdd,onStandard}:{catalog:BosCatalogData;onAdd:(item:BosCatalogItem)=>void;onStandard:(items:BosCatalogItem[])=>void}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[family,setFamily]=useState(''),[category,setCategory]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const all=useMemo(()=>catalogItems(catalog),[catalog]);
  const groups=useMemo(()=>families(catalog),[catalog]);
  const matches=useMemo(()=>searchItems(all,query).filter(i=>(!family || familyKey(i)===family)&&(!category || (i.categoryLabel ?? 'Legacy catalog')===category)),[all,query,family,category]);
  const visibleGroups=[...new Set(matches.map(familyKey))];
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
  function show(name=''){setQuery('');setCategory('');setFamily(name);setOpen(true);}
  return <div className="bos-quick-catalog">
    <div className="bos-quick-head"><strong>Frequently Used</strong><button type="button" className="bos-text-action" onClick={()=>onStandard(standardBosTemplates[0].families.flatMap(name=>groups.get(name)?.slice(0,1) ?? []))} disabled={!all.some(i=>i.sourceKey)}>Load Standard BOS</button></div>
    <div className="bos-frequent">{frequentFamilies.filter(name=>groups.has(name)).map(name=><button type="button" key={name} onClick={()=>show(name)}>{name}</button>)}</div>
    {!all.some(i=>i.sourceKey) && <p className="bos-catalog-hint">Standard specifications require manual catalog migration deployment. Your existing catalog and drafts remain available.</p>}
    <button type="button" className="bos-add-item" onClick={()=>show()}><Plus size={15}/> Add BOS Item</button>
    <dialog ref={dialog} className="bos-catalog-dialog" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-labelledby="bos-catalog-title">
      <div className="bos-drawer-head"><h3 id="bos-catalog-title">Add BOS Item</h3><button type="button" aria-label="Close catalog" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <div className="bos-drawer-filters"><label><Search size={15}/><input autoFocus placeholder="Search family, size, core, color, brand…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <select aria-label="Category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{[...new Set(all.map(i=>i.categoryLabel ?? 'Legacy catalog'))].map(c=><option key={c}>{c}</option>)}</select>
      {family && <button type="button" className="bos-text-action" onClick={()=>setFamily('')}>All families · clear {family}</button>}</div>
      <div className="bos-drawer-results">{open && visibleGroups.map(name=><details key={name} open={!!query || !!family}><summary>{name}<small>{matches.filter(i=>familyKey(i)===name).length} specifications</small></summary>
        {matches.filter(i=>familyKey(i)===name).map(item=><button type="button" key={item.id} className="bos-spec-option" title={item.sourceDescription ?? item.name} onClick={()=>{onAdd(item);setOpen(false);}}><span>{item.specification ?? item.name}<small>{item.brandHint ?? ''} · {item.defaultUnit}</small></span><Plus size={15}/></button>)}</details>)}
        {!matches.length && <p>No matching BOS specifications.</p>}</div>
    </dialog>
  </div>;
}
