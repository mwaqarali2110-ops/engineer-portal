import { useEffect, useState } from 'react';

type Props = {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
};

/**
 * Numeric input that keeps an editable draft while focused, emits `null` for an
 * empty field, and refuses negative values (quantities, lengths and prices can
 * never be below zero).
 */
export function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  suffix,
  prefix,
  min = 0,
  max,
  step,
  disabled = false,
  invalid = false,
  ariaLabel,
}: Props) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value === null ? '' : String(value));
  }, [value, focused]);

  function handleChange(raw: string) {
    // Digits and a single decimal point only — no minus sign, no exponent.
    const cleaned = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setDraft(cleaned);

    if (cleaned === '' || cleaned === '.') {
      onChange(null);
      return;
    }

    const parsed = Number(cleaned);
    if (Number.isNaN(parsed)) return;

    let next = Math.max(min, parsed);
    if (typeof max === 'number') next = Math.min(max, next);
    onChange(next);
  }

  return (
    <div className={`control number-control ${invalid ? 'is-invalid' : ''}`.trim()}>
      {prefix ? <span className="control-affix">{prefix}</span> : null}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        step={step}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(value === null ? '' : String(value));
        }}
        onChange={(event) => handleChange(event.target.value)}
      />
      {suffix ? <span className="control-affix">{suffix}</span> : null}
    </div>
  );
}
