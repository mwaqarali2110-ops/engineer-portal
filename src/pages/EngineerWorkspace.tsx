import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { BosEstimator } from '../features/bos/BosEstimator';
import { DirectoryResults } from '../features/surveys/SurveyDirectory';
import { WorkspaceDashboard, localDay } from '../features/surveys/WorkspaceDashboard';
import { CalendarDays } from 'lucide-react';
import { Notice } from '../components/ui/Notice';
import { SurveyDetails } from '../features/surveys/SurveyDetails';
import {ProjectJourney} from '../features/surveys/ProjectJourney';
import { SurveyLookup } from '../features/surveys/SurveyLookup';
import { SystemSummary } from '../features/surveys/SystemSummary';
import { getSurveyById, getSurveyByReference, getSurveyDashboard, SurveyLookupError, type DashboardSurvey } from '../services/surveyService';
import { useAuth } from '../features/auth/AuthContext';
import type { Engineer, SurveyRecord } from '../types/domain';

type Props = {
  engineer: Engineer;
};

/**
 * One continuous worksheet: look up the booking, review the survey and system,
 * then build the BOS. The engineer never navigates away mid-task.
 */
export function EngineerWorkspace({ engineer }: Props) {
  const { signOut } = useAuth();
  const [survey, setSurvey] = useState<SurveyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [directoryRevision,setDirectoryRevision] = useState(0);
  const [view,setView] = useState<'home'|'surveys'>('home');
  const [rows,setRows] = useState<DashboardSurvey[]>([]);
  const [dashboardLoading,setDashboardLoading] = useState(true);
  const [dashboardError,setDashboardError] = useState('');
  const [lastId,setLastId] = useState<string|null>(()=>{try{return sessionStorage.getItem(`kaamasaan-last-survey:${engineer.id}`);}catch{return null;}});
  const [now,setNow] = useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{let active=true;setDashboardLoading(true);setDashboardError('');getSurveyDashboard().then(data=>{if(active)setRows(data);}).catch(()=>{if(active)setDashboardError('Unable to load the survey dashboard. Reference lookup is still available.');}).finally(()=>{if(active)setDashboardLoading(false);});return ()=>{active=false;};},[directoryRevision]);

  const handleSearch = useCallback(async (referenceId: string) => {
    setLoading(true);
    setLookupError('');
    try {
      const result = await getSurveyByReference(referenceId);
      setSurvey(result);
      setLastId(result.details.bookingId);
      try { sessionStorage.setItem(`kaamasaan-last-survey:${engineer.id}`,result.details.bookingId); } catch { /* Session history is optional. */ }
    } catch (error) {
      setSurvey(null);
      // Every branch of surveyService throws a user-safe message and keeps
      // "not found", "not authorized" and "unavailable" distinct.
      setLookupError(
        error instanceof SurveyLookupError
          ? error.message
          : 'Unable to load the survey right now. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [engineer.id]);

  const refreshOpenSurvey = useCallback(async () => {
    const bookingId=survey?.details.bookingId;
    if(!bookingId)return;
    try {
      const updated=await getSurveyById(bookingId);
      setSurvey(current=>current?.details.bookingId===updated.details.bookingId ? updated : current);
    } finally { setDirectoryRevision(value=>value+1); }
  },[survey?.details.bookingId]);

  useEffect(() => {
    if (survey) document.getElementById('survey-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [survey]);

  return (
    <div className="app-shell">
      <AppHeader engineer={engineer} onLogout={() => void signOut()} view={view} onNavigate={setView}/>

      <main className="page">
        <div className="page-intro workspace-intro"><div>
          <h1>Site Survey Workspace</h1>
          <p>Manage your site surveys, view your schedule and complete surveys in the field.</p></div><span><CalendarDays size={17}/>{now.toLocaleDateString('en-PK',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
        </div>

        {view==='home' ? <WorkspaceDashboard rows={rows} loading={dashboardLoading} error={dashboardError} today={localDay(now)} onOpen={id=>void handleSearch(id)} onDirectory={()=>setView('surveys')} onRetry={()=>setDirectoryRevision(value=>value+1)} last={!dashboardLoading && !dashboardError ? rows.find(row=>row.bookingId===lastId)?.details : undefined} lookup={<SurveyLookup
          onSearch={(reference) => void handleSearch(reference)}
          loading={loading}
          error={lookupError}
          loadedReference={survey?.details.referenceId}
        />}/> : <>{lookupError && <Notice tone="error">{lookupError}</Notice>}{loading && <Notice tone="info">Opening survey…</Notice>}<DirectoryResults onOpen={reference=>void handleSearch(reference)} openedReference={survey?.details.referenceId} revision={directoryRevision}/></>}


        {survey ? (
          <div id="survey-details">
            <SurveyDetails details={survey.details} />
            <ProjectJourney key={survey.details.bookingId} details={survey.details} engineer={engineer} onChanged={refreshOpenSurvey}/>
            <SystemSummary system={survey.system} />
            <BosEstimator key={survey.details.bookingId} survey={survey.details} engineer={engineer} onJourneyChanged={refreshOpenSurvey}/>
          </div>
        ) : null}
      </main>
    </div>
  );
}
