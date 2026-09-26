-- 028 — patient forms by QR code: a poster on the reception desk, the
-- patient fills in their details, health, dental history, cards and consent on
-- their own phone, and the desk adds them to the records.
--
-- The pieces:
--
--   - clinic_forms_key: the clinic's private forms link, flossify.ph/f/<key>/.
--     The key is ten random characters (lowercase letters and digits with no
--     look-alikes: no i, l, o, 0 or 1), made by the app (src/lib/patient-
--     forms.ts). One live key per clinic; "Make a new QR code" retires it and
--     makes another. A retired key is kept, so an old poster says "this code
--     has been replaced, ask the desk" instead of "not found", and it accepts
--     nothing. The link works whether or not the clinic is listed.
--   - patient_form: one submission. NOT a patient yet: it waits in the
--     clinic's "New patient forms" until the desk adds it as a new patient,
--     adds it to a patient on file, or dismisses it. The answers are one jsonb
--     (the shape is the form definition in src/lib/patient-forms.ts, versioned
--     by form_version); the few columns the queue lists and matches on are
--     lifted out of it. A form not added is deleted 30 days after it was sent
--     (retention_purge below); an added one is part of the record.
--   - The public write is patient_form_submit(key, nonce, answers), a
--     security-definer function: the clinic comes from the key, never from
--     the page. It checks again what the app checked (names, birth date,
--     mobile, both consents, a parent or guardian for a patient under 18, the
--     consent wording in force) and never raises with the answers in an error
--     (a failed check is the status 'invalid'), so nothing a patient typed can
--     reach a log. The nonce is the form's own: the same form sent twice (a
--     refresh) is one row and gets its reference again.
--   - The consent to examination and treatment is versioned like the privacy
--     notice: a consent_version row of kind 'treatment' (the words live in
--     src/lib/patient-forms.ts under the same id; a change of words is a new
--     row, never an edit). current_consent_version() now reads the privacy
--     notice only, so nothing that asks it for "the notice in force" changes.
--   - Adding a form writes patient_consent rows with channel 'form' (who
--     signed, as whom, when, which version, which form), and a medical_history
--     version answered_by 'patient' that names the form (form_id).
--
-- Grants: the app reads the keys and the forms under forced RLS like every
-- clinic table, may make a key and retire it (and nothing else: a retired key
-- cannot come back), and may only decide a form (status, patient, who, when):
-- it cannot write or change a form's answers, and only the definer functions
-- insert or delete forms. It reads consent_version and no longer writes it:
-- the words patients agree to change by migration only.
--
-- Additive and idempotent: new tables, nullable columns, one widened check,
-- one new column with a default that describes every existing row truly
-- (every consent_version so far is a privacy notice).

-- ---------------------------------------------------------------------------
-- The clinic's forms link
-- ---------------------------------------------------------------------------
create table if not exists clinic_forms_key (
  key         text primary key check (key ~ '^[a-hjkmnp-z2-9]{10}$'),
  clinic_id   uuid not null references clinic(id) on delete restrict,
  created_at  timestamptz not null default now(),
  created_by  uuid references staff(id) on delete set null,
  retired_at  timestamptz,
  retired_by  uuid references staff(id) on delete set null,
  unique (clinic_id, key)
);

-- One live key per clinic.
create unique index if not exists clinic_forms_key_live on clinic_forms_key (clinic_id) where retired_at is null;

alter table clinic_forms_key enable row level security;
alter table clinic_forms_key force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clinic_forms_key' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on clinic_forms_key
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

-- A key is made and retired, never deleted: an old poster must still say it was replaced. The app
-- may make one and retire one (retired_at, retired_by), nothing else: it cannot change a key, move
-- it to another clinic, or bring a retired one back. The trigger below says the same to anyone.
revoke delete on clinic_forms_key from flossify_app;
revoke update on clinic_forms_key from flossify_app;
grant update (retired_at, retired_by) on clinic_forms_key to flossify_app;

create or replace function clinic_forms_key_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.key is distinct from old.key or new.clinic_id is distinct from old.clinic_id
     or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'clinic_forms_key: a key cannot be changed, only retired' using errcode = 'check_violation';
  end if;
  if old.retired_at is not null and (new.retired_at is distinct from old.retired_at or new.retired_by is distinct from old.retired_by) then
    raise exception 'clinic_forms_key: a retired key stays retired' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists clinic_forms_key_guard on clinic_forms_key;
create trigger clinic_forms_key_guard before update on clinic_forms_key
  for each row execute function clinic_forms_key_guard();

-- ---------------------------------------------------------------------------
-- The consent to examination and treatment, versioned like the notice
-- ---------------------------------------------------------------------------
alter table consent_version add column if not exists kind text not null default 'privacy';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consent_version_kind_check') then
    alter table consent_version add constraint consent_version_kind_check check (kind in ('privacy', 'treatment'));
  end if;
end $$;

-- The privacy notice in force, as before: 012's rule, now for the notice only.
-- Every caller (booking, desk and paper consent, the Patients list's record
-- check, Settings → Privacy) means the notice when it asks for this.
create or replace function current_consent_version()
returns consent_version
language sql security definer stable set search_path = public as $$
  select *
  from consent_version
  where kind = 'privacy' and effective_from <= (now() at time zone 'Asia/Manila')::date
  order by effective_from desc, id desc
  limit 1
$$;

-- The version of either kind in force: 'privacy' or 'treatment'.
create or replace function current_consent_of(p_kind text)
returns consent_version
language sql security definer stable set search_path = public as $$
  select *
  from consent_version
  where kind = p_kind and effective_from <= (now() at time zone 'Asia/Manila')::date
  order by effective_from desc, id desc
  limit 1
$$;

-- The wording patients agree to is written by migrations only. 002's default privileges gave the
-- app every right on this table (it has no tenant and no row-level security); it only reads it.
revoke insert, update, delete on consent_version from flossify_app;
grant select on consent_version to flossify_app;

insert into consent_version (id, title, summary, effective_from, kind)
values (
  'treatment-2026-09',
  'Consent to dental examination and treatment',
  'The dentist may examine you and take the X-rays and photos needed; medicines or a local anaesthetic may be used; every treatment is explained before it starts, and you may ask, get a second opinion, or refuse.',
  '2026-09-26',
  'treatment'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- One submission
-- ---------------------------------------------------------------------------
create table if not exists patient_form (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinic(id) on delete restrict,
  -- The poster it came through.
  forms_key         text not null,
  -- What the patient is shown and tells the desk: QR-7K2F. Unique per clinic.
  ref               text not null check (ref ~ '^QR-[A-HJKMNP-Z2-9]{4}$'),
  -- The form's own random token: the same form sent twice is one row.
  nonce             text not null check (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  form_version      text not null check (char_length(form_version) between 1 and 40),
  answers           jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 24576),
  -- Lifted out of answers for the queue and for finding the patient on file.
  first_name        text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name         text not null check (char_length(btrim(last_name)) between 1 and 60),
  birth_date        date not null check (birth_date >= date '1900-01-01'),
  phone             text not null check (phone ~ '^09[0-9]{9}$'),
  -- Who signed, typed as their signature, and as whom.
  signed_by_name    text not null check (char_length(btrim(signed_by_name)) between 2 and 120),
  signed_as         text not null check (signed_as in ('patient', 'guardian')),
  privacy_version   text not null references consent_version(id),
  treatment_version text not null references consent_version(id),
  submitted_at      timestamptz not null default now(),
  -- The desk's decision.
  status            text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  patient_id        uuid references patient(id) on delete restrict,
  -- Added as a new patient, or to one on file.
  added_as          text check (added_as in ('new', 'existing')),
  decided_by        uuid references staff(id) on delete set null,
  decided_at        timestamptz,
  foreign key (clinic_id, forms_key) references clinic_forms_key (clinic_id, key) on delete restrict,
  check ((status = 'added') = (patient_id is not null)),
  check ((status = 'added') = (added_as is not null)),
  check (status = 'new' or decided_at is not null)
);

create unique index if not exists patient_form_ref on patient_form (clinic_id, ref);
create unique index if not exists patient_form_nonce on patient_form (clinic_id, nonce);
create index if not exists patient_form_queue on patient_form (clinic_id, status, submitted_at desc);
create index if not exists patient_form_patient on patient_form (clinic_id, patient_id, submitted_at desc) where patient_id is not null;
create index if not exists patient_form_purge on patient_form (submitted_at) where status <> 'added';

alter table patient_form enable row level security;
alter table patient_form force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_form' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on patient_form
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

-- 002's default privileges gave the app every right on it. It reads forms and
-- decides them; the answers are written once, by patient_form_submit(), and
-- only retention_purge() deletes.
revoke insert, update, delete on patient_form from flossify_app;
grant select on patient_form to flossify_app;
grant update (status, patient_id, added_as, decided_by, decided_at) on patient_form to flossify_app;

-- ---------------------------------------------------------------------------
-- What adding a form writes
-- ---------------------------------------------------------------------------
-- The health version the form became. recorded_by stays null on it (021: a
-- version the patient answered themselves); who added it is on the form.
alter table medical_history add column if not exists form_id uuid references patient_form(id) on delete restrict;
create index if not exists medical_history_form on medical_history (form_id) where form_id is not null;

-- A consent given on the patient forms: channel 'form', the form it came on.
alter table patient_consent add column if not exists form_id uuid references patient_form(id) on delete restrict;
alter table patient_consent drop constraint if exists patient_consent_channel_check;
alter table patient_consent add constraint patient_consent_channel_check
  check (channel in ('web', 'desk', 'sms', 'paper', 'form'));
do $$
begin
  -- It names its form, the person who added it, and who signed, as whom (a
  -- name is always typed: it is the signature).
  if not exists (select 1 from pg_constraint where conname = 'patient_consent_form_shape') then
    alter table patient_consent add constraint patient_consent_form_shape
      check ((channel = 'form') = (form_id is not null)
             and (channel <> 'form' or (recorded_by is not null and agreed_as is not null and coalesce(btrim(given_by_name), '') <> '')));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The public side: what a key opens, and the one write
-- ---------------------------------------------------------------------------
-- 'open': the clinic's face for the page (the room photo, the name, where it
-- is, how to call it, its DPO) and the two consent versions in force.
-- 'replaced': an old poster; the clinic's name and room, nothing to fill in.
-- 'unknown': no such key, or the clinic is closed. Nothing else is returned.
drop function if exists patient_forms_clinic(text);
create function patient_forms_clinic(p_key text)
returns table (
  status text, clinic_id uuid, name text, slug text, area text, city text, phone text, photo_keys text[], listed boolean,
  dpo_name text, privacy_version text, privacy_title text, privacy_summary text, treatment_version text, treatment_title text
)
language plpgsql security definer stable set search_path = public as $$
declare
  k clinic_forms_key;
  c record;
  pv consent_version;
  tv consent_version;
  open_clinic boolean := false;
begin
  if p_key is not null and p_key ~ '^[a-hjkmnp-z2-9]{10}$' then
    select * into k from clinic_forms_key where key = p_key;
    if found then
      select cl.id, cl.name, cl.slug, cl.area, cl.city, cl.phone, cl.photo_keys, cl.listed, g.dpo_name as group_dpo into c
        from clinic cl join clinic_group g on g.id = cl.group_id
       where cl.id = k.clinic_id and cl.archived_at is null;
      open_clinic := found;
    end if;
  end if;
  if not open_clinic then
    return query select 'unknown'::text, null::uuid, null::text, null::text, null::text, null::text, null::text, null::text[], null::boolean,
                        null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if k.retired_at is not null then
    return query select 'replaced'::text, c.id, c.name, c.slug::text, c.area, c.city, c.phone, c.photo_keys, c.listed,
                        null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  pv := current_consent_of('privacy');
  tv := current_consent_of('treatment');
  return query select 'open'::text, c.id, c.name, c.slug::text, c.area, c.city, c.phone, c.photo_keys, c.listed,
                      c.group_dpo, pv.id, pv.title, pv.summary, tv.id, tv.title;
end $$;

-- The write. Statuses:
--   'saved'    ref is the new form's; first_name and signed_as are the form's (the thank-you)
--   'again'    this very form was already sent (the same nonce and the same answers: a refresh, a
--              double tap): its ref, and the stored first_name and signed_as
--   'resend'   the nonce was already used for DIFFERENT answers (a page brought back from the
--              browser's history and filled in for someone else): nothing saved; the page draws the
--              form again with a new nonce and asks for one more tap on Send
--   'replaced', 'unknown'
--   'changed'  the consent wording in force is not the one the form showed
--   'full'     500 forms sent through this poster are waiting: nobody is reading them. Counted per
--              key, so "Make a new QR code" opens the forms again after a flood of junk
--   'invalid'  a check failed: the app checks the same things first, so this is a crafted post,
--              never a person's typing
drop function if exists patient_form_submit(text, text, jsonb);
create function patient_form_submit(p_key text, p_nonce text, p_answers jsonb)
returns table (status text, ref text, first_name text, signed_as text)
language plpgsql security definer volatile set search_path = public as $$
declare
  k clinic_forms_key;
  v_clinic uuid;
  v_first text; v_last text; v_birth date; v_phone text; v_signed text; v_as text;
  v_pv text; v_tv text; v_age integer; v_today date := (now() at time zone 'Asia/Manila')::date;
  v_ref text; v_had record;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  tries integer := 0;
begin
  if p_key is null or p_key !~ '^[a-hjkmnp-z2-9]{10}$' then
    return query select 'unknown'::text, null::text, null::text, null::text; return;
  end if;
  select fk.* into k from clinic_forms_key fk join clinic c on c.id = fk.clinic_id and c.archived_at is null where fk.key = p_key;
  if not found then return query select 'unknown'::text, null::text, null::text, null::text; return; end if;
  if k.retired_at is not null then return query select 'replaced'::text, null::text, null::text, null::text; return; end if;
  v_clinic := k.clinic_id;

  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' or p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or octet_length(p_answers::text) > 24576 then
    return query select 'invalid'::text, null::text, null::text, null::text; return;
  end if;

  begin
    v_first  := btrim(p_answers ->> 'first_name');
    v_last   := btrim(p_answers ->> 'last_name');
    v_phone  := p_answers ->> 'mobile';
    v_signed := btrim(p_answers ->> 'signed_name');
    v_as     := p_answers ->> 'signed_as';
    v_pv     := p_answers ->> 'privacy_version';
    v_tv     := p_answers ->> 'treatment_version';
    if coalesce(p_answers ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode = 'check_violation'; end if;
    v_birth  := (p_answers ->> 'birth_date')::date;
    if coalesce(char_length(v_first), 0) not between 1 and 60 or coalesce(char_length(v_last), 0) not between 1 and 60
       or coalesce(v_phone, '') !~ '^09[0-9]{9}$'
       or v_birth > v_today or v_birth < date '1900-01-01'
       or coalesce(char_length(v_signed), 0) not between 2 and 120 or coalesce(v_as, '') not in ('patient', 'guardian')
       or coalesce(p_answers ->> 'consent_treatment', '') <> 'true' or coalesce(p_answers ->> 'consent_privacy', '') <> 'true'
       or coalesce(char_length(p_answers ->> 'v'), 0) not between 1 and 40 then
      raise exception using errcode = 'check_violation';
    end if;
    -- Under 18 on the Manila calendar: a parent or guardian signs, and is named on the form.
    v_age := extract(year from age(v_today, v_birth))::integer;
    if v_age < 18 and (v_as <> 'guardian' or coalesce(btrim(p_answers ->> 'guardian_name'), '') = '') then
      raise exception using errcode = 'check_violation';
    end if;
  exception when check_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    return query select 'invalid'::text, null::text, null::text, null::text; return;
  end;

  -- The wording the patient agreed to must be the wording in force.
  if v_pv is distinct from (current_consent_of('privacy')).id or v_tv is distinct from (current_consent_of('treatment')).id then
    return query select 'changed'::text, null::text, null::text, null::text; return;
  end if;

  -- Sent before. The very same form (a refresh, a double tap): the same reference. The same nonce with
  -- other answers is not that form: nothing is saved, and it is never told the other one's reference.
  select f.ref, f.answers, f.first_name, f.signed_as into v_had from patient_form f where f.clinic_id = v_clinic and f.nonce = p_nonce;
  if found then
    if v_had.answers = p_answers then return query select 'again'::text, v_had.ref, v_had.first_name, v_had.signed_as;
    else return query select 'resend'::text, null::text, null::text, null::text; end if;
    return;
  end if;

  if (select count(*) from patient_form f where f.clinic_id = v_clinic and f.forms_key = k.key and f.status = 'new') >= 500 then
    return query select 'full'::text, null::text, null::text, null::text; return;
  end if;

  loop
    tries := tries + 1;
    v_ref := 'QR-' || (select string_agg(substr(alphabet, 1 + (get_byte(b, i) % 31), 1), '' order by i)
                         from (select gen_random_bytes(4) as b) r, generate_series(0, 3) as i);
    begin
      insert into patient_form (clinic_id, forms_key, ref, nonce, form_version, answers, first_name, last_name, birth_date, phone,
                                signed_by_name, signed_as, privacy_version, treatment_version)
      values (v_clinic, k.key, v_ref, p_nonce, p_answers ->> 'v', p_answers, v_first, v_last, v_birth, v_phone,
              v_signed, v_as, v_pv, v_tv);
      return query select 'saved'::text, v_ref, v_first, v_as;
      return;
    exception
      when unique_violation then
        -- The same nonce at the same moment (two taps): the first one's reference, if it is the same form.
        select f.ref, f.answers, f.first_name, f.signed_as into v_had from patient_form f where f.clinic_id = v_clinic and f.nonce = p_nonce;
        if found then
          if v_had.answers = p_answers then return query select 'again'::text, v_had.ref, v_had.first_name, v_had.signed_as;
          else return query select 'resend'::text, null::text, null::text, null::text; end if;
          return;
        end if;
        -- Otherwise the reference was taken: draw another.
        if tries >= 12 then raise exception 'patient_form_submit: no free reference after 12 tries'; end if;
      when check_violation or not_null_violation or string_data_right_truncation then
        return query select 'invalid'::text, null::text, null::text, null::text; return;
    end;
  end loop;
end $$;

revoke all on function current_consent_of(text) from public;
revoke all on function patient_forms_clinic(text) from public;
revoke all on function patient_form_submit(text, text, jsonb) from public;
grant execute on function current_consent_version() to flossify_app;
grant execute on function current_consent_of(text) to flossify_app;
grant execute on function patient_forms_clinic(text) to flossify_app;
grant execute on function patient_form_submit(text, text, jsonb) to flossify_app;

-- ---------------------------------------------------------------------------
-- Retention: text logs after two years (017), and a patient form nobody added
-- 30 days after it was sent (dismissed, or never looked at). An added form is
-- part of the patient's record and stays with it. The worker runs this every
-- pass (scripts/sms/worker.ts); it returns how many rows went, both kinds.
-- ---------------------------------------------------------------------------
create or replace function retention_purge()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; m integer;
begin
  delete from message_log where created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  delete from patient_form where status <> 'added' and submitted_at < now() - interval '30 days';
  get diagnostics m = row_count;
  return n + m;
end $$;

grant execute on function retention_purge() to flossify_app;
