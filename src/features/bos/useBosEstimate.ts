import { useCallback, useEffect, useMemo, useState } from 'react';
import { createId } from '../../lib/id';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type {
  BosCatalogItem,
  BosLine,
  QuantityBosLine,
  WireBosLine,
} from '../../types/domain';
import { estimateTotal, lineTotal } from './calculations';
import { resolveWireRate } from './catalog';

function quantityRate(catalog: BosCatalogData | null, itemId: string, brandId: string | null, unit: QuantityBosLine['unit']) {
  return catalog?.quantityRates.find((rate) => rate.itemId === itemId && rate.brandId === brandId && rate.unit === unit) ?? null;
}

/**
 * Owns the BOS worksheet state.
 *
 * Only the line items are stored. Every amount — line totals and the BOS
 * total — is derived from that state, so no total can go stale.
 */
export function useBosEstimate(catalog: BosCatalogData | null) {
  const [lines, setLines] = useState<BosLine[]>([]);

  const addLine = useCallback((item: BosCatalogItem) => {
    const base = {
      id: createId('bos'),
      catalogItemId: item.id,
      name: item.name,
      categoryId: item.categoryId,
    };

    const newLine: BosLine =
      item.kind === 'wire'
        ? { ...base, kind: 'wire', unit: 'm', wireSizeId: null, brandId: null, ratePerMeter: null, lengthMeters: null }
        : {
            ...base,
            kind: 'quantity',
            unit: item.defaultUnit,
            quantity: null,
            unitPrice: null,
            brandId: null,
            ...(item.supportsNotes ? { notes: '' } : {}),
          };

    setLines((current) => [...current, newLine]);
    return newLine.id;
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));
  }, []);


  const replaceLines = useCallback((next: BosLine[]) => setLines(next), []);

  const updateQuantityLine = useCallback((id: string, patch: Partial<QuantityBosLine>) => {
    setLines((current) =>
      current.map((line) =>
        line.id === id && line.kind === 'quantity' ? (() => {
          const next = { ...line, ...patch };
          if (!('unit' in patch) && !('brandId' in patch)) return next;
          const configured = quantityRate(catalog, next.catalogItemId, next.brandId ?? null, next.unit);
          return { ...next, unitPrice: configured?.unitPrice ?? null, configuredRate: !!configured, rateProvisional: configured?.provisional ?? false };
        })() : line,
      ),
    );
  }, [catalog]);

  // Reprice restored local drafts when the real catalog arrives. A previous
  // mock snapshot must never appear as a current real-mode rate.
  useEffect(() => {
    if (!catalog) return;
    setLines((current) => current.map((line) => {
      if (line.kind === 'wire') {
        const rate = catalog.wireBrandRates.find((entry) => entry.wireItemId === line.catalogItemId && entry.wireSizeId === line.wireSizeId && entry.brandId === line.brandId && entry.active);
        return { ...line, ratePerMeter: resolveWireRate(catalog.wireBrandRates, {
          wireItemId: line.catalogItemId, wireSizeId: line.wireSizeId, brandId: line.brandId,
        }), rateProvisional: rate?.provisional ?? false };
      }
      const rate = quantityRate(catalog, line.catalogItemId, line.brandId ?? null, line.unit);
      return { ...line, unitPrice: rate?.unitPrice ?? (line.configuredRate ? null : line.unitPrice), configuredRate: !!rate, rateProvisional: rate?.provisional ?? false };
    }));
  }, [catalog]);

  /** Wire updates always re-resolve the current catalog rate. */
  const updateWireLine = useCallback(
    (id: string, patch: Partial<WireBosLine>) => {
      setLines((current) =>
        current.map((line) => {
          if (line.id !== id || line.kind !== 'wire') return line;

          const next: WireBosLine = { ...line, ...patch };
          const rates = catalog?.wireBrandRates ?? [];
          const resolved = resolveWireRate(rates, {
            wireItemId: next.catalogItemId,
            wireSizeId: next.wireSizeId,
            brandId: next.brandId,
          });

          const rate = rates.find((entry) => entry.wireItemId === next.catalogItemId && entry.wireSizeId === next.wireSizeId && entry.brandId === next.brandId && entry.active);
          return { ...next, ratePerMeter: resolved, rateProvisional: rate?.provisional ?? false };
        }),
      );
    },
    [catalog],
  );

  const total = useMemo(() => estimateTotal(lines), [lines]);

  const linesWithAmounts = useMemo(() => {
    return lines.map((line) => ({ line, amount: lineTotal(line) }));
  }, [lines]);

  return {
    lines,
    linesWithAmounts,
    total,
    addLine,
    removeLine,
    replaceLines,
    updateWireLine,
    updateQuantityLine,
  };
}
