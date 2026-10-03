/**
 * Survey booking access.
 *
 * Real source (verified against the live KaamAsaan project, not assumed):
 *
 *   table            public.survey_bookings          (pk: id uuid)
 *   customer fields  full_name, phone, city, address are denormalized ON the
 *                    booking row itself — there is no join to public.profiles
 *                    for the survey details the mobile app shows.
 *   reference        The live database has NO reference_code column. The
 *                    customer-facing KA-XXXXXXXX reference shown in "My Solar
 *                    Journey" is derived in the client from the booking UUID:
 *                      KA- + first 8 hex characters of id, uppercased
 *                    (see kaamasaan-mobile/src/services/journey.api.ts →
 *                    formatSurveyReference, which falls back to the UUID when
 *                    reference_code is absent, and admin-dashboard's
 *                    `booking.reference_code || booking.id`).
 *                    backend-development/migrations/001_add_survey_booking_
 *                    reference_code.sql would add the column, but it is not
 *                    applied to the live project. So the lookup resolves the
 *                    reference as a UUID prefix range on the primary key, and
 *                    still tries reference_code where that column does exist.
 *   system           selected_package_snapshot (jsonb) on the booking, with
 *                    system_design_id → public.system_designs as the fallback.
 *
 * RLS: survey_bookings_own_read allows `user_id = auth.uid() OR is_admin()`;
 * the separate engineer SELECT policy allows active engineers to read bookings.
 * Anon has every privilege revoked. A Supabase session is therefore
 * mandatory in real mode — see the report in README/AUTH notes.
 */

import { isMockMode } from '../lib/env';
import { getSupabaseClient } from '../lib/supabase';
import { mockSurveyRecords } from '../features/surveys/mockSurvey';
import type {
  SurveyDetails,
  SurveyRecord,
  SystemComponent,
  SystemSummary,
} from '../types/domain';

/* ------------------------------------------------------------------ errors */

export type SurveyErrorKind =
  | 'not_found'
  | 'unauthorized'
  | 'unavailable'
  | 'configuration'
  | 'invalid_reference'
  | 'ambiguous_reference';

export class SurveyLookupError extends Error {
  kind: SurveyErrorKind;
  /** Developer-facing detail; never rendered to the engineer. */
  diagnostic?: string;

  constructor(kind: SurveyErrorKind, message: string, diagnostic?: string) {
    super(message);
    this.name = 'SurveyLookupError';
    this.kind = kind;
    this.diagnostic = diagnostic;
  }
}

const NOT_FOUND_MESSAGE = 'No survey booking was found for this reference ID.';
/**
 * Real-mode wording. RLS hides inaccessible bookings in exactly the same way
 * as bookings that do not exist, so lookup never confirms a hidden reference.
 */
const NO_ACCESSIBLE_BOOKING_MESSAGE =
  'No accessible survey booking was found for this reference ID.';
const NO_ACCESSIBLE_BOOKING_ID_MESSAGE =
  'The open survey booking is no longer accessible. Refresh the survey directory and try again.';
const UNAVAILABLE_MESSAGE = 'Unable to load the survey right now. Please try again.';
const UNAUTHORIZED_MESSAGE =
  'This account is not allowed to open survey bookings. Engineer access has not been granted on the KaamAsaan database yet.';
const SIGNED_OUT_MESSAGE =
  'Sign in with a KaamAsaan account that is allowed to read survey bookings, then try again.';
const CONFIGURATION_MESSAGE =
  'Survey lookup is misconfigured for this environment. Please report this to the KaamAsaan team.';
/**
 * A KA-XXXXXXXX reference is only the first 8 hex characters of the booking
 * UUID (32 random bits), so it is not mathematically unique. When two
 * accessible bookings share a prefix the portal refuses to guess — picking
 * either one could put the wrong customer's site in front of the engineer.
 */
const AMBIGUOUS_REFERENCE_MESSAGE =
  'This reference matches more than one survey. Please contact the KaamAsaan team.';

/* -------------------------------------------------------- reference parsing */

/** `KA-` + the first 8 hex characters of the booking UUID. */
const KA_REFERENCE_PATTERN = /^KA-([0-9A-F]{8})$/;

/**
 * Accepts " ka-cd2454d8 ", "KA-CD2454D8" and a bare "cd2454d8" and returns the
 * canonical uppercase reference. Nothing here assumes the retired mock
 * `KA-SRV-2026-xxxxx` shape — arbitrary references are passed through
 * uppercased so a stored reference_code can still match.
 */
export function normalizeReference(referenceId: string): string {
  const compact = referenceId.trim().replace(/\s+/g, '').toUpperCase();
  if (/^[0-9A-F]{8}$/.test(compact)) return `KA-${compact}`;
  return compact;
}

/** The UUID range a KA-XXXXXXXX reference addresses, or null. */
function uuidRangeForReference(reference: string): { from: string; to: string } | null {
  const match = KA_REFERENCE_PATTERN.exec(reference);
  if (!match) return null;
  const prefix = match[1].toLowerCase();
  return {
    from: `${prefix}-0000-0000-0000-000000000000`,
    to: `${prefix}-ffff-ffff-ffff-ffffffffffff`,
  };
}

/* ------------------------------------------------------------- row mapping */

type SupabaseJson = Record<string, unknown>;

type SurveyBookingRow = {
  updated_at?: string | null;
  id: string;
  full_name?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  booking_type?: string | null;
  service_type?: string | null;
  preferred_date?: string | null;
  preferred_time_slot?: string | null;
  status?: string | null;
  current_milestone?: string | null;
  journey_status?: string | null;
  confirmed_survey_at?: string | null;
  planned_installation_at?: string | null;
  assigned_team_name?: string | null;
  assigned_team_contact?: string | null;
  progress_note?: string | null;
  selected_package_snapshot?: SupabaseJson | null;
  system_design_id?: string | null;
  reference_code?: string | null;
  created_at?: string | null;
};

/**
 * Milestone labels copied from the live journey contract
 * (kaamasaan-mobile/src/contracts/solarJourneyMilestones.ts). Unknown keys fall
 * back to a title-cased version of the raw value rather than being hidden.
 */
const MILESTONE_LABELS: Record<string, string> = {
  request_received: 'Request Received',
  survey_scheduled: 'Survey Scheduled',
  survey_confirmed: 'Survey Confirmed',
  team_assigned: 'Team Assigned',
  survey_in_progress: 'Survey In Progress',
  survey_completed: 'Survey Completed',
  quotation_shared: 'Quotation Shared',
  installation_completed: 'Installation Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function referenceForRow(row: SurveyBookingRow): string {
  const stored = text(row.reference_code);
  if (stored) return stored.toUpperCase();
  return `KA-${row.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function mapBookingRow(row: SurveyBookingRow): SurveyDetails {
  const milestone = text(row.current_milestone);
  const legacyStatus = text(row.status);
  const statusKey = milestone ?? legacyStatus;
  const bookingTypeKey = text(row.booking_type);
  const serviceTypeKey = text(row.service_type);

  return {
    referenceId: referenceForRow(row),
    bookingId: row.id,
    customerName: text(row.full_name) ?? 'Not provided',
    phone: text(row.phone) ?? 'Not provided',
    city: text(row.city) ?? 'Not provided',
    address: text(row.address) ?? 'Not provided',
    bookingType: bookingTypeKey ? titleCase(bookingTypeKey) : 'Not specified',
    serviceType: serviceTypeKey ? titleCase(serviceTypeKey) : 'Not specified',
    preferredDate: text(row.preferred_date),
    timeSlot: text(row.preferred_time_slot),
    status: statusKey ? (MILESTONE_LABELS[statusKey] ?? titleCase(statusKey)) : 'Not set',
    statusKey,
    currentMilestone: milestone,
    journeyStatus: text(row.journey_status),
    confirmedSurveyDate: text(row.confirmed_survey_at),
    plannedInstallationDate: text(row.planned_installation_at),
    requestedAt: text(row.created_at),
    assignedTeamName: text(row.assigned_team_name),
    assignedTeamContact: text(row.assigned_team_contact),
    progressNote: text(row.progress_note),
  };
}

/* ----------------------------------------------------- system summary mapping */

function asObject(value: unknown): SupabaseJson | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SupabaseJson)
    : null;
}

function componentFrom(
  source: SupabaseJson | null,
  detail: (item: SupabaseJson) => string | null,
): SystemComponent | null {
  if (!source) return null;
  const brand = text(source.brand);
  const model = text(source.model);
  const name = [brand, model].filter(Boolean).join(' ');
  if (!name) return null;
  return { name, detail: detail(source) ?? '—' };
}

/**
 * Maps `survey_bookings.selected_package_snapshot`. The snapshot shape is the
 * one the mobile app writes (see kaamasaan-mobile/src/types/survey.types.ts →
 * SelectedPackageSnapshot). Missing pieces stay null instead of being invented.
 */
function mapPackageSnapshot(snapshot: SupabaseJson | null): SystemSummary | null {
  if (!snapshot) return null;

  const panelSource = asObject(snapshot.panel);
  const inverterSource = asObject(snapshot.inverter);
  const batterySource = asObject(snapshot.battery);
  const structureSource = asObject(snapshot.structure);

  const panels = componentFrom(panelSource, (item) => {
    const wattage = numeric(item.wattage);
    const quantity = numeric(item.quantity);
    if (wattage && quantity) return `${wattage}W × ${quantity}`;
    if (quantity) return `${quantity} panels`;
    return null;
  });

  const inverter = componentFrom(inverterSource, (item) => {
    const capacity = numeric(item.capacityKw);
    const quantity = numeric(item.quantity) ?? 1;
    if (capacity) return `${capacity} kW × ${quantity}`;
    return `${quantity} unit${quantity === 1 ? '' : 's'}`;
  });

  const battery = componentFrom(batterySource, (item) => {
    const total = numeric(item.totalCapacityKwh);
    const unit = numeric(item.unitCapacityKwh);
    const quantity = numeric(item.quantity) ?? 1;
    if (total) return `${total} kWh total`;
    if (unit) return `${unit} kWh × ${quantity}`;
    return `${quantity} unit${quantity === 1 ? '' : 's'}`;
  });

  const structureType = structureSource ? text(structureSource.structureType) : null;
  const systemSizeKw = numeric(snapshot.systemSizeKw);

  const hasAnything =
    systemSizeKw !== null || panels !== null || inverter !== null || battery !== null || structureType !== null;
  if (!hasAnything) return null;

  return {
    systemSizeKw,
    panels,
    inverter,
    battery,
    structureType: structureType ? titleCase(structureType) + ' Structure' : null,
    source: 'package_snapshot',
  };
}

type ProductRow = {
  name?: string | null;
  model?: string | null;
  brands?: { name?: string | null } | null;
};

type SystemDesignRow = {
  recommended_solar_kw?: number | string | null;
  panel?: ProductRow | null;
  inverter?: ProductRow | null;
  battery?: ProductRow | null;
  design_data?: SupabaseJson | null;
};

function productComponent(product: ProductRow | null | undefined): SystemComponent | null {
  if (!product) return null;
  const brand = text(product.brands?.name);
  const name = text(product.name) ?? text(product.model);
  if (!name) return null;
  return { name: [brand, name].filter(Boolean).join(' '), detail: text(product.model) ?? '—' };
}

function mapSystemDesign(row: SystemDesignRow | null): SystemSummary | null {
  if (!row) return null;

  const panels = productComponent(row.panel);
  const inverter = productComponent(row.inverter);
  const battery = productComponent(row.battery);
  const systemSizeKw = numeric(row.recommended_solar_kw);
  const structureType = row.design_data ? text(row.design_data.structureType) : null;

  if (systemSizeKw === null && !panels && !inverter && !battery) return null;

  return {
    systemSizeKw,
    panels,
    inverter,
    battery,
    structureType: structureType ? titleCase(structureType) + ' Structure' : null,
    source: 'system_design',
  };
}

/* ---------------------------------------------------------- error handling */

type PostgrestLikeError = { code?: string; message?: string; details?: string | null };

function isPostgrestError(error: unknown): error is PostgrestLikeError {
  return typeof error === 'object' && error !== null && ('code' in error || 'message' in error);
}

/** Maps a Supabase/PostgREST failure onto a user-safe error without hiding RLS. */
function toLookupError(error: unknown, context: string): SurveyLookupError {
  if (isPostgrestError(error)) {
    const code = error.code ?? '';
    const diagnostic = `${context}: [${code}] ${error.message ?? 'unknown error'}`;

    // 42501 permission denied, PGRST301 invalid/expired JWT, 42P17 recursive policy.
    if (code === '42501' || code === 'PGRST301' || code === '42P17') {
      return new SurveyLookupError('unauthorized', UNAUTHORIZED_MESSAGE, diagnostic);
    }
    // 42703 undefined column, 42P01 undefined table, PGRST20x query shape issues.
    if (code === '42703' || code === '42P01' || code.startsWith('PGRST1') || code.startsWith('PGRST2')) {
      return new SurveyLookupError('configuration', CONFIGURATION_MESSAGE, diagnostic);
    }
    return new SurveyLookupError('unavailable', UNAVAILABLE_MESSAGE, diagnostic);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new SurveyLookupError('unavailable', UNAVAILABLE_MESSAGE, `${context}: ${message}`);
}

function logDiagnostic(error: SurveyLookupError): void {
  if (import.meta.env.DEV && error.diagnostic) {
    console.warn(`[surveyService] ${error.kind} — ${error.diagnostic}`);
  }
}

/* ------------------------------------------------------------- mock branch */

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMockSurvey(reference: string): Promise<SurveyRecord> {
  await delay(300);
  const match = mockSurveyRecords.find((record) => record.details.referenceId === reference);
  if (!match) throw new SurveyLookupError('not_found', NOT_FOUND_MESSAGE);
  return match;
}

/* ------------------------------------------------------------- real branch */

const BOOKING_COLUMNS = '*';

/**
 * Decides what a UUID-prefix match set means. Exported so the rule can be
 * exercised directly without a database:
 *
 *   0 rows  -> null, the caller falls through to the not-found path
 *   1 row   -> that booking
 *   2+ rows -> `ambiguous_reference`; no row is chosen and nothing about the
 *              second booking reaches the UI
 *
 * Only rows RLS already allowed through can appear here, so an ambiguity is
 * always between bookings this engineer may see.
 */
export function resolveSingleBookingRow(
  rows: SurveyBookingRow[],
  reference: string,
): SurveyBookingRow | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  throw new SurveyLookupError(
    'ambiguous_reference',
    AMBIGUOUS_REFERENCE_MESSAGE,
    `${reference} matched ${rows.length} accessible bookings: ${rows.map((row) => row.id).join(', ')}`,
  );
}

/**
 * Supabase (PostgREST) select on `public.survey_bookings`. `*` mirrors what the
 * mobile app sends, so a column that exists in one environment and not another
 * can never break the whole query.
 */
async function fetchBookingRow(reference: string): Promise<SurveyBookingRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new SurveyLookupError(
      'configuration',
      CONFIGURATION_MESSAGE,
      'Supabase client unavailable: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.',
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new SurveyLookupError(
      'unauthorized',
      SIGNED_OUT_MESSAGE,
      'No Supabase session. public.survey_bookings has every privilege revoked for anon.',
    );
  }

  // 1. Primary path — reference resolved as a UUID prefix on the primary key.
  //    Two rows are fetched, never one: `limit(1)` would silently return an
  //    arbitrary booking if two accessible bookings shared the prefix.
  const range = uuidRangeForReference(reference);
  if (range) {
    const { data, error } = await supabase
      .from('survey_bookings')
      .select(BOOKING_COLUMNS)
      .gte('id', range.from)
      .lte('id', range.to)
      .limit(2);

    if (error) throw toLookupError(error, 'survey_bookings by uuid prefix');

    const row = resolveSingleBookingRow((data ?? []) as SurveyBookingRow[], reference);
    if (row) return row;
  }

  // 2. Secondary path — environments where the reference_code column exists.
  const { data, error } = await supabase
    .from('survey_bookings')
    .select(BOOKING_COLUMNS)
    .eq('reference_code', reference)
    .limit(1)
    .maybeSingle();

  if (error) {
    // The live project has no reference_code column; that is expected, not a failure.
    if (isPostgrestError(error) && error.code === '42703') return null;
    throw toLookupError(error, 'survey_bookings by reference_code');
  }

  return (data as SurveyBookingRow | null) ?? null;
}

/**
 * Fallback system source: the customer's saved design linked from the booking.
 * Never fatal — a booking with an unreadable design still loads as State B.
 */
async function fetchSystemDesign(designId: string): Promise<SystemSummary | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('system_designs')
    .select(
      'recommended_solar_kw, design_data, panel:products!system_designs_selected_panel_id_fkey(name,model,brands(name)), inverter:products!system_designs_selected_inverter_id_fkey(name,model,brands(name)), battery:products!system_designs_selected_battery_id_fkey(name,model,brands(name))',
    )
    .eq('id', designId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logDiagnostic(toLookupError(error, 'system_designs fallback'));
    return null;
  }

  return mapSystemDesign(data as SystemDesignRow | null);
}

/* --------------------------------------------------------------- public API */

export async function getSurveyByReference(referenceId: string): Promise<SurveyRecord> {
  const reference = normalizeReference(referenceId);

  if (!reference) {
    throw new SurveyLookupError('invalid_reference', 'Enter a survey reference ID.');
  }

  if (isMockMode) return getMockSurvey(reference);

  let row: SurveyBookingRow | null;
  try {
    row = await fetchBookingRow(reference);
  } catch (error) {
    const lookupError =
      error instanceof SurveyLookupError ? error : toLookupError(error, 'survey lookup');
    logDiagnostic(lookupError);
    throw lookupError;
  }

  // RLS returns nothing for an inaccessible booking, which is indistinguishable
  // from a reference that does not exist — by design.
  if (!row) throw new SurveyLookupError('not_found', NO_ACCESSIBLE_BOOKING_MESSAGE);

  return buildRecord(row);
}

/** Refreshes an already-resolved booking by its canonical primary key.
 * Human reference parsing stays exclusively in getSurveyByReference(). */
export async function getSurveyById(bookingId: string): Promise<SurveyRecord> {
  const id=bookingId.trim().toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)){
    throw new SurveyLookupError('invalid_reference',NO_ACCESSIBLE_BOOKING_ID_MESSAGE,'Exact booking refresh received a non-UUID primary key.');
  }
  if(isMockMode){
    const match=mockSurveyRecords.find(record=>record.details.bookingId.toLowerCase()===id);
    if(!match)throw new SurveyLookupError('not_found',NO_ACCESSIBLE_BOOKING_ID_MESSAGE);
    return match;
  }
  const supabase=await requireSurveyClient();
  const {data,error}=await supabase.from('survey_bookings').select(BOOKING_COLUMNS).eq('id',id).limit(1).maybeSingle();
  if(error){
    const lookupError=toLookupError(error,'survey_bookings by exact id');
    logDiagnostic(lookupError);
    throw lookupError;
  }
  if(!data)throw new SurveyLookupError('not_found',NO_ACCESSIBLE_BOOKING_ID_MESSAGE,`Exact booking ${id} was hidden by RLS or no longer exists.`);
  return buildRecord(data as SurveyBookingRow);
}

async function buildRecord(row: SurveyBookingRow): Promise<SurveyRecord> {
  const details = mapBookingRow(row);

  let system = mapPackageSnapshot(asObject(row.selected_package_snapshot));
  if (!system && row.system_design_id) {
    system = await fetchSystemDesign(row.system_design_id);
  }

  return { details, system };
}

/* -------------------------------------------------------- survey directory */

export type AvailableSurvey = {
  bookingId: string;
  details: SurveyDetails;
  /** Directory-only lifecycle label; Survey Details mapping remains unchanged. */
  directoryStatus: string;
};

export type DashboardSurvey = AvailableSurvey & { updatedAt: string | null };

/** Shared lightweight RLS-filtered metadata. No package snapshots or system queries. */
export async function getSurveyDashboard(): Promise<DashboardSurvey[]> {
  if (isMockMode) return mockSurveyRecords.map(({ details }) => ({
    bookingId: details.bookingId, details, directoryStatus: details.status, updatedAt: details.requestedAt,
  }));
  const client = await requireSurveyClient();
  const rows: SurveyBookingRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('survey_bookings')
      .select('id,full_name,phone,city,address,booking_type,service_type,preferred_date,preferred_time_slot,confirmed_survey_at,current_milestone,status,journey_status,created_at,updated_at')
      .order('id').range(offset, offset + 499);
    if (error) throw toLookupError(error, 'survey dashboard');
    rows.push(...(data ?? []) as SurveyBookingRow[]);
    if ((data?.length ?? 0) < 500) break;
  }
  return rows.map(row => ({ bookingId: row.id, details: mapBookingRow(row), updatedAt: row.updated_at ?? row.created_at ?? null,
    directoryStatus: row.journey_status === 'cancelled' ? 'Cancelled' : row.journey_status === 'on_hold' ? 'On Hold' : mapBookingRow(row).status,
  }));
}

export const SURVEY_DIRECTORY_PAGE_SIZE = 20;

export const SURVEY_STATUS_OPTIONS = [
  { value: 'request_received', label: 'Request Received' },
  { value: 'survey_scheduled', label: 'Survey Scheduled' },
  { value: 'survey_completed', label: 'Survey Completed' },
  { value: 'quotation_shared', label: 'Quotation Shared' },
  { value: 'installation_completed', label: 'Installation Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export type SurveyDirectoryPage = {
  surveys: AvailableSurvey[];
  count: number;
};

type DirectoryQuery = {
  page: number;
  search: string;
  status: string;
};

async function requireSurveyClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new SurveyLookupError(
      'configuration',
      CONFIGURATION_MESSAGE,
      'Supabase client unavailable while loading surveys.',
    );
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new SurveyLookupError('unauthorized', SIGNED_OUT_MESSAGE, 'No Supabase session.');
  }
  return supabase;
}

/** Exact RLS-filtered count; Home does not download any survey rows. */
export async function getSurveyDirectoryCount(): Promise<number> {
  if (isMockMode) {
    await delay(200);
    return mockSurveyRecords.length;
  }

  const supabase = await requireSurveyClient();
  const { count, error } = await supabase
    .from('survey_bookings')
    .select('id', { count: 'exact', head: true });
  if (error) {
    const lookupError = toLookupError(error, 'survey_bookings count');
    logDiagnostic(lookupError);
    throw lookupError;
  }
  if (count === null) throw new SurveyLookupError('unavailable', UNAVAILABLE_MESSAGE);
  return count;
}

/**
 * One RLS-filtered, server-paged directory page. Complete KA-XXXXXXXX
 * references resolve against the UUID prefix without touching the existing
 * open-survey resolver. Other input searches customer name and phone.
 */
export async function getSurveyDirectoryPage({ page, search, status }: DirectoryQuery): Promise<SurveyDirectoryPage> {
  const safePage = Math.max(1, Math.floor(page));
  const term = search.trim();
  const normalizedReference = normalizeReference(term);
  const range = uuidRangeForReference(normalizedReference);

  if (isMockMode) {
    await delay(200);
    const needle = term.toLocaleLowerCase();
    const filtered = mockSurveyRecords
      .filter(({ details }) => !status || details.statusKey === status)
      .filter(({ details }) => !needle || [details.referenceId, details.customerName, details.phone]
        .some((value) => value.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => (b.details.requestedAt ?? '').localeCompare(a.details.requestedAt ?? '')
        || b.details.bookingId.localeCompare(a.details.bookingId));
    const offset = (safePage - 1) * SURVEY_DIRECTORY_PAGE_SIZE;
    return {
      count: filtered.length,
      surveys: filtered.slice(offset, offset + SURVEY_DIRECTORY_PAGE_SIZE)
      .map(({ details }) => ({ bookingId: details.bookingId, details, directoryStatus: details.status })),
    };
  }

  const supabase = await requireSurveyClient();
  let query = supabase
    .from('survey_bookings')
    .select(BOOKING_COLUMNS, { count: 'exact' });
  if (range) {
    query = query.gte('id', range.from).lte('id', range.to);
  } else if (term) {
    // PostgREST's OR syntax has delimiters; keep user input out of its grammar.
    const safeTerm = term.replace(/[^\p{L}\p{N}\s+\-]/gu, '').trim();
    if (safeTerm) {
      query = query.or(`full_name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`);
    } else {
      return { surveys: [], count: 0 };
    }
  }
  if (status === 'on_hold' || status === 'cancelled') {
    query = query.eq('journey_status', status);
  } else if (status) {
    query = query.eq('journey_status', 'active').eq('current_milestone', status);
  }

  const offset = (safePage - 1) * SURVEY_DIRECTORY_PAGE_SIZE;
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + SURVEY_DIRECTORY_PAGE_SIZE - 1);
  if (error) {
    const lookupError = toLookupError(error, 'survey_bookings directory');
    logDiagnostic(lookupError);
    throw lookupError;
  }
  if (count === null) throw new SurveyLookupError('unavailable', UNAVAILABLE_MESSAGE);
  return {
    count,
    surveys: ((data ?? []) as SurveyBookingRow[])
      .map((row) => {
        const details = mapBookingRow(row);
        return {
          bookingId: row.id,
          details,
          directoryStatus: row.journey_status === 'cancelled' ? 'Cancelled'
            : row.journey_status === 'on_hold' ? 'On Hold' : details.status,
        };
      }),
  };
}
