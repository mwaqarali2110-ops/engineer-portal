import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Notice';
import { formatPkr } from '../../lib/format';
import { loadFrozenBosItems, type FrozenBosItem, type QuotationVersion } from '../../services/bosFinalizationService';
import { prepareUpdatedQuotationPdf } from '../../services/quotationPdfService';
import { BOS_QUOTATION_DESCRIPTION, quotationPriceRows } from '../../quotation/quotationDocument';

export function UpdatedQuotation({ version, onPublished }: { version: QuotationVersion; onPublished?: () => Promise<void> }) {
  const [pdfError,setPdfError] = useState('');
  const [pdfReady,setPdfReady] = useState(false);
  const [retry,setRetry] = useState(0);
  const [items,setItems] = useState<FrozenBosItem[]>([]);
  const [itemsError,setItemsError] = useState('');
  const q = version.snapshot;
  useEffect(() => {
    let active = true;
    setPdfReady(false); setPdfError('');
    void prepareUpdatedQuotationPdf(version).then(() => { if(active) { setPdfReady(true); void onPublished?.(); } })
      .catch(error => { if(active) setPdfError(error instanceof Error ? error.message : 'PDF preparation failed.'); });
    return () => { active=false; };
  },[version,retry,onPublished]);
  useEffect(() => {
    let active=true; setItems([]); setItemsError('');
    if (version.bos_estimate_id) void loadFrozenBosItems(version.bos_estimate_id)
      .then(rows => { if(active) setItems(rows); })
      .catch(() => { if(active) setItemsError('The frozen BOS breakdown could not be loaded. Reopen this quotation to retry.'); });
    return () => { active=false; };
  },[version]);
  async function viewPdf() {
    const tab=window.open('about:blank','_blank');
    if(tab) tab.opener=null;
    try {
      const url=await prepareUpdatedQuotationPdf(version);
      if(tab) tab.location.href=url;
      else { setPdfError('Allow the quotation tab, then select View PDF again.'); }
    } catch(error) { tab?.close(); setPdfReady(false); setPdfError(error instanceof Error ? error.message : 'Unable to open PDF. Retry PDF.'); }
  }
  return <div className="updated-quotation">
    <h3>Quotation v{q.version} · {q.type === 'POST_SURVEY' ? 'Awaiting Customer Review' : 'Pre-Survey'}</h3>
    <p>{q.customer.name} · {q.reference} · {new Date(q.createdAt).toLocaleDateString('en-PK')}</p>
    <p>{q.customer.address}, {q.customer.city} · {q.customer.phone}</p>
    <p>{q.system.systemSizeKw} kW solar · {q.system.inverter?.capacityKw} kW inverter · {q.system.battery?.totalCapacityKwh ?? 0} kWh battery</p>
    <dl className="quotation-prices">{quotationPriceRows(q).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.amount === null ? 'Not confirmed' : formatPkr(row.amount)}</dd></div>)}
      <div className="quotation-grand-total"><dt>Final Total</dt><dd>{formatPkr(q.system.finalTotal ?? 0)}</dd></div>
    </dl>
    <p className="quotation-bos-description">{BOS_QUOTATION_DESCRIPTION}</p>
    {pdfError ? <Notice tone="error">{pdfError} <Button variant="secondary" onClick={()=>setRetry(v=>v+1)}>Retry PDF</Button></Notice> : null}
    <Button variant="secondary" disabled={!pdfReady} onClick={()=>void viewPdf()}>{pdfReady ? 'View PDF' : 'Preparing PDF…'}</Button>
    {version.bos_estimate_id ? <details className="frozen-bos"><summary>Internal finalized BOS breakdown</summary>
      {itemsError ? <Notice tone="error">{itemsError}</Notice> : items.map(item=><p key={item.position}>
        <strong>{item.family_name_snapshot ?? item.item_name_snapshot}</strong> · {[item.specification_snapshot ?? item.wire_size_snapshot,item.brand_snapshot].filter(Boolean).join(' · ')} · {item.quantity_or_length} {item.unit_snapshot} × {formatPkr(item.rate_snapshot_pkr)} = {formatPkr(item.line_total_pkr)}{item.provisional_rate_snapshot ? ' (provisional rate)' : ''}
      </p>)}
    </details> : null}
  </div>;
}
