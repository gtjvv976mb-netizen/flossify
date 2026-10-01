-- 039 — the patient intake and the consent library: "Add patient, step by step"
-- (the owner, 29 Sep 2026). The desk prepares one patient's intake: page 1,
-- "Patient information" (a new patient's details, health and the privacy
-- notice, the patient forms' own questions), and the consent forms the
-- dentist's plan needs, from a versioned library. The patient fills them in
-- and signs each on their own phone (a one-patient QR code) or on a clinic
-- device; a procedure form is signed only after the named dentist has
-- recorded "I explained this". What was signed is frozen as a snapshot,
-- fingerprinted and sealed by this database, and chained per clinic once it is
-- on a record. This file is phase 1 of that work: the data, nothing visible.
--
-- The pieces:
--   - consent_version gains the kind 'document', a code, and body_sha256: the
--     fingerprint of the template's words in src/lib/consent-library.ts
--     (npm run consent:hash). Ten forms, in force from 1 Oct 2026; the general
--     consent (treatment-2026-09, 028) gets its fingerprint too. A server
--     offers a template only while its words hash to the row's; new words are
--     a new version id and a new row.
--   - intake: one patient's intake (a new patient, or one on file), with
--     page 1's answers as a draft, who agreed to the privacy notice, and the
--     desk's decision. An intake is not a patient: a new patient's record is
--     made from it (src/lib/patient-add.ts), never by this file.
--   - intake_link: the one-patient link (flossify.ph/f/i/<token>/), claimed
--     by the first device that opens it; a clinic tablet's and a handed-over
--     desk's links are made already claimed. clinic_tablet: a registered
--     tablet, known by the hash of a secret in its cookie.
--   - consent_document: one form prepared for a patient, with the clinic's
--     part (fields) and the dentist who explains it. intake_page: the
--     patient's draft decision on it (written by the definers only).
--     consent_signing: a decision as signed, insert-only, with its snapshot
--     and the two fingerprints this database computes. consent_attestation:
--     the named dentist's "I explained this", before any signing.
--     consent_confirmation, capacity_note, consent_withdrawal,
--     consent_override, consent_chain, intake_event: insert-only records.
--   - The public side has no tenant: the definer functions below are its only
--     way in, the clinic comes from the token, and none raises an error that
--     carries an answer (a refusal is a status word).
--   - retention_purge() keeps its signature: texts after two years and poster
--     forms after 30 days as before, then intakes, in a block of their own so
--     a failure there never stops the rest.
--
-- Locking: the intake row first, then its link, everywhere (intake_gate here;
-- the desk's writes in src/lib/intake.ts), so a patient's Send and the desk's
-- Stop take turns and never deadlock.
--
-- Additive: new tables, nullable columns, one widened check each on
-- consent_version and patient_consent. It replaces one function,
-- retention_purge() (from 028, same signature), and nothing else that exists;
-- it does not touch public_directory, public_dentist, sms_enqueue_reminders or
-- signup_clinic, nor clinic_hours, staff_schedule, appointment or
-- procedure_catalog (040–042 own those), and it depends on nothing in 040–042.

-- ---------------------------------------------------------------------------
-- 1. The library
-- ---------------------------------------------------------------------------
alter table consent_version add column if not exists code text;
alter table consent_version add column if not exists body_sha256 text;
alter table consent_version drop constraint if exists consent_version_kind_check;
alter table consent_version add constraint consent_version_kind_check check (kind in ('privacy', 'treatment', 'document'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consent_version_document_shape') then
    alter table consent_version add constraint consent_version_document_shape check (
      (kind = 'document') = (code is not null)
      and (code is null or code in ('anaesthesia', 'extraction', 'root_canal', 'restoration', 'periodontal', 'denture', 'implant', 'ortho', 'whitening', 'photos'))
      and (body_sha256 is null or body_sha256 ~ '^[0-9a-f]{64}$')
      and (kind <> 'document' or body_sha256 is not null));
  end if;
end $$;

-- The fingerprints below are what `npm run consent:hash` prints for the words in
-- src/lib/consent-library.ts. A placeholder fails the check above, so this file
-- cannot be applied unfilled.
insert into consent_version (id, title, summary, effective_from, kind, code, body_sha256) values
  ('anaesthesia-2026-10', 'Local anaesthesia', 'Numbing with an injection: what it does, its risks, the other choices, and your rights.', '2026-10-01', 'document', 'anaesthesia', '83eaf42252349c348d6491c236574e88d796f4ae0b876ffeac88a405827ce235'),
  ('extraction-2026-10', 'Tooth extraction and oral surgery', 'Removing a tooth: what is done, the risks, the other choices, the cost and your rights.', '2026-10-01', 'document', 'extraction', 'd63807d66a1cfd3755e8266f5f840fdcc50570fb21fd3f4ae8f566c60c938408'),
  ('root-canal-2026-10', 'Root canal treatment', 'Treating the inside of a tooth: what is done, the risks, the other choices, the cost and your rights.', '2026-10-01', 'document', 'root_canal', '96cf87fbcd17594e5f347f556cacd3f1ba3e209618a6f61ab5b8270a2afaa4f9'),
  ('restoration-2026-10', 'Fillings, crowns, bridges and veneers', 'Repairing or replacing teeth: what is done, the risks, the other choices, the cost and your rights.', '2026-10-01', 'document', 'restoration', '20e66546a12e0ba39c4d00ab7523b42d35bd325a8b897378c64df46c25263b32'),
  ('periodontal-2026-10', 'Deep cleaning and gum treatment', 'Cleaning below the gums: what is done, the risks, the other choices, the cost and your rights.', '2026-10-01', 'document', 'periodontal', '712f17f63c7b19ae112f503752bfd807d0fbe731d96c1087afe7600f7c07aa08'),
  ('denture-2026-10', 'Dentures', 'Dentures: what is made, the risks and limits, the other choices, the cost and your rights.', '2026-10-01', 'document', 'denture', '163dba214e904c772399e164500354eca70f1e15c5da53a3b64990e932f59de7'),
  ('implant-2026-10', 'Dental implants', 'Implants: what is done, the risks, the other choices, the cost and your rights.', '2026-10-01', 'document', 'implant', 'ed34e7445e332b685e1669fc9d6e212d18c486d9ab21302c30abca029ec3b042'),
  ('ortho-2026-10', 'Braces and orthodontic treatment', 'Braces and aligners: what is done, the risks, the results, the other choices, the cost and your rights.', '2026-10-01', 'document', 'ortho', '2f7e1043d43bd2b3f65a775066f80be314151f0205c69d111396cd17bfaf689c'),
  ('whitening-2026-10', 'Tooth whitening', 'Whitening: what is done, who it is not for, the risks and limits, the other choices and the cost.', '2026-10-01', 'document', 'whitening', 'b74ec0236547ca7c0f8ae68aead4d34c191d216392dc2b0b2b9897fec70318bc'),
  ('photos-2026-10', 'Photos and use of records', 'Your yes or no to each use of your photos and records beyond your care, and how to change your mind.', '2026-10-01', 'document', 'photos', 'f906c80d4645cdfd6079b5e6d236fa31bae14c74c63fd638b91edc8240806db2')
on conflict (id) do nothing;
update consent_version set body_sha256 = '8c49b0f27b84832478f3af9db934334852fc40a900562a7fd94f722969033cb1' where id = 'treatment-2026-09' and kind = 'treatment';

-- Every row's fingerprint is the one this file names (a row already there with other words stops the file).
do $$
declare want constant jsonb := '{
  "treatment-2026-09": "8c49b0f27b84832478f3af9db934334852fc40a900562a7fd94f722969033cb1",
  "anaesthesia-2026-10": "83eaf42252349c348d6491c236574e88d796f4ae0b876ffeac88a405827ce235", "extraction-2026-10": "d63807d66a1cfd3755e8266f5f840fdcc50570fb21fd3f4ae8f566c60c938408",
  "root-canal-2026-10": "96cf87fbcd17594e5f347f556cacd3f1ba3e209618a6f61ab5b8270a2afaa4f9", "restoration-2026-10": "20e66546a12e0ba39c4d00ab7523b42d35bd325a8b897378c64df46c25263b32",
  "periodontal-2026-10": "712f17f63c7b19ae112f503752bfd807d0fbe731d96c1087afe7600f7c07aa08", "denture-2026-10": "163dba214e904c772399e164500354eca70f1e15c5da53a3b64990e932f59de7",
  "implant-2026-10": "ed34e7445e332b685e1669fc9d6e212d18c486d9ab21302c30abca029ec3b042", "ortho-2026-10": "2f7e1043d43bd2b3f65a775066f80be314151f0205c69d111396cd17bfaf689c",
  "whitening-2026-10": "b74ec0236547ca7c0f8ae68aead4d34c191d216392dc2b0b2b9897fec70318bc", "photos-2026-10": "f906c80d4645cdfd6079b5e6d236fa31bae14c74c63fd638b91edc8240806db2"}';
  k text;
begin
  for k in select jsonb_object_keys(want) loop
    if (want ->> k) !~ '^[0-9a-f]{64}$' then
      raise exception '039: the fingerprint of % is not filled in (npm run consent:hash)', k;
    end if;
    if not exists (select 1 from consent_version where id = k and body_sha256 = want ->> k) then
      raise exception '039: consent_version % is missing or holds other words', k;
    end if;
  end loop;
end $$;

-- The form of a code in force on the Manila day ('general': the consent to
-- examination and treatment in force). A row of nulls when there is none.
create or replace function current_document_of(p_code text)
returns consent_version
language sql security definer stable set search_path = public as $$
  select *
  from consent_version
  where ((p_code = 'general' and kind = 'treatment') or (kind = 'document' and code = p_code))
    and effective_from <= (now() at time zone 'Asia/Manila')::date
  order by effective_from desc, id desc
  limit 1
$$;

-- Is this treatment or document version the one in force for its code?
create or replace function consent_in_force(p_version text)
returns boolean
language sql stable set search_path = public as $$
  select coalesce((
    select (current_document_of(case when v.kind = 'treatment' then 'general' else v.code end)).id = v.id
      from consent_version v where v.id = p_version and v.kind in ('treatment', 'document')), false)
$$;

-- ---------------------------------------------------------------------------
-- 2. The tables
-- ---------------------------------------------------------------------------
create table if not exists intake (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinic(id) on delete restrict,
  -- What the desk and the patient call it: IN-7K2F. Unique per clinic.
  ref               text not null check (ref ~ '^IN-[A-HJKMNP-Z2-9]{4}$'),
  target            text not null check (target in ('new', 'existing')),
  patient_id        uuid references patient(id) on delete restrict,
  -- The visit it was started from, if any.
  appointment_id    uuid references appointment(id) on delete set null,
  -- An optional first name shown under the code.
  label             text check (label is null or char_length(btrim(label)) between 1 and 40),
  -- Page 1's questions (INTAKE_FORM_VERSION in src/lib/intake-def.ts).
  form_version      text not null check (char_length(form_version) between 1 and 40),
  -- The desk's two questions for a new patient.
  desk_minor        text check (desk_minor in ('yes', 'no', 'unsure')),
  came_with         text check (came_with in ('parent', 'guardian', 'other_adult', 'nobody')),
  -- Page 1's answers, saved screen by screen (the definers only).
  answers           jsonb check (answers is null or (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 24576)),
  page1_done_at     timestamptz,
  -- Who agreed to the privacy notice on page 1, to which version, when.
  privacy_version   text references consent_version(id),
  privacy_at        timestamptz,
  privacy_as        text check (privacy_as in ('patient', 'parent', 'court_guardian', 'none')),
  privacy_by_name   text check (privacy_by_name is null or char_length(btrim(privacy_by_name)) between 2 and 120),
  privacy_relation  text check (privacy_relation is null or char_length(btrim(privacy_relation)) between 1 and 60),
  -- A patient on file's birth date, asked on their phone before anything is drawn.
  id_tries          smallint not null default 0 check (id_tries between 0 and 3),
  verified_at       timestamptz,
  status            text not null default 'preparing' check (status in ('preparing', 'out', 'sent', 'added', 'cancelled')),
  -- Bumped by every desk write (the second of two staff saves is told).
  rev               integer not null default 0 check (rev >= 0),
  created_by        uuid not null references staff(id),
  created_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  sent_at           timestamptz,
  -- The Send's own token: the same Send twice is 'again'.
  send_nonce        text check (send_nonce is null or send_nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  decided_by        uuid references staff(id) on delete set null,
  decided_at        timestamptz,
  added_as          text check (added_as in ('new', 'existing')),
  cancelled_by      uuid references staff(id) on delete set null,
  cancelled_at      timestamptz,
  cancel_reason     text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 120),
  unique (clinic_id, id),
  -- A patient on file has no page 1.
  check (target <> 'existing' or (patient_id is not null and answers is null and page1_done_at is null and privacy_as is null)),
  -- A privacy agreement names its person; 'none' agrees to nothing.
  check (privacy_as is null
         or (privacy_as = 'none' and privacy_version is null and privacy_at is null and privacy_by_name is null)
         or (privacy_as = 'patient' and privacy_version is not null and privacy_at is not null and privacy_by_name is not null)
         or (privacy_as in ('parent', 'court_guardian') and privacy_version is not null and privacy_at is not null
             and privacy_by_name is not null and privacy_relation is not null)),
  check (status <> 'added' or (patient_id is not null and decided_at is not null and added_as is not null)),
  check (status not in ('sent', 'added') or sent_at is not null),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index if not exists intake_ref on intake (clinic_id, ref);
create index if not exists intake_list on intake (clinic_id, status, created_at desc);
create index if not exists intake_patient on intake (clinic_id, patient_id) where patient_id is not null;
create index if not exists intake_purge on intake (created_at) where status in ('preparing', 'out', 'sent', 'cancelled');

create table if not exists clinic_tablet (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinic(id) on delete restrict,
  name           text not null check (char_length(btrim(name)) between 1 and 40),
  -- sha256 of the secret in the tablet's fl_ctab cookie; the secret itself is never stored.
  secret_sha256  text not null unique check (secret_sha256 ~ '^[0-9a-f]{64}$'),
  created_by     uuid not null references staff(id),
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  retired_at     timestamptz,
  retired_by     uuid references staff(id) on delete set null,
  unique (clinic_id, id),
  check (retired_by is null or retired_at is not null)
);

create table if not exists intake_link (
  -- 26 characters of the forms' alphabet (no i, l, o, 0 or 1): about 129 bits.
  token          text primary key check (token ~ '^[a-hjkmnp-z2-9]{26}$'),
  clinic_id      uuid not null references clinic(id) on delete restrict,
  intake_id      uuid not null,
  device         text not null check (device in ('phone', 'tablet', 'desk')),
  tablet_id      uuid,
  created_by     uuid not null references staff(id),
  created_at     timestamptz not null default now(),
  -- A phone's link must be opened by then (15 minutes).
  open_by        timestamptz not null,
  claimed_at     timestamptz,
  -- sha256 of the claiming device's secret (fl_idev, fl_ctab, or the one made for a handed-over desk).
  device_sha256  text check (device_sha256 is null or device_sha256 ~ '^[0-9a-f]{64}$'),
  last_seen_at   timestamptz,
  retired_at     timestamptz,
  retired_why    text check (retired_why in ('replaced', 'stopped', 'switched', 'cancelled', 'sent', 'idle', 'expired', 'locked')),
  foreign key (clinic_id, intake_id) references intake (clinic_id, id) on delete cascade,
  foreign key (clinic_id, tablet_id) references clinic_tablet (clinic_id, id) on delete restrict,
  check ((device = 'tablet') = (tablet_id is not null)),
  check ((claimed_at is null) = (device_sha256 is null)),
  check (device = 'phone' or claimed_at is not null),
  check ((retired_at is null) = (retired_why is null))
);
-- One live link per intake.
create unique index if not exists intake_link_live on intake_link (intake_id) where retired_at is null;
create index if not exists intake_link_tablet on intake_link (tablet_id) where retired_at is null;

create table if not exists consent_document (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinic(id) on delete restrict,
  -- CF-7K2FQ: printed on the form and its copy. Unique per clinic.
  ref               text not null check (ref ~ '^CF-[A-HJKMNP-Z2-9]{5}$'),
  version_id        text not null references consent_version(id),
  intake_id         uuid,
  patient_id        uuid references patient(id) on delete restrict,
  appointment_id    uuid references appointment(id) on delete set null,
  plan_item_id      uuid references treatment_plan_item(id) on delete set null,
  -- The clinic's part (readClinicPart), declared names only.
  fields            jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object' and octet_length(fields::text) <= 8192),
  -- The dentist who explains it: a treating dentist here with a PRC licence
  -- (every form but the general consent and the photos). Name and licence are
  -- copied by the trigger, never typed.
  dentist_id        uuid references staff(id),
  dentist_name      text check (dentist_name is null or char_length(btrim(dentist_name)) between 1 and 120),
  dentist_prc       text check (dentist_prc is null or char_length(btrim(dentist_prc)) between 1 and 40),
  -- The language planned; the attestation records the one used.
  explained_in      text check (explained_in in ('en', 'fil', 'other')),
  explained_other   text check (explained_other is null or char_length(btrim(explained_other)) between 1 and 40),
  interpreter       text check (interpreter is null or char_length(btrim(interpreter)) between 1 and 120),
  -- The page order (Template.order), never the desk's.
  sort              smallint not null check (sort between 1 and 1000),
  -- Bumped when the fields or the dentist change; a page signed at an older rev is signed again.
  rev               integer not null default 0 check (rev >= 0),
  prepared_by       uuid not null references staff(id),
  prepared_at       timestamptz not null default now(),
  changed_at        timestamptz,
  paper_printed_at  timestamptz,
  cancelled_by      uuid references staff(id) on delete set null,
  cancelled_at      timestamptz,
  cancel_why        text check (cancel_why in ('removed', 'renewed', 'minor', 'intake')),
  unique (clinic_id, id),
  foreign key (clinic_id, intake_id) references intake (clinic_id, id) on delete set null (intake_id),
  check ((cancelled_at is null) = (cancel_why is null)),
  check (explained_in is distinct from 'other' or explained_other is not null),
  -- A form belongs to an intake or to a record (or both).
  check (intake_id is not null or patient_id is not null)
);
create unique index if not exists consent_document_ref on consent_document (clinic_id, ref);
create index if not exists consent_document_patient on consent_document (clinic_id, patient_id, prepared_at desc) where patient_id is not null;
create index if not exists consent_document_intake on consent_document (intake_id) where intake_id is not null;
create index if not exists consent_document_visit on consent_document (appointment_id) where appointment_id is not null;

create table if not exists intake_page (
  intake_id         uuid not null,
  document_id       uuid not null,
  clinic_id         uuid not null references clinic(id) on delete restrict,
  state             text not null check (state in ('reading', 'read', 'question', 'agreed', 'refused', 'later')),
  -- The document's rev when the page was drawn and decided.
  doc_rev           integer not null,
  answers           jsonb check (answers is null or (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 4096)),
  signed_by_name    text check (signed_by_name is null or char_length(btrim(signed_by_name)) between 2 and 120),
  signed_as         text check (signed_as in ('patient', 'guardian')),
  method            text check (method in ('sign', 'mark')),
  relation          text check (relation is null or char_length(btrim(relation)) between 1 and 60),
  authority         text check (authority in ('parent', 'court_guardian', 'substitute', 'written', 'representative')),
  authority_ground  text check (authority_ground in ('died', 'absent', 'unfit')),
  -- For a substitute: who they are (grandparent, sibling_21, custodian_21).
  authority_note    text check (authority_note is null or char_length(btrim(authority_note)) between 1 and 200),
  explained_in      text check (explained_in is null or char_length(btrim(explained_in)) between 1 and 40),
  read_by           text check (read_by is null or char_length(btrim(read_by)) between 1 and 60),
  initials          text check (initials is null or initials ~ '^[[:alpha:]]{1,4}$'),
  strokes           jsonb check (strokes is null or (jsonb_typeof(strokes) = 'array' and jsonb_array_length(strokes) between 1 and 80 and octet_length(strokes::text) <= 120000)),
  snapshot          text check (snapshot is null or octet_length(snapshot) <= 65536),
  opened_at         timestamptz,
  decided_at        timestamptz,
  primary key (intake_id, document_id),
  foreign key (clinic_id, intake_id) references intake (clinic_id, id) on delete cascade,
  foreign key (clinic_id, document_id) references consent_document (clinic_id, id) on delete cascade,
  check ((state in ('agreed', 'refused')) = (snapshot is not null)),
  check (state not in ('agreed', 'refused') or (signed_by_name is not null and signed_as is not null and method is not null)),
  check (state not in ('agreed', 'refused', 'later', 'read') or decided_at is not null)
);

create table if not exists consent_signing (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinic(id) on delete restrict,
  document_id       uuid not null,
  intake_id         uuid,
  decision          text not null check (decision in ('agreed', 'refused')),
  channel           text not null check (channel in ('phone', 'tablet', 'desk', 'paper')),
  method            text not null default 'sign' check (method in ('sign', 'mark')),
  -- The canonical JSON of what was shown and decided (consent-seal.ts), and its two fingerprints,
  -- computed by the trigger below whatever the caller passed.
  snapshot          text not null check (octet_length(snapshot) <= 65536),
  snapshot_sha256   text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  seal_sha256       text not null check (seal_sha256 ~ '^[0-9a-f]{64}$'),
  answers           jsonb check (answers is null or (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 4096)),
  signed_by_name    text not null check (char_length(btrim(signed_by_name)) between 2 and 120),
  signed_as         text not null check (signed_as in ('patient', 'guardian')),
  relation          text check (relation is null or char_length(btrim(relation)) between 1 and 60),
  authority         text check (authority in ('parent', 'court_guardian', 'substitute', 'written', 'representative')),
  authority_ground  text check (authority_ground in ('died', 'absent', 'unfit')),
  authority_note    text check (authority_note is null or char_length(btrim(authority_note)) between 1 and 200),
  explained_in      text check (explained_in is null or char_length(btrim(explained_in)) between 1 and 40),
  read_by           text check (read_by is null or char_length(btrim(read_by)) between 1 and 60),
  strokes           jsonb check (strokes is null or (jsonb_typeof(strokes) = 'array' and jsonb_array_length(strokes) between 1 and 80 and octet_length(strokes::text) <= 120000)),
  -- On paper: the day on the paper and the scan, recorded by a staff member.
  signed_on         date,
  attachment_id     uuid references attachment(id) on delete restrict,
  -- Computed: a mark wants a witness, an authority but a parent's wants its papers checked.
  needs_confirm     text check (needs_confirm in ('witness', 'authority')),
  -- Who made the link it was signed through.
  link_by           uuid references staff(id),
  opened_at         timestamptz,
  decided_at        timestamptz not null,
  recorded_by       uuid references staff(id),
  signed_at         timestamptz not null default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, document_id) references consent_document (clinic_id, id) on delete restrict,
  foreign key (clinic_id, intake_id) references intake (clinic_id, id) on delete set null (intake_id),
  -- Paper, and only paper, has a day, a scan and a recorder; a device signing came through an intake.
  check ((channel = 'paper') = (signed_on is not null) and (channel = 'paper') = (attachment_id is not null)),
  check (channel <> 'paper' or recorded_by is not null),
  -- A mark, and every authority but a parent's, only on a clinic device or paper.
  check (channel <> 'phone' or (method = 'sign' and (authority is null or authority = 'parent'))),
  check ((signed_as = 'patient') = (authority is null)),
  check (signed_as = 'patient' or relation is not null),
  check (method = 'sign' or signed_as = 'patient'),
  check ((authority = 'substitute') = (authority_ground is not null))
);
create unique index if not exists consent_signing_page on consent_signing (intake_id, document_id) where intake_id is not null;
create index if not exists consent_signing_document on consent_signing (document_id, signed_at desc);

create table if not exists consent_attestation (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  document_id     uuid not null unique,
  dentist_id      uuid not null references staff(id),
  dentist_name    text not null check (char_length(btrim(dentist_name)) between 1 and 120),
  dentist_prc     text not null check (char_length(btrim(dentist_prc)) between 1 and 40),
  -- The language actually used, and who interpreted.
  explained_in    text not null check (char_length(btrim(explained_in)) between 1 and 40),
  interpreter     text check (interpreter is null or char_length(btrim(interpreter)) between 1 and 120),
  -- For a patient aged 7 to 17: what they said themself.
  assent          text check (assent in ('agreed', 'objected', 'not_asked')),
  fields_sha256   text not null check (fields_sha256 ~ '^[0-9a-f]{64}$'),
  attested_at     timestamptz not null default now(),
  foreign key (clinic_id, document_id) references consent_document (clinic_id, id) on delete restrict
);

create table if not exists consent_confirmation (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  signing_id      uuid not null unique,
  kind            text not null check (kind in ('witness', 'authority')),
  staff_id        uuid not null references staff(id),
  -- The court order, the ground's papers or the parent's letter, in Files.
  attachment_id   uuid references attachment(id) on delete restrict,
  note            text check (note is null or char_length(btrim(note)) between 1 and 200),
  confirmed_at    timestamptz not null default now(),
  foreign key (clinic_id, signing_id) references consent_signing (clinic_id, id) on delete restrict,
  check (kind <> 'authority' or attachment_id is not null)
);

create table if not exists capacity_note (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  patient_id      uuid not null references patient(id) on delete restrict,
  dentist_id      uuid not null references staff(id),
  reason          text not null check (char_length(btrim(reason)) between 1 and 300),
  recorded_at     timestamptz not null default now()
);
create index if not exists capacity_note_patient on capacity_note (clinic_id, patient_id, recorded_at desc);

create table if not exists consent_withdrawal (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  signing_id      uuid not null unique,
  told_by_name    text not null check (char_length(btrim(told_by_name)) between 1 and 120),
  how             text not null check (how in ('in_person', 'phone', 'text', 'letter', 'other')),
  note            text check (note is null or char_length(btrim(note)) between 1 and 200),
  recorded_by     uuid not null references staff(id),
  withdrawn_at    timestamptz not null default now(),
  foreign key (clinic_id, signing_id) references consent_signing (clinic_id, id) on delete restrict
);

create table if not exists consent_override (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  document_id     uuid not null,
  context         text not null check (context in ('plan_done', 'in_chair', 'strip')),
  state_then      text not null check (state_then in ('cancelled', 'to_sign', 'to_confirm', 'agreed', 'refused', 'no_photos', 'withdrawn', 'not_explained')),
  reason          text not null check (char_length(btrim(reason)) between 1 and 200),
  staff_id        uuid not null references staff(id),
  at              timestamptz not null default now(),
  foreign key (clinic_id, document_id) references consent_document (clinic_id, id) on delete restrict
);
create index if not exists consent_override_document on consent_override (document_id);

create table if not exists consent_chain (
  clinic_id       uuid not null references clinic(id) on delete restrict,
  seq             bigint not null check (seq >= 1),
  signing_id      uuid not null unique,
  seal_sha256     text not null check (seal_sha256 ~ '^[0-9a-f]{64}$'),
  prev_sha256     text not null check (prev_sha256 ~ '^[0-9a-f]{64}$'),
  chain_sha256    text not null check (chain_sha256 ~ '^[0-9a-f]{64}$'),
  at              timestamptz not null default now(),
  primary key (clinic_id, seq),
  foreign key (clinic_id, signing_id) references consent_signing (clinic_id, id) on delete restrict
);

create table if not exists intake_event (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  intake_id       uuid not null,
  kind            text not null check (kind in ('started', 'link', 'handover', 'opened', 'page1', 'reading', 'read', 'question', 'decided',
                                                'resign', 'sent', 'stopped', 'switched', 'cancelled', 'added', 'seen', 'expired', 'idle',
                                                'identity', 'locked', 'age_check', 'cancelled_doc', 'confirm', 'renewed', 'dismissed')),
  document_id     uuid,
  -- A word or two about what happened; never an answer.
  detail          text check (detail is null or char_length(btrim(detail)) between 1 and 120),
  staff_id        uuid references staff(id),
  at              timestamptz not null default now(),
  foreign key (clinic_id, intake_id) references intake (clinic_id, id) on delete cascade,
  foreign key (clinic_id, document_id) references consent_document (clinic_id, id) on delete cascade
);
create index if not exists intake_event_intake on intake_event (intake_id, at);

-- ---------------------------------------------------------------------------
-- 3. Where it meets the tables already there
-- ---------------------------------------------------------------------------
-- The health version an intake's page 1 became, at Add (answered_by 'patient', recorded_by null).
alter table medical_history add column if not exists intake_id uuid references intake(id) on delete restrict;
create index if not exists medical_history_intake on medical_history (intake_id) where intake_id is not null;

-- Page 1's privacy agreement as a patient_consent row at Add: channel 'intake'.
alter table patient_consent add column if not exists intake_id uuid references intake(id) on delete restrict;
alter table patient_consent drop constraint if exists patient_consent_channel_check;
alter table patient_consent add constraint patient_consent_channel_check
  check (channel in ('web', 'desk', 'sms', 'paper', 'form', 'intake'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_consent_intake_shape') then
    alter table patient_consent add constraint patient_consent_intake_shape
      check ((channel = 'intake') = (intake_id is not null)
             and (channel <> 'intake' or (recorded_by is not null and agreed_as is not null and coalesce(btrim(given_by_name), '') <> '')));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Row-level security: every new table is clinic data
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['intake', 'clinic_tablet', 'intake_link', 'consent_document', 'intake_page', 'consent_signing', 'consent_attestation',
                           'consent_confirmation', 'capacity_note', 'consent_withdrawal', 'consent_override', 'consent_chain', 'intake_event'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation') then
      execute format($p$create policy tenant_isolation on %I
        using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
        with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)$p$, t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------
-- The seal of a signing: sha256 of its lines (sealHex in src/lib/consent-seal.ts is the same sum).
create or replace function consent_seal(p_snapshot_sha256 text, p_ink text, p_name text, p_as text, p_method text, p_signed_at timestamptz)
returns text
language sql stable set search_path = public as $$
  select encode(sha256(convert_to(
    'flossify-seal-1' || E'\n' || coalesce(p_snapshot_sha256, '') || E'\n' || coalesce(p_ink, '') || E'\n' || coalesce(p_name, '') || E'\n'
    || coalesce(p_as, '') || E'\n' || coalesce(p_method, '') || E'\n'
    || to_char(p_signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'UTF8')), 'hex')
$$;

-- What was drawn or put on paper, as the seal reads it (inkOf in consent-seal.ts).
create or replace function consent_ink(p_strokes jsonb, p_channel text, p_signed_on date, p_attachment uuid)
returns text
language sql immutable set search_path = public as $$
  select case
    when p_channel = 'paper' then 'paper ' || to_char(p_signed_on, 'YYYY-MM-DD') || ' ' || p_attachment::text
    when p_strokes is null then 'none'
    else replace(p_strokes::text, ' ', '')
  end
$$;

-- One link of a clinic's chain (chainHex in consent-seal.ts).
create or replace function consent_chain_link(p_prev text, p_seal text, p_seq bigint)
returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_prev || p_seal || p_seq::text, 'UTF8')), 'hex')
$$;

-- A signature as strokes: 1–80 lines of [x, y] whole numbers in a 1000 × 400 box, at most 6000 points.
create or replace function consent_strokes_ok(p jsonb)
returns boolean
language plpgsql immutable set search_path = public as $$
declare line jsonb; pt jsonb; n integer := 0;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 80 or octet_length(p::text) > 120000 then return false; end if;
  for line in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(line) <> 'array' or jsonb_array_length(line) < 1 then return false; end if;
    for pt in select * from jsonb_array_elements(line) loop
      n := n + 1;
      if n > 6000 or jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) <> 2
         or jsonb_typeof(pt -> 0) <> 'number' or jsonb_typeof(pt -> 1) <> 'number'
         or (pt ->> 0) !~ '^[0-9]{1,4}$' or (pt ->> 1) !~ '^[0-9]{1,3}$'
         or (pt ->> 0)::integer > 1000 or (pt ->> 1)::integer > 400 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $$;

-- "Maria Clara Santos Jr.": the name as formName() writes it.
create or replace function person_name(p_first text, p_middle text, p_last text, p_suffix text)
returns text
language sql immutable set search_path = public as $$
  select concat_ws(' ', nullif(btrim(p_first), ''), nullif(btrim(p_middle), ''), nullif(btrim(p_last), ''), nullif(btrim(p_suffix), ''))
$$;

-- A treating dentist with access to this clinic, not disabled: (name, PRC licence), or nothing.
create or replace function treating_dentist(p_staff uuid, p_clinic uuid)
returns table (full_name text, prc text)
language sql stable set search_path = public as $$
  select s.full_name, nullif(btrim(coalesce(s.prc_licence, '')), '')
    from staff s join staff_access a on a.staff_id = s.id and a.clinic_id = p_clinic
   where s.id = p_staff and s.disabled_at is null and s.role in ('owner', 'dentist', 'associate')
$$;

-- The patient's birth date for a form: the record's, or an intake's page 1 before the record exists.
create or replace function consent_birth_date(p_patient uuid, p_intake uuid)
returns date
language plpgsql stable set search_path = public as $$
declare b date; a text;
begin
  if p_patient is not null then
    select birth_date into b from patient where id = p_patient;
    return b;
  end if;
  select answers ->> 'birth_date' into a from intake where id = p_intake;
  if a is null or a !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin
    return a::date;
  exception when others then
    return null;
  end;
end $$;

-- Whole years on a Manila day.
create or replace function years_on(p_birth date, p_day date)
returns integer
language sql immutable set search_path = public as $$
  select case when p_birth is null then null else extract(year from age(p_day, p_birth))::integer end
$$;

-- Who may sign (§2.3), for a decision and for a paper signing alike. Null when allowed; otherwise a word
-- naming the rule (never a name or an answer).
create or replace function consent_signer_problem(p_minor boolean, p_channel text, p_as text, p_method text, p_authority text,
                                                  p_ground text, p_note text, p_patient uuid, p_clinic uuid)
returns text
language plpgsql stable set search_path = public as $$
begin
  if p_minor is null then return 'no_birth_date'; end if;
  if p_as not in ('patient', 'guardian') or p_method not in ('sign', 'mark') then return 'bad_signer'; end if;
  if p_as = 'patient' and p_authority is not null then return 'bad_signer'; end if;
  if p_as = 'guardian' and p_authority is null then return 'bad_signer'; end if;
  if p_minor then
    if p_as = 'patient' then return 'minor_signs'; end if;
    if p_authority not in ('parent', 'court_guardian', 'substitute', 'written') then return 'not_for_a_minor'; end if;
  else
    if p_as = 'guardian' and p_authority not in ('court_guardian', 'representative') then return 'not_for_an_adult'; end if;
  end if;
  if p_method = 'mark' and (p_as <> 'patient' or p_minor) then return 'mark'; end if;
  if p_channel = 'phone' and (p_method <> 'sign' or coalesce(p_authority, 'parent') <> 'parent') then return 'clinic_device_only'; end if;
  if p_authority = 'substitute' and (coalesce(p_ground, '') not in ('died', 'absent', 'unfit')
                                     or coalesce(p_note, '') not in ('grandparent', 'sibling_21', 'custodian_21')) then
    return 'substitute';
  end if;
  if p_authority = 'representative' and (p_patient is null or not exists (
       select 1 from capacity_note c where c.patient_id = p_patient and c.clinic_id = p_clinic and c.recorded_at > now() - interval '30 days')) then
    return 'no_capacity_note';
  end if;
  return null;
end $$;

-- Page 1 as the privacy screen sends it, checked again (src/lib/intake-def.ts read it first). Null when it
-- holds; otherwise a word naming what does not (never an answer).
create or replace function intake_page1_problem(a jsonb, p_today date)
returns text
language plpgsql stable set search_path = public as $$
declare b date; y integer; k text;
begin
  if a is null or jsonb_typeof(a) <> 'object' then return 'shape'; end if;
  if coalesce(a ->> 'v', '') = '' or char_length(a ->> 'v') > 40 then return 'version'; end if;
  foreach k in array array['first_name', 'last_name'] loop
    if coalesce(char_length(btrim(a ->> k)), 0) not between 1 and 60 then return 'name'; end if;
  end loop;
  if coalesce(a ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'birth_date'; end if;
  begin
    b := (a ->> 'birth_date')::date;
  exception when others then
    return 'birth_date';
  end;
  if b > p_today or b < date '1900-01-01' then return 'birth_date'; end if;
  y := years_on(b, p_today);
  if coalesce(a ->> 'sex', '') not in ('female', 'male', 'other', 'undisclosed') then return 'sex'; end if;
  if coalesce(a ->> 'mobile', '') !~ '^09[0-9]{9}$' then return 'mobile'; end if;
  foreach k in array array['address', 'city', 'province', 'emergency_name', 'emergency_relation', 'emergency_mobile'] loop
    if coalesce(btrim(a ->> k), '') = '' then return k; end if;
  end loop;
  if y < 18 and (coalesce(btrim(a ->> 'guardian_name'), '') = '' or coalesce(btrim(a ->> 'guardian_relation'), '') = ''
                 or coalesce(a ->> 'guardian_mobile', '') !~ '^09[0-9]{9}$') then
    return 'guardian';
  end if;
  if jsonb_typeof(a -> 'allergies') is distinct from 'array' or jsonb_typeof(a -> 'conditions') is distinct from 'array'
     or jsonb_typeof(a -> 'medicines') is distinct from 'array' then
    return 'health';
  end if;
  -- Who agreed to the notice: an adult themself; for a minor a parent, a court-appointed guardian, or nobody yet.
  if coalesce(a ->> 'privacy_as', '') not in ('patient', 'parent', 'court_guardian', 'none') then return 'privacy_as'; end if;
  if y >= 18 and a ->> 'privacy_as' <> 'patient' then return 'privacy_as'; end if;
  if y < 18 and a ->> 'privacy_as' = 'patient' then return 'privacy_as'; end if;
  if a ->> 'privacy_as' <> 'none' then
    if coalesce(a ->> 'consent_privacy', '') <> 'true' then return 'privacy_tick'; end if;
    if a ->> 'privacy_as' = 'patient'
       and a ->> 'privacy_by_name' is distinct from person_name(a ->> 'first_name', a ->> 'middle_name', a ->> 'last_name', a ->> 'suffix') then
      return 'privacy_name';
    end if;
    if a ->> 'privacy_as' <> 'patient' and (coalesce(char_length(btrim(a ->> 'privacy_by_name')), 0) not between 2 and 120
                                            or coalesce(char_length(btrim(a ->> 'privacy_relation')), 0) not between 1 and 60) then
      return 'privacy_name';
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------------
-- intake: identity never changes; added and cancelled are final; the moves; the patient once, this clinic's,
-- not archived; the visit is that patient's. A desk insert is made by someone who may edit records here.
create or replace function intake_guard() returns trigger
language plpgsql set search_path = public as $$
declare ok boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'preparing' then raise exception 'intake: a new intake starts as preparing' using errcode = 'check_violation'; end if;
    if not staff_can(new.created_by, new.clinic_id, 'records.edit') then
      raise exception 'intake: only someone who may edit records here starts one' using errcode = 'insufficient_privilege';
    end if;
  else
    if new.id <> old.id or new.clinic_id <> old.clinic_id or new.ref <> old.ref or new.target <> old.target
       or new.form_version <> old.form_version or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'intake: who and what an intake is never changes' using errcode = 'check_violation';
    end if;
    if old.status in ('added', 'cancelled') then
      -- Final. Only a person's reference going when that person's account is deleted.
      ok := (new.decided_by is null or new.decided_by = old.decided_by) and (new.cancelled_by is null or new.cancelled_by = old.cancelled_by)
            and (row(new.status, new.patient_id, new.appointment_id, new.label, new.desk_minor, new.came_with, new.answers, new.page1_done_at,
                     new.privacy_version, new.privacy_at, new.privacy_as, new.privacy_by_name, new.privacy_relation, new.id_tries, new.verified_at,
                     new.rev, new.last_activity_at, new.sent_at, new.send_nonce, new.decided_at, new.added_as, new.cancelled_at, new.cancel_reason)
                 is not distinct from
                 row(old.status, old.patient_id, old.appointment_id, old.label, old.desk_minor, old.came_with, old.answers, old.page1_done_at,
                     old.privacy_version, old.privacy_at, old.privacy_as, old.privacy_by_name, old.privacy_relation, old.id_tries, old.verified_at,
                     old.rev, old.last_activity_at, old.sent_at, old.send_nonce, old.decided_at, old.added_as, old.cancelled_at, old.cancel_reason));
      if not ok then raise exception 'intake: an added or cancelled intake does not change' using errcode = 'check_violation'; end if;
      return new;
    end if;
    if new.status <> old.status and not (
         (old.status = 'preparing' and new.status in ('out', 'cancelled'))
      or (old.status = 'out' and new.status in ('preparing', 'sent', 'added', 'cancelled'))
      or (old.status = 'sent' and new.status in ('added', 'cancelled'))) then
      raise exception 'intake: it cannot go from % to %', old.status, new.status using errcode = 'check_violation';
    end if;
    if old.patient_id is not null and new.patient_id is distinct from old.patient_id then
      raise exception 'intake: the patient is set once' using errcode = 'check_violation';
    end if;
  end if;
  if new.patient_id is not null and (tg_op = 'INSERT' or new.patient_id is distinct from old.patient_id) then
    if not exists (select 1 from patient p where p.id = new.patient_id and p.clinic_id = new.clinic_id and p.archived_at is null) then
      raise exception 'intake: the patient is not on file at this clinic' using errcode = 'check_violation';
    end if;
  end if;
  if new.appointment_id is not null and (tg_op = 'INSERT' or new.appointment_id is distinct from old.appointment_id or new.patient_id is distinct from old.patient_id) then
    if not exists (select 1 from appointment ap where ap.id = new.appointment_id and ap.clinic_id = new.clinic_id
                     and (new.patient_id is null or ap.patient_id = new.patient_id)) then
      raise exception 'intake: the visit is not this patient''s at this clinic' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists intake_guard on intake;
create trigger intake_guard before insert or update on intake for each row execute function intake_guard();

-- clinic_tablet: a tablet is named and retired, never moved or given another secret.
create or replace function clinic_tablet_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id <> old.id or new.clinic_id <> old.clinic_id or new.secret_sha256 <> old.secret_sha256
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'clinic_tablet: a tablet''s secret and clinic never change' using errcode = 'check_violation';
  end if;
  if old.retired_at is not null and (new.retired_at is distinct from old.retired_at or new.name <> old.name) then
    raise exception 'clinic_tablet: a removed tablet stays removed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists clinic_tablet_guard on clinic_tablet;
create trigger clinic_tablet_guard before update on clinic_tablet for each row execute function clinic_tablet_guard();

-- intake_link: made only while the intake is preparing or out; a clinic tablet's and a desk's link are made
-- claimed (the tablet's with the tablet's own secret); a phone's is claimed once; retired once; nothing else
-- changes. A new phone link gives a patient on file three new tries at the birth date. Security definer: that
-- reset writes a column the app may not.
create or replace function intake_link_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare i intake; t clinic_tablet;
begin
  if tg_op = 'INSERT' then
    select * into i from intake where id = new.intake_id and clinic_id = new.clinic_id;
    if not found or i.status not in ('preparing', 'out') then
      raise exception 'intake_link: the intake is not open for a link' using errcode = 'check_violation';
    end if;
    new.created_at := now();
    new.open_by := now() + interval '15 minutes';
    new.last_seen_at := null;
    new.retired_at := null;
    new.retired_why := null;
    if new.device = 'tablet' then
      select * into t from clinic_tablet where id = new.tablet_id and clinic_id = new.clinic_id and retired_at is null;
      if not found then raise exception 'intake_link: not a clinic tablet here' using errcode = 'check_violation'; end if;
      new.device_sha256 := t.secret_sha256;
      new.claimed_at := now();
      new.last_seen_at := now();
    elsif new.device = 'desk' then
      if new.device_sha256 is null then raise exception 'intake_link: a handed-over desk needs its secret' using errcode = 'check_violation'; end if;
      new.claimed_at := now();
      new.last_seen_at := now();
    else
      new.claimed_at := null;
      new.device_sha256 := null;
      update intake set id_tries = 0 where id = new.intake_id and verified_at is null and id_tries <> 0;
    end if;
    return new;
  end if;
  if new.token <> old.token or new.clinic_id <> old.clinic_id or new.intake_id <> old.intake_id or new.device <> old.device
     or new.tablet_id is distinct from old.tablet_id or new.created_by <> old.created_by or new.created_at <> old.created_at or new.open_by <> old.open_by then
    raise exception 'intake_link: a link never changes what it is' using errcode = 'check_violation';
  end if;
  if old.retired_at is not null and row(new.*) is distinct from row(old.*) then
    raise exception 'intake_link: a retired link stays retired' using errcode = 'check_violation';
  end if;
  if old.claimed_at is not null and (new.claimed_at is distinct from old.claimed_at or new.device_sha256 is distinct from old.device_sha256) then
    raise exception 'intake_link: a link is claimed once' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists intake_link_guard on intake_link;
create trigger intake_link_guard before insert or update on intake_link for each row execute function intake_link_guard();

-- consent_document: the words are a treatment consent or a document; every form but the general consent and
-- the photos names a treating dentist here with a PRC licence (name and licence copied from the staff row);
-- the patient, the intake, the visit and the plan line are this clinic's; what a form is never changes; once
-- attested, signed or printed for paper its clinic part is frozen; a signed form is never cancelled, and
-- moves to another intake only to be signed again after a refusal or a withdrawal. A change to the fields or
-- the dentist bumps rev.
create or replace function consent_document_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  v consent_version;
  d record;
  signed boolean := false;
  frozen boolean := false;
  latest consent_signing;
  changed_part boolean;
begin
  select * into v from consent_version where id = new.version_id;
  if not found or v.kind not in ('treatment', 'document') then
    raise exception 'consent_document: % is not a consent form', new.version_id using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if not staff_can(new.prepared_by, new.clinic_id, 'records.edit') then
      raise exception 'consent_document: only someone who may edit records here prepares one' using errcode = 'insufficient_privilege';
    end if;
    new.rev := 0;
    new.prepared_at := now();
    new.changed_at := null;
    new.paper_printed_at := null;
    new.cancelled_at := null; new.cancelled_by := null; new.cancel_why := null;
  else
    if new.id <> old.id or new.clinic_id <> old.clinic_id or new.ref <> old.ref or new.version_id <> old.version_id
       or new.prepared_by <> old.prepared_by or new.prepared_at <> old.prepared_at then
      raise exception 'consent_document: what a form is never changes' using errcode = 'check_violation';
    end if;
    if old.patient_id is not null and new.patient_id is distinct from old.patient_id then
      raise exception 'consent_document: the patient is set once' using errcode = 'check_violation';
    end if;
    signed := exists (select 1 from consent_signing s where s.document_id = old.id);
    frozen := signed or old.paper_printed_at is not null or exists (select 1 from consent_attestation a where a.document_id = old.id);
    changed_part := new.fields is distinct from old.fields or new.dentist_id is distinct from old.dentist_id
                    or new.explained_in is distinct from old.explained_in or new.explained_other is distinct from old.explained_other
                    or new.interpreter is distinct from old.interpreter;
    -- A visit or a plan line may go (it was deleted: the foreign key clears it), never change.
    if frozen and (changed_part or new.sort <> old.sort
                   or (new.appointment_id is not null and new.appointment_id is distinct from old.appointment_id)
                   or (new.plan_item_id is not null and new.plan_item_id is distinct from old.plan_item_id)) then
      raise exception 'consent_document: the form was explained, signed or printed; its details are fixed' using errcode = 'check_violation';
    end if;
    if old.paper_printed_at is not null and new.paper_printed_at is distinct from old.paper_printed_at then
      raise exception 'consent_document: printed once' using errcode = 'check_violation';
    end if;
    if old.cancelled_at is not null and (new.cancelled_at is distinct from old.cancelled_at or new.cancel_why is distinct from old.cancel_why) then
      raise exception 'consent_document: a cancelled form stays cancelled' using errcode = 'check_violation';
    end if;
    if old.cancelled_at is null and new.cancelled_at is not null and signed then
      raise exception 'consent_document: a signed form cannot be cancelled' using errcode = 'check_violation';
    end if;
    if signed and new.intake_id is not null and new.intake_id is distinct from old.intake_id then
      select * into latest from consent_signing s where s.document_id = old.id order by s.signed_at desc, s.id desc limit 1;
      if not (latest.decision = 'refused' or exists (select 1 from consent_withdrawal w where w.signing_id = latest.id)) then
        raise exception 'consent_document: only a refused or withdrawn form is signed again' using errcode = 'check_violation';
      end if;
    end if;
    if changed_part then
      new.rev := old.rev + 1;
      new.changed_at := now();
    else
      new.rev := old.rev;
      new.changed_at := old.changed_at;
    end if;
  end if;

  if new.patient_id is not null and (tg_op = 'INSERT' or new.patient_id is distinct from old.patient_id) then
    if not exists (select 1 from patient p where p.id = new.patient_id and p.clinic_id = new.clinic_id and p.archived_at is null) then
      raise exception 'consent_document: the patient is not on file at this clinic' using errcode = 'check_violation';
    end if;
  end if;
  if new.intake_id is not null and (tg_op = 'INSERT' or new.intake_id is distinct from old.intake_id) then
    if not exists (select 1 from intake i where i.id = new.intake_id and i.clinic_id = new.clinic_id and i.status in ('preparing', 'out')) then
      raise exception 'consent_document: the intake is not open' using errcode = 'check_violation';
    end if;
  end if;
  if new.appointment_id is not null and (tg_op = 'INSERT' or new.appointment_id is distinct from old.appointment_id or new.patient_id is distinct from old.patient_id) then
    if not exists (select 1 from appointment ap where ap.id = new.appointment_id and ap.clinic_id = new.clinic_id
                     and (new.patient_id is null or ap.patient_id = new.patient_id)) then
      raise exception 'consent_document: the visit is not this patient''s at this clinic' using errcode = 'check_violation';
    end if;
  end if;
  if new.plan_item_id is not null and (tg_op = 'INSERT' or new.plan_item_id is distinct from old.plan_item_id or new.patient_id is distinct from old.patient_id) then
    if not exists (select 1 from treatment_plan_item t where t.id = new.plan_item_id and t.clinic_id = new.clinic_id
                     and (new.patient_id is null or t.patient_id = new.patient_id)) then
      raise exception 'consent_document: the plan line is not this patient''s at this clinic' using errcode = 'check_violation';
    end if;
  end if;

  if v.kind = 'document' and v.code <> 'photos' and new.dentist_id is null then
    raise exception 'consent_document: the form names the dentist who explains it' using errcode = 'check_violation';
  end if;
  if new.dentist_id is null then
    new.dentist_name := null;
    new.dentist_prc := null;
  elsif tg_op = 'INSERT' or new.dentist_id is distinct from old.dentist_id then
    select * into d from treating_dentist(new.dentist_id, new.clinic_id);
    if not found then
      raise exception 'consent_document: not a treating dentist at this clinic' using errcode = 'check_violation';
    end if;
    if v.kind = 'document' and d.prc is null then
      raise exception 'consent_document: the dentist needs a PRC licence on file' using errcode = 'check_violation';
    end if;
    new.dentist_name := d.full_name;
    new.dentist_prc := d.prc;
  else
    new.dentist_name := old.dentist_name;
    new.dentist_prc := old.dentist_prc;
  end if;
  return new;
end $$;
drop trigger if exists consent_document_guard on consent_document;
create trigger consent_document_guard before insert or update on consent_document for each row execute function consent_document_guard();

-- consent_attestation: only the form's own dentist, treating here with a PRC licence; never for the general
-- consent or the photos; the form open, unsigned and not printed; assent for a patient aged 7 to 17. The
-- trigger copies the dentist's name and licence, fingerprints the fields it froze, and sets the time.
create or replace function consent_attestation_check() returns trigger
language plpgsql set search_path = public as $$
declare d consent_document; v consent_version; who record; y integer;
begin
  select * into d from consent_document where id = new.document_id and clinic_id = new.clinic_id for update;
  if not found then raise exception 'consent_attestation: not this clinic''s form' using errcode = 'check_violation'; end if;
  select * into v from consent_version where id = d.version_id;
  if v.kind <> 'document' or v.code = 'photos' then
    raise exception 'consent_attestation: this form is not explained and confirmed by a dentist' using errcode = 'check_violation';
  end if;
  if d.cancelled_at is not null then raise exception 'consent_attestation: the form was cancelled' using errcode = 'check_violation'; end if;
  if d.paper_printed_at is not null or exists (select 1 from consent_signing s where s.document_id = d.id) then
    raise exception 'consent_attestation: the form was already signed or printed' using errcode = 'check_violation';
  end if;
  if new.dentist_id is distinct from d.dentist_id then
    raise exception 'consent_attestation: only the dentist named on the form confirms it' using errcode = 'insufficient_privilege';
  end if;
  select * into who from treating_dentist(new.dentist_id, new.clinic_id);
  if not found or who.prc is null then
    raise exception 'consent_attestation: a treating dentist here with a PRC licence confirms it' using errcode = 'insufficient_privilege';
  end if;
  y := years_on(consent_birth_date(d.patient_id, d.intake_id), (now() at time zone 'Asia/Manila')::date);
  if y between 7 and 17 and new.assent is null then
    raise exception 'consent_attestation: say what the patient said (7 to 17)' using errcode = 'check_violation';
  end if;
  new.dentist_name := who.full_name;
  new.dentist_prc := who.prc;
  new.fields_sha256 := encode(sha256(convert_to(d.fields::text, 'UTF8')), 'hex');
  new.attested_at := date_trunc('milliseconds', now());
  return new;
end $$;
drop trigger if exists consent_attestation_check on consent_attestation;
create trigger consent_attestation_check before insert on consent_attestation for each row execute function consent_attestation_check();

-- consent_signing: the form is open and this clinic's; a device signing belongs to the form's intake; a form
-- agreed and not withdrawn is not signed over; a dentist's form was explained and confirmed before the
-- decision; paper was printed, dated between the print and today, its scan this patient's and uploaded after
-- the print; the strokes are a signature (none only for paper or a photos refusal); who signs is allowed;
-- the snapshot is of this form, this decision, these fields, this signer and this attestation. The trigger
-- computes needs_confirm, the time, and both fingerprints, whatever the caller passed.
create or replace function consent_signing_check() returns trigger
language plpgsql set search_path = public as $$
declare
  d consent_document; v consent_version; a consent_attestation; latest consent_signing;
  snap jsonb; birth date; problem text; day date;
begin
  select * into d from consent_document where id = new.document_id and clinic_id = new.clinic_id for update;
  if not found then raise exception 'consent_signing: not this clinic''s form' using errcode = 'check_violation'; end if;
  if d.cancelled_at is not null then raise exception 'consent_signing: the form was cancelled' using errcode = 'check_violation'; end if;
  select * into v from consent_version where id = d.version_id;
  if new.channel <> 'paper' and new.intake_id is distinct from d.intake_id then
    raise exception 'consent_signing: a signing on a device comes through the form''s intake' using errcode = 'check_violation';
  end if;
  if new.channel = 'paper' then new.intake_id := null; end if;
  select * into latest from consent_signing s where s.document_id = d.id order by s.signed_at desc, s.id desc limit 1;
  if found and latest.decision = 'agreed' and not exists (select 1 from consent_withdrawal w where w.signing_id = latest.id) then
    raise exception 'consent_signing: the form is already agreed' using errcode = 'check_violation';
  end if;
  new.signed_at := date_trunc('milliseconds', now());
  if new.channel = 'paper' then new.decided_at := new.signed_at; end if;
  if v.kind = 'document' and v.code <> 'photos' then
    select * into a from consent_attestation where document_id = d.id;
    if not found or a.attested_at > new.decided_at then
      raise exception 'consent_signing: the dentist has not explained and confirmed this form' using errcode = 'check_violation';
    end if;
  end if;
  if new.channel = 'paper' then
    if d.paper_printed_at is null then raise exception 'consent_signing: print the form for signing first' using errcode = 'check_violation'; end if;
    day := (now() at time zone 'Asia/Manila')::date;
    if new.signed_on < (d.paper_printed_at at time zone 'Asia/Manila')::date or new.signed_on > day then
      raise exception 'consent_signing: the day on the paper is between the print and today' using errcode = 'check_violation';
    end if;
    if d.patient_id is null or not exists (select 1 from attachment f where f.id = new.attachment_id and f.clinic_id = d.clinic_id
                                             and f.patient_id = d.patient_id and f.removed_at is null and f.created_at >= d.paper_printed_at) then
      raise exception 'consent_signing: the scan is this patient''s, uploaded after the print' using errcode = 'check_violation';
    end if;
  end if;
  if new.strokes is null then
    if new.channel <> 'paper' and not (v.code = 'photos' and new.decision = 'refused') then
      raise exception 'consent_signing: a signature is needed' using errcode = 'check_violation';
    end if;
  elsif not consent_strokes_ok(new.strokes) then
    raise exception 'consent_signing: not a signature' using errcode = 'check_violation';
  end if;
  birth := consent_birth_date(d.patient_id, d.intake_id);
  if v.code = 'whitening' and years_on(birth, (now() at time zone 'Asia/Manila')::date) < 18 then
    raise exception 'consent_signing: whitening is not for under 18' using errcode = 'check_violation';
  end if;
  problem := consent_signer_problem(years_on(birth, (now() at time zone 'Asia/Manila')::date) < 18, new.channel, new.signed_as, new.method,
                                    new.authority, new.authority_ground, new.authority_note, d.patient_id, d.clinic_id);
  if problem is not null then
    raise exception 'consent_signing: who signs is not allowed (%)', problem using errcode = 'check_violation';
  end if;
  begin
    snap := new.snapshot::jsonb;
  exception when others then
    raise exception 'consent_signing: the snapshot is not JSON' using errcode = 'check_violation';
  end;
  if jsonb_typeof(snap) <> 'object' or snap ->> 'document' is distinct from d.id::text or snap ->> 'version' is distinct from d.version_id
     or snap ->> 'decision' is distinct from new.decision or (snap -> 'fields') is distinct from d.fields
     or snap -> 'signer' ->> 'name' is distinct from new.signed_by_name
     or (a.id is not null and (snap -> 'attested' ->> 'at') is distinct from to_char(a.attested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
    raise exception 'consent_signing: the snapshot is not of this form and this decision' using errcode = 'check_violation';
  end if;
  new.needs_confirm := case when new.method = 'mark' then 'witness'
                            when new.authority in ('court_guardian', 'substitute', 'written') then 'authority' end;
  new.snapshot_sha256 := encode(sha256(convert_to(new.snapshot, 'UTF8')), 'hex');
  new.seal_sha256 := consent_seal(new.snapshot_sha256, consent_ink(new.strokes, new.channel, new.signed_on, new.attachment_id),
                                  new.signed_by_name, new.signed_as, new.method, new.signed_at);
  return new;
end $$;
drop trigger if exists consent_signing_check on consent_signing;
create trigger consent_signing_check before insert on consent_signing for each row execute function consent_signing_check();

-- consent_confirmation: it is what the signing needs; the confirmer may edit records here and is not the one
-- who signed; an authority's papers are this patient's file.
create or replace function consent_confirmation_check() returns trigger
language plpgsql set search_path = public as $$
declare s consent_signing; d consent_document; who text;
begin
  select * into s from consent_signing where id = new.signing_id and clinic_id = new.clinic_id;
  if not found then raise exception 'consent_confirmation: not this clinic''s signing' using errcode = 'check_violation'; end if;
  if s.needs_confirm is distinct from new.kind then
    raise exception 'consent_confirmation: this signing does not need that' using errcode = 'check_violation';
  end if;
  if not staff_can(new.staff_id, new.clinic_id, 'records.edit') then
    raise exception 'consent_confirmation: only someone who may edit records here confirms' using errcode = 'insufficient_privilege';
  end if;
  select full_name into who from staff where id = new.staff_id;
  if new.staff_id = s.recorded_by or lower(btrim(who)) = lower(btrim(s.signed_by_name)) then
    raise exception 'consent_confirmation: the person who signed does not confirm it' using errcode = 'check_violation';
  end if;
  if new.attachment_id is not null then
    select * into d from consent_document where id = s.document_id;
    if d.patient_id is null or not exists (select 1 from attachment f where f.id = new.attachment_id and f.clinic_id = d.clinic_id
                                             and f.patient_id = d.patient_id and f.removed_at is null) then
      raise exception 'consent_confirmation: the papers are this patient''s file' using errcode = 'check_violation';
    end if;
  end if;
  new.confirmed_at := now();
  return new;
end $$;
drop trigger if exists consent_confirmation_check on consent_confirmation;
create trigger consent_confirmation_check before insert on consent_confirmation for each row execute function consent_confirmation_check();

-- capacity_note: a treating dentist here with a PRC licence, about an adult patient on file here.
create or replace function capacity_note_check() returns trigger
language plpgsql set search_path = public as $$
declare who record; b date;
begin
  select * into who from treating_dentist(new.dentist_id, new.clinic_id);
  if not found or who.prc is null then
    raise exception 'capacity_note: a treating dentist here with a PRC licence records it' using errcode = 'insufficient_privilege';
  end if;
  select birth_date into b from patient where id = new.patient_id and clinic_id = new.clinic_id and archived_at is null;
  if not found then raise exception 'capacity_note: the patient is not on file here' using errcode = 'check_violation'; end if;
  if b is null or years_on(b, (now() at time zone 'Asia/Manila')::date) < 18 then
    raise exception 'capacity_note: only for an adult patient, with a birth date on file' using errcode = 'check_violation';
  end if;
  new.recorded_at := now();
  return new;
end $$;
drop trigger if exists capacity_note_check on capacity_note;
create trigger capacity_note_check before insert on capacity_note for each row execute function capacity_note_check();

-- consent_withdrawal: only the latest signing on its form, only when it is agreed; recorded by someone who may
-- edit records here.
create or replace function consent_withdrawal_check() returns trigger
language plpgsql set search_path = public as $$
declare s consent_signing; latest uuid;
begin
  select * into s from consent_signing where id = new.signing_id and clinic_id = new.clinic_id;
  if not found then raise exception 'consent_withdrawal: not this clinic''s signing' using errcode = 'check_violation'; end if;
  select id into latest from consent_signing where document_id = s.document_id order by signed_at desc, id desc limit 1;
  if latest <> s.id or s.decision <> 'agreed' then
    raise exception 'consent_withdrawal: only the latest agreement on a form is withdrawn' using errcode = 'check_violation';
  end if;
  if not staff_can(new.recorded_by, new.clinic_id, 'records.edit') then
    raise exception 'consent_withdrawal: only someone who may edit records here records it' using errcode = 'insufficient_privilege';
  end if;
  new.withdrawn_at := now();
  return new;
end $$;
drop trigger if exists consent_withdrawal_check on consent_withdrawal;
create trigger consent_withdrawal_check before insert on consent_withdrawal for each row execute function consent_withdrawal_check();

-- consent_override: the form is this clinic's, the reason is given, by someone who may edit records here.
create or replace function consent_override_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from consent_document d where d.id = new.document_id and d.clinic_id = new.clinic_id) then
    raise exception 'consent_override: not this clinic''s form' using errcode = 'check_violation';
  end if;
  if not staff_can(new.staff_id, new.clinic_id, 'records.edit') then
    raise exception 'consent_override: only someone who may edit records here goes ahead' using errcode = 'insufficient_privilege';
  end if;
  new.at := now();
  return new;
end $$;
drop trigger if exists consent_override_check on consent_override;
create trigger consent_override_check before insert on consent_override for each row execute function consent_override_check();

-- ---------------------------------------------------------------------------
-- 7. The chain (§4.6): a signing joins its clinic's chain when it becomes part of a record — at insert when its
-- form already has a patient, otherwise when the form's patient is set (Add). Security definer: the app may
-- read the chain and never write it.
-- ---------------------------------------------------------------------------
create or replace function consent_chain_append(p_clinic uuid, p_signing uuid, p_seal text)
returns void
language plpgsql security definer set search_path = public as $$
declare last consent_chain; n bigint; prev text;
begin
  if exists (select 1 from consent_chain where signing_id = p_signing) then return; end if;
  perform pg_advisory_xact_lock(hashtext('consent-chain:' || p_clinic::text));
  select * into last from consent_chain where clinic_id = p_clinic order by seq desc limit 1;
  n := coalesce(last.seq, 0) + 1;
  prev := coalesce(last.chain_sha256, repeat('0', 64));
  insert into consent_chain (clinic_id, seq, signing_id, seal_sha256, prev_sha256, chain_sha256, at)
  values (p_clinic, n, p_signing, p_seal, prev, consent_chain_link(prev, p_seal, n), now());
end $$;
revoke all on function consent_chain_append(uuid, uuid, text) from public;

create or replace function consent_signing_chain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from consent_document d where d.id = new.document_id and d.patient_id is not null) then
    perform consent_chain_append(new.clinic_id, new.id, new.seal_sha256);
  end if;
  return null;
end $$;
drop trigger if exists consent_signing_chain on consent_signing;
create trigger consent_signing_chain after insert on consent_signing for each row execute function consent_signing_chain();

create or replace function consent_document_chain() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if old.patient_id is null and new.patient_id is not null then
    for s in select id, seal_sha256 from consent_signing where document_id = new.id order by signed_at, id loop
      perform consent_chain_append(new.clinic_id, s.id, s.seal_sha256);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists consent_document_chain on consent_document;
create trigger consent_document_chain after update of patient_id on consent_document for each row execute function consent_document_chain();

-- The last link on or before a Manila day, for the Close the day sheet: "Consent forms: 1432 · 7C1E-09AB-44".
create or replace function consent_chain_head(p_clinic uuid, p_day date)
returns table (seq bigint, chain_sha256 text, at timestamptz)
language sql stable set search_path = public as $$
  select c.seq, c.chain_sha256, c.at from consent_chain c
   where c.clinic_id = p_clinic and c.at < ((p_day + 1)::timestamp at time zone 'Asia/Manila')
   order by c.seq desc limit 1
$$;

-- Walk a clinic's whole chain, recomputing every seal from its signing and every link from the seals: a stored
-- snapshot or seal edited anywhere breaks the chain from there on. `first_bad` is the first link that does not
-- recompute (null when all do).
create or replace function consent_chain_check(p_clinic uuid)
returns table (ok boolean, links bigint, first_bad bigint)
language plpgsql stable set search_path = public as $$
declare r record; prev text := repeat('0', 64); n bigint := 0; bad bigint := null; seal text; expect bigint := 1;
begin
  for r in select c.*, s.snapshot, s.snapshot_sha256 as s_snap, s.seal_sha256 as s_seal, s.strokes, s.channel, s.signed_on, s.attachment_id,
                  s.signed_by_name, s.signed_as, s.method, s.signed_at
             from consent_chain c join consent_signing s on s.id = c.signing_id
            where c.clinic_id = p_clinic order by c.seq loop
    n := n + 1;
    seal := consent_seal(encode(sha256(convert_to(r.snapshot, 'UTF8')), 'hex'), consent_ink(r.strokes, r.channel, r.signed_on, r.attachment_id),
                         r.signed_by_name, r.signed_as, r.method, r.signed_at);
    if bad is null and (r.seq <> expect or r.prev_sha256 <> prev or r.seal_sha256 <> seal or r.s_seal <> seal
                        or r.chain_sha256 <> consent_chain_link(prev, seal, r.seq)) then
      bad := r.seq;
    end if;
    prev := consent_chain_link(prev, seal, r.seq);
    expect := r.seq + 1;
  end loop;
  return query select bad is null, n, bad;
end $$;

-- ---------------------------------------------------------------------------
-- 8. The record's functions (invoker, under row-level security)
-- ---------------------------------------------------------------------------
-- Is a stored signing unchanged? Its snapshot's hash, its seal from its own columns, and its link (null while
-- the form is not on a record).
create or replace function consent_signing_verify(p_signing uuid)
returns table (snapshot_ok boolean, seal_ok boolean, chain_ok boolean)
language plpgsql stable set search_path = public as $$
declare s consent_signing; c consent_chain; prev text; snap text; seal text;
begin
  select * into s from consent_signing where id = p_signing;
  if not found then return query select null::boolean, null::boolean, null::boolean; return; end if;
  snap := encode(sha256(convert_to(s.snapshot, 'UTF8')), 'hex');
  seal := consent_seal(snap, consent_ink(s.strokes, s.channel, s.signed_on, s.attachment_id), s.signed_by_name, s.signed_as, s.method, s.signed_at);
  select * into c from consent_chain where signing_id = s.id;
  if not found then return query select snap = s.snapshot_sha256, seal = s.seal_sha256, null::boolean; return; end if;
  select chain_sha256 into prev from consent_chain where clinic_id = c.clinic_id and seq = c.seq - 1;
  prev := coalesce(prev, case when c.seq = 1 then repeat('0', 64) end);
  return query select snap = s.snapshot_sha256, seal = s.seal_sha256,
                      prev is not null and c.prev_sha256 = prev and c.seal_sha256 = seal and c.chain_sha256 = consent_chain_link(prev, seal, c.seq);
end $$;

-- Where a form stands on the record: cancelled · to_sign · to_confirm · agreed · refused · no_photos · withdrawn.
create or replace function consent_document_state(p_document uuid)
returns text
language plpgsql stable set search_path = public as $$
declare d consent_document; s consent_signing; v consent_version;
begin
  select * into d from consent_document where id = p_document;
  if not found then return null; end if;
  if d.cancelled_at is not null then return 'cancelled'; end if;
  select * into s from consent_signing where document_id = d.id order by signed_at desc, id desc limit 1;
  if not found then return 'to_sign'; end if;
  if s.decision = 'agreed' then
    if exists (select 1 from consent_withdrawal w where w.signing_id = s.id) then return 'withdrawn'; end if;
    if s.needs_confirm is not null and not exists (select 1 from consent_confirmation c where c.signing_id = s.id) then return 'to_confirm'; end if;
    return 'agreed';
  end if;
  select * into v from consent_version where id = d.version_id;
  if v.code = 'photos' and s.strokes is null then return 'no_photos'; end if;
  return 'refused';
end $$;

-- Did the patient consent to examination and treatment for this visit? A tablet signing (035), or the visit's
-- general consent form agreed. One rule for the calendar, the visit strip and the visit panel.
create or replace function visit_treatment_consented(p_appointment uuid)
returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from visit_consent vc where vc.appointment_id = p_appointment)
      or exists (select 1 from consent_document d join consent_version v on v.id = d.version_id and v.kind = 'treatment'
                  where d.appointment_id = p_appointment and consent_document_state(d.id) = 'agreed')
$$;

-- ---------------------------------------------------------------------------
-- 9. The public side (§4.5): the only ways in without a tenant. The clinic comes from the token; every answer
-- is a status word; nothing raises with an answer in it.
-- ---------------------------------------------------------------------------
-- The gate every public call passes: what a token opens for this device, the intake and the link locked (the
-- intake first). Links past their time are retired here; an open link is touched. Internal: granted to nobody.
--   unknown · welcome (a phone's link, not claimed yet) · verify (a patient on file, before the birth date)
--   open · taken (another device claimed it) · expired (15 minutes unclaimed, or 24 hours since the start)
--   idle (20 minutes unseen) · replaced · locked (three wrong birth dates) · finished (sent) · closed
create or replace function intake_gate(p_token text, p_device text)
returns table (status text, intake_id uuid)
language plpgsql security definer volatile set search_path = public as $$
declare l intake_link; i intake;
begin
  if p_token is null or p_token !~ '^[a-hjkmnp-z2-9]{26}$' then return query select 'unknown'::text, null::uuid; return; end if;
  select * into l from intake_link where token = p_token;
  if not found then return query select 'unknown'::text, null::uuid; return; end if;
  -- The intake first, then the link, re-read after any wait.
  select * into i from intake where id = l.intake_id for update;
  select * into l from intake_link where token = p_token for update;
  if not found or i.id is null then return query select 'unknown'::text, null::uuid; return; end if;
  if not exists (select 1 from clinic c where c.id = i.clinic_id and c.archived_at is null) then
    return query select 'closed'::text, i.id; return;
  end if;
  if l.retired_at is not null then
    return query select (case l.retired_why when 'replaced' then 'replaced' when 'switched' then 'replaced' when 'sent' then 'finished'
                                            when 'idle' then 'idle' when 'expired' then 'expired' when 'locked' then 'locked' else 'closed' end)::text, i.id;
    return;
  end if;
  if i.status in ('sent', 'added') then return query select 'finished'::text, i.id; return; end if;
  if i.status <> 'out' then return query select 'closed'::text, i.id; return; end if;
  if now() > i.created_at + interval '24 hours' or (l.claimed_at is null and now() > l.open_by) then
    update intake_link set retired_at = now(), retired_why = 'expired' where token = l.token;
    insert into intake_event (clinic_id, intake_id, kind) values (i.clinic_id, i.id, 'expired');
    return query select 'expired'::text, i.id; return;
  end if;
  if l.claimed_at is not null and coalesce(l.last_seen_at, l.claimed_at) < now() - interval '20 minutes' then
    update intake_link set retired_at = now(), retired_why = 'idle' where token = l.token;
    insert into intake_event (clinic_id, intake_id, kind) values (i.clinic_id, i.id, 'idle');
    return query select 'idle'::text, i.id; return;
  end if;
  if l.claimed_at is null then return query select 'welcome'::text, i.id; return; end if;
  if p_device is null or p_device !~ '^[0-9a-f]{64}$' or p_device <> l.device_sha256 then
    return query select 'taken'::text, i.id; return;
  end if;
  update intake_link set last_seen_at = now() where token = l.token;
  update intake set last_activity_at = now() where id = i.id;
  if i.target = 'existing' and l.device = 'phone' and i.verified_at is null then
    return query select 'verify'::text, i.id; return;
  end if;
  return query select 'open'::text, i.id;
end $$;
revoke all on function intake_gate(text, text) from public;

-- What a token shows: the clinic's face for every status but unknown; the number of parts before the pages;
-- the pages only when open. Each page says whether it can be signed now (the general consent, the photos,
-- or a form its dentist has confirmed) and carries the dentist's confirmation.
create or replace function intake_view(p_token text, p_device text)
returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare g record; i intake; l intake_link; c record; out jsonb; parts integer; p record; pn consent_version;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status = 'unknown' then return jsonb_build_object('status', 'unknown'); end if;
  select * into i from intake where id = g.intake_id;
  select cl.id, cl.name, cl.slug::text as slug, cl.area, cl.city, cl.phone, cl.photo_keys, cl.listed, gr.dpo_name into c
    from clinic cl join clinic_group gr on gr.id = cl.group_id where cl.id = i.clinic_id;
  out := jsonb_build_object('status', g.status, 'clinic', jsonb_build_object(
    'id', c.id, 'name', c.name, 'slug', c.slug, 'area', c.area, 'city', c.city, 'phone', c.phone,
    'photo_keys', to_jsonb(coalesce(c.photo_keys, '{}'::text[])), 'listed', c.listed, 'dpo_name', c.dpo_name));
  if g.status not in ('welcome', 'verify', 'open') then return out; end if;
  parts := (select count(*) from consent_document d where d.intake_id = i.id and d.cancelled_at is null)::integer
           + case when i.target = 'new' then 1 else 0 end;
  out := out || jsonb_build_object('parts', parts, 'target', i.target);
  if g.status <> 'open' then return out; end if;
  select * into l from intake_link where token = p_token;
  pn := current_consent_version();
  out := out || jsonb_build_object(
    'device', l.device,
    'intake', jsonb_build_object('id', i.id, 'ref', i.ref, 'target', i.target, 'form_version', i.form_version, 'desk_minor', i.desk_minor,
                                 'came_with', i.came_with, 'answers', i.answers, 'page1_done_at', i.page1_done_at,
                                 'privacy_version', i.privacy_version, 'privacy_as', i.privacy_as, 'privacy_by_name', i.privacy_by_name,
                                 'privacy_relation', i.privacy_relation),
    'privacy', case when pn.id is null then null else jsonb_build_object('id', pn.id, 'title', pn.title, 'summary', pn.summary) end,
    'patient', (select jsonb_build_object('first_name', pt.first_name, 'middle_name', pt.middle_name, 'last_name', pt.last_name, 'suffix', pt.suffix,
                                          'birth_date', to_char(pt.birth_date, 'YYYY-MM-DD'), 'sex', pt.sex)
                  from patient pt where pt.id = i.patient_id),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'ref', d.ref, 'version_id', d.version_id, 'code', coalesce(v.code, 'general'), 'kind', v.kind, 'sort', d.sort, 'rev', d.rev,
               'fields', d.fields, 'dentist_name', d.dentist_name, 'dentist_prc', d.dentist_prc, 'explained_in', d.explained_in,
               'explained_other', d.explained_other, 'interpreter', d.interpreter, 'in_force', consent_in_force(d.version_id),
               'signable', v.kind = 'treatment' or v.code = 'photos' or a.id is not null,
               'attestation', case when a.id is null then null else jsonb_build_object(
                  'dentist_name', a.dentist_name, 'dentist_prc', a.dentist_prc, 'explained_in', a.explained_in, 'interpreter', a.interpreter,
                  'assent', a.assent, 'attested_at', to_char(a.attested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end,
               'page', case when pg.document_id is null then null else jsonb_build_object(
                  'state', pg.state, 'doc_rev', pg.doc_rev, 'answers', pg.answers, 'signed_by_name', pg.signed_by_name, 'signed_as', pg.signed_as,
                  'method', pg.method, 'relation', pg.relation, 'authority', pg.authority, 'authority_ground', pg.authority_ground,
                  'authority_note', pg.authority_note, 'explained_in', pg.explained_in, 'read_by', pg.read_by, 'initials', pg.initials,
                  'opened_at', pg.opened_at, 'decided_at', pg.decided_at) end)
             order by d.sort, d.prepared_at)
        from consent_document d
        join consent_version v on v.id = d.version_id
        left join consent_attestation a on a.document_id = d.id
        left join intake_page pg on pg.intake_id = i.id and pg.document_id = d.id
       where d.intake_id = i.id and d.cancelled_at is null), '[]'::jsonb));
  return out;
end $$;

-- A phone claims its link on Start: the first device wins. Returns the next status (open, or verify for a
-- patient on file), or the gate's.
create or replace function intake_claim(p_token text, p_device text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare g record; i intake; l intake_link;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status <> 'welcome' then return g.status; end if;
  if p_device is null or p_device !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into i from intake where id = g.intake_id;
  select * into l from intake_link where token = p_token;
  if l.device <> 'phone' then return 'taken'; end if;
  update intake_link set claimed_at = now(), device_sha256 = p_device, last_seen_at = now() where token = p_token;
  update intake set last_activity_at = now() where id = i.id;
  insert into intake_event (clinic_id, intake_id, kind) values (i.clinic_id, i.id, 'opened');
  return case when i.target = 'existing' then 'verify' else 'open' end;
end $$;

-- A patient on file types their birth date first, on a phone: it must be the record's. Three misses lock the
-- link. Returns open, wrong, locked, or the gate's status.
create or replace function intake_verify(p_token text, p_device text, p_birth text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare g record; i intake; b date; typed date; n integer;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status <> 'verify' then return g.status; end if;
  select * into i from intake where id = g.intake_id;
  select birth_date into b from patient where id = i.patient_id;
  begin
    typed := case when coalesce(p_birth, '') ~ '^\d{4}-\d{2}-\d{2}$' then p_birth::date end;
  exception when others then
    typed := null;
  end;
  if typed is not null and b is not null and typed = b then
    update intake set verified_at = now() where id = i.id;
    insert into intake_event (clinic_id, intake_id, kind, detail) values (i.clinic_id, i.id, 'identity', 'birth date matched');
    return 'open';
  end if;
  update intake set id_tries = least(id_tries + 1, 3) where id = i.id returning id_tries into n;
  if n >= 3 then
    update intake_link set retired_at = now(), retired_why = 'locked' where token = p_token;
    insert into intake_event (clinic_id, intake_id, kind) values (i.clinic_id, i.id, 'locked');
    return 'locked';
  end if;
  return 'wrong';
end $$;

-- A page keeps its link alive (the gate's status).
create or replace function intake_ping(p_token text, p_device text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare g record;
begin
  select * into g from intake_gate(p_token, p_device);
  return g.status;
end $$;

-- A clinic tablet waiting on /f/t/: its live link, or ready. Known by the hash of its cookie's secret.
create or replace function tablet_poll(p_secret_sha256 text)
returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare t clinic_tablet; tok text; c record;
begin
  if p_secret_sha256 is null or p_secret_sha256 !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status', 'unknown'); end if;
  select * into t from clinic_tablet where secret_sha256 = p_secret_sha256 and retired_at is null;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  select cl.id, cl.name, cl.slug::text as slug, cl.photo_keys, cl.archived_at into c from clinic cl where cl.id = t.clinic_id;
  if c.archived_at is not null then return jsonb_build_object('status', 'unknown'); end if;
  update clinic_tablet set last_seen_at = now() where id = t.id;
  select l.token into tok from intake_link l join intake i on i.id = l.intake_id
   where l.tablet_id = t.id and l.retired_at is null and i.status = 'out' order by l.created_at desc limit 1;
  return jsonb_build_object('status', case when tok is null then 'ready' else 'link' end, 'token', tok, 'tablet', t.name,
                            'clinic', jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'photo_keys', to_jsonb(coalesce(c.photo_keys, '{}'::text[]))));
end $$;

-- Page 1, one screen at a time (you, contact, health), then privacy, which carries the whole of page 1 read
-- again: checked here again, the notice in force, and who agrees. A new patient's intake only, while out.
--   saved · page1 (privacy passed) · age_check (the birth date says otherwise than the desk) · changed (the
--   notice in force is another) · invalid · or the gate's status
-- A saved earlier screen means passing privacy again. Page 1 making the patient a minor cancels a whitening
-- form; a change in who the patient is (a name, the birth date, the parent or guardian) sends signed pages
-- back to be signed again.
create or replace function intake_save_page1(p_token text, p_device text, p_screen text, p_answers jsonb)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare
  g record; i intake; merged jsonb; b date; y integer; v_today date := (now() at time zone 'Asia/Manila')::date;
  problem text; ident_before text; ident_after text; n integer; result text := 'saved';
  allowed constant text[] := array['v', 'first_name', 'middle_name', 'last_name', 'suffix', 'birth_date', 'sex', 'occupation', 'mobile', 'email',
    'address', 'city', 'province', 'guardian_name', 'guardian_relation', 'guardian_mobile', 'guardian_is_emergency', 'emergency_name',
    'emergency_relation', 'emergency_mobile', 'good_health', 'under_treatment', 'treatment_detail', 'serious_illness', 'illness_detail',
    'hospitalised', 'hospital_detail', 'takes_medicines', 'medicines', 'allergies', 'allergy_other', 'smoke', 'alcohol_drugs', 'pregnant',
    'nursing', 'birth_control', 'blood_type', 'blood_pressure', 'bleeding_time', 'conditions', 'condition_other', 'hmo', 'hmo_other',
    'hmo_card_no', 'privacy_version', 'privacy_as', 'privacy_by_name', 'privacy_relation', 'consent_privacy'];
  ident constant text[] := array['first_name', 'middle_name', 'last_name', 'suffix', 'birth_date', 'guardian_name', 'guardian_relation', 'guardian_mobile'];
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status <> 'open' then return g.status; end if;
  select * into i from intake where id = g.intake_id;
  if i.target <> 'new' then return 'invalid'; end if;
  if p_screen is null or p_screen not in ('you', 'contact', 'health', 'privacy') or p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or octet_length(p_answers::text) > 24576 or exists (select 1 from jsonb_object_keys(p_answers) k where k <> all (allowed)) then
    return 'invalid';
  end if;
  merged := coalesce(i.answers, '{}'::jsonb) || p_answers;
  if octet_length(merged::text) > 24576 then return 'invalid'; end if;
  ident_before := (select string_agg(coalesce(i.answers ->> k, ''), '|' order by k) from unnest(ident) k);
  ident_after := (select string_agg(coalesce(merged ->> k, ''), '|' order by k) from unnest(ident) k);
  b := null;
  if coalesce(merged ->> 'birth_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      b := (merged ->> 'birth_date')::date;
    exception when others then
      b := null;
    end;
  end if;
  y := years_on(b, v_today);
  -- The desk said under 18 or not: a birth date that says otherwise stops page 1 until one side changes.
  if y is not null and ((i.desk_minor = 'no' and y < 18) or (i.desk_minor = 'yes' and y >= 18)) then result := 'age_check'; end if;

  begin
    if p_screen = 'privacy' then
      if result = 'age_check' then return 'age_check'; end if;
      problem := intake_page1_problem(merged, v_today);
      if problem is not null then return 'invalid'; end if;
      if merged ->> 'privacy_as' <> 'none' and merged ->> 'privacy_version' is distinct from (current_consent_version()).id then return 'changed'; end if;
      update intake set answers = merged, page1_done_at = now(),
             privacy_as = merged ->> 'privacy_as',
             privacy_version = case when merged ->> 'privacy_as' = 'none' then null else merged ->> 'privacy_version' end,
             privacy_at = case when merged ->> 'privacy_as' = 'none' then null else now() end,
             privacy_by_name = case when merged ->> 'privacy_as' = 'none' then null else btrim(merged ->> 'privacy_by_name') end,
             privacy_relation = case when merged ->> 'privacy_as' in ('parent', 'court_guardian') then btrim(merged ->> 'privacy_relation') end,
             last_activity_at = now()
       where id = i.id;
      insert into intake_event (clinic_id, intake_id, kind, detail) values (i.clinic_id, i.id, 'page1', merged ->> 'privacy_as');
      result := 'page1';
    else
      update intake set answers = merged, page1_done_at = null, privacy_as = null, privacy_version = null, privacy_at = null,
             privacy_by_name = null, privacy_relation = null, last_activity_at = now()
       where id = i.id;
      if result = 'age_check' then
        insert into intake_event (clinic_id, intake_id, kind) values (i.clinic_id, i.id, 'age_check');
      end if;
    end if;
    -- A minor: whitening is not for them.
    if y is not null and y < 18 then
      update consent_document d set cancelled_at = now(), cancel_why = 'minor'
       where d.intake_id = i.id and d.cancelled_at is null and d.version_id in (select id from consent_version where code = 'whitening')
         and not exists (select 1 from consent_signing s where s.document_id = d.id);
      get diagnostics n = row_count;
      if n > 0 then insert into intake_event (clinic_id, intake_id, kind, detail) values (i.clinic_id, i.id, 'cancelled_doc', 'whitening: under 18'); end if;
    end if;
    -- Who the patient is changed: what was signed is signed again.
    if i.answers is not null and ident_before is distinct from ident_after then
      update intake_page set state = 'reading', answers = null, signed_by_name = null, signed_as = null, method = null, relation = null,
             authority = null, authority_ground = null, authority_note = null, explained_in = null, read_by = null, initials = null,
             strokes = null, snapshot = null, opened_at = null, decided_at = null
       where intake_id = i.id and state in ('agreed', 'refused');
      get diagnostics n = row_count;
      if n > 0 then insert into intake_event (clinic_id, intake_id, kind, detail) values (i.clinic_id, i.id, 'resign', 'details changed'); end if;
    end if;
  exception when others then
    return 'invalid';
  end;
  return result;
end $$;

-- A page opened, a question, or read (a dentist's form not confirmed yet: read now, signed later). A page drawn
-- at an older rev of its form starts again ('changed').
create or replace function intake_mark_page(p_token text, p_device text, p_document uuid, p_rev integer, p_mark text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare g record; i intake; d consent_document; v consent_version; pg intake_page; signable boolean;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status <> 'open' then return g.status; end if;
  select * into i from intake where id = g.intake_id;
  select * into d from consent_document where id = p_document and intake_id = i.id and cancelled_at is null for update;
  if not found or p_mark is null or p_mark not in ('opened', 'question', 'read') then return 'invalid'; end if;
  select * into v from consent_version where id = d.version_id;
  signable := v.kind = 'treatment' or v.code = 'photos' or exists (select 1 from consent_attestation a where a.document_id = d.id);
  select * into pg from intake_page where intake_id = i.id and document_id = d.id for update;
  begin
    if found and pg.doc_rev <> d.rev then
      update intake_page set state = 'reading', doc_rev = d.rev, answers = null, signed_by_name = null, signed_as = null, method = null,
             relation = null, authority = null, authority_ground = null, authority_note = null, explained_in = null, read_by = null,
             initials = null, strokes = null, snapshot = null, opened_at = now(), decided_at = null
       where intake_id = i.id and document_id = d.id;
      insert into intake_event (clinic_id, intake_id, kind, document_id, detail) values (i.clinic_id, i.id, 'resign', d.id, 'form changed');
      return 'changed';
    end if;
    if p_rev is distinct from d.rev then return 'changed'; end if;
    if p_mark = 'opened' then
      insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, opened_at)
      values (i.id, d.id, i.clinic_id, 'reading', d.rev, now())
      on conflict (intake_id, document_id) do update set opened_at = coalesce(intake_page.opened_at, now());
      if pg.document_id is null then
        insert into intake_event (clinic_id, intake_id, kind, document_id) values (i.clinic_id, i.id, 'reading', d.id);
      end if;
    elsif p_mark = 'question' then
      if pg.state in ('agreed', 'refused') then return 'invalid'; end if;
      insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, opened_at)
      values (i.id, d.id, i.clinic_id, 'question', d.rev, now())
      on conflict (intake_id, document_id) do update set state = 'question';
      insert into intake_event (clinic_id, intake_id, kind, document_id) values (i.clinic_id, i.id, 'question', d.id);
    else
      if signable then return 'invalid'; end if;
      insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, opened_at, decided_at)
      values (i.id, d.id, i.clinic_id, 'read', d.rev, now(), now())
      on conflict (intake_id, document_id) do update set state = 'read', decided_at = now();
      insert into intake_event (clinic_id, intake_id, kind, document_id) values (i.clinic_id, i.id, 'read', d.id);
    end if;
  exception when others then
    return 'invalid';
  end;
  return 'saved';
end $$;

-- A decision on a page: agreed, refused (both signed; a photos refusal needs no strokes) or later ("I want to
-- ask the dentist first", which clears the page). The signer's rules of §2.3, and the snapshot is of this
-- form, this decision, these fields, this signer and this confirmation.
--   saved · not_ready (a dentist's form not confirmed yet) · changed (the form's words or fields changed) ·
--   order (page 1 first) · invalid · or the gate's status
create or replace function intake_decide(p_token text, p_device text, p_document uuid, p_rev integer, p_decision text, p_page jsonb, p_snapshot text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare
  g record; i intake; l intake_link; d consent_document; v consent_version; a consent_attestation; pt patient;
  v_name text; v_as text; v_method text; v_rel text; v_auth text; v_ground text; v_note text; v_expl text; v_read text; v_init text;
  v_answers jsonb; v_strokes jsonb; v_over21 boolean; birth date; y integer; patient_name text; snap jsonb;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status <> 'open' then return g.status; end if;
  select * into i from intake where id = g.intake_id;
  select * into l from intake_link where intake_id = i.id and retired_at is null;
  select * into d from consent_document where id = p_document and intake_id = i.id and cancelled_at is null for update;
  if not found or p_decision is null or p_decision not in ('agreed', 'refused', 'later') then return 'invalid'; end if;
  select * into v from consent_version where id = d.version_id;
  if not consent_in_force(d.version_id) or p_rev is distinct from d.rev then return 'changed'; end if;
  if i.target = 'new' and i.page1_done_at is null then return 'order'; end if;
  select * into a from consent_attestation where document_id = d.id;
  if v.kind = 'document' and v.code <> 'photos' and a.id is null then return 'not_ready'; end if;

  begin
    if p_decision = 'later' then
      if v.code = 'photos' then return 'invalid'; end if;
      insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, opened_at, decided_at)
      values (i.id, d.id, i.clinic_id, 'later', d.rev, now(), now())
      on conflict (intake_id, document_id) do update set state = 'later', doc_rev = d.rev, answers = null, signed_by_name = null, signed_as = null,
        method = null, relation = null, authority = null, authority_ground = null, authority_note = null, explained_in = null, read_by = null,
        initials = null, strokes = null, snapshot = null, decided_at = now();
      insert into intake_event (clinic_id, intake_id, kind, document_id, detail) values (i.clinic_id, i.id, 'decided', d.id, 'later');
      return 'saved';
    end if;

    if p_page is null or jsonb_typeof(p_page) <> 'object' then return 'invalid'; end if;
    v_name := btrim(p_page ->> 'signed_by_name');
    v_as := p_page ->> 'signed_as';
    v_method := coalesce(p_page ->> 'method', 'sign');
    v_rel := nullif(btrim(coalesce(p_page ->> 'relation', '')), '');
    v_auth := p_page ->> 'authority';
    v_ground := p_page ->> 'authority_ground';
    v_note := p_page ->> 'authority_note';
    v_expl := nullif(btrim(coalesce(p_page ->> 'explained_in', '')), '');
    v_read := nullif(btrim(coalesce(p_page ->> 'read_by', '')), '');
    v_init := p_page ->> 'initials';
    v_answers := p_page -> 'answers';
    v_strokes := p_page -> 'strokes';
    if jsonb_typeof(v_strokes) = 'null' then v_strokes := null; end if;
    if jsonb_typeof(v_answers) = 'null' then v_answers := null; end if;
    v_over21 := coalesce((p_page ->> 'over21')::boolean, false);

    -- The patient: the name the server holds, and the age.
    if i.target = 'existing' then
      select * into pt from patient where id = i.patient_id;
      patient_name := person_name(pt.first_name, pt.middle_name, pt.last_name, pt.suffix);
      birth := pt.birth_date;
    else
      patient_name := person_name(i.answers ->> 'first_name', i.answers ->> 'middle_name', i.answers ->> 'last_name', i.answers ->> 'suffix');
      birth := consent_birth_date(null, i.id);
    end if;
    y := years_on(birth, (now() at time zone 'Asia/Manila')::date);
    if y is null then return 'invalid'; end if;
    if v.code = 'whitening' and y < 18 then return 'invalid'; end if;
    if v_name is null or char_length(v_name) not between 2 and 120 then return 'invalid'; end if;
    if v_as = 'patient' and v_name is distinct from patient_name then return 'invalid'; end if;
    if v_as = 'guardian' and (v_rel is null or char_length(v_rel) > 60) then return 'invalid'; end if;
    if consent_signer_problem(y < 18, l.device, v_as, v_method, v_auth, v_ground, v_note, i.patient_id, i.clinic_id) is not null then return 'invalid'; end if;
    if v_auth = 'substitute' and v_note in ('sibling_21', 'custodian_21') and not v_over21 then return 'invalid'; end if;
    if v.kind = 'document' and v.code <> 'photos' and v_expl is null then return 'invalid'; end if;
    if v_strokes is null then
      if not (v.code = 'photos' and p_decision = 'refused') then return 'invalid'; end if;
    elsif not consent_strokes_ok(v_strokes) then
      return 'invalid';
    end if;
    if p_snapshot is null or octet_length(p_snapshot) > 65536 then return 'invalid'; end if;
    snap := p_snapshot::jsonb;
    if jsonb_typeof(snap) <> 'object' or snap ->> 'document' is distinct from d.id::text or snap ->> 'version' is distinct from d.version_id
       or snap ->> 'decision' is distinct from p_decision or (snap -> 'fields') is distinct from d.fields
       or snap -> 'signer' ->> 'name' is distinct from v_name
       or (a.id is not null and (snap -> 'attested' ->> 'at') is distinct from to_char(a.attested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
      return 'invalid';
    end if;

    insert into intake_page (intake_id, document_id, clinic_id, state, doc_rev, answers, signed_by_name, signed_as, method, relation, authority,
                             authority_ground, authority_note, explained_in, read_by, initials, strokes, snapshot, opened_at, decided_at)
    values (i.id, d.id, i.clinic_id, p_decision, d.rev, v_answers, v_name, v_as, v_method, case when v_as = 'guardian' then v_rel end, v_auth,
            v_ground, v_note, v_expl, v_read, v_init, v_strokes, p_snapshot, null, now())
    on conflict (intake_id, document_id) do update set state = excluded.state, doc_rev = excluded.doc_rev, answers = excluded.answers,
      signed_by_name = excluded.signed_by_name, signed_as = excluded.signed_as, method = excluded.method, relation = excluded.relation,
      authority = excluded.authority, authority_ground = excluded.authority_ground, authority_note = excluded.authority_note,
      explained_in = excluded.explained_in, read_by = excluded.read_by, initials = excluded.initials, strokes = excluded.strokes,
      snapshot = excluded.snapshot, decided_at = excluded.decided_at;
    insert into intake_event (clinic_id, intake_id, kind, document_id, detail) values (i.clinic_id, i.id, 'decided', d.id, p_decision);
  exception when others then
    return 'invalid';
  end;
  return 'saved';
end $$;

-- Send. The same Send again is 'again'. Unfinished: page 1 not done, or not under the notice in force, or a
-- page with no decision (read and later count; a signed page whose form changed since does not). Changed: a
-- form's words are no longer in force (nothing is wiped; the desk renews it). Otherwise one consent_signing per
-- agreed or refused page, the link retired as sent, and the intake sent (a new patient: the desk, or the
-- server's check for look-alikes, adds it) or added (a patient on file: the forms are on the record now).
create or replace function intake_send(p_token text, p_device text, p_nonce text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare g record; i intake; l intake_link; p record; n integer;
begin
  select * into g from intake_gate(p_token, p_device);
  if g.status = 'finished' then
    return case when exists (select 1 from intake x where x.id = g.intake_id and x.send_nonce = p_nonce) then 'again' else 'finished' end;
  end if;
  if g.status <> 'open' then return g.status; end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' then return 'invalid'; end if;
  select * into i from intake where id = g.intake_id;
  select * into l from intake_link where intake_id = i.id and retired_at is null;
  if i.target = 'new' then
    if i.page1_done_at is null then return 'unfinished'; end if;
    if i.privacy_as <> 'none' and i.privacy_version is distinct from (current_consent_version()).id then return 'unfinished'; end if;
  end if;
  if exists (select 1 from consent_document d where d.intake_id = i.id and d.cancelled_at is null and not consent_in_force(d.version_id)) then
    return 'changed';
  end if;
  if exists (select 1 from consent_document d left join intake_page pg on pg.intake_id = i.id and pg.document_id = d.id
              where d.intake_id = i.id and d.cancelled_at is null
                and (pg.state is null or pg.state in ('reading', 'question') or (pg.state in ('agreed', 'refused') and pg.doc_rev <> d.rev))) then
    return 'unfinished';
  end if;
  begin
    for p in select pg.*, d.sort from intake_page pg join consent_document d on d.id = pg.document_id
              where pg.intake_id = i.id and d.cancelled_at is null and pg.state in ('agreed', 'refused') order by d.sort, d.prepared_at loop
      insert into consent_signing (clinic_id, document_id, intake_id, decision, channel, method, snapshot, snapshot_sha256, seal_sha256, answers,
                                   signed_by_name, signed_as, relation, authority, authority_ground, authority_note, explained_in, read_by,
                                   strokes, link_by, opened_at, decided_at)
      values (i.clinic_id, p.document_id, i.id, p.state, l.device, p.method, p.snapshot, repeat('0', 64), repeat('0', 64), p.answers,
              p.signed_by_name, p.signed_as, p.relation, p.authority, p.authority_ground, p.authority_note, p.explained_in, p.read_by,
              p.strokes, l.created_by, p.opened_at, p.decided_at);
    end loop;
    update intake_link set retired_at = now(), retired_why = 'sent' where token = l.token;
    update intake set status = case when target = 'new' then 'sent' else 'added' end, sent_at = now(), send_nonce = p_nonce,
           last_activity_at = now(),
           decided_at = case when target = 'existing' then now() else decided_at end,
           decided_by = case when target = 'existing' then l.created_by else decided_by end,
           added_as = case when target = 'existing' then 'existing' else added_as end
     where id = i.id and status = 'out';
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'intake_send: the intake changed' using errcode = 'serialization_failure';
    end if;
    insert into intake_event (clinic_id, intake_id, kind) values (i.clinic_id, i.id, 'sent');
    if i.target = 'existing' then insert into intake_event (clinic_id, intake_id, kind, detail) values (i.clinic_id, i.id, 'added', 'at send'); end if;
  exception when others then
    return 'invalid';
  end;
  return case when i.target = 'new' then 'sent' else 'added' end;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------
-- 002's default privileges gave the app every right on the new tables: start again from nothing.
revoke all on intake, clinic_tablet, intake_link, consent_document, intake_page, consent_signing, consent_attestation, consent_confirmation,
              capacity_note, consent_withdrawal, consent_override, consent_chain, intake_event from flossify_app;
grant select on intake, clinic_tablet, intake_link, consent_document, intake_page, consent_signing, consent_attestation, consent_confirmation,
                capacity_note, consent_withdrawal, consent_override, consent_chain, intake_event to flossify_app;

-- The desk starts an intake and decides it; page 1's answers, the privacy agreement, the birth-date tries and the
-- Send are the definers' alone.
grant insert (clinic_id, ref, target, patient_id, appointment_id, label, form_version, desk_minor, came_with, created_by) on intake to flossify_app;
grant update (status, patient_id, appointment_id, label, desk_minor, came_with, rev, decided_by, decided_at, added_as,
              cancelled_by, cancelled_at, cancel_reason) on intake to flossify_app;
-- A link is made and retired; claiming it and keeping it alive are the definers'.
grant insert (token, clinic_id, intake_id, device, tablet_id, created_by, device_sha256) on intake_link to flossify_app;
grant update (retired_at, retired_why) on intake_link to flossify_app;
grant insert (clinic_id, name, secret_sha256, created_by) on clinic_tablet to flossify_app;
grant update (name, retired_at, retired_by) on clinic_tablet to flossify_app;
-- The desk prepares a form and changes it until it is explained, signed or printed (the trigger freezes it).
grant insert (clinic_id, ref, version_id, intake_id, patient_id, appointment_id, plan_item_id, fields, dentist_id, explained_in,
              explained_other, interpreter, sort, prepared_by) on consent_document to flossify_app;
grant update (patient_id, intake_id, appointment_id, plan_item_id, fields, dentist_id, explained_in, explained_other, interpreter, sort,
              paper_printed_at, cancelled_by, cancelled_at, cancel_why) on consent_document to flossify_app;
-- Insert-only records. A signing by the app is a paper one (a device signing comes through intake_send).
grant insert on consent_signing, consent_attestation, consent_confirmation, capacity_note, consent_withdrawal, consent_override, intake_event to flossify_app;

grant execute on function current_document_of(text), consent_in_force(text), consent_seal(text, text, text, text, text, timestamptz),
  consent_ink(jsonb, text, date, uuid), consent_chain_link(text, text, bigint), consent_strokes_ok(jsonb), person_name(text, text, text, text),
  treating_dentist(uuid, uuid), consent_birth_date(uuid, uuid), years_on(date, date),
  consent_signer_problem(boolean, text, text, text, text, text, text, uuid, uuid), intake_page1_problem(jsonb, date),
  consent_chain_head(uuid, date), consent_chain_check(uuid), consent_signing_verify(uuid), consent_document_state(uuid), visit_treatment_consented(uuid)
  to flossify_app;

revoke all on function current_document_of(text), intake_view(text, text), intake_claim(text, text), intake_verify(text, text, text),
  intake_ping(text, text), tablet_poll(text), intake_save_page1(text, text, text, jsonb), intake_mark_page(text, text, uuid, integer, text),
  intake_decide(text, text, uuid, integer, text, jsonb, text), intake_send(text, text, text) from public;
grant execute on function current_document_of(text), intake_view(text, text), intake_claim(text, text), intake_verify(text, text, text),
  intake_ping(text, text), tablet_poll(text), intake_save_page1(text, text, text, jsonb), intake_mark_page(text, text, uuid, integer, text),
  intake_decide(text, text, uuid, integer, text, jsonb, text), intake_send(text, text, text) to flossify_app;

-- ---------------------------------------------------------------------------
-- 11. Retention (§4.8): the same signature as 028's. Texts after two years and poster forms nobody added after
-- 30 days, as before; then intakes, in a block of their own, so a failure there never stops the rest (a
-- warning with the error's code, never a row). Purged: intakes preparing, out or cancelled and started more
-- than 24 hours ago, and intakes sent more than 30 days ago — unless held: a sent intake that holds a signing
-- and either looks like a patient here (the same names and the same or no birth date, or the same mobile) or
-- was started from a visit waits for the desk. Their events, pages and links go; forms with no patient go with
-- their confirmations, signings, attestations and overrides; forms on a record stay (the intake is cleared
-- from them). An added intake is part of the record and is never purged.
-- ---------------------------------------------------------------------------
create or replace function retention_purge()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; m integer; k integer := 0; ids uuid[]; docs uuid[];
begin
  delete from message_log where created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  delete from patient_form where status <> 'added' and submitted_at < now() - interval '30 days';
  get diagnostics m = row_count;
  begin
    select array_agg(i.id) into ids from intake i
     where (i.status in ('preparing', 'out', 'cancelled') and i.created_at < now() - interval '24 hours')
        or (i.status = 'sent' and i.sent_at < now() - interval '30 days'
            and not (exists (select 1 from consent_signing s where s.intake_id = i.id)
                     and (i.appointment_id is not null
                          or exists (select 1 from patient p
                                      where p.clinic_id = i.clinic_id and p.archived_at is null
                                        and ((lower(btrim(p.first_name)) = lower(btrim(i.answers ->> 'first_name'))
                                              and lower(btrim(p.last_name)) = lower(btrim(i.answers ->> 'last_name'))
                                              and (p.birth_date is null or to_char(p.birth_date, 'YYYY-MM-DD') = i.answers ->> 'birth_date'))
                                          or (length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 10
                                              and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10)
                                                  = right(regexp_replace(coalesce(i.answers ->> 'mobile', ''), '\D', '', 'g'), 10)))))));
    if ids is not null then
      delete from intake_event where intake_id = any (ids);
      delete from intake_page where intake_id = any (ids);
      delete from intake_link where intake_id = any (ids);
      select array_agg(d.id) into docs from consent_document d where d.intake_id = any (ids) and d.patient_id is null;
      if docs is not null then
        delete from consent_confirmation where signing_id in (select id from consent_signing where document_id = any (docs));
        delete from consent_withdrawal where signing_id in (select id from consent_signing where document_id = any (docs));
        delete from consent_signing where document_id = any (docs);
        delete from consent_attestation where document_id = any (docs);
        delete from consent_override where document_id = any (docs);
        delete from consent_document where id = any (docs);
      end if;
      delete from intake where id = any (ids);
      get diagnostics k = row_count;
    end if;
  exception when others then
    raise warning 'retention_purge: intakes were not purged this pass (%)', sqlstate;
    k := 0;
  end;
  return n + m + k;
end $$;

grant execute on function retention_purge() to flossify_app;
