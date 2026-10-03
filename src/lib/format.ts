/** Pakistani Rupee and date formatting used across the portal. */

const currencyFormatter = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});

/** e.g. Rs 184,750 — no decimals, matching how site estimates are quoted. */
export function formatPkr(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  // Some runtimes render PKR as "PKR 184,750"; normalise to "Rs 184,750".
  return currencyFormatter.format(safe).replace(/^(PKR|Rs\.?)\s?/, 'Rs ');
}


/** Neutral placeholder for scheduling values the team has not set yet. */
export const TO_BE_CONFIRMED = 'To Be Confirmed';

function parseDate(value: string): Date | null {
  // A bare `YYYY-MM-DD` is parsed as UTC midnight by Date; read it as a local
  // calendar date so a preferred date never shifts a day backwards.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date only. Null/blank/unparseable values render as the neutral fallback. */
export function formatDateValue(
  value: string | null | undefined,
  fallback: string = TO_BE_CONFIRMED,
): string {
  if (!value) return fallback;
  const date = parseDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Date + time, used for confirmed survey and planned installation stamps. */
export function formatDateTimeValue(
  value: string | null | undefined,
  fallback: string = TO_BE_CONFIRMED,
): string {
  if (!value) return fallback;
  const date = parseDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** Any plain text field that may be missing. */
export function formatTextValue(
  value: string | null | undefined,
  fallback: string = TO_BE_CONFIRMED,
): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? fallback : trimmed;
}
