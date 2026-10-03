import type { InputHTMLAttributes, ReactNode } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
  invalid?: boolean;
};

export function TextInput({ icon, invalid = false, className = '', ...rest }: Props) {
  return (
    <div className={`control ${invalid ? 'is-invalid' : ''} ${className}`.trim()}>
      {icon ? <span className="control-icon">{icon}</span> : null}
      <input aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
}
