import { PackageSearch } from 'lucide-react';
import type { SystemSummary as SystemSummaryModel } from '../../types/domain';

type Props = {
  /** Null when the booking exists but no system is attached to it yet. */
  system: SystemSummaryModel | null;
};

const sourceLabels: Record<SystemSummaryModel['source'], string> = {
  package_snapshot: 'From the selected package snapshot',
  system_design: 'From the customer’s saved system design',
  mock: 'Prototype data',
};

export function SystemSummary({ system }: Props) {
  if (!system) {
    return (
      <section className="panel summary-panel">
        <div className="summary-top">
          <div className="summary-identity">
            <span className="summary-eyebrow">System Summary</span>
            <h2>System Summary not available yet</h2>
          </div>
        </div>
        <div className="summary-unavailable">
          <span className="summary-unavailable-icon">
            <PackageSearch size={18} />
          </span>
          <p>
            The survey booking was found, but no approved or selected system configuration is
            currently attached to this booking.
          </p>
        </div>
      </section>
    );
  }

  const facts = [
    { label: 'Solar Panels', component: system.panels },
    { label: 'Inverter', component: system.inverter },
    { label: 'Battery', component: system.battery },
    {
      label: 'Structure',
      component: system.structureType ? { name: system.structureType, detail: 'As selected' } : null,
    },
  ];

  return (
    <section className="panel summary-panel">
      <div className="summary-top">
        <div className="summary-identity">
          <span className="summary-eyebrow">System Summary</span>
          <h2>Selected system</h2>
          <p className="summary-source">{sourceLabels[system.source]}</p>
        </div>

        <div className="system-size">
          <span>System Size</span>
          <strong>{system.systemSizeKw === null ? '—' : `${system.systemSizeKw} kW`}</strong>
        </div>
      </div>

      <div className="summary-grid">
        {facts.map((fact) => (
          <div className="summary-cell" key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.component ? fact.component.name : 'Not specified'}</strong>
            <small>{fact.component ? fact.component.detail : '—'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
