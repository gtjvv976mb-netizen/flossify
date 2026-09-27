-- 035 — the consent a patient signs at a visit, with their own hand, on the clinic's tablet.
--
-- The owner: the patient signs on an iPad, and the record shows the signature on the visit it was
-- for. One row is one signing: the visit, the words they agreed to (a consent_version of kind
-- 'treatment', whose words are TREATMENT_CONSENT in src/lib/patient-forms-def.ts), the treatment
-- the dentist explained in the clinic's own words, the dentist who explained it, who signed (the
-- patient, or a parent or guardian, named) and the signature itself.
--
-- The signature is kept as the strokes that drew it — numbers only, in a 1000 × 400 box — never an
-- image file: it is small, it draws the same at any size, and nothing in it can be a script. The
-- app reads it back through src/lib/visit-consent.ts, which checks it again before drawing.
--
-- A signed consent is never changed: the app may add one and read them, nothing else (a mistake is
-- signed again; the record shows both). Clinic data under row-level security like every other.

create table if not exists visit_consent (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinic(id) on delete restrict,
  patient_id     uuid not null references patient(id) on delete restrict,
  appointment_id uuid not null references appointment(id) on delete restrict,
  version_id     text not null references consent_version(id),
  treatment      text not null check (length(btrim(treatment)) between 1 and 600),
  dentist_id     uuid references staff(id) on delete set null,
  signed_by_name text not null check (length(btrim(signed_by_name)) between 1 and 120),
  signed_as      text not null check (signed_as in ('patient', 'guardian')),
  relation       text check (relation is null or length(btrim(relation)) between 1 and 60),
  strokes        jsonb not null check (jsonb_typeof(strokes) = 'array' and jsonb_array_length(strokes) between 1 and 80 and length(strokes::text) <= 120000),
  recorded_by    uuid not null references staff(id),
  signed_at      timestamptz not null default now(),
  check (signed_as = 'guardian' or relation is null)
);
create index if not exists visit_consent_patient on visit_consent (clinic_id, patient_id, signed_at desc);
create index if not exists visit_consent_visit on visit_consent (appointment_id);

-- The visit is this patient's, at this clinic, and the words are a treatment consent.
create or replace function visit_consent_check() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from appointment a where a.id = new.appointment_id and a.patient_id = new.patient_id and a.clinic_id = new.clinic_id) then
    raise exception 'visit_consent: the visit is not this patient''s at this clinic';
  end if;
  if not exists (select 1 from consent_version v where v.id = new.version_id and v.kind = 'treatment') then
    raise exception 'visit_consent: % is not a treatment consent', new.version_id;
  end if;
  return new;
end $$;
drop trigger if exists visit_consent_check on visit_consent;
create trigger visit_consent_check before insert on visit_consent for each row execute function visit_consent_check();

alter table visit_consent enable row level security;
alter table visit_consent force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'visit_consent' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on visit_consent
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
      with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

revoke all on visit_consent from flossify_app;
grant select, insert on visit_consent to flossify_app;
