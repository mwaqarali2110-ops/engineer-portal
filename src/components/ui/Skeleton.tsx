type Props = {
  /** Number of placeholder rows to render while data loads. */
  rows?: number;
  className?: string;
};

/** Loading placeholder, ready for the real API calls added in Phase 2. */
export function Skeleton({ rows = 3, className = '' }: Props) {
  return (
    <div className={`skeleton ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className="skeleton-row" />
      ))}
    </div>
  );
}
