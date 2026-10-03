import type { BosLine } from '../../types/domain';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type { BosPresetData } from '../../services/bosPresetService';
import { isLinePriced } from './calculations';
import { activeSiteLines, invalidSiteQuantity, invalidSynchronizedGroups, siteQuantity, synchronizedLength } from './presets';
import { brandOptions } from './brandOptions';

// This is the existing incomplete-count predicate, also used by handleSave.
export function incompleteSiteLines(lines: BosLine[]) {
  return activeSiteLines(lines).filter(line => !isLinePriced(line));
}
export type AttentionReason = { label: string; kind: 'site' | 'rate' | 'brand'; control?: 'qty' | 'brand' | 'size' | 'spec' | 'rate' };
export type AttentionItem = { line: BosLine; name: string; specification?: string | null; category: string; groupTitle?: string; brandName?: string; reasons: AttentionReason[] };
export function bosAttentionItems(lines: BosLine[], catalog: BosCatalogData, presets: BosPresetData | null): AttentionItem[] {
  const incomplete = new Set(incompleteSiteLines(lines).map(l => l.id));
  const active = new Set(activeSiteLines(lines).map(l => l.id));
  const result = new Map<string, AttentionItem>();
  for (const line of lines) {
    const group = line.quantityGroupKey ? lines.filter(l => l.quantityGroupKey === line.quantityGroupKey) : [];
    const invalidGroup = !!presets && !!group.length && invalidSynchronizedGroups(group, presets);
    if (!incomplete.has(line.id) && !invalidSiteQuantity([line]) && !invalidGroup && !(active.has(line.id) && line.rateProvisional)) continue;
    const item = catalog.categories.flatMap(c => c.items).find(i => i.id === line.catalogItemId);
    const owner = line.quantityGroupPresetId ?? line.presetIds?.[0];
    const mapping = presets?.items.find(i => i.preset_id === owner && i.bos_item_id === line.catalogItemId);
    const reasons: AttentionReason[] = [];
    const qty = siteQuantity(line), rate = line.kind === 'wire' ? line.ratePerMeter : line.unitPrice;
    if (line.specificationPending) reasons.push({label:'Required specification missing',kind:'site',control:'spec'});
    if (line.kind === 'wire' && !line.wireSizeId) reasons.push({label:'Wire size missing',kind:'site',control:'size'});
    if (!line.brandId && (line.kind === 'wire' || brandOptions(line,catalog).length > 0)) reasons.push({label:'Brand not selected',kind:'brand',control:'brand'});
    if (!Number.isFinite(qty) || (qty ?? 0) <= 0) reasons.push({label:`${line.unit === 'm' ? 'Length' : 'Quantity'} ${qty === null ? 'missing' : 'must be finite and positive'}`,kind:'site',control:'qty'});
    if (!Number.isFinite(rate) || (rate ?? 0) <= 0) reasons.push({label:line.brandId ? 'Selected brand has no configured rate' : 'Rate not configured',kind:'rate',control:'rate'});
    if (invalidGroup && synchronizedLength(group) === null) reasons.push({label:'Enter one synchronized length for all conductors',kind:'site',control:'qty'});
    if (invalidGroup && group.length !== 4) reasons.push({label:'Complete the required four-conductor set',kind:'site'});
    if (active.has(line.id) && line.rateProvisional) reasons.push({label:'Provisional rate blocks finalization',kind:'rate'});
    if (!reasons.length) reasons.push({label:'Line amount or cable set is invalid; review this item',kind:'site'});
    result.set(line.id,{line,name:mapping?.display_name ?? line.familyName ?? line.name,specification:line.specification,
      category:presets?.presets.find(p => p.id === owner)?.name ?? item?.categoryLabel ?? 'Previous / Ungrouped Items',
      brandName:catalog.wireBrands.find(b => b.id === line.brandId)?.name,
      groupTitle:group.length ? presets?.items.find(i => i.quantity_group_key === line.quantityGroupKey)?.quantity_group_label ?? line.quantityGroupKey! : undefined,reasons});
  }
  return [...result.values()];
}

/** Navigate within this worksheet only; filters and conductor details are opened first. */
export function revealBosItem(root: HTMLElement, item: AttentionItem) {
  const row = Array.from(root.querySelectorAll<HTMLElement>('[id]')).find(el => el.id === item.line.id);
  if (!row) return;
  for (let parent = row.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const control = item.reasons.find(r => r.control)?.control;
  const group = row.closest('.bos-cable-set');
  const controls = Array.from(row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'));
  let focus: HTMLElement | undefined;
  if (control === 'qty') focus = group ? group.querySelector<HTMLInputElement>('.bos-cable-set-head input') ?? undefined : controls.find(el => el.id.endsWith('-qty'));
  if (control === 'brand') focus = controls.find(el => el.getAttribute('aria-label')?.startsWith('Brand for'));
  if (control === 'size') focus = controls.find(el => el.id.endsWith('-size') || el.getAttribute('aria-label')?.startsWith('Wire size'));
  if (control === 'spec') focus = controls.find(el => el.id.endsWith('-spec'));
  if (control === 'rate') focus = row.querySelector<HTMLInputElement>('.bos-material-price input') ?? controls.find(el => el.getAttribute('aria-label')?.startsWith('Rate for'));
  row.tabIndex = -1;
  (focus && !focus.closest('fieldset:disabled') ? focus : row).focus({preventScroll:true});
  row.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'center'});
  row.classList.add('bos-attention-highlight');
  window.setTimeout(() => row.classList.remove('bos-attention-highlight'),2200);
}
