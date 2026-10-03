/** Local-only BOS draft/finalized worksheet storage; no Supabase write yet. */

import type { BosEstimate, BosEstimateStatus, BosLine } from '../types/domain';

const DRAFT_STORAGE_PREFIX = 'kaamasaan-bos-draft:';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storageKey(surveyReferenceId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${surveyReferenceId}`;
}

export async function saveBosEstimate(input: {
  schemaVersion?: number;
  selectedPresetIds?: string[];
  surveyReferenceId: string;
  preparedByEngineerId: string;
  status: BosEstimateStatus;
  lines: BosLine[];
  totalAmount: number;
}): Promise<BosEstimate> {
  const estimate: BosEstimate = { ...input, savedAt: new Date().toISOString() };

  await delay(450);
  window.localStorage.setItem(storageKey(input.surveyReferenceId), JSON.stringify(estimate));
  return estimate;
}

export function loadStoredEstimate(surveyReferenceId: string): BosEstimate | null {
  try {
    const raw = window.localStorage.getItem(storageKey(surveyReferenceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BosEstimate;
    return Array.isArray(parsed?.lines) ? parsed : null;
  } catch {
    return null;
  }
}
