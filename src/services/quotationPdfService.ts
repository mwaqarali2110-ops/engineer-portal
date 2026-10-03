import { UnsupportedQuotationTextError } from '../quotation/quotationText';
import { requireSupabaseClient } from '../lib/supabase';
import { renderQuotationPdf } from '../quotation/preSurveyPdf';
import masterUrl from '../quotation/pre-survey-master-v2.pdf?url';
import { loadFrozenBosItems, loadQuotationVersion, type QuotationVersion } from './bosFinalizationService';

const inFlight = new Map<string, Promise<string>>();
const bucket = 'pre-survey-quotations';
async function normalizedImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('A saved product image is unavailable. Retry PDF preparation.');
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to prepare PDF product images.');
  context.drawImage(bitmap,0,0); bitmap.close();
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image conversion failed.')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
type PdfStage = 'session' | 'snapshot' | 'storage check' | 'BOS items' | 'template' | 'product images' | 'render' | 'upload' | 'upload confirmation' | 'signed URL' | 'journey publish';
function missingObject(error: unknown) {
  const e = error as { statusCode?: string | number; status?: number } | null;
  return [400,404].includes(Number(e?.statusCode ?? e?.status));
}
async function materialize(requested: QuotationVersion): Promise<string> {
  let stage: PdfStage = 'session';
  try {
    const client = requireSupabaseClient();
    const session = await client.auth.getUser();
    if (session.error) throw session.error;
    if (!session.data.user) throw new Error('Sign in as an active Engineer to retry PDF delivery.');
    stage = 'snapshot';
    const version = await loadQuotationVersion(requested.id);
    if (version.id !== requested.id || version.version !== requested.version || version.pdf_path !== requested.pdf_path
      || !version.pdf_path || version.snapshot.type !== 'POST_SURVEY' || version.snapshot.version !== version.version
      || version.status !== 'awaiting_customer_review') throw new Error('The saved quotation version does not match this PDF request.');
    const storage = client.storage.from(bucket);
    stage = 'storage check';
    const exists = await storage.exists(version.pdf_path);
    if (exists.error && !missingObject(exists.error)) throw exists.error;
    if (!exists.data) {
    stage = 'BOS items';
    const bosItems = version.bos_estimate_id ? await loadFrozenBosItems(version.bos_estimate_id) : [];
    stage = 'template';
    const master = await fetch(masterUrl);
    if (!master.ok) throw new Error('The approved quotation template is unavailable.');
    stage = 'product images';
    const images: Partial<Record<'panel'|'inverter'|'battery',Uint8Array>> = {};
    await Promise.all((['panel','inverter','battery'] as const).map(async key => {
      const product = version.snapshot.system[key];
      if (!product) return;
      if (!product.imageUrl) throw new Error(`The saved ${key} image is missing. The quotation is saved; PDF preparation can be retried.`);
      images[key] = await normalizedImage(product.imageUrl);
    }));
    stage = 'render';
    const bytes = await renderQuotationPdf({...version.snapshot,bosItems},new Uint8Array(await master.arrayBuffer()),images);
    if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0,5)) !== '%PDF-') throw new Error('The renderer did not produce a PDF.');
    stage = 'upload';
    // Own the exact binary bytes. No base64 conversion and no UPDATE policy required.
    const body = new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/pdf'});
    const uploaded = await storage.upload(version.pdf_path,body,{contentType:'application/pdf',upsert:false});
    // A concurrent retry may have inserted the same object. Only a confirmed object
    // can make that failed insert a successful delivery.
    if (uploaded.error) {
      const winner = await storage.exists(version.pdf_path);
      if (winner.error || !winner.data) throw uploaded.error;
    } else {
      stage = 'upload confirmation';
      const confirmed = await storage.exists(version.pdf_path);
      if (confirmed.error) throw confirmed.error;
      if (!confirmed.data) throw new Error('Storage did not confirm the uploaded quotation PDF.');
    }
  }
  stage = 'signed URL';
  const { data, error } = await storage.createSignedUrl(version.pdf_path,300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Storage did not return a quotation PDF link.');
  stage = 'journey publish';
  const published = await client.rpc('publish_finalized_quotation',{p_quotation_id:version.id});
  if (published.error) throw published.error;
  return data.signedUrl;
  } catch (error) {
    if (import.meta.env.DEV) {
      const detail = error as { code?: string; statusCode?: string | number; status?: number; message?: string };
      console.error('Quotation PDF delivery failed',{stage,code:detail?.code,status:detail?.statusCode ?? detail?.status});
    }
    if (error instanceof UnsupportedQuotationTextError) throw error;
    const reason = stage === 'session' ? 'Sign in again as an active Engineer.'
      : stage === 'product images' ? 'A saved product image could not be prepared.'
      : stage === 'template' ? 'The approved template could not be loaded.'
      : stage === 'render' ? 'The frozen snapshot could not be rendered.'
      : stage === 'BOS items' ? 'The finalized BOS components could not be read.'
      : stage === 'snapshot' ? 'The existing quotation version could not be read.'
      : stage === 'signed URL' ? 'The saved PDF link could not be opened.'
      : stage === 'journey publish' ? 'The quotation is saved, but Project Journey could not be updated.'
      : 'PDF upload failed.';
    throw new Error(reason === 'PDF upload failed.'
      ? 'Quotation finalized, but PDF upload failed. Retry PDF.'
      : `Quotation finalized. ${reason} Retry PDF.`);
  }
}
/** PDF retry never repeats BOS finalization or creates a quotation version. */
export function prepareUpdatedQuotationPdf(version: QuotationVersion) {
  const key = `${version.id}:${version.pdf_path}`;
  const running = inFlight.get(key);
  if (running) return running;
  const pending = materialize(version).finally(() => inFlight.delete(key));
  inFlight.set(key,pending);
  return pending;
}
