import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,X} from 'lucide-react';
import {Button} from '../../components/ui/Button';
import {Notice} from '../../components/ui/Notice';
import {requireSupabaseClient} from '../../lib/supabase';
import {isMockMode} from '../../lib/env';
import type {Engineer,SurveyDetails} from '../../types/domain';
import './survey-progress.css';

const milestones=[['request_received','Request Received'],['survey_scheduled','Survey Scheduled'],['survey_completed','Survey Completed'],['quotation_shared','Quotation Shared'],['installation_completed','Installation Completed']] as const;
type Action='schedule'|'complete-survey'|'complete-installation';
const pakistanDate=(offsetDays=0)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offsetDays*86_400_000));
const tomorrow=()=>pakistanDate(1);
const today=()=>pakistanDate();
const preferredDate=(value:string | null)=>value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value>=today() ? value : tomorrow();

export function ProjectJourney({details,engineer,onChanged}:{details:SurveyDetails;engineer?:Engineer;onChanged:()=>Promise<void>}){
  const [action,setAction]=useState<Action|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[note,setNote]=useState('');
  const [surveyDate,setSurveyDate]=useState(()=>preferredDate(details.preferredDate)),[surveyTime,setSurveyTime]=useState('11:00');
  const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);
  const position=milestones.findIndex(([key])=>key===details.currentMilestone);
  const active=details.journeyStatus==='active';
  const nextAction=useMemo<Action|null>(()=>!active ? null : details.currentMilestone==='request_received' ? 'schedule' : details.currentMilestone==='survey_scheduled' ? 'complete-survey' : details.currentMilestone==='quotation_shared' ? 'complete-installation' : null,[active,details.currentMilestone]);
  useEffect(()=>{if(action)dialog.current?.showModal();else dialog.current?.close();},[action]);
  useEffect(()=>{if(action && action!==nextAction)setAction(null);},[action,nextAction]);
  function close(){if(inFlight.current)return;setAction(null);setNote('');setError('');}
  function open(next:Action){setError('');setNotice('');setNote('');if(next==='schedule')setSurveyDate(preferredDate(details.preferredDate));setAction(next);}
  async function submit(){
    if(inFlight.current || busy || !action || action!==nextAction)return;
    let rpcName:'engineer_schedule_survey'|'engineer_complete_survey'|'engineer_complete_installation';
    let args:Record<string,string|null>;
    if(action==='schedule'){
      if(!surveyDate || !surveyTime){setError('Choose the confirmed survey date and time.');return;}
      const confirmed=new Date(`${surveyDate}T${surveyTime}:00+05:00`);
      if(!Number.isFinite(confirmed.getTime()) || confirmed.getTime()<=Date.now()){setError('Choose a future survey date and time.');return;}
      rpcName='engineer_schedule_survey';args={p_booking_id:details.bookingId,p_confirmed_survey_at:confirmed.toISOString(),p_note:note.trim() || null};
    }else{
      rpcName=action==='complete-survey' ? 'engineer_complete_survey' : 'engineer_complete_installation';
      args={p_booking_id:details.bookingId,p_note:note.trim() || null};
    }
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      if(isMockMode)throw new Error('Journey updates require a real Engineer session.');
      const {data,error:rpcError}=await requireSupabaseClient().rpc(rpcName,args);
      if(rpcError){
        if(rpcError.code==='PGRST202')throw new Error('This journey action is not deployed yet. Contact your administrator.');
        if(rpcError.code==='42501')throw new Error('Your Engineer session cannot update this project. Refresh or sign in again.');
        throw new Error('The project stage changed before this update was saved. The latest journey has been refreshed.');
      }
      await onChanged();
      setAction(null);setNote('');
      const result=data as {already_scheduled?:boolean;already_completed?:boolean} | null;
      setNotice(result?.already_scheduled ? 'Survey is already scheduled.' : result?.already_completed ? (rpcName==='engineer_complete_installation' ? 'Installation is already marked as completed.' : 'Survey is already marked as completed.') : rpcName==='engineer_schedule_survey' ? 'Survey scheduled.' : rpcName==='engineer_complete_installation' ? 'Installation marked as completed.' : 'Survey marked as completed.');
    }catch(e){
      try{await onChanged();}catch{ /* Keep the original actionable failure message. */ }
      setError(e instanceof Error ? e.message : 'Project Journey could not be updated. Please retry.');
    }finally{inFlight.current=false;setBusy(false);}
  }
  const title=action==='schedule' ? 'Schedule Survey' : action==='complete-installation' ? 'Mark installation as completed?' : 'Mark this site survey as completed?';
  const confirmLabel=action==='schedule' ? 'Confirm Survey Schedule' : action==='complete-installation' ? 'Confirm Installation Completion' : 'Confirm Survey Completion';
  return <section className="panel survey-progress-panel">
    <div className="survey-progress-heading"><div><h3>Project Journey</h3><p>Current Stage: {details.journeyStatus==='on_hold' ? 'On Hold' : details.journeyStatus==='cancelled' ? 'Cancelled' : details.status}</p></div>
      {nextAction==='schedule' ? <Button disabled={busy} onClick={()=>open('schedule')}>Schedule Survey</Button> : nextAction==='complete-survey' ? <Button disabled={busy} onClick={()=>open('complete-survey')}>Mark Survey as Completed</Button> : nextAction==='complete-installation' ? <Button disabled={busy} onClick={()=>open('complete-installation')}>Mark Installation as Completed</Button> : null}</div>
    <div className="survey-progress-overview" aria-label="Project journey">{milestones.map(([key,label],index)=>{
      const achieved=position>=index;
      return <div key={key} className={`survey-progress-overview-step${achieved ? ' achieved' : ''}`} aria-current={index===position ? 'step' : undefined}><span>{achieved ? <Check size={14}/> : '○'}</span><strong>{label}</strong></div>;
    })}</div>
    {details.currentMilestone==='survey_completed' ? <div className="survey-progress-next"><strong>Survey Completed ✓</strong><span>Next: Quotation Shared</span><small>Quotation Shared will update automatically once the finalized quotation is available to the customer.</small></div>
      : details.currentMilestone==='installation_completed' ? <div className="survey-progress-next"><strong>Installation Completed ✓</strong><span>Project journey complete</span></div>
      : details.currentMilestone==='request_received' && active ? <small>Confirm the actual survey date and time to progress this project.</small>
      : details.currentMilestone==='survey_scheduled' && active ? <small>After the physical site visit, mark the survey completed.</small>
      : details.currentMilestone==='quotation_shared' && active ? <small>The finalized quotation is available. Mark installation completed only after the physical installation is finished.</small>
      : <small>No Engineer journey action is available while this project is {details.journeyStatus?.replace('_',' ') ?? 'inactive'}.</small>}
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {error && !action ? <Notice tone="error">{error}</Notice> : null}
    <dialog ref={dialog} className="survey-progress-dialog" aria-labelledby="survey-progress-title" onCancel={event=>{if(inFlight.current)event.preventDefault();else close();}} onClose={()=>{if(!inFlight.current)setAction(null);}}>
      <header><div><h3 id="survey-progress-title">{title}</h3><p>{details.customerName} · {details.referenceId}</p></div><button type="button" aria-label="Close journey action" disabled={busy} onClick={close}><X size={18}/></button></header>
      <div className="survey-progress-body">
        {action==='schedule' ? <><div className="survey-progress-transition"><span>Request Received</span><strong>→</strong><span>Survey Scheduled</span></div><div className="survey-progress-schedule-fields"><label>Survey Date<input type="date" min={today()} max={pakistanDate(366)} value={surveyDate} disabled={busy} onChange={event=>setSurveyDate(event.target.value)}/></label><label>Time<input type="time" value={surveyTime} disabled={busy} onChange={event=>setSurveyTime(event.target.value)}/></label></div>{details.preferredDate || details.timeSlot ? <small className="survey-progress-requested">Customer preference: {[details.preferredDate,details.timeSlot].filter(Boolean).join(' · ')}</small> : null}</>
          : <div className="survey-progress-transition"><span>{action==='complete-installation' ? 'Quotation Shared' : 'Survey Scheduled'}</span><strong>→</strong><span>{action==='complete-installation' ? 'Installation Completed' : 'Survey Completed'}</span></div>}
        {engineer && <div className="survey-progress-actor"><small>Updated by</small><strong>{engineer.fullName}</strong><span>Design Engineer</span></div>}
        <label className="survey-progress-note">Note, optional<textarea aria-label="Journey note" placeholder="Add a customer-safe progress note" maxLength={2000} value={note} disabled={busy} onChange={event=>setNote(event.target.value)}/></label>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div><footer><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button disabled={!action || busy} onClick={()=>void submit()}>{busy ? 'Updating…' : confirmLabel}</Button></footer>
    </dialog>
  </section>;
}
