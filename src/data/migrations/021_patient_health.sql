-- 021 — the patient's health record and consent taken at the desk, written by
-- staff from the patient record (/c/<slug>/patients/<id>/).
--
-- medical_history already keeps versions (rows are appended, never updated)
-- and patient_consent already allows channel 'desk'. What neither could say
-- is WHO on the team wrote the row, and the health record had nowhere for the
-- short alert a dentist must read before starting ("faints at injections").
-- Both tables are already under forced RLS on app.clinic_id (schema.sql, 012);
-- new columns inherit the table's policy and flossify_app's grants.
--
-- Additive only: nullable columns, so the seed's rows and every web consent
-- stay valid as they are.

-- The staff member who typed this version. Null on rows from before this
-- migration (the development seed) and on any row a patient answers
-- themselves (answered_by = 'patient').
alter table medical_history add column if not exists recorded_by uuid references staff(id);

-- One free-text line for the dentist, shown at the top of the record.
alter table medical_history add column if not exists note text;

-- The staff member who recorded a consent at the desk. given_by_name stays
-- the person who agreed (the patient, or a parent or guardian), typed by them.
alter table patient_consent add column if not exists recorded_by uuid references staff(id);

-- In what capacity that person agreed: the patient themselves, or a parent or
-- guardian for them. A name alone cannot say it (an adult may type their own
-- name), and the record has to show whether a minor's consent came from an
-- adult responsible for them. Null on web consents and on rows from before.
alter table patient_consent add column if not exists agreed_as text
  check (agreed_as in ('patient', 'guardian'));

-- The birth date is kept on the patient row and overwritten in place. Each
-- change is also written into a medical_history version (the existing
-- `answers` jsonb: {"birth_date": {"from": …, "to": …}}), so the history keeps
-- every value it had and who set it. No column is needed for that.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'medical_history_note_length') then
    alter table medical_history add constraint medical_history_note_length
      check (note is null or char_length(note) <= 1000);
  end if;
  -- A consent taken at the desk always names who took it. Web consents carry
  -- the patient's own tick and IP instead, so the rule is for 'desk' only.
  if not exists (select 1 from pg_constraint where conname = 'patient_consent_desk_recorded') then
    alter table patient_consent add constraint patient_consent_desk_recorded
      check (channel <> 'desk' or recorded_by is not null);
  end if;
  -- ...and says who agreed: the patient, or a parent or guardian, named.
  if not exists (select 1 from pg_constraint where conname = 'patient_consent_desk_agreed_as') then
    alter table patient_consent add constraint patient_consent_desk_agreed_as
      check (channel <> 'desk' or (agreed_as is not null and (agreed_as = 'patient' or coalesce(btrim(given_by_name), '') <> '')));
  end if;
end $$;
