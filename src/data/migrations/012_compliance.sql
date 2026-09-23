-- 012 — the Data Privacy Act paperwork made real: a versioned privacy notice,
-- a named Data Protection Officer per clinic group, and a consent record per
-- patient that says which version they agreed to, when, and how.
--
-- Rules kept: patient_consent is clinic data and goes under forced RLS the
-- way 003 does it. consent_version is the notice itself — one row per
-- wording, the same for every clinic — so it is not tenant data and is not
-- under RLS; the app asks for the one in force through a definer function so
-- the rule for "current" lives in one place. Nothing here joins a patient to
-- anything outside their clinic.

-- ---------------------------------------------------------------------------
-- The group's Data Protection Officer and NPC registration. The National
-- Privacy Commission asks clinics that process health data to register and to
-- name one; every column is null until the owner enters it on
-- Settings › Privacy.
-- ---------------------------------------------------------------------------
alter table clinic_group add column if not exists dpo_name text;
alter table clinic_group add column if not exists dpo_email text;
alter table clinic_group add column if not exists dpo_phone text;
alter table clinic_group add column if not exists npc_registration_no text;
alter table clinic_group add column if not exists dpo_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- One row per wording of the notice. The id is what a consent row points at
-- and what /privacy/ prints, so it is readable: privacy-<year>-<month>. A
-- change to the words is a new row with a later effective_from, never an
-- update to this one — a consent that points at old words must keep pointing
-- at them.
-- ---------------------------------------------------------------------------
create table if not exists consent_version (
  id             text primary key,
  title          text not null,
  summary        text not null,
  effective_from date not null,
  created_at     timestamptz not null default now()
);

insert into consent_version (id, title, summary, effective_from)
values (
  'privacy-2026-09',
  'Privacy notice',
  'What Flossify and your clinic keep about you, why, for how long, and your rights under the Data Privacy Act of 2012.',
  '2026-09-23'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who agreed to which version, when, and how. Appended, never updated: a
-- newer notice gets a newer row. `channel` is how the agreement was taken;
-- the booking form writes 'web' and the rest wait for a desk capture.
-- `given_by_name` is the person who ticked the box, which for a visit booked
-- for someone else is not the patient. `ip` is evidence, not identity.
-- ---------------------------------------------------------------------------
create table if not exists patient_consent (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinic(id) on delete restrict,
  patient_id     uuid not null references patient(id) on delete restrict,
  version_id     text not null references consent_version(id),
  given_at       timestamptz not null default now(),
  channel        text not null check (channel in ('web', 'desk', 'sms', 'paper')),
  given_by_name  text,
  ip             inet,
  appointment_id uuid references appointment(id) on delete set null
);

create index if not exists patient_consent_patient on patient_consent (patient_id, given_at desc);

-- Same fence as every other clinic table: enabled, forced, keyed on app.clinic_id.
alter table patient_consent enable row level security;
alter table patient_consent force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_consent' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on patient_consent
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The notice in force: the latest version whose effective date has arrived,
-- on the Manila calendar, since that is the day the clinic and the patient
-- are in. Returns no row when nothing is in force yet.
-- ---------------------------------------------------------------------------
create or replace function current_consent_version()
returns consent_version
language sql security definer stable set search_path = public as $$
  select *
  from consent_version
  where effective_from <= (now() at time zone 'Asia/Manila')::date
  order by effective_from desc, id desc
  limit 1
$$;

grant execute on function current_consent_version() to flossify_app;
