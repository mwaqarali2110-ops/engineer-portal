import type { SelectHTMLAttributes } from 'react';

type Option = { value: string; label: string; disabled?: boolean };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  value: string;
  options: Option[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
};

export function Select({
  value,
  options,
  onValueChange,
  placeholder,
  invalid = false,
  className = '',
  ...rest
}: Props) {
  return (
    <div className={`control select-control ${invalid ? 'is-invalid' : ''} ${className}`.trim()}>
      <select
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onValueChange(event.target.value)}
        {...rest}
      >
        {placeholder ? (
          <option value="">{placeholder}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
