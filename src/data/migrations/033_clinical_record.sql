-- 033 — the rest of the clinical record: notes, a treatment plan with items, and what the
-- tables already there (procedure_done, prescription, attachment, recall, lab_order; schema.sql)
-- were missing to be used from the record page.
--
--   - clinical_note: one visit's notes in the usual order — why they came (complaint), what the
--     dentist found, the diagnosis, what was done, what comes next — by the dentist, for a day
--     (and a visit when there is one). A signed note is never edited: a correction is an
--     addendum (amends_id), dated and signed in turn, so the record shows what was written when.
--   - treatment_plan_item: the planned work, a line each — the procedure (from the fee guide or
--     typed), the tooth and surfaces, the price, a phase (what first), and where it stands:
--     planned → accepted → done, or declined. Done links the procedure_done row it became.
--   - attachment: soft removal (removed_at / removed_by) — an X-ray taken off the record is kept
--     for the audit and hidden, never deleted from disk by a click.
--   - recall, lab_order, prescription: who wrote them and when, a note.
--
-- All clinic data under row-level security (the tables in schema.sql already are; the new ones
-- here get the same tenant policy), and none of it is public.

create table if not exists clinical_note (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinic(id) on delete restrict,
  patient_id     uuid not null references patient(id) on delete restrict,
  appointment_id uuid references appointment(id) on delete set null,
  visit_on       date not null,
  dentist_id     uuid references staff(id) on delete set null,
  complaint      text check (complaint is null or length(complaint) <= 2000),
  findings       text check (findings is null or length(findings) <= 4000),
  diagnosis      text check (diagnosis is null or length(diagnosis) <= 2000),
  treatment      text check (treatment is null or length(treatment) <= 4000),
  plan           text check (plan is null or length(plan) <= 2000),
  teeth          smallint[] not null default '{}',
  amends_id      uuid references clinical_note(id) on delete restrict,
  created_by     uuid references staff(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists clinical_note_patient on clinical_note (clinic_id, patient_id, visit_on desc, created_at desc);

create table if not exists treatment_plan_item (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete restrict,
  plan_id     uuid not null references treatment_plan(id) on delete cascade,
  patient_id  uuid not null references patient(id) on delete restrict,
  catalog_id  uuid references procedure_catalog(id) on delete set null,
  name        text not null check (length(btrim(name)) between 1 and 160),
  fdi         smallint check (fdi between 11 and 85),
  surface     text check (surface is null or length(surface) <= 12),
  price       numeric(12, 2) not null default 0 check (price >= 0),
  phase       smallint not null default 1 check (phase between 1 and 9),
  status      text not null default 'planned' check (status in ('planned', 'accepted', 'done', 'declined')),
  note        text check (note is null or length(note) <= 500),
  done_id     uuid references procedure_done(id) on delete set null,
  created_by  uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists treatment_plan_item_patient on treatment_plan_item (clinic_id, patient_id, status);

alter table attachment add column if not exists removed_at timestamptz;
alter table attachment add column if not exists removed_by uuid references staff(id) on delete set null;
alter table recall add column if not exists created_by uuid references staff(id) on delete set null;
alter table recall add column if not exists created_at timestamptz not null default now();
alter table lab_order add column if not exists created_by uuid references staff(id) on delete set null;
alter table lab_order add column if not exists created_at timestamptz not null default now();
alter table lab_order add column if not exists note text;
alter table procedure_done add column if not exists created_by uuid references staff(id) on delete set null;
alter table procedure_done add column if not exists name text check (name is null or length(name) <= 160);
alter table prescription add column if not exists created_at timestamptz not null default now();
create index if not exists procedure_done_patient on procedure_done (clinic_id, patient_id, performed_at desc);
create index if not exists attachment_patient on attachment (clinic_id, patient_id, created_at desc);
create index if not exists prescription_patient on prescription (clinic_id, patient_id, issued_at desc);

do $$
declare t text;
begin
  foreach t in array array['clinical_note', 'treatment_plan_item'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation') then
      execute format($p$create policy tenant_isolation on %I
        using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
        with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)$p$, t);
    end if;
  end loop;
end $$;

-- A signed note stays as it was written: the app may add notes, never change or delete one. The database's
-- default privileges hand the app every right on a new table, so what it may not do is taken back here.
revoke all on clinical_note from flossify_app;
grant select, insert on clinical_note to flossify_app;
grant select, insert, update, delete on treatment_plan_item to flossify_app;
-- What went on a record stays there: an X-ray is hidden (removed_at), never deleted; a prescription or a
-- treatment done is never taken back or rewritten by the app.
revoke delete on attachment, procedure_done from flossify_app;
revoke update, delete on prescription from flossify_app;
