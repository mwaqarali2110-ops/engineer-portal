import { isMockMode } from '../lib/env';
import { requireSupabaseClient } from '../lib/supabase';
import type { BosLine } from '../types/domain';
import type { QuotationDocument } from '../quotation/quotationDocument';
import { activeSiteLines, invalidSiteQuantity } from '../features/bos/presets';

export type SubmittedBosLine = { itemId: string; unit: string; quantity: number | null; rate: number | null; brandId: string | null; wireSizeId: string | null; configuredRate: boolean; notes: string; presetIds?:string[]; quantityGroupKey?:string };
export type FrozenBosItem = {
  preset_codes_snapshot?: string[] | null; quantity_group_key_snapshot?: string | null;
  family_name_snapshot?: string | null; specification_snapshot?: string | null;
  source_description_snapshot?: string | null; source_key_snapshot?: string | null;
  position: number; item_name_snapshot: string; category_snapshot: string; kind_snapshot: string;
  wire_size_snapshot: string | null; brand_snapshot: string | null; unit_snapshot: string;
  quantity_or_length: number; rate_snapshot_pkr: number; line_total_pkr: number;
  provisional_rate_snapshot: boolean; notes_snapshot: string | null;
};
export type QuotationVersion = { id: string; version: number; status: string; snapshot: QuotationDocument; bos_estimate_id: string | null; pdf_path: string };
export type BosPreview = { bosTotal: number; quotation: QuotationDocument; items: FrozenBosItem[]; hasProvisionalRates: boolean; submittedLines: SubmittedBosLine[] };
export type FinalizationResult = { estimate: { id: string; total_pkr: number; status: 'finalized' }; quotation: QuotationVersion };
export type PendingFinalization = { key: string; bookingId: string; expectedVersion: number; lines: SubmittedBosLine[] };

function client() {
  if (isMockMode) throw new Error('Finalizing a customer quotation requires real mode and a saved pre-survey quotation. Local drafts are still available.');
  return requireSupabaseClient();
}
function rpcError(error: { code?: string; message: string }) {
  return new Error(['PGRST202','PGRST205'].includes(error.code ?? '')
    ? 'BOS finalization is not deployed yet. Your draft is safe; the Phase A migration needs manual deployment.'
    : error.message);
}
export function submitBosLines(lines: BosLine[]): SubmittedBosLine[] {
  if(invalidSiteQuantity(lines))throw new Error('Site quantities must be finite and non-negative.');
  const active=activeSiteLines(lines);
  if(!active.length)throw new Error('Enter at least one positive site quantity or length.');
  if(active.some(line=>line.specificationPending)) throw new Error('Choose an exact specification for every active worksheet row.');
  return active.map(line => ({ itemId: line.catalogItemId, unit: line.unit,
    quantity: line.kind === 'wire' ? line.lengthMeters : line.quantity,
    rate: line.kind === 'wire' ? line.ratePerMeter : line.unitPrice,
    brandId: line.brandId ?? null, wireSizeId: line.kind === 'wire' ? line.wireSizeId : null,
    configuredRate: line.kind === 'wire' || !!line.configuredRate, notes: line.notes ?? '',
    ...(line.presetIds?.length ? {presetIds:line.presetIds} : {}),
    ...(line.quantityGroupKey ? {quantityGroupKey:line.quantityGroupKey} : {}),
  }));
}
export async function previewBosQuotation(bookingId: string, lines: BosLine[]): Promise<BosPreview> {
  const submittedLines = submitBosLines(lines);
  const { data, error } = await client().rpc('preview_bos_quotation', { p_booking_id: bookingId, p_lines: submittedLines });
  if (error) throw rpcError(error);
  if (!data?.quotation) throw new Error('Quotation preview was not returned. Please retry.');
  return { ...data, submittedLines } as BosPreview;
}
const pendingKey = (engineerId: string, bookingId: string) => `kaamasaan-bos-finalization:${engineerId}:${bookingId}`;
export function loadPendingFinalization(engineerId: string, bookingId: string): PendingFinalization | null {
  const raw = localStorage.getItem(pendingKey(engineerId, bookingId));
  if (!raw) return null;
  const pending = JSON.parse(raw) as PendingFinalization;
  if (pending.bookingId !== bookingId || !pending.key || !Array.isArray(pending.lines)) throw new Error('Saved finalization request is invalid. Contact support before retrying.');
  return pending;
}
export function persistFinalization(engineerId: string, bookingId: string, preview: BosPreview): PendingFinalization {
  const existing = loadPendingFinalization(engineerId, bookingId);
  if (existing) return existing;
  const request = { key: crypto.randomUUID(), bookingId, expectedVersion: preview.quotation.version, lines: preview.submittedLines };
  // Persist BEFORE the RPC. Failure to persist prevents an unsafe retry/new key.
  localStorage.setItem(pendingKey(engineerId,bookingId), JSON.stringify(request));
  return request;
}
export async function finalizeBosQuotation(engineerId: string, request: PendingFinalization): Promise<FinalizationResult> {
  const { data, error } = await client().rpc('finalize_bos_and_create_quotation', {
    p_booking_id: request.bookingId, p_request_key: request.key,
    p_lines: request.lines, p_expected_version: request.expectedVersion,
  });
  if (error) {
    // Explicit validation/authorization errors mean the transaction rolled back.
    // Keep the same request for transport/unknown errors: it may have committed.
    if (['22023','22P02','42501','40001','PGRST202'].includes(error.code)) {
      localStorage.removeItem(pendingKey(engineerId,request.bookingId));
    }
    throw rpcError(error);
  }
  if (!data?.estimate?.id || !data?.quotation?.id) throw new Error('Finalization response was incomplete. Retry the saved request safely.');
  localStorage.removeItem(pendingKey(engineerId,request.bookingId));
  return data as FinalizationResult;
}
export async function loadQuotationVersions(bookingId: string): Promise<QuotationVersion[]> {
  if (isMockMode) return [];
  const { data, error } = await client().from('survey_quotation_versions').select('id,version,status,snapshot,bos_estimate_id,pdf_path')
    .eq('booking_id',bookingId).order('version',{ascending:false});
  if (error) throw rpcError(error);
  return data as QuotationVersion[];
}
/** Read the immutable version for PDF delivery; never finalize or recalculate. */
export async function loadQuotationVersion(id: string): Promise<QuotationVersion> {
  const { data, error } = await client().from('survey_quotation_versions')
    .select('id,version,status,snapshot,bos_estimate_id,pdf_path').eq('id',id).single();
  if (error) throw rpcError(error);
  if (!data) throw new Error('The saved quotation version is unavailable.');
  return data as QuotationVersion;
}
export async function loadFrozenBosItems(estimateId: string): Promise<FrozenBosItem[]> {
  const { data, error } = await client().from('bos_estimate_items').select('*').eq('estimate_id',estimateId).order('position');
  if (error) throw rpcError(error);
  return data as FrozenBosItem[];
}
