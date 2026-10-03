import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Save, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Notice } from '../../components/ui/Notice';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatPkr } from '../../lib/format';
import { loadBosCatalog, type BosCatalogData } from '../../services/bosCatalogService';
import { loadStoredEstimate, saveBosEstimate } from '../../services/bosEstimateService';
import type { Engineer, SurveyDetails } from '../../types/domain';
import { Panel } from '../../components/ui/Panel';
import { BosPresetWorksheet } from './BosPresetWorksheet';
import { BosAttention } from './BosAttention';
import { bosAttentionItems, incompleteSiteLines, type AttentionItem } from './attention';
import { usePresetEstimate } from './usePresetEstimate';
import { activeSiteLines, invalidSiteQuantity, invalidSynchronizedGroups } from './presets';
import { loadBosPresets, type BosPresetData } from '../../services/bosPresetService';
import './worksheet.css';
import './preset.css';
import { UpdatedQuotation } from './UpdatedQuotation';
import { finalizeBosQuotation, loadPendingFinalization, loadQuotationVersions, persistFinalization, previewBosQuotation,
  type BosPreview, type PendingFinalization, type QuotationVersion } from '../../services/bosFinalizationService';
import { prepareUpdatedQuotationPdf } from '../../services/quotationPdfService';

type Props = {
  survey: SurveyDetails;
  engineer: Engineer;
  onJourneyChanged?: () => Promise<void>;
};

type SaveState = { tone: 'success' | 'error'; message: string } | null;

export function BosEstimator({ survey, engineer, onJourneyChanged }: Props) {
  const [open, setOpen] = useState(true);
  const [catalog, setCatalog] = useState<BosCatalogData | null>(null);
  const [presets,setPresets]=useState<BosPresetData | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [saving, setSaving] = useState<'draft' | 'final' | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [validationError, setValidationError] = useState('');
  const [preview, setPreview] = useState<BosPreview | null>(null);
  const [pending, setPending] = useState<PendingFinalization | null>(null);
  const [versions, setVersions] = useState<QuotationVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<QuotationVersion | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [finalizedLines, setFinalizedLines] = useState('');
  const finalizing = useRef(false);
  const engineerId = engineer.authUserId ?? engineer.id;
  const surveyCompleted=['survey_completed','quotation_shared','installation_completed'].includes(survey.currentMilestone ?? survey.statusKey ?? '');

  const worksheet=usePresetEstimate(catalog,presets);
  const {lines,total,selectedPresetIds,restore}=worksheet;

  useEffect(() => { setPreview(null); }, [lines]);
  useEffect(() => {
    let active = true;
    try { setPending(loadPendingFinalization(engineerId,survey.bookingId)); }
    catch(error) { setValidationError(error instanceof Error ? error.message : 'Unable to restore pending finalization.'); }
    void loadQuotationVersions(survey.bookingId).then(rows => {
      if(active) { setVersions(rows); setSelectedVersion(rows[0] ?? null); }
    }).catch(error => { if(active) setHistoryError(error instanceof Error ? error.message : 'Quotation history is unavailable.'); });
    return () => { active=false; };
  },[engineerId,survey.bookingId]);

  async function confirmFinalization() {
    if (finalizing.current || (!preview && !pending)) return;
    finalizing.current=true; setSaving('final'); setValidationError('');
    try {
      const request = pending ?? persistFinalization(engineerId,survey.bookingId,preview!);
      setPending(request);
      const result = await finalizeBosQuotation(engineerId,request);
      setPending(null); setPreview(null); setFinalizedLines(JSON.stringify(lines));
      setSelectedVersion(result.quotation);
      setVersions(current => [result.quotation,...current.filter(q=>q.id!==result.quotation.id)]);
      setHistoryError('');
      void loadQuotationVersions(survey.bookingId).then(setVersions).catch(() => setHistoryError('The quotation was saved. Reload to refresh full history.'));
      try {
        await prepareUpdatedQuotationPdf(result.quotation);
        setSaveState({ tone:'success', message:`BOS Finalized Â· Quotation v${result.quotation.version} Â· ${formatPkr(result.quotation.snapshot.system.finalTotal ?? 0)} Â· Shared with Customer` });
        try { await onJourneyChanged?.(); }
        catch { setHistoryError('Quotation Shared was saved. Reload to refresh Project Journey.'); }
      } catch(error) {
        setSaveState({ tone:'error', message:error instanceof Error ? error.message : 'Quotation finalized, but PDF publication failed. Retry PDF.' });
      }
    } catch(error) {
      setValidationError(error instanceof Error ? error.message : 'Finalization could not be confirmed. Retry the saved request.');
      try { const saved=loadPendingFinalization(engineerId,survey.bookingId); setPending(saved); if(!saved) setPreview(null); } catch { /* Preserve the pending request on storage failure. */ }
    } finally { finalizing.current=false; setSaving(null); }
  }

  useEffect(() => {
    let active = true;
    setCatalogError('');

    loadBosCatalog()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(
          error instanceof Error ? error.message : 'The BOS catalog could not be loaded.',
        );
      });
    void loadBosPresets().then(data=>{if(active)setPresets(data);}).catch(error=>{if(active){setPresets({presets:[],items:[]});setCatalogError(error instanceof Error ? error.message : 'Preset catalog could not be loaded.');}});

    return () => {
      active = false;
    };
  }, []);

  // Restore a prototype draft previously saved on this device for this survey.
  useEffect(() => {
    const stored = loadStoredEstimate(survey.referenceId);
    setFinalizedLines('');
    if (stored && (stored.lines.length > 0 || stored.selectedPresetIds?.length)) {
      restore(stored.lines,stored.selectedPresetIds ?? []);
      setSaveState({
        tone: 'success',
        message: `Draft restored for ${survey.referenceId}, saved ${new Date(stored.savedAt).toLocaleString('en-PK')}.`,
      });
    } else {
      restore([],[]);
      setSaveState(null);
    }
  }, [survey.referenceId, restore]);

  const attentionItems = useMemo(() => catalog ? bosAttentionItems(lines,catalog,presets) : [],[lines,catalog,presets]);
  const [attentionTarget,setAttentionTarget] = useState<AttentionItem | null>(null);
  const incompleteCount = useMemo(
    () => incompleteSiteLines(lines).length,
    [lines],
  );

  async function handleSave(status: 'draft' | 'finalized') {
    setValidationError('');
    setSaveState(null);

    if (status==='draft' ? lines.length===0 && selectedPresetIds.length===0 : activeSiteLines(lines).length===0) {
      setValidationError(status==='draft' ? 'Add a category or BOS item before saving.' : 'Enter at least one positive site quantity or length before finalizing.');
      return;
    }
    if(status==='finalized' && invalidSiteQuantity(lines))return;
    if(status==='finalized' && presets && invalidSynchronizedGroups(lines,presets))return;
    if (status === 'finalized' && incompleteCount > 0) {
      return;
    }

    if (status === 'finalized') {
      if (pending) { setValidationError('Resolve the saved finalization request before starting another.'); return; }
      setSaving('final');
      try { setPreview(await previewBosQuotation(survey.bookingId,lines)); }
      catch(error) { setValidationError(error instanceof Error ? error.message : 'The quotation preview could not be prepared.'); }
      finally { setSaving(null); }
      return;
    }

    setSaving(status === 'draft' ? 'draft' : 'final');
    try {
      const saved = await saveBosEstimate({
        schemaVersion: 3,
        selectedPresetIds,
        surveyReferenceId: survey.referenceId,
        preparedByEngineerId: engineer.id,
        status,
        lines,
        totalAmount: total,
      });

      const savedTime = new Date(saved.savedAt).toLocaleTimeString('en-PK');
      setSaveState({
        tone: 'success',
        message: `Draft saved on this device at ${savedTime}.`,
      });
    } catch (error) {
      setSaveState({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The estimate could not be saved.',
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Panel
      className="bos-panel"
      step="02"
      title="Balance of System"
      description="Add site categories, edit workbook defaults, and enter the actual materials used."
      collapsible
      open={open}
      onToggle={() => setOpen((value) => !value)}
      actions={
        <>
          <span className="panel-total-preview">{formatPkr(total)}</span>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </>
      }
    >
      {catalogError ? <Notice tone="error">{catalogError}</Notice> : null}

      {!catalog && !catalogError ? <Skeleton rows={4} /> : null}

      {catalog ? (
        <>
          <fieldset className="bos-editor-fields" disabled={saving !== null || pending !== null || preview !== null}>
          {presets ? <BosPresetWorksheet catalog={catalog} presets={presets} lines={lines} selectedPresetIds={selectedPresetIds} onLoad={worksheet.loadCategory} onReset={worksheet.resetCategory} onRemoveCategory={worksheet.removeCategory} onAdd={worksheet.addItem} onUpdate={worksheet.updateLine} onRemoveLine={worksheet.removeLine} onGroupLength={worksheet.updateGroupLength} onGroupBrand={worksheet.updateGroupBrand} onLegacySpecification={worksheet.changeLegacySpecification} attentionTarget={attentionTarget} onAttentionNavigated={()=>setAttentionTarget(null)}/> : <Skeleton rows={2}/>}
          {worksheet.notice && <Notice tone="success">{worksheet.notice}</Notice>}

          </fieldset>
          <div className="total-card">
            <div>
              <span>Estimated BOS Total</span>
              <small>Derived from every selected line. Taxes and labour are not included.</small>
            </div>
            <strong>{formatPkr(total)}</strong>
          </div>

          <BosAttention items={attentionItems} onGo={item=>setAttentionTarget({...item})}/>
          {validationError ? <Notice tone="error">{validationError}</Notice> : null}
          {saveState ? <Notice tone={saveState.tone}>{saveState.message}</Notice> : null}
          {historyError ? <Notice tone="error">Quotation history: {historyError}</Notice> : null}

          {preview ? <div className="bos-finalization-preview">
            <h3>Review Updated Quotation</h3>
            <p>{preview.quotation.customer.name} Â· {preview.quotation.reference}</p>
            <p>BOS Total <strong>{formatPkr(preview.bosTotal)}</strong></p>
            <p>Updated Quotation Total <strong>{formatPkr(preview.quotation.system.finalTotal ?? 0)}</strong></p>
            <p>Quotation v{preview.quotation.version} will await customer review.</p>
            {preview.hasProvisionalRates ? <Notice tone="error">One or more BOS rates are provisional. Verify the rates before finalizing the quotation.</Notice> : null}
            <Button disabled={saving !== null || preview.hasProvisionalRates} onClick={()=>void confirmFinalization()}>Finalize BOS &amp; Create Updated Quotation</Button>
            <Button variant="secondary" disabled={saving !== null} onClick={()=>setPreview(null)}>Cancel</Button>
          </div> : null}
          {pending ? <Notice tone="error">A finalization request is pending confirmation. Retry uses the same request and cannot create a duplicate version.
            <Button disabled={saving !== null} onClick={()=>void confirmFinalization()}>Retry Finalization</Button>
          </Notice> : null}

          <div className="bos-actions">
            <Button variant="secondary" disabled={saving !== null || pending !== null || preview !== null} onClick={()=>{if(window.confirm('Clear this survey draft on this device? Finalized quotations are preserved.')){localStorage.removeItem(`kaamasaan-bos-draft:${survey.referenceId}`);restore([],[]);setSaveState(null);setValidationError('');}}}>Clear Draft</Button>
            <Button
              variant="secondary"
              icon={<Save size={15} />}
              disabled={saving !== null || pending !== null}
              onClick={() => handleSave('draft')}
            >
              {saving === 'draft' ? 'Savingâ€¦' : 'Save Draft'}
            </Button>
            <Button
              icon={<ShieldCheck size={15} />}
              disabled={!surveyCompleted || saving !== null || pending !== null || preview !== null || finalizedLines === JSON.stringify(lines)}
              onClick={() => handleSave('finalized')}
            >
              {saving === 'final' ? 'Finalizingâ€¦' : 'Finalize BOS'}
            </Button>
          </div>
          {selectedVersion ? <div className="quotation-history">
            <label htmlFor="quotation-version">Quotation history</label>
            <select id="quotation-version" value={selectedVersion.id} onChange={event=>setSelectedVersion(versions.find(q=>q.id===event.target.value) ?? null)}>
              {versions.map(q=><option key={q.id} value={q.id}>Quotation v{q.version} Â· {q.status.replace(/_/g,' ')}</option>)}
            </select>
            <details><summary>View Updated Quotation</summary><UpdatedQuotation key={selectedVersion.id} version={selectedVersion} onPublished={onJourneyChanged}/></details>
          </div> : null}
        </>
      ) : null}
    </Panel>
  );
}

