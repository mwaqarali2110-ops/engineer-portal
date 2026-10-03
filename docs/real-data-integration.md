# Real survey data — schema discovery and access status

Everything below was verified against the existing KaamAsaan repositories in
`D:\KaamAsaan` and against the live Supabase project, not assumed. No other
repository was modified.

## 1. Booking table

`public.survey_bookings` — primary key `id uuid` (`gen_random_uuid()`).

Source: `backend-development/supabase-sql-schema.sql`, and the live project
(PostgREST answers on `/rest/v1/survey_bookings`).

Customer fields are **denormalized onto the booking row** — `full_name`,
`phone`, `city`, `address` (plus `customer_email`). My Solar Journey reads them
straight off the booking; it does not join `public.profiles`.
`user_id → auth.users` is the ownership link, and `public.profiles` only carries
`role` (`customer` | `admin` | `installer`).

Relevant columns used by the portal:

| Portal field | Column |
| --- | --- |
| customerName / phone / city / address | `full_name`, `phone`, `city`, `address` |
| bookingType | `service_type`, falling back to `booking_type` |
| preferredDate / timeSlot | `preferred_date`, `preferred_time_slot` |
| status | `current_milestone` (labels from the journey contract), falling back to `status` |
| confirmedSurveyDate | `confirmed_survey_at` |
| plannedInstallationDate | `planned_installation_at` |
| requestedAt | `created_at` |
| assigned team / progress note | `assigned_team_name`, `assigned_team_contact`, `progress_note` |

History lives in `public.survey_booking_status_history` (the mobile app embeds it
as `status_history:survey_booking_status_history(*)`). The Engineer Portal does
not need it yet.

## 2. The reference number — the reason KA-CD2454D8 was "not found"

**The live database has no `reference_code` column.** Verified twice against the
live project: a select of that column returns
`42703 column survey_bookings.reference_code does not exist`, while columns that
do exist return `42501 permission denied` instead.

`backend-development/migrations/001_add_survey_booking_reference_code.sql` would
add the column, the `KA-` + 8 hex format check, the unique index and the
`private.set_survey_booking_reference_code()` trigger — but it has not been
applied to this project. (The same is true of
`supabase/migrations/202609130001_survey_booking_request_key.sql`: `request_key`
does not exist either.)

So `KA-CD2454D8` is produced **client-side** from the booking UUID:

```ts
// kaamasaan-mobile/src/services/journey.api.ts
export const formatSurveyReference = (booking) =>
  booking.reference_code || `KA-${booking.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
```

The admin dashboard does the same (`booking.reference_code || booking.id`), and
its `SurveyBooking` type marks `reference_code` optional.

`KA-CD2454D8` therefore means: the booking whose `id` begins with the UUID group
`cd2454d8`. The portal resolves it as a primary-key range, which is valid SQL on
the `uuid` type and uses the PK index:

```
id >= cd2454d8-0000-0000-0000-000000000000
id <= cd2454d8-ffff-ffff-ffff-ffffffffffff
```

`surveyService` still tries `reference_code = <ref>` afterwards, so the same code
keeps working in any environment where migration 001 has been applied (a `42703`
there is treated as "column not present", never as an error).

### Prefix collisions are refused, never guessed

Those 8 hex characters are 32 random bits (UUIDv4), so the prefix is **not**
unique: the birthday probability of at least one collision is ~1.2% at 10,000
bookings, ~25% at 50,000 and 50% at ~77,000. The range query therefore fetches
**two** rows, never one (`limit(2)`, no `maybeSingle`), and
`resolveSingleBookingRow()` decides:

| Rows | Result |
| --- | --- |
| 0 | falls through to the not-found path |
| 1 | that booking |
| 2+ | throws `ambiguous_reference` — no booking is chosen |

The engineer sees *"This reference matches more than one survey. Please contact
the KaamAsaan team."* and nothing about either customer. The matching UUIDs are
logged only as a DEV console diagnostic. Because the rows come back already
RLS-filtered, an ambiguity can only ever be between bookings this engineer is
allowed to see.

## 3. System summary source

1. `survey_bookings.selected_package_snapshot` (jsonb) — the primary source.
   Shape written by the mobile app: `systemSizeKw`, `panel {brand, model,
   wattage, quantity}`, `inverter {brand, model, capacityKw, quantity}`,
   `battery {brand, model, unitCapacityKwh, totalCapacityKwh, quantity}`,
   `structure {structureType}`. See
   `kaamasaan-mobile/src/types/survey.types.ts → SelectedPackageSnapshot`.
2. `survey_bookings.system_design_id → public.system_designs` — fallback, joined
   to `public.products` / `public.brands` for names.

Nothing is invented: when neither source yields values, the portal shows
"System Summary not available yet" and keeps Balance of System available.

## 4. RLS and access — the remaining blocker

```sql
-- backend-development/supabase-sql-schema.sql
create policy "survey_bookings_own_read"
on public.survey_bookings for select
to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

revoke all on public.profiles, public.system_designs,
  public.survey_bookings, public.smart_tool_results from anon;
```

`private.is_admin()` is `profiles.role = 'admin'`. `rls-policies.md` states
installer access is **deferred**: "Installer access is deferred. A later phase
should add `installer_profiles` and a separate `booking_assignments` table…".

Confirmed live with the portal's own Supabase client (no session):
`42501 permission denied for table survey_bookings`.

Consequences, in order:

1. Without a Supabase Auth session the portal can read **nothing** — the
   prototype localStorage login is not authentication and grants no database
   access. Real mode therefore signs in through Supabase Auth.
2. Even signed in, only the booking's **owner** or an **admin** profile can read
   `KA-CD2454D8` today. There is no engineer/installer read path.

### The engineer access path — now written, not yet applied

Two migrations in the backend repository close this gap:

- `backend-development/supabase/migrations/202609140001_engineer_role.sql` — adds
  `engineer` to the `public.user_role` enum (`admin` and `installer` are not
  reused).
- `backend-development/supabase/migrations/202609140002_engineer_portal_access.sql`
  — `public.engineer_profiles` (active flag), `public.survey_booking_assignments`
  (engineer ↔ booking), the `private.is_assigned_engineer()` predicate, and an
  **additive** second SELECT policy on `survey_bookings`. The existing
  owner-or-admin policy is untouched; permissive policies are OR-ed.

An engineer reads a booking only when role = `engineer`, `engineer_profiles.active`
is true, **and** an active assignment row links them to that exact booking.
Journey history and the linked `system_designs` row are authorized through the
same assignment. Engineers get SELECT only.

Steps to apply, create the first engineer account and assign a booking are in
`backend-development/engineer-portal-access.md`, together with the RLS test
matrix. As of this writing neither table exists in the live project (PostgREST
returns `PGRST205` for both), so nothing has been applied yet.

Not acceptable, and not done: disabling RLS, granting `anon` access to customer
survey data, or putting a service-role key in this frontend.

## 5. One caveat about RLS and "not found"

A `permission denied` error (42501) only happens when the role lacks the table
grant — that is the anon case, and the portal reports it as an authorization
problem. Once signed in, RLS filters rows **silently**: a signed-in account that
may not read a particular booking gets an empty result, not an error, so the
portal will say "No survey booking was found for this reference ID."

That is unavoidable at the client. It means a successful "not found" in real mode
should be read as *"this account cannot see that booking"* until an engineer
policy exists. Diagnosing which of the two it is requires checking the account's
`profiles.role` — the header shows it next to the engineer name in real mode.
