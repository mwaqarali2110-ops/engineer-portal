/**
 * The single source of truth for BOS money maths.
 *
 * Totals are always derived from the line state — never stored alongside it —
 * so the UI cannot show a stale amount.
 */

import type { BosLine } from '../../types/domain';

export function lineTotal(line: BosLine): number {
  if(line.specificationPending) return 0;
  if (line.kind === 'wire') {
    const length = line.lengthMeters ?? 0;
    const rate = line.ratePerMeter ?? 0;
    return length * rate;
  }

  const quantity = line.quantity ?? 0;
  const unitPrice = line.unitPrice ?? 0;
  return quantity * unitPrice;
}

export function estimateTotal(lines: BosLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** A line is only counted as complete once it can produce a real amount. */
export function isLinePriced(line: BosLine): boolean {
  if(line.specificationPending) return false;
  if (line.kind === 'wire') {
    return !!line.wireSizeId && !!line.brandId && Number.isFinite(line.ratePerMeter) && (line.ratePerMeter ?? 0) > 0
      && Number.isFinite(line.lengthMeters) && (line.lengthMeters ?? 0) > 0 && Number.isFinite(lineTotal(line));
  }
  return Number.isFinite(line.quantity) && (line.quantity ?? 0) > 0 && Number.isFinite(line.unitPrice)
    && (line.unitPrice ?? 0) > 0 && Number.isFinite(lineTotal(line));
}
