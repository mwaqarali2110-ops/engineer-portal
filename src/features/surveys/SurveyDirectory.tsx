import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Notice } from '../../components/ui/Notice';
import { Panel } from '../../components/ui/Panel';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDateValue, formatTextValue } from '../../lib/format';
import {
  getSurveyDirectoryCount,
  getSurveyDirectoryPage,
  SURVEY_DIRECTORY_PAGE_SIZE,
  SURVEY_STATUS_OPTIONS,
  SurveyLookupError,
  type SurveyDirectoryPage,
} from '../../services/surveyService';

type Props = {
  onOpen: (referenceId: string) => void;
  openedReference?: string;
  revision?: number;
};

export function SurveyDirectory({ onOpen, openedReference, revision = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    let active = true;
    setSummaryError('');
    void getSurveyDirectoryCount()
      .then((count) => { if (active) setTotal(count); })
      .catch((error: unknown) => {
        if (active) setSummaryError(error instanceof SurveyLookupError
          ? error.message : 'Unable to load the survey count right now.');
      });
    return () => { active = false; };
  }, [revision]);

  return (
    <>
      <Panel
        title="Survey Directory"
        description="Browse bookings when you do not have a reference number."
        className="directory-summary"
        actions={
          <Button variant="secondary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Hide Directory' : 'View All Surveys'}
          </Button>
        }
      >
        <div className="directory-summary-count">
          <strong>{total === null ? '—' : total.toLocaleString('en-PK')}</strong>
          <span>Total surveys</span>
        </div>
        {summaryError ? <Notice tone="error">{summaryError}</Notice> : null}
      </Panel>

      {expanded ? <DirectoryResults onOpen={onOpen} openedReference={openedReference} revision={revision} /> : null}
    </>
  );
}

export function DirectoryResults({ onOpen, openedReference, revision = 0 }: Props) {
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<SurveyDirectoryPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setResult(null);
    setError('');
    void getSurveyDirectoryPage({ page, search, status })
      .then((data) => { if (active) setResult(data); })
      .catch((caught: unknown) => {
        if (active) {
          setResult(null);
          setError(caught instanceof SurveyLookupError
            ? caught.message : 'Unable to load surveys right now. Please try again.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, status, refreshKey, revision]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  const pageCount = Math.max(1, Math.ceil((result?.count ?? 0) / SURVEY_DIRECTORY_PAGE_SIZE));

  return (
    <Panel
      title="All Surveys"
      description="Search and open any survey booking available to Design Engineering."
      className="directory-results"
      actions={
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={refresh} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="directory-toolbar">
        <form className="directory-search-form" onSubmit={submitSearch}>
          <label htmlFor="directory-search">Search surveys</label>
          <input
            id="directory-search"
            type="search"
            placeholder="Search reference, customer or phone..."
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <div className="directory-status-filter">
          <label htmlFor="directory-status">Status</label>
          <Select
            id="directory-status"
            value={status}
            placeholder="All statuses"
            options={[...SURVEY_STATUS_OPTIONS]}
            onValueChange={(value) => { setPage(1); setStatus(value); }}
          />
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && result === null ? <Skeleton rows={3} /> : null}
      {!loading && result !== null && result.surveys.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={20} />}
          title="No matching surveys"
          description="Try another reference, customer, phone or status."
        />
      ) : null}

      {result !== null && result.surveys.length > 0 ? (
        <>
          <div className="directory-meta" aria-live="polite">
            {result.count.toLocaleString('en-PK')} matching surveys
          </div>
          <div className="directory-table" role="table" aria-label="Survey directory" aria-busy={loading}>
            <div className="directory-row directory-head" role="row">
              <span role="columnheader">Reference</span>
              <span role="columnheader">Customer</span>
              <span role="columnheader">Phone</span>
              <span role="columnheader">City</span>
              <span role="columnheader">Preferred Date</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Open</span>
            </div>
            {result.surveys.map(({ bookingId, details, directoryStatus }) => (
              <div
                className={`directory-row${openedReference === details.referenceId ? ' is-open' : ''}`}
                role="row"
                key={bookingId}
              >
                <span role="cell" data-label="Reference" className="directory-reference">{details.referenceId}</span>
                <span role="cell" data-label="Customer">{formatTextValue(details.customerName, 'Not provided')}</span>
                <span role="cell" data-label="Phone">{formatTextValue(details.phone, 'Not provided')}</span>
                <span role="cell" data-label="City">{formatTextValue(details.city, 'Not provided')}</span>
                <span role="cell" data-label="Preferred Date">{formatDateValue(details.preferredDate)}</span>
                <span role="cell" data-label="Status"><span className="assignment-status">{directoryStatus}</span></span>
                <span role="cell" className="directory-action">
                  <Button variant="secondary" onClick={() => onOpen(details.referenceId)}>Open</Button>
                </span>
              </div>
            ))}
          </div>
          <div className="directory-pagination">
            <Button variant="secondary" onClick={() => setPage((value) => value - 1)} disabled={loading || page <= 1}>
              Previous
            </Button>
            <span>Page {page} of {pageCount}</span>
            <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={loading || page >= pageCount}>
              Next
            </Button>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
