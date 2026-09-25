-- 026 — bringing patients in: Add patient (/c/<slug>/patients/new/) and
-- import from a spreadsheet (/c/<slug>/patients/import/).
--
-- A clinic moving to Flossify has years of patients on index cards and in
-- spreadsheets: who they are, what they said about their health, the visits
-- they had and what they paid. This file lets that history in without
-- pretending it is something else:
--
--   - the patient row gains what the intake form asks and the schema lacked:
--     the HMO and member number, and an emergency contact (guardian_* in
--     schema.sql is for a minor's consent, a different person and purpose);
--   - a visit from before Flossify is a completed appointment with
--     source 'import', no chair, and date_only when only its day is known
--     (starts_at is noon Manila on that day and ends_at the same instant: no
--     time is shown for it anywhere). Its dentist is a staff member, or the
--     name as the old record has it (dentist_name) for someone no longer on
--     the team; its service is the fee guide's (catalog_id) or the words of
--     the old record (reason); teeth are FDI numbers;
--   - what those visits cost and what was paid become statements and
--     payments in the clinic's own statement series (src/lib/invoices.ts),
--     marked imported_at: issued_at / paid_on are the day of the visit (or of
--     the opening balance), the number is taken the day it is brought in.
--     A payment whose method the old records do not say is 'unrecorded',
--     allowed only on an imported payment;
--   - consent signed on paper is recorded as what it was. A printed copy of
--     the privacy notice in force, signed on a date: a patient_consent row
--     with channel 'paper' and that date (signed_on), counted like any other
--     consent to that version, never for a version not yet in force on that
--     day. The clinic's OWN paper form: a patient_paper_consent row — kept on
--     the record as a fact, and not consent to Flossify's notice, which it
--     is not;
--   - patient_import holds one uploaded file between its preview and its
--     import (the cells, the column matching the desk chose, the date order),
--     then only the counts and, for rows left out, their row numbers and the
--     reasons. The cells are emptied when the import runs or is discarded.
--
-- Re-importing the same file does not duplicate: a patient is matched by
-- chart number, or mobile + name (+ birth date); a visit by its import_key
-- (patient, day, service, dentist), unique per clinic; its statement and
-- payment by a form_key derived from that key (022's unique indexes); the
-- opening balance by one derived from the patient; a paper form by
-- (patient, day).
--
-- Additive only: nullable columns or defaults that describe existing rows
-- truly (date_only false: every existing visit has its real time), two
-- widened checks (appointment.source, payment.method), new checks that
-- existing rows already meet, two new tables under forced RLS, one trigger.

-- ---------------------------------------------------------------------------
-- One uploaded file
-- ---------------------------------------------------------------------------
create table if not exists patient_import (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinic(id) on delete restrict,
  kind         text not null check (kind in ('patients', 'visits')),
  file_name    text not null check (char_length(file_name) <= 200),
  file_bytes   integer not null check (file_bytes between 0 and 5242880),
  file_sha256  text not null,
  status       text not null default 'draft' check (status in ('draft', 'done', 'discarded')),
  -- The file as read (header row and data rows, every cell a string), until it runs or is discarded.
  headers      jsonb,
  cells        jsonb,
  -- Which field each column is: {"0": "last_name", "3": "birth_date", …}.
  mapping      jsonb not null default '{}'::jsonb,
  -- How 03/04/1985 is read: month/day/year (the Philippine habit) or day/month/year.
  date_order   text not null default 'mdy' check (date_order in ('mdy', 'dmy')),
  -- What the run did, and the rows it left out as {row, why}. While a draft: how the file read ({"notes": […], "headerRow": n}).
  counts       jsonb not null default '{}'::jsonb,
  created_by   uuid not null references staff(id),
  created_at   timestamptz not null default now(),
  done_by      uuid references staff(id),
  done_at      timestamptz,
  check (status = 'draft' or (cells is null and headers is null))
);

create index if not exists patient_import_recent on patient_import (clinic_id, created_at desc);

alter table patient_import enable row level security;
alter table patient_import force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_import' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on patient_import
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The patient: what the intake form asks
-- ---------------------------------------------------------------------------
alter table patient
  add column if not exists hmo_name           text,
  add column if not exists hmo_member_no      text,
  add column if not exists emergency_name     text,
  add column if not exists emergency_relation text,
  add column if not exists emergency_phone    text,
  -- Who added the patient from Add patient or an import. Null for bookings and older rows.
  add column if not exists created_by         uuid references staff(id) on delete set null,
  add column if not exists import_id          uuid references patient_import(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_intake_lengths') then
    alter table patient add constraint patient_intake_lengths check (
      coalesce(char_length(hmo_name), 0) <= 80 and coalesce(char_length(hmo_member_no), 0) <= 40
      and coalesce(char_length(emergency_name), 0) <= 120 and coalesce(char_length(emergency_relation), 0) <= 40
      and coalesce(char_length(emergency_phone), 0) <= 20);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Visits from before Flossify
-- ---------------------------------------------------------------------------
alter table appointment drop constraint if exists appointment_source_check;
alter table appointment add constraint appointment_source_check
  check (source in ('staff', 'web', 'request', 'import'));

alter table appointment
  -- Only the day is known (an index card says "12 Mar 2023"); no time is shown for it.
  add column if not exists date_only    boolean not null default false,
  -- The dentist as the old record names them, when they are not a staff member here.
  add column if not exists dentist_name text,
  -- FDI tooth numbers the visit was about.
  add column if not exists teeth        smallint[],
  add column if not exists import_id    uuid references patient_import(id) on delete set null,
  -- patient + day + service + dentist, hashed: the same visit brought in twice is one visit.
  add column if not exists import_key   text;

create unique index if not exists appointment_import_key on appointment (clinic_id, import_key) where import_key is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointment_import_shape') then
    -- A visit brought in happened: it is completed, and it holds no chair.
    alter table appointment add constraint appointment_import_shape
      check (source <> 'import' or (status = 'completed' and chair is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointment_date_only_import') then
    alter table appointment add constraint appointment_date_only_import
      check (not date_only or source = 'import');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointment_dentist_one') then
    alter table appointment add constraint appointment_dentist_one
      check (dentist_name is null or (dentist_id is null and char_length(btrim(dentist_name)) between 1 and 120));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointment_teeth_fdi') then
    alter table appointment add constraint appointment_teeth_fdi
      check (teeth is null or (cardinality(teeth) between 1 and 52 and 11 <= all (teeth) and 85 >= all (teeth)));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Money from before Flossify
-- ---------------------------------------------------------------------------
alter table invoice
  -- Set when the statement was brought in from earlier records: issued_at is then the
  -- day of the visit or of the balance, and the number was taken on imported_at.
  add column if not exists imported_at    timestamptz,
  add column if not exists import_id      uuid references patient_import(id) on delete set null,
  -- The visit the statement is for, when it came with one.
  add column if not exists appointment_id uuid references appointment(id) on delete set null;

alter table payment
  add column if not exists imported_at timestamptz,
  add column if not exists import_id   uuid references patient_import(id) on delete set null;

-- How it was paid is often not in the old records: 'unrecorded', on an imported payment only.
alter table payment drop constraint if exists payment_method_check;
alter table payment add constraint payment_method_check
  check (method in ('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'hmo', 'philhealth', 'cheque', 'unrecorded'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_unrecorded_imported') then
    alter table payment add constraint payment_unrecorded_imported
      check (method <> 'unrecorded' or imported_at is not null);
  end if;
end $$;

create index if not exists invoice_appointment on invoice (clinic_id, appointment_id) where appointment_id is not null;

-- ---------------------------------------------------------------------------
-- Consent signed on paper
-- ---------------------------------------------------------------------------
-- A printed copy of the notice, signed: channel 'paper', the day on the paper,
-- who recorded it, who signed (the patient, or a parent or guardian, named).
alter table patient_consent
  add column if not exists signed_on   date,
  -- When the row was written. Null on rows from before this file.
  add column if not exists recorded_at timestamptz;
alter table patient_consent alter column recorded_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_consent_paper_shape') then
    alter table patient_consent add constraint patient_consent_paper_shape
      check ((channel = 'paper') = (signed_on is not null)
             and (channel <> 'paper' or (recorded_by is not null and agreed_as is not null
                                         and (agreed_as = 'patient' or coalesce(btrim(given_by_name), '') <> '')))) not valid;
  end if;
end $$;

-- The day on the paper must be one on which that notice was in force, and not
-- after today; given_at follows it (noon Manila: the time of day is not known,
-- and nothing shows one for a paper consent).
create or replace function patient_consent_paper()
returns trigger
language plpgsql set search_path = public as $$
declare
  eff date;
begin
  -- Not paper, or a paper row from before this file (no day on it: the check
  -- above, NOT VALID, leaves those alone): nothing to derive, given_at stays.
  if new.channel <> 'paper' or new.signed_on is null then
    return new;
  end if;
  select effective_from into eff from consent_version where id = new.version_id;
  if new.signed_on < eff then
    raise exception 'The notice % was not in force until %; a paper signed on % is not consent to it.', new.version_id, eff, new.signed_on
      using errcode = 'check_violation';
  end if;
  if new.signed_on > (now() at time zone 'Asia/Manila')::date then
    raise exception 'A paper consent cannot be dated after today.' using errcode = 'check_violation';
  end if;
  new.given_at := (new.signed_on + time '12:00') at time zone 'Asia/Manila';
  return new;
end $$;

drop trigger if exists patient_consent_paper on patient_consent;
create trigger patient_consent_paper before insert or update on patient_consent
  for each row execute function patient_consent_paper();

-- The clinic's own paper form. Not a version of the privacy notice, so not a
-- patient_consent row: the record shows it as what it is.
create table if not exists patient_paper_consent (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinic(id) on delete restrict,
  patient_id    uuid not null references patient(id) on delete restrict,
  signed_on     date not null check (signed_on >= date '1900-01-01'),
  -- What the paper was, in the clinic's words.
  form_name     text not null default 'The clinic’s own consent form' check (char_length(btrim(form_name)) between 1 and 120),
  -- Who signed, as the paper says; unknown for a row from an import.
  signed_by_name text check (signed_by_name is null or char_length(signed_by_name) <= 120),
  agreed_as     text check (agreed_as in ('patient', 'guardian')),
  recorded_by   uuid not null references staff(id),
  recorded_at   timestamptz not null default now(),
  import_id     uuid references patient_import(id) on delete set null
);

create unique index if not exists patient_paper_consent_day on patient_paper_consent (clinic_id, patient_id, signed_on);

alter table patient_paper_consent enable row level security;
alter table patient_paper_consent force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_paper_consent' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on patient_paper_consent
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;
