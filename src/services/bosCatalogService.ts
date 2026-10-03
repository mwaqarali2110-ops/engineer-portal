/** BOS catalog access: prototype only in mock mode, Supabase in real mode. */

import {
  prototypeBosCategories,
  prototypeWireBrandRates,
  prototypeWireBrands,
  prototypeWireSizes,
} from '../data/bosPrototypeCatalog';
import { isMockMode } from '../lib/env';
import { mockPresetCatalogItems } from '../data/bosPresetCatalog';
import { requireSupabaseClient } from '../lib/supabase';
import type { BosCategory, BosCategoryId, BosCatalogItem, BosUnit, QuantityBosRate, WireBrand, WireBrandRate, WireSize } from '../types/domain';

export type BosCatalogData = {
  categories: BosCategory[];
  wireSizes: WireSize[];
  wireBrands: WireBrand[];
  wireBrandRates: WireBrandRate[];
  quantityRates: QuantityBosRate[];
  itemBrands?: {itemId:string;brandId:string;active:boolean;sortOrder:number}[];
  brandOptionsDeploymentRequired?: boolean;
};

type ItemRow = { id: string; name: string; category_id: BosCategoryId; kind: 'wire' | 'quantity'; default_unit: BosUnit; allowed_units: BosUnit[]; supports_notes: boolean; active: boolean; sort_order: number; family_name?: string; specification?: string; category_label?: string; source_description?: string; source_key?: string; search_aliases?: string[]; fixed_wire_mm2?: number; brand_hint?: string; unit_review_note?: string };
type SizeRow = { id: string; mm2: number; label: string; active: boolean };
type BrandRow = { id: string; name: string; active: boolean; sort_order: number };
type RateRow = { item_id: string; wire_size_id: string | null; brand_id: string | null; unit: BosUnit; amount_pkr: number; provisional: boolean; active: boolean };

const categoryDefinitions: Omit<BosCategory, 'items'>[] = [
  { id: 'wires', title: 'Wires & Conductors', description: 'Priced per meter using wire size and cable brand.' },
  { id: 'protection', title: 'Protection & Electrical Components', description: 'Enter a unit price for each quantity item.' },
  { id: 'installation', title: 'Earthing, Conduit & Installation Material', description: 'Supports meters, pieces and bags.' },
  { id: 'misc', title: 'Miscellaneous Items', description: 'Cable ties, tapes, thimbles and lugs.' },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadBosCatalog(): Promise<BosCatalogData> {
  if (isMockMode) {
    await delay(250);
    return {
      categories: prototypeBosCategories.map(category=>({...category,items:[...category.items,...mockPresetCatalogItems.filter(item=>item.categoryId===category.id)]})),
      wireSizes: [...prototypeWireSizes,...[16,25,35].map(mm2=>({id:`mock-size-${mm2}`,mm2,label:`${mm2} mm²`,active:true}))],
      wireBrands: prototypeWireBrands,
      wireBrandRates: prototypeWireBrandRates,
      quantityRates: [],
    };
  }

  const supabase = requireSupabaseClient();
  const [itemsResult, sizesResult, brandsResult, ratesResult] = await Promise.all([
    supabase.from('bos_items').select('*').eq('active', true).order('sort_order'),
    supabase.from('bos_wire_sizes').select('id,mm2,label,active').eq('active', true).order('mm2'),
    supabase.from('bos_brands').select('id,name,active,sort_order').eq('active', true).order('sort_order'),
    supabase.from('bos_rates').select('item_id,wire_size_id,brand_id,unit,amount_pkr,provisional,active').eq('active', true),
  ]);
  for (const result of [itemsResult, sizesResult, brandsResult, ratesResult]) {
    if (result.error) throw new Error(`Unable to load Supabase BOS catalog: ${result.error.message}`);
  }
  const items = (itemsResult.data ?? []) as ItemRow[];
  const sizes = (sizesResult.data ?? []) as SizeRow[];
  const brands = (brandsResult.data ?? []) as BrandRow[];
  const rates = (ratesResult.data ?? []) as RateRow[];
  const assignments = await supabase.from('bos_item_brands').select('bos_item_id,brand_id,active,sort_order').eq('active',true).order('sort_order');
  if(assignments.error && !['PGRST205','42P01'].includes(assignments.error.code))throw new Error('Unable to load BOS brand applicability. Retry catalog loading.');
  const seenWireRates = new Set<string>();
  for (const row of rates) {
    if (!row.brand_id || !row.wire_size_id || row.unit !== 'm') continue;
    const key = `${row.item_id}|${row.wire_size_id}|${row.brand_id}`;
    if (seenWireRates.has(key)) {
      throw new Error('BOS rate configuration error: duplicate active rates for a wire, size and brand.');
    }
    seenWireRates.add(key);
    if (!Number.isFinite(Number(row.amount_pkr)) || Number(row.amount_pkr) <= 0) {
      throw new Error('BOS rate configuration error: invalid wire rate.');
    }
  }
  const categories = categoryDefinitions.map((definition) => ({
    ...definition,
    items: items.filter((row) => row.category_id === definition.id).map((row): BosCatalogItem => ({
      id: row.id, name: row.name, categoryId: row.category_id, kind: row.kind,
      defaultUnit: row.default_unit, allowedUnits: row.allowed_units,
      supportsNotes: row.supports_notes, active: row.active,
      familyName: row.family_name, specification: row.specification, categoryLabel: row.category_label,
      sourceDescription: row.source_description, sourceKey: row.source_key, searchAliases: row.search_aliases,
      fixedWireMm2: row.fixed_wire_mm2 == null ? null : Number(row.fixed_wire_mm2), brandHint: row.brand_hint, unitReviewNote: row.unit_review_note,
    })),
  })).filter((category) => category.items.length > 0);
  if (categories.length === 0) throw new Error('The Supabase BOS catalog has no active items, or this account cannot read them.');
  return {
    categories,
    itemBrands: assignments.error ? undefined : (assignments.data ?? []).map(a=>({itemId:a.bos_item_id,brandId:a.brand_id,active:a.active,sortOrder:a.sort_order})),
    brandOptionsDeploymentRequired: !!assignments.error,
    wireSizes: sizes.map((row): WireSize => ({ id: row.id, mm2: Number(row.mm2), label: row.label, active: row.active })),
    wireBrands: brands.map((row): WireBrand => ({ id: row.id, name: row.name, active: row.active })),
    wireBrandRates: rates.filter((row) => row.brand_id && row.wire_size_id && row.unit === 'm')
      .map((row): WireBrandRate => ({ wireItemId: row.item_id, wireSizeId: row.wire_size_id!, brandId: row.brand_id!, ratePerMeter: Number(row.amount_pkr), active: row.active, provisional: row.provisional })),
    quantityRates: rates.filter((row) => !row.wire_size_id && items.some((item) => item.id === row.item_id && item.kind === 'quantity'))
      .map((row): QuantityBosRate => ({ itemId: row.item_id, brandId: row.brand_id, unit: row.unit, unitPrice: Number(row.amount_pkr), provisional: row.provisional })),
  };
}
