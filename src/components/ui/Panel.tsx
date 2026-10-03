import type { ReactNode } from 'react';

type Props = {
  step?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Renders the header as a button that toggles the body. */
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  className?: string;
};

export function Panel({
  step,
  title,
  description,
  actions,
  children,
  collapsible = false,
  open = true,
  onToggle,
  className = '',
}: Props) {
  const heading = (
    <>
      <div className="panel-heading-main">
        {step ? <span className="step-badge">{step}</span> : null}
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="panel-heading-actions">{actions}</div> : null}
    </>
  );

  return (
    <section className={`panel ${className}`.trim()}>
      {collapsible ? (
        <button
          type="button"
          className="panel-heading panel-heading-button"
          onClick={onToggle}
          aria-expanded={open}
        >
          {heading}
        </button>
      ) : (
        <div className="panel-heading">{heading}</div>
      )}
      {open ? <div className="panel-body">{children}</div> : null}
    </section>
  );
}
