import { validFrozenConfigurationComponents } from './requiredConfigurationComponents';
import { assertSupportedQuotationText } from './quotationText';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BOS_QUOTATION_LABEL, BOS_QUOTATION_DESCRIPTION, buildBosDescription, customerBosAmount, type QuotationDocument, type QuotationProduct } from './quotationDocument';

export const quotationFilename = (reference: string, type: QuotationDocument['type'] = 'PRE_SURVEY', version = 1) =>
  `KaamAsaan_${type === 'POST_SURVEY' ? `Post-Survey_Quotation_v${version}` : 'Pre-Survey_Quotation'}_${reference.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

/**
 * The approved master is the exact seven-page customer quotation. Pre- and
 * post-survey modes overlay state-specific copy onto the same page geometry.
 */
const MASTER_PAGE_COUNT = 7;
export const CUSTOMER_PAGE_COUNT = 7;
const CUSTOMER_PAGES = [0, 1, 2, 3, 4, 5, 6];

const money = (n: number | null | undefined) => n == null ? 'Not confirmed' : n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
const number = (n: number) => Number(n.toFixed(3)).toString();
const unknown = 'Not supplied';
/** "1 unit" / "2 units", matching how the master sets these counts. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const spec = (p: QuotationProduct | null, ...keys: string[]): string => {
  for (const key of keys) {
    const entry = Object.entries(p?.specifications ?? {}).find(([k]) => k.toLowerCase().replace(/[^a-z]/g,'') === key.toLowerCase().replace(/[^a-z]/g,''));
    if (entry && typeof entry[1] === 'string' && entry[1]) return entry[1];
  }
  return unknown;
};
export const ELEVATED_SPEC = 'Column: I - Beam 5 x 2.5in, 2.6mm – Mughal Steel\nBeam: I - Beam 5 x 2.5in, 2.6mm – Mughal Steel\nPurlin: C-Channel 3 x 1.5in, 1.6mm\nBase Plate: 8 x 8in, 6mm\nTop Plate: 7 x 4in, 5mm\nBraces: SHS 1.5in\nFasteners: SS 304/316 with lock nuts (nylon)\n– as per OEM recommendations.\nAnchors: M10 x 76mm, With Epoxy';

// Palette lifted from the approved master so overlaid values match the artwork around them.
const NAVY = rgb(0.0863, 0.1412, 0.2353);   // #16243C headline / value
const SLATE = rgb(0.2039, 0.2510, 0.3294);  // #344054 body copy
const GREY = rgb(0.2784, 0.3294, 0.4039);   // #475467 table description
const MUTED = rgb(0.4000, 0.4392, 0.5216);  // #667085 label / unit
const WHITE = rgb(1, 1, 1);

// Column edges measured from the master, so right-aligned money lands on the design grid.
const QTY_RIGHT = 370.7;
const UNIT_PRICE_RIGHT = 486.6;
const TOTAL_RIGHT = 566.0;
const SPEC_LEFT_RIGHT = 354.0;   // page 4, left spec column
const SPEC_RIGHT_RIGHT = 566.3;  // page 4, right spec column
const DESCRIPTION_COLUMN_RIGHT = QTY_RIGHT - 26;
export const BOS_DESCRIPTION_LAYOUT = Object.freeze({
  textStartX: 175.7,
  columnRightX: DESCRIPTION_COLUMN_RIGHT,
  safeRightPadding: 10,
  descriptionMaxWidth: DESCRIPTION_COLUMN_RIGHT - 175.7 - 10,
  startBaseline: 399.5,
});

export function validateQuotation(q: QuotationDocument) {
  if (!Number.isInteger(q.version) || (q.type === 'PRE_SURVEY' ? q.version !== 1 : q.type !== 'POST_SURVEY' || q.version < 2 || q.status !== 'awaiting_customer_review') || q.templateVersion !== 1 || !q.reference || !q.bookingId || !q.ownerId) throw new Error('The saved quotation version is unavailable. Please contact support with your survey reference.');
  const s = q.system;
  if (!s.panel || !s.inverter || !s.structure || s.structure.charge == null || s.finalTotal == null || s.grossTotal == null) throw new Error('The booking does not contain a complete quotation snapshot. Please contact support with your survey reference.');
  if (s.requiredComponents !== undefined && !validFrozenConfigurationComponents(s.requiredComponents)) throw new Error('Saved configuration equipment is invalid.');
  const parts = [...(s.requiredComponents ?? []).map(c => c.totalPrice), s.panel.lineTotal, s.inverter.lineTotal, s.battery?.lineTotal ?? 0, s.structure.charge, s.installationCharge, s.transportationCharge ?? 0, customerBosAmount(q)];
  if (parts.some(n => n == null || !Number.isFinite(n) || n < 0)) throw new Error('Saved component prices are incomplete. No quotation has been issued.');
  if (Math.abs(parts.reduce<number>((a,n) => a + n!,0) - s.grossTotal) > 1 || Math.abs(s.grossTotal - s.discountAmount - s.finalTotal) > 1) throw new Error('Saved quotation prices do not reconcile. Please contact support; your booking is safe.');
  if (![s.grossTotal,s.finalTotal,s.discountAmount].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Saved quotation totals are invalid.');
  if (q.type === 'POST_SURVEY' && ((s.accessoriesCharge ?? 0) !== 0 || s.balanceOfSystemStatus !== 'finalized')) throw new Error('Updated quotation BOS must be finalized and included exactly once.');
}

export type PdfRenderMetrics = (stage: string, details: Record<string, number>) => void;
type Ink = { bold?: boolean; right?: boolean; color?: ReturnType<typeof rgb>; leading?: number };

/** Pure renderer. No catalog, recommendation, promo, clock, or network access. */
export async function renderQuotationPdf(q: QuotationDocument, master: Uint8Array, images: Partial<Record<'panel'|'inverter'|'battery', Uint8Array>>, onMetric?: PdfRenderMetrics) {
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  const started = onMetric ? now() : 0;
  const timed = async <T,>(stage: string, operation: () => Promise<T>): Promise<T> => {
    if (!onMetric) return operation();
    const start = now();
    try { return await operation(); } finally { onMetric(stage, { duration_ms: now() - start }); }
  };
  validateQuotation(q);
  const source = await timed('pdf master load', () => PDFDocument.load(master));
  if (source.getPageCount() !== MASTER_PAGE_COUNT) throw new Error('The approved customer quotation template must contain exactly seven pages.');
  const [font, bold] = await timed('pdf font setup', async () => {
    const regular = await source.embedFont(StandardFonts.Helvetica);
    const strong = await source.embedFont(StandardFonts.HelveticaBold);
    return [regular, strong];
  });
  // No shaping engine/font is installed. Reject explicitly rather than corrupt text
  // or let WinAnsi fail halfway through customer fields. The frozen text is retained.
  assertSupportedQuotationText(q.customer.name, bold);
  assertSupportedQuotationText(q.customer.address + ', ' + q.customer.city, font);

  /**
   * Draws a value into a slot of the master. `baseline` is the first line's baseline
   * measured down from the page top — the same number scripts/quotation-master-map.mjs
   * reports for the placeholder that used to sit there, so slots stay on the design grid.
   * Long values wrap inside `width` and, only if they still overrun `maxLines`, step the
   * size down; nothing is silently truncated and nothing escapes the cell.
   */
  const text = (p: number, value: string, x: number, baseline: number, width: number, maxLines: number, size: number, ink: Ink = {}) => {
    const f: PDFFont = ink.bold ? bold : font;
    assertSupportedQuotationText(value, f);
    const wrap = (fs: number) => value.split('\n').flatMap(paragraph => {
      const lines: string[] = []; let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && f.widthOfTextAtSize(next,fs) > width) { lines.push(line); line=word; } else line=next;
      }
      lines.push(line); return lines;
    });
    const overflows = (lines: string[], fs: number) => lines.length > maxLines || lines.some(l => f.widthOfTextAtSize(l,fs) > width);
    let fs = size;
    let lines = wrap(fs);
    while (overflows(lines, fs) && fs > 5.5) { fs -= 0.25; lines = wrap(fs); }
    if (overflows(lines, fs)) throw new Error('A saved quotation value exceeds the approved layout. Please contact support.');
    const leading = ink.leading ?? fs * 1.2;
    lines.forEach((line,i) => source.getPage(p).drawText(line, {
      x: ink.right ? x + width - f.widthOfTextAtSize(line,fs) : x,
      y: 792 - baseline - i * leading,
      size: fs, font: f, color: ink.color ?? NAVY,
    }));
    return fs;
  };

  /** Right-aligns to a column edge rather than a box, which is how the money columns read. */
  const rightAt = (p: number, value: string, edge: number, baseline: number, width: number, size: number, ink: Ink = {}) =>
    text(p, value, edge - width, baseline, width, 1, size, { ...ink, right: true });

  /**
   * Draws the structure specification the way the master sets it: each line opens with a
   * bold "Column:"-style label and continues in regular weight, wrapping as one flow.
   */
  const labelledSpec = (p: number, body: string, x: number, baseline: number, width: number, maxLines: number, size: number, leading: number) => {
    const page = source.getPage(p);
    assertSupportedQuotationText(body, font);
    assertSupportedQuotationText(body, bold);
    let row = 0;
    for (const paragraph of body.split('\n')) {
      const split = /^([^:]+:)(.*)$/.exec(paragraph);
      const tokens = split
        ? [{ t: split[1], strong: true }, ...split[2].trim().split(/\s+/).filter(Boolean).map(t => ({ t, strong: false }))]
        : paragraph.split(/\s+/).filter(Boolean).map(t => ({ t, strong: false }));
      let line: { t: string; strong: boolean }[] = [];
      const flush = () => {
        let cursor = x;
        for (const token of line) {
          const f = token.strong ? bold : font;
          page.drawText(token.t, { x: cursor, y: 792 - baseline - row * leading, size, font: f, color: GREY });
          cursor += f.widthOfTextAtSize(`${token.t} `, size);
        }
        row++; line = [];
      };
      let used = 0;
      for (const token of tokens) {
        const f = token.strong ? bold : font;
        if (line.length && used + f.widthOfTextAtSize(token.t, size) > width) { flush(); used = 0; }
        line.push(token);
        used += f.widthOfTextAtSize(`${token.t} `, size);
      }
      if (line.length) flush();
    }
    if (row > maxLines) throw new Error('The approved structure specification no longer fits its row. Please contact support.');
  };

  const s=q.system, panel=s.panel!, inv=s.inverter!, battery=s.battery;
  const pv=number(s.systemSizeKw), ik=number(inv.capacityKw), bk=number(battery?.totalCapacityKwh ?? 0);
  const system=`${pv} kW × ${ik} kW × ${bk} kWh`;
  const date = new Date(q.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Karachi'});
  const location = `${q.customer.address}, ${q.customer.city}`;
  const technology = spec(panel,'technology','panel technology') !== unknown ? spec(panel,'technology','panel technology') : panel.technology || unknown;
  const inverterType = spec(inv,'inverter type','type') !== unknown ? spec(inv,'inverter type','type') : inv.type || unknown;
  const phase = inv.phase ? `${inv.phase} phase` : spec(inv,'phase');
  const chemistry = spec(battery,'chemistry','battery type','cell chemistry');
  const ip = spec(battery,'ip rating','protection rating','ip');
  const structure = s.structure!.structureType === 'elevated' ? 'Elevated' : 'Standard';
  // The master prints "Hybrid Inverter"; keep that shape without doubling the word when
  // the saved type already carries it, and fall back to the bare noun when it is unknown.
  const inverterRowTitle = inverterType === unknown ? 'Inverter'
    : /inverter\s*$/i.test(inverterType) ? inverterType : `${inverterType} Inverter`;

  // ---- Page 1 · cover -----------------------------------------------------------------
  text(0, q.customer.name, 45.35, 309.75, 174, 1, 10, { bold: true });
  text(0, location, 226.67, 309.75, 174, 2, 10, { leading: 12 });
  text(0, date, 408, 309.75, 158, 1, 10);
  text(0, q.reference, 45.35, 351.75, 174, 1, 10);
  text(0, system, 226.67, 351.75, 174, 2, 10, { bold: true, leading: 12 });

  // ---- Page 2 · customer details and system overview ----------------------------------
  text(1, q.customer.name, 243.43, 210.0, 323, 1, 8.5, { bold: true });
  text(1, location, 243.43, 237.75, 323, 1, 8.5);
  text(1, date, 243.43, 264.75, 323, 1, 8.5);
  text(1, q.reference, 243.43, 291.75, 323, 1, 8.5);
  // Each tile is a bold figure with a smaller muted unit beside it; the unit follows the
  // figure's measured width so it stays glued to it whatever the value.
  ([[45.35, pv, 'kW'], [233.3, ik, 'kW'], [407.1, bk, 'kWh']] as const).forEach(([x, value, unit]) => {
    text(1, value, x, 400.5, 150, 1, 15, { bold: true });
    text(1, unit, x + bold.widthOfTextAtSize(`${value} `, 15), 400.5, 40, 1, 9, { color: MUTED });
  });
  text(1, inverterType, 216.4, 438.75, 100, 1, 8.5, { bold: true });
  rightAt(1, structure, TOTAL_RIGHT, 438.75, 120, 8.5, { bold: true });

  // ---- Page 3 · pricing schedule ------------------------------------------------------
  text(2, `Product description: (${system})`, 45.35, 123.0, 450, 1, 8.5, { color: MUTED });
  /** One priced row: item title, wrapped description and the three right-aligned columns. */
  const row = (title: string | null, desc: string, descBaseline: number, descLines: number, valueBaseline: number, qty: string, unitPrice: string, total: string) => {
    if (title) text(2, title, 79.3, valueBaseline, 90, 2, 8.2, { bold: true, leading: 10.5 });
    if (desc) text(2, desc, 175.7, descBaseline, 153, descLines, 7, { color: GREY, leading: 9.45 });
    rightAt(2, qty, QTY_RIGHT, valueBaseline, 26, 8.2);
    rightAt(2, unitPrice, UNIT_PRICE_RIGHT, valueBaseline, 72, 8.2);
    rightAt(2, total, TOTAL_RIGHT, valueBaseline, 78, 8.2, { bold: true });
  };
  if (s.requiredComponents?.length) {
    const page = source.getPage(2);
    page.drawRectangle({ x: 44, y: 792 - 275, width: 524, height: 115, color: WHITE });
    const hardwareRows = (source: 'inverter' | 'battery') => s.requiredComponents!.filter(c => source === 'inverter' ? c.source === 'inverter_parallel' : c.source !== 'inverter_parallel').map(c => ({ serial: '', title: c.category, description: c.name, quantity: c.quantity, unit: c.unitPrice, total: c.totalPrice }));
    const rows = [
      { serial: '01', title: 'Solar Panels', description: panel.brand + ' · ' + panel.model, quantity: panel.quantity, unit: panel.unitPrice, total: panel.lineTotal },
      { serial: '02', title: inverterRowTitle, description: inv.brand + ' · ' + inv.model, quantity: inv.quantity, unit: inv.unitPrice, total: inv.lineTotal },
      ...hardwareRows('inverter'),
      { serial: '03', title: 'Battery', description: battery ? battery.brand + ' · ' + battery.model : 'No battery selected', quantity: battery?.quantity ?? 0, unit: battery?.unitPrice ?? 0, total: battery?.lineTotal ?? 0 },
      ...hardwareRows('battery'),
    ];
    const step = 108 / rows.length;
    rows.forEach((r, index) => {
      const baseline = 168 + index * step;
      if (r.serial) text(2, r.serial, 45.35, baseline, 26, 1, 7.99, { color: MUTED });
      text(2, 'Nos.', 382.5, baseline, 26, 1, 7, { color: MUTED });
      text(2, r.title, 79.3, baseline, 90, 2, 7, { bold: true, leading: 8 });
      text(2, r.description, 175.7, baseline, 153, 2, 7, { color: GREY, leading: 8 });
      rightAt(2, String(r.quantity), QTY_RIGHT, baseline, 26, 8.2);
      rightAt(2, money(r.unit), UNIT_PRICE_RIGHT, baseline, 72, 8.2);
      rightAt(2, money(r.total), TOTAL_RIGHT, baseline, 78, 8.2, { bold: true });
    });
  } else {
  row(null, `${panel.brand} · ${panel.model}\nGrade-A, ${technology} PV panel, ${panel.wattage} W — ${pv} kW total PV capacity`,
    168.8, 3, 170.3, `${panel.quantity}`, money(panel.unitPrice), money(panel.lineTotal));
  row(inverterRowTitle, `${inv.brand} · ${inv.model}\n${ik} kW ${inverterType}, ${phase}, online monitoring via web / mobile app`,
    205.5, 3, 207.0, `${inv.quantity}`, money(inv.unitPrice), money(inv.lineTotal));
  row(null, battery ? `${battery.brand} · ${battery.model}\n${chemistry} battery module, ${battery.unitCapacityKwh} kWh per module — ${bk} kWh total${ip === unknown ? '' : `, IP ${ip}`}` : 'No battery selected',
    243.0, 3, 244.5, `${battery?.quantity ?? 0}`, money(battery?.unitPrice ?? 0), money(battery?.lineTotal ?? 0));
  }
  // The approved table prices the structure by kW; the snapshot stores watts and a
  // per-watt rate, so both are converted. The frozen line total is printed untouched.
  const structureKw = s.structure!.totalPanelWatts / 1000;
  row(`${structure} Structure`, '', 279.8, 12, 281.3,
    number(structureKw), money(s.structure!.ratePerWatt == null ? null : s.structure!.ratePerWatt * 1000), money(s.structure!.charge));
  labelledSpec(2, structure === 'Elevated' ? ELEVATED_SPEC : 'Standard Structure', 175.7, 279.8, 153, 12, 7, 9.45);

  // Replace the two old BOS rows inside their existing combined footprint.
  // The approved table, adjacent rows, branding and seven-page geometry remain.
  source.getPage(2).drawRectangle({ x: 44, y: 792 - 516, width: 524, height: 128, color: WHITE });
  text(2, '05', 45.35, 399, 26, 1, 7.99, { color: MUTED });
  text(2, BOS_QUOTATION_LABEL, 79.3, 399, 90, 5, 8.2, { bold: true, leading: 10.5 });
  // Item 05 uses only the real Description column. The ten-point inset keeps every
  // glyph clear of the Qty boundary; commercial columns keep their approved positions.
  const bosDescription = buildBosDescription(q.bosItems);
  const hasSelectedBosSummary = bosDescription !== BOS_QUOTATION_DESCRIPTION;
  text(2, bosDescription, BOS_DESCRIPTION_LAYOUT.textStartX, BOS_DESCRIPTION_LAYOUT.startBaseline,
    BOS_DESCRIPTION_LAYOUT.descriptionMaxWidth, hasSelectedBosSummary ? 18 : 10, 7,
    { color: GREY, leading: hasSelectedBosSummary ? 6.7 : 9.45 });
  rightAt(2, '1', QTY_RIGHT, 399, 26, 8.2);
  text(2, 'Lot', 382.5, 399, 26, 1, 7.8, { color: MUTED });
  rightAt(2, money(customerBosAmount(q)), UNIT_PRICE_RIGHT, 399, 72, 8.2);
  rightAt(2, money(customerBosAmount(q)), TOTAL_RIGHT, 399, 78, 8.2, { bold: true });
  if (q.type === 'PRE_SURVEY') text(2, 'Estimated; finalized after site survey', 420, 418, 146, 2, 7, { color: MUTED, right: true });
  blank(source.getPage(2),45.35,527.25,26,8);
  blank(source.getPage(2),45.35,555,26,8);
  text(2,'06',45.35,527.25,26,1,7.99,{color:MUTED});
  text(2,'07',45.35,555,26,1,7.99,{color:MUTED});

  // Transportation keeps the master's "to be confirmed" treatment when it is not yet priced.
  if (s.transportationCharge == null) {
    rightAt(2, '—', QTY_RIGHT, 528.0, 26, 8.2, { color: MUTED });
    text(2, '—', 382.5, 527.25, 26, 1, 7.8, { color: MUTED });
    text(2, 'To be confirmed after site survey', 488, 527.25, 78, 2, 7.39, { right: true, color: MUTED, leading: 10.5 });
  } else {
    rightAt(2, '1', QTY_RIGHT, 528.0, 26, 8.2);
    text(2, 'Lot', 382.5, 527.25, 26, 1, 7.8, { color: MUTED });
    rightAt(2, money(s.transportationCharge), UNIT_PRICE_RIGHT, 528.0, 72, 8.2);
    rightAt(2, money(s.transportationCharge), TOTAL_RIGHT, 528.0, 78, 8.2, { bold: true });
  }
  // Installation is also a per-kW row in the approved table. Only the rate is derived;
  // the line total stays exactly the frozen installation charge.
  rightAt(2, pv, QTY_RIGHT, 555.75, 26, 8.2);
  rightAt(2, money(s.systemSizeKw > 0 ? s.installationCharge / s.systemSizeKw : null), UNIT_PRICE_RIGHT, 555.75, 72, 8.2);
  rightAt(2, money(s.installationCharge), TOTAL_RIGHT, 555.75, 78, 8.2, { bold: true });
  text(2, s.promoCode ? `Discount · promo ${s.promoCode}` : 'Discount', 380.8, 596.25, 145, 1, 7.99, { color: GREY });
  rightAt(2, `(${money(s.discountAmount)})`, 566.2, 596.25, 60, 7.99);
  rightAt(2, `PKR ${money(s.finalTotal)}`, TOTAL_RIGHT, 633.75, 130, 14, { bold: true });

  // ---- Page 4 · product information ---------------------------------------------------
  /** Left and right spec columns of one product block. */
  const specRow = (baseline: number, left: string | null, right: string | null) => {
    if (left !== null) rightAt(3, left, SPEC_LEFT_RIGHT, baseline, 104, 7.8);
    if (right !== null) rightAt(3, right, SPEC_RIGHT_RIGHT, baseline, 104, 7.8);
  };
  text(3, `${panel.brand} ${panel.model}`, 164.4, 203.25, 400, 2, 10.99, { bold: true, leading: 12 });
  specRow(228.0, technology, `${panel.wattage} W`);
  specRow(249.8, count(panel.quantity, 'panel'), `${pv} kW`);
  text(3, `${inv.brand} ${inv.model}`, 164.4, 355.5, 400, 2, 10.99, { bold: true, leading: 12 });
  specRow(380.25, `${ik} kW`, inverterType);
  specRow(402.0, phase, null); // the monitoring method is approved fixed copy in the master
  specRow(423.75, count(inv.quantity, 'unit'), null);
  text(3, battery ? `${battery.brand} ${battery.model}` : 'No battery selected', 164.4, 507.75, 400, 2, 10.99, { bold: true, leading: 12 });
  specRow(532.5, battery ? chemistry : 'Not applicable', `${battery?.unitCapacityKwh ?? 0} kWh`);
  specRow(554.25, count(battery?.quantity ?? 0, 'module'), `${bk} kWh`);
  specRow(576.0, !battery ? 'Not applicable' : ip === unknown ? '—' : `IP ${ip}`, null);

  // Product images replace the template's placeholder frames; scaled to fit, never stretched.
  const IMAGE_SLOTS = [
    { key: 'panel', top: 174.8, height: 97.5 },
    { key: 'inverter', top: 326.3, height: 98.3 },
    { key: 'battery', top: 478.5, height: 98.3 },
  ] as const;
  for (const slot of IMAGE_SLOTS) {
    if (slot.key === 'battery' && !battery) continue;
    const input = images[slot.key];
    if (!input) throw new Error(`The saved ${slot.key} image could not be prepared. Please retry quotation preparation.`);
    const bytes = new Uint8Array(input); // Own buffer, including for Node Buffer slices.
    const img = await timed('pdf image embed ' + slot.key, () => bytes[0] === 137 ? source.embedPng(bytes) : source.embedJpg(bytes));
    const box = { x: 45, width: 96.75, top: slot.top, height: slot.height };
    const scale = Math.min(box.width / img.width, box.height / img.height);
    const w = img.width * scale, h = img.height * scale;
    source.getPage(3).drawImage(img, {
      x: box.x + (box.width - w) / 2,
      y: 792 - box.top - box.height + (box.height - h) / 2,
      width: w, height: h,
    });
  }

  // ---- Page 5 · warranty schedule -----------------------------------------------------
  text(4, `Inverter: ${inv.brand} Hybrid Inverter (As Per OEM)`, 45.35, 298.5, 480, 1, 8.2, { color: SLATE });
  text(4, battery ? `Battery: ${battery.brand} Hybrid Battery (As Per OEM)` : 'Battery: Not included', 45.35, 324.75, 480, 1, 8.2, { color: SLATE });
  if (!battery) {
    // Clear the fixed "10 Years" that the schedule prints for a battery that was not sold.
    blank(source.getPage(4), 528, 324.75, 40, 8.2);
    rightAt(4, '—', TOTAL_RIGHT, 324.75, 40, 8.2, { bold: true });
  }

  // ---- Page 7 · signatures ------------------------------------------------------------
  text(6, `${q.customer.name} · Date`, 328.67, 361.5, 237, 1, 7.6, { color: MUTED });

  if (q.type === 'POST_SURVEY') {
    blank(source.getPage(0),45.35,190.5,220,27);
    text(0,'POST-SURVEY',45.35,190.5,250,1,27,{bold:true});
    source.getPage(0).drawRectangle({x:65,y:792-265,width:157,height:12,color:rgb(253/255,248/255,240/255)});
    text(0,`v${q.version} - Awaiting Customer Review`,66.4,262.5,155,1,7.99,{color:GREY});
    blank(source.getPage(1),45.35,122.25,340,15);
    text(1,'POST-SURVEY SOLAR QUOTATION',45.35,122.25,400,1,15,{bold:true});
    blank(source.getPage(1),45.35,139.5,300,8.5);
    text(1,`Quotation v${q.version} - Awaiting Customer Review`,45.35,139.5,350,1,8.5,{color:MUTED});
    source.getPage(1).drawRectangle({x:62,y:792-548,width:487,height:47,color:rgb(253/255,248/255,240/255)});
    text(1,'Thank you for choosing KaamAsaan. This updated quotation uses the saved system configuration and finalized site-survey BOS. It is awaiting customer review and has not been approved or accepted.',63.1,511.5,485,3,8.8,{color:SLATE,leading:14.25});
    blank(source.getPage(2),361.6,633.75,90,7.2);
    text(2,'UPDATED TOTAL',361.6,633.75,90,1,7.2,{color:MUTED,bold:true});
    source.getPage(2).drawRectangle({x:267,y:792-671,width:300,height:27,color:WHITE});
    text(2,'Updated after site survey - awaiting customer review. This quotation is not customer acceptance.',269,653.25,297,2,7.2,{color:MUTED});
    source.getPage(6).drawRectangle({x:44,y:792-248,width:523,height:57,color:WHITE});
    text(6,'Post-Survey Basis',45.35,201.75,130,1,8.2,{bold:true});
    text(6,'This quotation preserves the selected system and agreed pricing snapshot, with the finalized engineering BOS included as one lump sum. Customer review and acceptance remain pending.',187.1,202.5,379,4,7.99,{color:SLATE,leading:12.75});
  }

  const result = await PDFDocument.create();
  result.setTitle(`KaamAsaan ${q.type === 'POST_SURVEY' ? 'Post-Survey' : 'Pre-Survey'} Quotation ${q.reference} — V${q.version}`);
  result.setCreationDate(new Date(q.createdAt)); result.setModificationDate(new Date(q.createdAt));
  const sourceBytes = await timed('pdf source save', () => source.save());
  const pages = await timed('pdf page embedding', () => result.embedPdf(sourceBytes, CUSTOMER_PAGES));
  const width=595.2756, height=841.8898, scale=width/612;
  pages.forEach(p => result.addPage([width,height]).drawPage(p,{ x:0, y:(height-792*scale)/2, width, height:792*scale }));
  const output = await timed('pdf final save', () => result.save());
  onMetric?.('pdf renderer total', { duration_ms: now() - started, bytes: output.byteLength, pages: result.getPageCount() });
  return output;
}

/** Backward-compatible entry point: both apps use the same implementation. */
export const renderPreSurveyPdf = renderQuotationPdf;

/** Paints over a fixed value the master prints for a component this quotation omits. */
function blank(page: PDFPage, x: number, baseline: number, width: number, size: number) {
  page.drawRectangle({ x, y: 792 - baseline - size * 0.3, width, height: size * 1.4, color: WHITE });
}
