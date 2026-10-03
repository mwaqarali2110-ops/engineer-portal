/**
 * Pure lookup helpers over the BOS catalog.
 *
 * These functions never import prototype data directly — the data is always
 * passed in. That keeps them valid once the catalog is served from Supabase
 * instead of `src/data/bosPrototypeCatalog.ts`.
 */

import type {
  BosCatalogItem,
  BosCategory,
  WireBrand,
  WireBrandRate,
  WireSize,
} from '../../types/domain';

export type BrandRateOption = {
  brand: WireBrand;
  ratePerMeter: number | null;
};

export function findCatalogItem(
  categories: BosCategory[],
  itemId: string,
): BosCatalogItem | undefined {
  for (const category of categories) {
    const match = category.items.find((item) => item.id === itemId);
    if (match) return match;
  }
  return undefined;
}

export function activeWireSizes(sizes: WireSize[]): WireSize[] {
  return sizes.filter((size) => size.active);
}

export function findWireSize(sizes: WireSize[], sizeId: string | null): WireSize | undefined {
  if (!sizeId) return undefined;
  return sizes.find((size) => size.id === sizeId);
}

export function findWireBrand(brands: WireBrand[], brandId: string | null): WireBrand | undefined {
  if (!brandId) return undefined;
  return brands.find((brand) => brand.id === brandId);
}

/**
 * Resolve the rate for one wire type + size + brand combination.
 *
 * Only the mock prototype uses `'*'` wildcards. Real BOS rates have UUID
 * foreign keys for both item and size, so they can match only one exact row.
 * Multiple matching rows are an explicit configuration error.
 */
export function resolveWireRate(
  rates: WireBrandRate[],
  params: { wireItemId: string; wireSizeId: string | null; brandId: string | null },
): number | null {
  const { wireItemId, wireSizeId, brandId } = params;
  if (!brandId || !wireSizeId) return null;

  let match: number | null = null;

  for (const row of rates) {
    if (!row.active || row.brandId !== brandId) continue;
    if (row.wireItemId !== '*' && row.wireItemId !== wireItemId) continue;
    if (row.wireSizeId !== '*' && row.wireSizeId !== wireSizeId) continue;

    if (match !== null) {
      throw new Error('BOS rate configuration error: multiple rates match this wire, size and brand.');
    }
    match = row.ratePerMeter;
  }

  return match;
}

/** Show every active brand, including combinations awaiting a configured rate. */
export function brandOptionsFor(
  brands: WireBrand[],
  rates: WireBrandRate[],
  wireItemId: string,
  wireSizeId: string | null,
): BrandRateOption[] {
  if (!wireSizeId) return [];

  return brands
    .filter((brand) => brand.active)
    .map((brand) => ({
      brand,
      ratePerMeter: resolveWireRate(rates, { wireItemId, wireSizeId, brandId: brand.id }),
    }));
}
