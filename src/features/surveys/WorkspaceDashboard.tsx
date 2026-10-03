import { CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock3, FileText, MapPin, RefreshCw } from 'lucide-react';
import type { DashboardSurvey } from '../../services/surveyService';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Notice } from '../../components/ui/Notice';
import type { SurveyDetails } from '../../types/domain';

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function schedule(details: SurveyDetails) {
  const confirmed = details.confirmedSurveyDate ? new Date(details.confirmedSurveyDate) : null;
  if (confirmed && Number.isFinite(confirmed.getTime())) return {
    day: localDay(confirmed), time: confirmed.toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit' }), order: confirmed.getTime(), confirmed: true,
  };
  const day = details.preferredDate?.slice(0,10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { day, time: details.timeSlot || 'Time to be confirmed', order: new Date(`${day}T23:59:59`).getTime(), confirmed: false };
}
export function dashboardGroups(rows: DashboardSurvey[], today: string) {
  const active = (row: DashboardSurvey) => row.details.journeyStatus === 'active';
  const scheduled = rows.filter(row => active(row) && row.details.statusKey === 'survey_scheduled');
  const completed = rows.filter(row => active(row) && ['survey_completed','quotation_shared','installation_completed'].includes(row.details.statusKey ?? ''));
  const awaiting = rows.filter(row => active(row) && row.details.statusKey === 'survey_completed');
  const todayRows = scheduled.filter(row => schedule(row.details)?.day === today);
  const upcoming = scheduled.filter(row => (schedule(row.details)?.day ?? '') >= today)
    .sort((a,b) => schedule(a.details)!.order - schedule(b.details)!.order || a.bookingId.localeCompare(b.bookingId));
  const recent = [...rows].sort((a,b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.bookingId.localeCompare(b.bookingId)).slice(0,5);
  return { scheduled, completed, awaiting, todayRows, upcoming, recent };
}
export function WorkspaceDashboard({ rows, loading, error, today, onOpen, onDirectory, onRetry, lookup, last } : {
  rows: DashboardSurvey[]; loading: boolean; error: string; today: string;
  onOpen: (id:string)=>void; onDirectory:()=>void; onRetry:()=>void; lookup: React.ReactNode; last?: SurveyDetails;
}) {
  const groups = dashboardGroups(rows,today);
  const cards = [
    { label:"Today's Surveys", count:groups.todayRows.length, helper:'Scheduled for today', icon:CalendarDays, tone:'blue' },
    { label:'Scheduled', count:groups.scheduled.length, helper:'At the survey scheduled stage', icon:Clock3, tone:'gold' },
    { label:'Completed', count:groups.completed.length, helper:'Survey completed or later stage', icon:CheckCircle2, tone:'green' },
    { label:'Awaiting Quotation', count:groups.awaiting.length, helper:'Survey completed; quotation pending', icon:FileText, tone:'purple' },
  ];
  const unavailable = loading || !!error;
  return <>
    <div className="workspace-kpis">{cards.map(card => <div className={`workspace-kpi ${card.tone}`} key={card.label}>
      <span className="workspace-icon"><card.icon size={25}/></span><div><h3>{card.label}</h3><strong>{unavailable ? '—' : card.count}</strong><p>{card.helper}</p></div>
    </div>)}</div>
    <div className={`workspace-search${last ? ' has-last' : ''}`}>{lookup}{last && <section className="workspace-card continue-card"><div className="workspace-card-title"><RefreshCw size={21}/><div><h2>Continue Last Survey</h2><p>Resume where you left off</p></div></div><div className="continue-content"><div><strong>{last.referenceId}</strong><p>{last.customerName} · {last.city}</p></div><Button variant="secondary" onClick={()=>onOpen(last.bookingId)}>Continue</Button></div></section>}</div>
    {error && <Notice tone="error">{error} <Button variant="secondary" onClick={onRetry}>Retry dashboard</Button></Notice>}
    <div className="workspace-columns"><div><section className="workspace-card"><div className="workspace-section-head"><h2>Today's &amp; Upcoming Surveys</h2><button className="workspace-link" onClick={onDirectory}>View All</button></div>
      {loading ? <Skeleton rows={4}/> : !error && groups.upcoming.length===0 ? <p className="workspace-empty">No upcoming surveys scheduled.</p> : groups.upcoming.slice(0,5).map(row=>{
        const slot=schedule(row.details)!; const date=new Date(`${slot.day}T12:00:00`);
        return <div className="workspace-survey-row" key={row.bookingId}><div className="workspace-date"><strong>{date.getDate()}</strong><span>{date.toLocaleDateString('en-PK',{month:'short'})}</span></div><div className="workspace-time"><strong>{slot.time}</strong><small>{slot.day===today ? 'Today' : date.toLocaleDateString('en-PK',{weekday:'short'})} · {slot.confirmed ? 'Confirmed' : 'Preferred'}</small></div><div className="workspace-customer"><strong>{row.details.referenceId}</strong><span>{row.details.customerName}</span><small><MapPin size={13}/>{row.details.address}, {row.details.city}</small></div><span className="workspace-status scheduled">Scheduled</span><Button onClick={()=>onOpen(row.bookingId)}>Open Survey</Button></div>;
      })}</section><section className="workspace-card workspace-help"><MapPin size={24}/><div><h3>Need Help?</h3><p>If you face any issues in the field, contact the admin team.</p></div></section></div>
      <aside><section className="workspace-card"><div className="workspace-section-head"><div><h2>Recent Surveys</h2><small>Most recently updated bookings</small></div><button className="workspace-link" onClick={onDirectory}>View All</button></div>{loading ? <Skeleton rows={3}/> : !error && groups.recent.length===0 ? <p className="workspace-empty">No recent surveys available.</p> : groups.recent.map(row=><button className="workspace-recent" key={row.bookingId} onClick={()=>onOpen(row.bookingId)}><span><strong>{row.details.referenceId}</strong><small>{row.details.customerName}</small></span><small>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString('en-PK',{day:'numeric',month:'short'}) : 'Date unavailable'}</small><span className={`workspace-status ${row.details.journeyStatus==='cancelled' ? 'cancelled' : row.details.statusKey==='survey_scheduled' ? 'scheduled' : row.details.journeyStatus==='on_hold' ? 'hold' : ['survey_completed','quotation_shared','installation_completed'].includes(row.details.statusKey ?? '') ? 'completed' : ''}`}>{row.directoryStatus}</span><ChevronRight size={15}/></button>)}</section>
      <section className="workspace-card"><div className="workspace-section-head"><h2><ClipboardList size={18}/> Survey Directory</h2><button className="workspace-link" onClick={onDirectory}>View All Surveys</button></div><p>Browse and manage all survey bookings.</p><div className="workspace-total"><strong>{unavailable ? '—' : rows.length}</strong><span>Total Surveys</span></div><div className="workspace-breakdown">{[['Scheduled',groups.scheduled.length],['Completed',groups.completed.length],['Awaiting Quote',groups.awaiting.length],['Other',rows.length-groups.scheduled.length-groups.completed.length]].map(([label,count])=><div key={label}><strong>{unavailable ? '—' : count}</strong><small>{label}</small></div>)}</div><small className="workspace-count-note">Awaiting Quote is included in Completed.</small></section></aside>
    </div>
  </>;
}
