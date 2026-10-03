import {useEffect,useRef,useState} from 'react';
import {Info,X} from 'lucide-react';
import type {AttentionItem} from './attention';
import './attention.css';

export function BosAttention({items,onGo}:{items:AttentionItem[];onGo:(item:AttentionItem)=>void}) {
  const [open,setOpen]=useState(false), dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open && items.length)dialog.current?.showModal();else {dialog.current?.close();if(open)setOpen(false);}},[open,items.length]);
  if(!items.length)return null;
  const groups=new Map<string,AttentionItem[]>();
  for(const item of items){const key=item.line.quantityGroupKey ?? item.line.id;groups.set(key,[...(groups.get(key) ?? []),item]);}
  return <>
    <div className="notice notice-error bos-attention-warning" role="alert"><button type="button" aria-label="Show incomplete BOS items" aria-haspopup="dialog" onClick={()=>setOpen(true)}><Info size={16}/><span>{items.length} {items.length===1 ? 'item requires' : 'items require'} attention. Complete them before finalizing.</span></button></div>
    <dialog ref={dialog} className="bos-attention-dialog" aria-labelledby="bos-attention-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
      <header><h3 id="bos-attention-title">Items Requiring Attention</h3><button type="button" aria-label="Close incomplete BOS items" onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <p>{items.length} {items.length===1 ? 'item must' : 'items must'} be completed before finalizing.</p>
      <div className="bos-attention-list">{[...groups].map(([key,members])=><section key={key}>
        {members[0].groupTitle && <h4>{members[0].groupTitle}{members.length>1 ? ` · ${members.length} affected conductors` : ''}</h4>}
        {members.map(item=><div key={item.line.id} className="bos-attention-item" data-attention-line={item.line.id}>
          <strong>{item.name}{item.specification ? ` · ${item.specification}` : ''}</strong><small>{item.category}</small>
          <div className="bos-attention-reasons">{item.reasons.map((reason,index)=><span key={index} className={`bos-attention-badge ${reason.kind}`}>{item.groupTitle && reason.kind==='rate' && item.brandName ? `${item.brandName}: ${reason.label}` : reason.label}</span>)}</div>
          {item.line.brandId && item.reasons.some(r=>r.kind==='rate') && <small>Selected brand and conductor rate must match the configured catalog.</small>}
          <button type="button" className="bos-attention-go" onClick={()=>{setOpen(false);dialog.current?.close();onGo(item);}}>Go to item</button>
        </div>)}
      </section>)}</div>
    </dialog>
  </>;
}
