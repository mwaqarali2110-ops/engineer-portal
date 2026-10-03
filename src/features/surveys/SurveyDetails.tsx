import { ClipboardList } from 'lucide-react';
import {
  formatDateTimeValue,
  formatDateValue,
  formatTextValue,
  TO_BE_CONFIRMED,
} from '../../lib/format';
import type { SurveyDetails as SurveyDetailsModel } from '../../types/domain';

type Props = {
  details: SurveyDetailsModel;
};

/** Compact read-only card for the real booking fields. */
export function SurveyDetails({ details }: Props) {
  const rows: { label: string; value: string; wide?: boolean }[] = [
    { label: 'Reference ID', value: details.referenceId },
    { label: 'Customer Name', value: formatTextValue(details.customerName, 'Not provided') },
    { label: 'Phone', value: formatTextValue(details.phone, 'Not provided') },
    { label: 'City', value: formatTextValue(details.city, 'Not provided') },
    { label: 'Address', value: formatTextValue(details.address, 'Not provided'), wide: true },
    { label: 'Service', value: formatTextValue(details.serviceType, 'Not specified') },
    { label: 'Booking Type', value: formatTextValue(details.bookingType, 'Not specified') },
    { label: 'Preferred Survey Date', value: formatDateValue(details.preferredDate) },
    { label: 'Time Slot', value: formatTextValue(details.timeSlot) },
    { label: 'Confirmed Survey', value: formatDateTimeValue(details.confirmedSurveyDate) },
    { label: 'Planned Installation', value: formatDateTimeValue(details.plannedInstallationDate) },
    { label: 'Requested On', value: formatDateValue(details.requestedAt, 'Not recorded') },
  ];

  const assignedTeam = details.assignedTeamName
    ? [details.assignedTeamName, details.assignedTeamContact].filter(Boolean).join(' · ')
    : null;

  return (
    <section className="panel details-panel">
      <div className="details-head">
        <div className="details-title">
          <span className="details-eyebrow">
            <ClipboardList size={13} /> Survey Details
          </span>
          <h2>{details.referenceId}</h2>
        </div>
        <span className="status-pill">{formatTextValue(details.status, 'Not set')}</span>
      </div>

      <dl className="details-grid">
        {rows.map((row) => (
          <div className={`details-cell${row.wide ? ' details-cell-wide' : ''}`} key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.value === TO_BE_CONFIRMED ? 'is-pending' : undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {assignedTeam || details.progressNote ? (
        <div className="details-notes">
          {assignedTeam ? (
            <p>
              <strong>Assigned team:</strong> {assignedTeam}
            </p>
          ) : null}
          {details.progressNote ? (
            <p>
              <strong>Latest update:</strong> {details.progressNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
