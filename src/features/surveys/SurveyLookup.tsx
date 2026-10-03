import { useState } from 'react';
import type { FormEvent } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Notice';
import { TextInput } from '../../components/ui/TextInput';
import { Panel } from '../../components/ui/Panel';
import { DEMO_SURVEY_REFERENCE, DEMO_SURVEY_WITHOUT_SYSTEM } from './mockSurvey';
import { isMockMode } from '../../lib/env';

type Props = {
  onSearch: (referenceId: string) => void;
  loading: boolean;
  error: string;
  /** Reference of the survey currently open, if any. */
  loadedReference?: string;
};

export function SurveyLookup({ onSearch, loading, error, loadedReference }: Props) {
  const [referenceId, setReferenceId] = useState('');
  const [touchedError, setTouchedError] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = referenceId.trim();
    if (!trimmed) {
      setTouchedError('Enter a survey reference ID.');
      return;
    }
    setTouchedError('');
    onSearch(trimmed);
  }

  const visibleError = touchedError || error;

  return (
    <Panel
      title="Find Survey Booking"
      description="Enter a survey reference number to open the customer's details and survey."
      className="lookup-primary"
    >
      <form className="lookup-form" onSubmit={handleSubmit} noValidate>
        <div className="lookup-field">
          <label htmlFor="survey-reference">Survey Reference ID</label>
          <TextInput
            id="survey-reference"
            placeholder={`e.g. ${isMockMode ? DEMO_SURVEY_REFERENCE : 'KA-E7109E45'}`}
            icon={<Search size={16} />}
            autoComplete="off"
            spellCheck={false}
            invalid={Boolean(visibleError)}
            value={referenceId}
            onChange={(event) => {
              setReferenceId(event.target.value);
              if (touchedError) setTouchedError('');
            }}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Opening…' : 'Open Survey'}
        </Button>
      </form>

      {visibleError ? <Notice tone="error">{visibleError}</Notice> : null}

      {!visibleError && loadedReference ? (
        <Notice tone="success">Survey {loadedReference} is open below.</Notice>
      ) : null}

      {isMockMode && !loadedReference && !visibleError ? (
        <p className="lookup-hint">
          Mock mode is on. Prototype data is available for <code>{DEMO_SURVEY_REFERENCE}</code> and
          <code>{DEMO_SURVEY_WITHOUT_SYSTEM}</code>.
        </p>
      ) : null}
    </Panel>
  );
}
