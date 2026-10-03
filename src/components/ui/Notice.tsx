import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

type Tone = 'error' | 'success' | 'info';

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
} as const;

type Props = {
  tone?: Tone;
  children: ReactNode;
};

/** Inline message block — the portal never uses browser alerts. */
export function Notice({ tone = 'info', children }: Props) {
  const Icon = icons[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}
