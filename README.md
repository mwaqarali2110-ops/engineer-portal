# KaamAsaan Engineer Portal — Phase 1

Internal portal for KaamAsaan design / site-survey engineers. After a customer books a
solar site survey, the engineer opens the booking by reference ID, reviews the approved
system, and prepares the site **Balance of System (BOS)** estimate.

Survey bookings are read from the **live KaamAsaan Supabase project** (the same one the
mobile app and admin dashboard use). BOS pricing is still prototype data.
No database migrations, no RLS changes, no service-role key.

## Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

```bash
npm run build      # type-check (tsc -b) + production build to dist/
npm run preview    # serve the production build
```

## Walkthrough

1. Sign in — a KaamAsaan Supabase account in real mode, any valid email plus a 6+
   character password in mock mode.
2. Enter a survey reference (e.g. `KA-CD2454D8` in real mode, `KA-SRV-2026-00128`
   in mock mode) and press **Open Survey**. Input is normalized: leading/trailing
   spaces and lowercase are accepted.
3. Review **Survey Details**, then the **System Summary** (or its "not available
   yet" state when no system is attached to the booking).
4. In **Balance of System**, click a material to add a BOS line.
   - Wires: wire size → brand (rate per meter) → required length → amount.
   - Components: quantity × unit price (unit selectable where it makes sense).
5. The **Estimated BOS Total** updates instantly from the line items.
6. **Save Draft** stores the worksheet on this device; **Finalize BOS** validates that
   every line is priced. Both are prototype actions in this phase.

## Project structure

```
.env.example                    Supabase / mock-mode placeholders
docs/real-data-integration.md   Schema discovery + RLS access status
index.html
vite.config.ts, tsconfig*.json
src/
  main.tsx                      React entry
  App.tsx                       AuthProvider + login / workspace switch
  styles.css                    Design tokens and all component styles
  vite-env.d.ts                 Typed import.meta.env
  types/
    domain.ts                   SurveyDetails, SurveyRecord, SystemSummary, BosLine,
                                WireSize, WireBrand, WireBrandRate, BosCategory,
                                BosEstimate, Engineer, …
  lib/
    env.ts                      Typed env access + isMockMode
    supabase.ts                 Lazy Supabase client (anon key only)
    format.ts                   PKR, date and "To Be Confirmed" formatting (en-PK)
    id.ts                       Line id generator
  services/                     The only place that knows where data comes from
    authService.ts              Supabase Auth (real) / prototype sign-in (mock)
    surveyService.ts            survey_bookings lookup, mapping, error taxonomy
    bosCatalogService.ts        Catalog load → admin-managed tables later
    bosEstimateService.ts       Draft/finalize save → estimate tables later
  data/
    bosPrototypeCatalog.ts      ⚠️ TEMPORARY prototype catalog + sample rates
  components/
    AppHeader.tsx               Dark top bar, engineer chip, logout
    ui/                         Button, Panel, Field, TextInput, NumberInput,
                                Select, Notice, EmptyState, Skeleton
  features/
    auth/AuthContext.tsx        Session context over authService
    auth/LoginScreen.tsx        Engineer Portal sign-in
    surveys/MySurveys.tsx       Assigned surveys list (opens in the same page)
    surveys/SurveyLookup.tsx    Find survey booking by reference
    surveys/SurveyDetails.tsx   Real booking fields (customer, schedule, status)
    surveys/SystemSummary.tsx   Selected system, or its "not available yet" state
    surveys/mockSurvey.ts       Mock booking data (mock mode only)
    bos/BosEstimator.tsx        Step 02 — collapsible BOS section
    bos/BosCatalog.tsx          Grouped material picker
    bos/BosLineItem.tsx         One editable BOS line (wire or quantity)
    bos/catalog.ts              Pure catalog lookups + wire rate resolver
    bos/calculations.ts         lineTotal / estimateTotal / isLinePriced
    bos/useBosEstimate.ts       Worksheet state; totals derived, never stored
  pages/
    EngineerWorkspace.tsx       Single-screen workspace
```

## Calculations

- Wire line: `lineTotal = lengthMeters × ratePerMeter`
- Quantity line: `lineTotal = quantity × unitPrice`
- Worksheet: `bosTotal = sum(all lineTotals)`

Only the line items live in state. Every amount is derived (`useMemo`) from that state,
so no total can go stale. Quantities, lengths and prices cannot be negative.

## Mock data in use

| What | Where |
|---|---|
| Mock bookings `KA-SRV-2026-00128` (with a system) and `KA-0000CAFE` (booking only, exercises the "no system yet" state) — used only when `VITE_USE_MOCK_DATA=true` | `src/features/surveys/mockSurvey.ts` |
| BOS groups, items, units, wire sizes (4/6/10 mm²) | `src/data/bosPrototypeCatalog.ts` |
| Sample cable rates: KUKA Rs 300/m, Fast Rs 350/m, Pak Rs 400/m, New Age Rs 250/m | `src/data/bosPrototypeCatalog.ts` |
| Engineer identity (derived from the email used to sign in) | `src/services/authService.ts` |

**The cable rates are initial prototype samples, not final market rates.** The same rate
is applied to 4/6/10 mm² because per-size pricing has not been supplied yet. The data
model already supports a specific rate per *wire type → wire size → brand*: add a more
specific row to `prototypeWireBrandRates` and `resolveWireRate()` will prefer it.

## Supabase integration

`.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the same public values
the mobile app and admin dashboard use — one shared project, never a second
database) and `VITE_USE_MOCK_DATA`.

- `VITE_USE_MOCK_DATA=true` — mock booking data only, for isolated UI work.
- `VITE_USE_MOCK_DATA=false` — **production target.** Real Supabase lookup, real
  Supabase Auth sign-in. Real mode never falls back to mock data when a lookup
  fails.

| Portal concern | Real source (verified) | Status |
|---|---|---|
| Engineer login | Supabase Auth (`signInWithPassword`) + `profiles.role = engineer` + `engineer_profiles.active` | wired |
| Survey reference lookup | `public.survey_bookings`, reference resolved as a UUID prefix on `id` | wired |
| Survey details | booking columns (customer data is denormalized on the booking) | wired |
| System Summary | `selected_package_snapshot`, falling back to `system_design_id → system_designs` | wired |
| My Surveys | `survey_booking_assignments` (active rows for `auth.uid()`) | wired |
| Engineer read access | assignment-scoped RLS policy | **migrations written, not yet applied** |
| BOS catalog, rates | admin-managed catalog tables | still prototype data |
| Draft / finalized estimate | site-survey BOS estimate tables | still local draft |

`docs/real-data-integration.md` documents the discovered schema, why a
`KA-XXXXXXXX` reference is a UUID prefix rather than a stored column, the exact
RLS policies, and the engineer policy that the backend still needs.

Only the public anon key belongs in this frontend — never a service-role key.

## Deliberately not in this phase

PDF export, customer signatures, photo uploads, GPS, drawing tools, inventory deduction,
approval workflow, WhatsApp/SMS/notifications, installation scheduling, complex role
management, Supabase migrations, and the admin price manager.
