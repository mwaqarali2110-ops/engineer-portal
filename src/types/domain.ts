/**
 * Shared domain types for the KaamAsaan Engineer Portal.
 *
 * These deliberately mirror the shape we expect from Supabase later, so the
 * services layer can be swapped from mock data to real queries without the UI
 * having to change.
 */

/* ---------------------------------------------------------------- identity */

export type EngineerRole = 'design_engineer' | 'survey_engineer' | 'lead_engineer';

export type Engineer = {
  id: string;
  email: string;
  fullName: string;
  role: EngineerRole;
  /** Supabase auth user id — present once signed in with Supabase Auth. */
  authUserId?: string;
  /** Raw `public.profiles.role` of the signed-in KaamAsaan account. */
  accountRole?: string | null;
  /** `engineer_profiles.employee_code`, when set. */
  employeeCode?: string | null;
};

export type AuthSession = {
  engineer: Engineer;
  issuedAt: string;
};

/* ----------------------------------------------------------------- surveys */

/**
 * Normalized booking, mapped from `public.survey_bookings` by
 * `surveyService`. The UI never sees raw Supabase column names.
 */
export type SurveyDetails = {
  /** Customer-facing reference, e.g. KA-CD2454D8. */
  referenceId: string;
  /** `survey_bookings.id` — the real primary key, used by BOS estimates. */
  bookingId: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  /** Human label, e.g. "Solar Survey". */
  bookingType: string;
  /** `survey_bookings.service_type`, e.g. "Solar Package". */
  serviceType: string;
  /** ISO date/timestamp strings, or null when not scheduled yet. */
  preferredDate: string | null;
  timeSlot: string | null;
  /** Human label, e.g. "Request Received". */
  status: string;
  /** Raw milestone/status key kept for diagnostics and future rules. */
  statusKey: string | null;
  currentMilestone?: string | null;
  journeyStatus?: string | null;
  confirmedSurveyDate: string | null;
  plannedInstallationDate: string | null;
  requestedAt: string | null;
  assignedTeamName?: string | null;
  assignedTeamContact?: string | null;
  progressNote?: string | null;
};

export type SystemComponent = {
  /** e.g. "JA Solar 625W" */
  name: string;
  /** e.g. "20 panels", "1 unit", "16 kWh" */
  detail: string;
};

/** Where a system summary was resolved from, shown to the engineer. */
export type SystemSummarySource = 'package_snapshot' | 'system_design' | 'mock';

export type SystemSummary = {
  systemSizeKw: number | null;
  panels: SystemComponent | null;
  inverter: SystemComponent | null;
  battery: SystemComponent | null;
  structureType: string | null;
  source: SystemSummarySource;
};

/**
 * A loaded survey. `system` is null when the booking exists but no approved or
 * selected system configuration is attached to it yet — not an error.
 */
export type SurveyRecord = {
  details: SurveyDetails;
  system: SystemSummary | null;
};

/* -------------------------------------------------------------- BOS basics */

export type BosCategoryId = 'wires' | 'protection' | 'installation' | 'misc';

export type BosCategory = {
  id: BosCategoryId;
  /** Group label shown in the catalog, e.g. "Wires & Conductors". */
  title: string;
  description: string;
  items: BosCatalogItem[];
};

/** Units a BOS line can be measured in. Extend as the catalogue grows. */
export type BosUnit = 'm' | 'pcs' | 'bag' | 'set' | 'lot' | 'pack';

export type BosItemKind = 'wire' | 'quantity';

export type BosCatalogItem = {
  familyName?: string | null;
  specification?: string | null;
  categoryLabel?: string | null;
  sourceDescription?: string | null;
  sourceKey?: string | null;
  searchAliases?: string[];
  fixedWireMm2?: number | null;
  brandHint?: string | null;
  unitReviewNote?: string | null;
  id: string;
  name: string;
  categoryId: BosCategoryId;
  kind: BosItemKind;
  /** Default unit for a new line created from this catalog item. */
  defaultUnit: BosUnit;
  /** Units the engineer may switch between on the line item. */
  allowedUnits: BosUnit[];
  /** Whether the line exposes a free-text notes field. */
  supportsNotes?: boolean;
  active: boolean;
};

/* ----------------------------------------------------------- wire pricing */

export type WireSize = {
  id: string;
  mm2: number;
  label: string;
  active: boolean;
};

export type WireBrand = {
  id: string;
  name: string;
  active: boolean;
};

/**
 * One resolvable price point.
 *
 * `wireItemId` / `wireSizeId` may be `'*'` to mean "applies to every wire type
 * / every size". That wildcard is what lets the prototype ship a single rate
 * per brand today while allowing a fully specific
 * wireType -> size -> brand -> rate matrix later without any UI change.
 */
export type WireBrandRate = {
  wireItemId: string | '*';
  wireSizeId: string | '*';
  brandId: string;
  ratePerMeter: number;
  active: boolean;
  provisional?: boolean;
};

export type QuantityBosRate = { itemId: string; brandId: string | null; unit: BosUnit; unitPrice: number; provisional: boolean };

/* ------------------------------------------------------------- BOS lines */

type BosLineBase = {
  presetIds?: string[];
  presetDefaultQuantities?: Record<string, number>;
  quantityGroupKey?: string | null;
  quantityGroupPresetId?: string | null;
  specificationPending?: boolean;
  familyName?: string | null;
  specification?: string | null;
  sourceDescription?: string | null;
  sourceKey?: string | null;
  id: string;
  catalogItemId: string;
  name: string;
  categoryId: BosCategoryId;
  notes?: string;
};

export type WireBosLine = BosLineBase & {
  kind: 'wire';
  unit: 'm';
  wireSizeId: string | null;
  brandId: string | null;
  /** Snapshot of the resolved rate at selection time. */
  ratePerMeter: number | null;
  rateProvisional?: boolean;
  lengthMeters: number | null;
};

export type QuantityBosLine = BosLineBase & {
  kind: 'quantity';
  unit: BosUnit;
  quantity: number | null;
  unitPrice: number | null;
  brandId?: string | null;
  rateProvisional?: boolean;
  configuredRate?: boolean;
};

export type BosLine = WireBosLine | QuantityBosLine;

export type BosEstimateStatus = 'draft' | 'finalized';

export type BosEstimate = {
  selectedPresetIds?: string[];
  schemaVersion?: number;
  surveyReferenceId: string;
  preparedByEngineerId: string;
  status: BosEstimateStatus;
  lines: BosLine[];
  /** Derived total, computed at save time from `lines`. */
  totalAmount: number;
  savedAt: string;
};
