import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = 'primary',
  block = false,
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: Props) {
  const classes = ['btn', `btn-${variant}`, block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
