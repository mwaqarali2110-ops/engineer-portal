/** Platform-neutral frozen document contract shared by mobile and Engineer Portal. */
export type QuotationProduct = {
  brand: string; model: string; quantity: number;
  imageUrl?: string | null; specifications?: Record<string, unknown>;
  technology?: string | null; type?: string | null; phase?: string | null;
  unitPrice?: number | null; lineTotal?: number | null;
};
export type QuotationBosItem = {
  position?: number;
  preset_codes_snapshot?: string[] | null;
  quantity_group_key_snapshot?: string | null;
  item_name_snapshot: string;
  family_name_snapshot?: string | null;
  specification_snapshot?: string | null;
  source_description_snapshot?: string | null;
  source_key_snapshot?: string | null;
  wire_size_snapshot?: string | null;
  brand_snapshot?: string | null;
  category_snapshot?: string | null;
  kind_snapshot?: string | null;
  unit_snapshot?: string | null;
  quantity_or_length?: number | null;
};
export type QuotationDocument = {
  version: number; type: 'PRE_SURVEY' | 'POST_SURVEY'; templateVersion: 1;
  presentationVersion?: 2; status?: 'awaiting_customer_review'; bosEstimateId?: string;
  bookingId: string; ownerId: string; reference: string; createdAt: string;
  /** Immutable finalized estimate rows, attached only while rendering a post-survey PDF. */
  bosItems?: QuotationBosItem[];
  customer: { name: string; phone: string; city: string; address: string };
  system: {
    requiredComponents?: import("./requiredConfigurationComponents").RequiredConfigurationComponent[];
    systemSizeKw: number;
    panel: (QuotationProduct & { wattage: number }) | null;
    inverter: (QuotationProduct & { capacityKw: number }) | null;
    battery: (QuotationProduct & { unitCapacityKwh: number; totalCapacityKwh: number }) | null;
    structure: { structureType: 'standard' | 'elevated'; totalPanelWatts: number; ratePerWatt: number | null; charge: number | null } | null;
    installationCharge: number; transportationCharge?: number | null; accessoriesCharge?: number;
    balanceOfSystemTotal?: number; balanceOfSystemStatus?: 'pending_survey' | 'finalized';
    grossTotal: number | null; discountAmount: number; finalTotal: number | null; promoCode?: string | null;
  };
};

export const BOS_QUOTATION_LABEL = 'Mechanical & Electrical Balance of System (BOS)';
export const BOS_QUOTATION_DESCRIPTION = `UPVC Conduits, Pipes & Cable Ducts
Junction Boxes, Conduit Accessories
(bends, couplers, tees, sockets, saddles)
Cable Clamps & Supports, Cable Glands
I-Lugs & O-Lugs, Thimbles, Ferrules Cable.

Earth Pit: 1m Cu Rod with 10mm bare conductor and complete bus bar assembly with insulator.`;

type BosGroupKey = 'breaker' | 'db' | 'spd' | 'ats' | 'ac_cable' | 'dc_cable' | 'earthing_cable';
const BOS_GROUPS: readonly { key: BosGroupKey; label: string }[] = [
  { key: 'breaker', label: 'AC Breaker' },
  { key: 'db', label: 'DB' },
  { key: 'spd', label: 'AC SPD' },
  { key: 'ats', label: 'ATS Change Over' },
  { key: 'ac_cable', label: 'AC Cable' },
  { key: 'dc_cable', label: 'DC Cable' },
  { key: 'earthing_cable', label: 'Earthing Cable' },
];

const cleanBosText = (value: string) => value
  .replace(/mm\s*\^?\s*2\b/gi, 'mm²')
  .replace(/\s*[·]\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const identity = (value: string | null | undefined) => cleanBosText(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Structured frozen catalog identity wins; legacy text matching is only a fallback. */
function bosGroup(item: QuotationBosItem): BosGroupKey | null {
  const family = identity(item.family_name_snapshot);
  if (family === 'acbreakermccb' || family === 'acbreaker' || family === 'mccb') return 'breaker';
  if (family === 'db' || family === 'msdb' || family === 'distributionboard') return 'db';
  if (family === 'acspd') return 'spd';
  if (family === 'atschangeover' || family === 'ats') return 'ats';
  if (family === 'accable') return 'ac_cable';
  if (family === 'dccable') return 'dc_cable';
  if (family === 'earthingcable' || family === 'bareconductor') return 'earthing_cable';
  const fallback = [item.source_key_snapshot, item.category_snapshot, item.item_name_snapshot, item.source_description_snapshot]
    .filter(Boolean).join(' ');
  if (/\bac\s*breaker\b|\bmccb\b/i.test(fallback)) return 'breaker';
  if (/\b(?:ms\s+)?db\b|distribution\s+board/i.test(fallback)) return 'db';
  if (/\bac\s*spd\b/i.test(fallback)) return 'spd';
  if (/\bats\s*change\s*over\b|\bats\s*changeover\b/i.test(fallback)) return 'ats';
  if (/\bac\s*cable\b/i.test(fallback)) return 'ac_cable';
  if (/\bdc\s*cable\b/i.test(fallback)) return 'dc_cable';
  if (/\bearth(?:ing)?\s*(?:cable|wire)\b|\bbare\s+conductor\b/i.test(fallback)) return 'earthing_cable';
  return null;
}

function selectedBosItemName(item: QuotationBosItem): string {
  const base = cleanBosText(item.specification_snapshot?.trim()
    || item.wire_size_snapshot?.trim()
    || item.source_description_snapshot?.trim()
    || item.item_name_snapshot);
  const brand = cleanBosText(item.brand_snapshot ?? '');
  const quantity = Number(item.quantity_or_length);
  const suffix = item.kind_snapshot !== 'wire' && Number.isFinite(quantity) && quantity > 1 ? ` × ${quantity}` : '';
  if (!brand) return `${base}${suffix}`;
  const normalizedBase = base.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizedBrand = brand.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const brandLead = brand.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? '';
  const named = normalizedBase.includes(normalizedBrand) || (brandLead.length >= 3 && base.toLowerCase().includes(brandLead))
    ? base : `${base} ${brand}`;
  return `${named}${suffix}`;
}

function cableValues(items: readonly QuotationBosItem[], key: Extract<BosGroupKey, 'ac_cable' | 'dc_cable' | 'earthing_cable'>): string[] {
  const buckets = new Map<string, { size: string; core: string; brand: string; colors: Set<string>; first: string }>();
  for (const item of items) {
    if (bosGroup(item) !== key) continue;
    const spec = cleanBosText(item.specification_snapshot || item.wire_size_snapshot || item.source_description_snapshot || item.item_name_snapshot);
    const size = spec.match(/\b\d+(?:\.\d+)?\s*mm²/i)?.[0]?.replace(/\s+/g, ' ') ?? '';
    const core = spec.match(/\b\d+\s*(?:core|c)\b/i)?.[0]?.replace(/\s+/g, '-') ?? '';
    const color = spec.match(/\b(red|black|blue|yellow|green|white)\b/i)?.[0]?.toLowerCase() ?? '';
    const brand = cleanBosText(item.brand_snapshot ?? '');
    const bucketKey = [size.toLowerCase(), core.toLowerCase(), brand.toLowerCase()].join('|');
    const current = buckets.get(bucketKey) ?? { size, core, brand, colors: new Set<string>(), first: selectedBosItemName(item) };
    if (color) current.colors.add(color);
    buckets.set(bucketKey, current);
  }
  return [...buckets.values()].map(value => {
    if (!value.size) return value.first;
    const set = key === 'ac_cable' && !value.core && value.colors.size > 1 ? `${value.colors.size}-wire set` : value.core;
    const brand = value.brand === 'Fast Cable' ? 'Fast Cables' : value.brand;
    return [value.size, set, brand ? `- ${brand}` : ''].filter(Boolean).join(' ');
  });
}

/** Fixed customer copy followed only by selected rows from the frozen finalized estimate. */
export function buildBosDescription(items: readonly QuotationBosItem[] | null | undefined): string {
  const ordered = [...(items ?? [])].sort((a,b) => (a.position ?? 0) - (b.position ?? 0));
  const grouped = BOS_GROUPS.map(group => {
    const seen = new Set<string>();
    const values: string[] = [];
    const candidates = group.key.endsWith('_cable') ? cableValues(ordered, group.key as 'ac_cable' | 'dc_cable' | 'earthing_cable') : ordered.filter(item => bosGroup(item) === group.key).map(selectedBosItemName);
    for (const value of candidates) {
      const key = value.toLowerCase();
      if (!seen.has(key)) { seen.add(key); values.push(value); }
    }
    return values.length ? `${group.label}: ${values.join(', ')}` : null;
  }).filter((line): line is string => Boolean(line));
  return grouped.length ? `${BOS_QUOTATION_DESCRIPTION}\n\nSelected BOS Components:\n${grouped.join('\n')}` : BOS_QUOTATION_DESCRIPTION;
}

/** Existing accessories are the sole priced BOS component in the V1 snapshot. */
export function customerBosAmount(q: QuotationDocument): number {
  return q.type === 'POST_SURVEY' ? q.system.balanceOfSystemTotal! : q.system.accessoriesCharge ?? 0;
}

export function quotationPriceRows(q: QuotationDocument) {
  const s = q.system;
  return [
    { label: 'Solar Panels', amount: s.panel?.lineTotal ?? 0 },
    { label: 'Inverter', amount: s.inverter?.lineTotal ?? 0 },
    ...(s.requiredComponents ?? []).filter(c => c.source === 'inverter_parallel').map(c => ({ label: `${c.category}: ${c.name} · Qty ${c.quantity} × PKR ${c.unitPrice.toLocaleString('en-PK')}`, amount: c.totalPrice })),
    { label: 'Battery', amount: s.battery?.lineTotal ?? 0 },
    ...(s.requiredComponents ?? []).filter(c => c.source !== 'inverter_parallel').map(c => ({ label: `${c.category}: ${c.name} · Qty ${c.quantity} × PKR ${c.unitPrice.toLocaleString('en-PK')}`, amount: c.totalPrice })),
    { label: 'Structure', amount: s.structure?.charge ?? null },
    { label: 'Transportation', amount: s.transportationCharge ?? null },
    { label: 'Installation', amount: s.installationCharge },
    { label: BOS_QUOTATION_LABEL, amount: customerBosAmount(q) },
    { label: s.promoCode ? `Discount / Promo (${s.promoCode})` : 'Discount', amount: -s.discountAmount },
  ];
}
