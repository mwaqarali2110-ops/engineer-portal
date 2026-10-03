import { Trash2 } from 'lucide-react';
import { Field } from '../../components/ui/Field';
import { NumberInput } from '../../components/ui/NumberInput';
import { Select } from '../../components/ui/Select';
import { formatPkr } from '../../lib/format';
import type { BosCatalogData } from '../../services/bosCatalogService';
import type {
  BosCatalogItem,
  BosLine,
  BosUnit,
  QuantityBosLine,
  WireBosLine,
} from '../../types/domain';
import { activeWireSizes, brandOptionsFor } from './catalog';

const unitLabels: Record<BosUnit, string> = {
  m: 'Meters',
  pcs: 'Pieces',
  bag: 'Bags',
  set: 'Sets',
  lot: 'Lot',
  pack: 'Packs',
};

type Props = {
  line: BosLine;
  amount: number;
  catalog: BosCatalogData;
  catalogItem?: BosCatalogItem;
  onUpdateWire: (id: string, patch: Partial<WireBosLine>) => void;
  onUpdateQuantity: (id: string, patch: Partial<QuantityBosLine>) => void;
  onRemove: (id: string) => void;
};

export function BosLineItem({
  line,
  amount,
  catalog,
  catalogItem,
  onUpdateWire,
  onUpdateQuantity,
  onRemove,
}: Props) {
  const header = (
    <div className="line-head">
      <div className="line-title">
        <strong>{line.name}</strong>
        <span className="line-tag">{line.kind === 'wire' ? 'Per meter' : `Per ${line.unit}`}</span>
      </div>
      <button
        type="button"
        className="line-remove"
        onClick={() => onRemove(line.id)}
        aria-label={`Remove ${line.name}`}
        title="Remove item"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  if (line.kind === 'wire') {
    const sizes = activeWireSizes(catalog.wireSizes);
    const brandOptions = brandOptionsFor(
      catalog.wireBrands,
      catalog.wireBrandRates,
      line.catalogItemId,
      line.wireSizeId,
    );

    return (
      <article className="line-card">
        {header}
        <div className="line-grid line-grid-wire">
          <Field label="Wire Size" htmlFor={`${line.id}-size`}>
            <Select
              id={`${line.id}-size`}
              value={line.wireSizeId ?? ''}
              placeholder="Select size"
              options={sizes.map((size) => ({ value: size.id, label: size.label }))}
              onValueChange={(value) => onUpdateWire(line.id, { wireSizeId: value || null })}
            />
          </Field>

          <Field
            label="Brand"
            htmlFor={`${line.id}-brand`}
            hint={line.wireSizeId ? undefined : 'Select a wire size first.'}
          >
            <Select
              id={`${line.id}-brand`}
              value={line.brandId ?? ''}
              placeholder={line.wireSizeId ? 'Select brand' : '—'}
              disabled={!line.wireSizeId}
              options={brandOptions.map((option) => ({
                value: option.brand.id,
                label: option.ratePerMeter === null
                  ? `${option.brand.name} — Rate not configured`
                  : `${option.brand.name} — ${formatPkr(option.ratePerMeter)}/m`,
              }))}
              onValueChange={(value) => onUpdateWire(line.id, { brandId: value || null })}
            />
          </Field>

          <Field label="Rate">
            <div className="readonly-value">
              {line.ratePerMeter === null ? 'Rate not configured' : `${formatPkr(line.ratePerMeter)}/m${line.rateProvisional ? ' · Provisional' : ''}`}
            </div>
          </Field>

          <Field label="Required Length" htmlFor={`${line.id}-length`}>
            <NumberInput
              id={`${line.id}-length`}
              value={line.lengthMeters}
              onChange={(value) => onUpdateWire(line.id, { lengthMeters: value })}
              placeholder="0"
              suffix="m"
            />
          </Field>

          <div className="line-amount">
            <span>Amount</span>
            <strong>{line.ratePerMeter === null ? 'Rate not configured' : formatPkr(amount)}</strong>
          </div>
        </div>
      </article>
    );
  }

  const allowedUnits = catalogItem?.allowedUnits ?? [line.unit];
  const pricedBrands = catalog.quantityRates.filter((rate) => rate.itemId === line.catalogItemId && rate.unit === line.unit && rate.brandId);
  const brands = catalog.wireBrands.filter((brand) => pricedBrands.some((rate) => rate.brandId === brand.id));

  return (
    <article className="line-card">
      {header}
      <div className="line-grid line-grid-quantity">
        <Field label="Quantity" htmlFor={`${line.id}-qty`}>
          <NumberInput
            id={`${line.id}-qty`}
            value={line.quantity}
            onChange={(value) => onUpdateQuantity(line.id, { quantity: value })}
            placeholder="0"
          />
        </Field>

        <Field label="Unit" htmlFor={`${line.id}-unit`}>
          {allowedUnits.length > 1 ? (
            <Select
              id={`${line.id}-unit`}
              value={line.unit}
              options={allowedUnits.map((unit) => ({ value: unit, label: unitLabels[unit] }))}
              onValueChange={(value) => onUpdateQuantity(line.id, { unit: value as BosUnit })}
            />
          ) : (
            <div className="readonly-value">{unitLabels[line.unit]}</div>
          )}
        </Field>

        {brands.length > 0 && <Field label="Brand" htmlFor={`${line.id}-brand`}>
          <Select id={`${line.id}-brand`} value={line.brandId ?? ''} options={[{ value: '', label: 'No brand' }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))]} onValueChange={(value) => onUpdateQuantity(line.id, { brandId: value || null })} />
        </Field>}

        <Field label="Unit Price" htmlFor={`${line.id}-price`}>
          {line.configuredRate ? <div className="readonly-value">{formatPkr(line.unitPrice ?? 0)}{line.rateProvisional ? ' · Provisional' : ' · Verified'}</div> : <NumberInput
            id={`${line.id}-price`}
            value={line.unitPrice}
            onChange={(value) => onUpdateQuantity(line.id, { unitPrice: value })}
            placeholder="0"
            prefix="Rs"
          />}
        </Field>

        <div className="line-amount">
          <span>Amount</span>
          <strong>{formatPkr(amount)}</strong>
        </div>
      </div>

      {catalogItem?.supportsNotes ? (
        <Field label="Notes" htmlFor={`${line.id}-notes`} className="line-notes">
          <div className="control">
            <input
              id={`${line.id}-notes`}
              type="text"
              placeholder="e.g. cable ties, tapes, thimbles, I-lugs, O-lugs"
              value={line.notes ?? ''}
              onChange={(event) => onUpdateQuantity(line.id, { notes: event.target.value })}
            />
          </div>
        </Field>
      ) : null}
    </article>
  );
}
