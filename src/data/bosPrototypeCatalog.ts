/**
 * ⚠️ TEMPORARY PROTOTYPE CATALOG — PHASE 1 ONLY ⚠️
 *
 * Everything in this file is sample data for the first prototype.
 *
 *  - The wire rates below are INITIAL SAMPLE PRICES, not final market rates.
 *  - The same brand rate is intentionally reused across 4 / 6 / 10 mm² because
 *    real per-size rates have not been supplied yet. The data shape already
 *    supports per-size and per-wire-type rates (see `wireBrandRates`), so the
 *    only thing that changes later is the data source.
 *
 * This is the ONLY place prototype pricing lives. In a later phase the
 * KaamAsaan Admin Portal will manage BOS components, brands, wire sizes,
 * rates, units and active/inactive state in Supabase, and
 * `src/services/bosCatalogService.ts` will read from there instead of here.
 * No pricing should be added to components or JSX.
 */

import type {
  BosCategory,
  WireBrand,
  WireBrandRate,
  WireSize,
} from '../types/domain';

/* ------------------------------------------------------------- wire sizes */

export const prototypeWireSizes: WireSize[] = [
  { id: 'mm2-4', mm2: 4, label: '4 mm²', active: true },
  { id: 'mm2-6', mm2: 6, label: '6 mm²', active: true },
  { id: 'mm2-10', mm2: 10, label: '10 mm²', active: true },
];

/* ------------------------------------------------------------ wire brands */

export const prototypeWireBrands: WireBrand[] = [
  { id: 'kuka', name: 'KUKA Cable', active: true },
  { id: 'fast', name: 'Fast Cable', active: true },
  { id: 'pak', name: 'Pak Cable', active: true },
  { id: 'new-age', name: 'New Age', active: true },
];

/**
 * Sample rates. `'*'` means "any wire type" / "any wire size".
 *
 * To price a specific combination later, add a more specific row, e.g.
 *   { wireItemId: 'wire-dc', wireSizeId: 'mm2-10', brandId: 'kuka',
 *     ratePerMeter: 520, active: true }
 * The resolver in `src/features/bos/catalog.ts` always prefers the most
 * specific matching row.
 */
export const prototypeWireBrandRates: WireBrandRate[] = [
  { wireItemId: '*', wireSizeId: '*', brandId: 'kuka', ratePerMeter: 300, active: true },
  { wireItemId: '*', wireSizeId: '*', brandId: 'fast', ratePerMeter: 350, active: true },
  { wireItemId: '*', wireSizeId: '*', brandId: 'pak', ratePerMeter: 400, active: true },
  { wireItemId: '*', wireSizeId: '*', brandId: 'new-age', ratePerMeter: 250, active: true },
];

/* --------------------------------------------------------- BOS categories */

export const prototypeBosCategories: BosCategory[] = [
  {
    id: 'wires',
    title: 'Wires & Conductors',
    description: 'Priced per meter using wire size and cable brand.',
    items: [
      { id: 'wire-dc', name: 'DC Wire', categoryId: 'wires', kind: 'wire', defaultUnit: 'm', allowedUnits: ['m'], active: true },
      { id: 'wire-ac-in', name: 'AC Input Wire', categoryId: 'wires', kind: 'wire', defaultUnit: 'm', allowedUnits: ['m'], active: true },
      { id: 'wire-ac-out', name: 'AC Output Wire', categoryId: 'wires', kind: 'wire', defaultUnit: 'm', allowedUnits: ['m'], active: true },
      { id: 'wire-earthing', name: 'Earthing Cable', categoryId: 'wires', kind: 'wire', defaultUnit: 'm', allowedUnits: ['m'], active: true },
      { id: 'wire-bare', name: 'Bare Conductor', categoryId: 'wires', kind: 'wire', defaultUnit: 'm', allowedUnits: ['m'], active: true },
    ],
  },
  {
    id: 'protection',
    title: 'Protection & Electrical Components',
    description: 'Priced per unit. Unit prices are entered by the engineer for now.',
    items: [
      { id: 'cmp-disconnect', name: 'Disconnect Switch', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-arrestor', name: 'Lightning Arrestor', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-ac-breaker', name: 'AC Breakers', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-dc-breaker', name: 'DC Breakers', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-spd', name: 'SPD', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-db', name: 'DB', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-earthing-rod', name: 'Earthing Rod', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
      { id: 'cmp-bus-bar', name: 'Bus Bar', categoryId: 'protection', kind: 'quantity', defaultUnit: 'pcs', allowedUnits: ['pcs', 'set'], active: true },
    ],
  },
  {
    id: 'installation',
    title: 'Earthing, Conduit & Installation Material',
    description: 'Supports meters, pieces, bags and sets.',
    items: [
      { id: 'inst-ducts', name: 'Ducts', categoryId: 'installation', kind: 'quantity', defaultUnit: 'm', allowedUnits: ['m', 'pcs'], active: true },
      { id: 'inst-pipes', name: 'Pipes', categoryId: 'installation', kind: 'quantity', defaultUnit: 'm', allowedUnits: ['m', 'pcs'], active: true },
      { id: 'inst-earth-powder', name: 'Earthing Chemical Powder', categoryId: 'installation', kind: 'quantity', defaultUnit: 'bag', allowedUnits: ['bag', 'pcs'], active: true },
    ],
  },
  {
    id: 'misc',
    title: 'Miscellaneous Items',
    description: 'Cable ties, tapes, thimbles, I-lugs, O-lugs. One combined line for Phase 1.',
    items: [
      {
        id: 'misc-consumables',
        name: 'Miscellaneous Items',
        categoryId: 'misc',
        kind: 'quantity',
        defaultUnit: 'lot',
        allowedUnits: ['lot', 'pcs', 'set'],
        supportsNotes: true,
        active: true,
      },
    ],
  },
];
