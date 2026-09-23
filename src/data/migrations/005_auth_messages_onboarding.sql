-- 005 — sign-in hardening, the outgoing text queue, and clinics that set
-- themselves up.
--
-- Rules kept: clinic data stays under forced RLS; anything that has to run
-- without a tenant (sign-in, the text sender, an inbound reply) goes through
-- a security-definer function that does one narrow thing. Staff, codes,
-- sign-in events and rate-limit counters are not clinic data and are not
-- under RLS; they never join to a patient.

-- ---------------------------------------------------------------------------
-- Staff: a mobile (the channel a reset code is texted to), a token version
-- (bumped on every password change, which signs out every session at once),
-- and invitation bookkeeping.
-- ---------------------------------------------------------------------------
alter table staff add column if not exists phone text;
alter table staff add column if not exists token_version integer not null default 0;
alter table staff add column if not exists password_set_at timestamptz;
alter table staff add column if not exists invited_at timestamptz;
alter table staff add column if not exists invited_by uuid references staff(id) on delete set null;

-- One-time codes, six digits, texted to the person: password reset and
-- invitations. Stored hashed; five wrong tries void one; one live code per
-- purpose per person.
create table if not exists one_time_code (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  purpose       text not null check (purpose in ('reset', 'invite')),
  code_hash     text not null,
  attempts      smallint not null default 0,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists one_time_code_live on one_time_code (staff_id, purpose) where used_at is null;

-- What happened at the door. Kept apart from audit_log, which is per clinic
-- and needs a tenant; a failed sign-in has neither.
create table if not exists auth_event (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  kind          text not null,
  email         citext,
  staff_id      uuid references staff(id) on delete set null,
  ip            inet,
  user_agent    text
);
create index if not exists auth_event_at on auth_event (at desc);
-- 002 granted the sequences that existed then; this one is new, and any later
-- serial gets the same by default.
grant usage, select on sequence auth_event_id_seq to flossify_app;
alter default privileges in schema public grant usage, select on sequences to flossify_app;

-- ---------------------------------------------------------------------------
-- Rate limits: a fixed-window counter per key ('login:e:<email>',
-- 'book:ip:<addr>'…). The database owns the count so every server instance
-- sees the same number. One function, one round trip.
-- ---------------------------------------------------------------------------
create table if not exists throttle (
  key           text primary key,
  hits          integer not null default 0,
  window_start  timestamptz not null default now()
);

create or replace function throttle_hit(p_key text, p_limit integer, p_window interval)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql security definer set search_path = public as $$
declare r throttle;
begin
  insert into throttle as t (key, hits, window_start) values (p_key, 1, now())
  on conflict (key) do update set
    hits = case when t.window_start + p_window <= now() then 1 else t.hits + 1 end,
    window_start = case when t.window_start + p_window <= now() then now() else t.window_start end
  returning t.* into r;
  -- Housekeeping on the cheap: now and then drop windows nobody will read again.
  if random() < 0.01 then delete from throttle where window_start < now() - interval '1 day'; end if;
  return query select r.hits <= p_limit, r.hits,
    greatest(0, extract(epoch from (r.window_start + p_window - now()))::integer);
end $$;

-- ---------------------------------------------------------------------------
-- The text queue. Rows are written by the app inside a clinic transaction and
-- sent by a worker that has no tenant, so the worker claims and marks them
-- through the two functions below and nothing else.
-- ---------------------------------------------------------------------------
alter table message_log drop constraint if exists message_log_status_check;
alter table message_log add constraint message_log_status_check
  check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled'));
alter table message_log
  add column if not exists direction       text not null default 'out' check (direction in ('out', 'in')),
  -- confirmation | reminder | reset | invite | reply | manual
  add column if not exists kind            text,
  add column if not exists dedupe_key      text,
  add column if not exists appointment_id  uuid references appointment(id) on delete set null,
  add column if not exists staff_id        uuid references staff(id) on delete set null,
  add column if not exists attempts        smallint not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists provider_status text;
create unique index if not exists message_log_dedupe on message_log (dedupe_key) where dedupe_key is not null;
create index if not exists message_log_due on message_log (next_attempt_at) where status = 'queued' and direction = 'out';

-- Claim up to p_limit due texts, across clinics, marking them 'sending' so a
-- second worker cannot take them. Returns only what the sender needs.
create or replace function sms_claim_due(p_limit integer)
returns table (id uuid, clinic_id uuid, to_address text, body text, kind text, attempts smallint)
language sql security definer set search_path = public as $$
  with due as (
    select m.id from message_log m
    where m.direction = 'out' and m.channel = 'sms' and m.status = 'queued' and m.next_attempt_at <= now()
    order by m.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update message_log m set status = 'sending', attempts = m.attempts + 1
  from due where m.id = due.id
  returning m.id, m.clinic_id, m.to_address, m.body, m.kind, m.attempts
$$;

-- Record the outcome. 'queued' with a retry interval puts it back for later;
-- a hold (queued with no error — quiet hours) gives the claimed attempt back,
-- so a text held overnight still gets its full four tries.
create or replace function sms_mark(p_id uuid, p_status text, p_provider_ref text, p_error text, p_retry_in interval)
returns void
language sql security definer set search_path = public as $$
  update message_log set
    status = p_status,
    attempts = case when p_status = 'queued' and p_error is null then greatest(attempts - 1, 0) else attempts end,
    provider_ref = coalesce(p_provider_ref, provider_ref),
    failed_reason = p_error,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    next_attempt_at = case when p_status = 'queued' then now() + coalesce(p_retry_in, interval '5 minutes') else next_attempt_at end
  where id = p_id and status = 'sending'
$$;

-- Tomorrow's visits get one reminder each, once, across every clinic. The
-- text names the clinic and asks for a Y. No link in it: telcos block them.
create or replace function sms_enqueue_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, kind, dedupe_key)
  select a.clinic_id, a.patient_id, a.id, 'sms', coalesce(a.booked_by_phone, p.phone),
    c.name || ': reminder for ' || coalesce(a.reason, 'your visit') || ' tomorrow, '
      || to_char(a.starts_at at time zone 'Asia/Manila', 'FMDy FMHH12:MI am')
      || case when s.full_name is not null then ' with ' || s.full_name else '' end
      || '. Reply Y to confirm, or call ' || coalesce(c.phone, 'the clinic') || ' to move it.',
    'queued', 'reminder', 'reminder:' || a.id
  from appointment a
  join patient p on p.id = a.patient_id
  join clinic c on c.id = a.clinic_id
  left join staff s on s.id = a.dentist_id
  where a.status in ('booked', 'confirmed')
    and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date + 1
    and coalesce(a.booked_by_phone, p.phone) is not null
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- A reply from a patient. Y confirms their next visit; anything else is kept
-- for the desk to read. Matched on the last ten digits of the sender.
create or replace function sms_inbound(p_from text, p_text text)
returns table (clinic_id uuid, appointment_id uuid, action text)
language plpgsql security definer set search_path = public as $$
declare
  k text := right(regexp_replace(p_from, '\D', '', 'g'), 10);
  a record;
begin
  select a2.id, a2.clinic_id, a2.patient_id, a2.status into a
  from appointment a2 join patient p on p.id = a2.patient_id
  where right(regexp_replace(coalesce(a2.booked_by_phone, p.phone, ''), '\D', '', 'g'), 10) = k
    and a2.status in ('booked', 'confirmed') and a2.starts_at > now()
  order by a2.starts_at limit 1;
  if a.id is null then
    return query select null::uuid, null::uuid, 'unmatched'::text; return;
  end if;
  insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, direction, kind)
  values (a.clinic_id, a.patient_id, a.id, 'sms', p_from, left(p_text, 500), 'delivered', 'in', 'reply');
  if upper(btrim(p_text)) in ('Y', 'YES', 'OO', 'OPO', 'CONFIRM', 'OK') then
    update appointment set status = 'confirmed' where id = a.id and status = 'booked';
    insert into audit_log (clinic_id, action, entity, entity_id) values (a.clinic_id, 'appointment.confirmed_by_text', 'appointment', a.id);
    return query select a.clinic_id, a.id, 'confirmed'::text;
  else
    return query select a.clinic_id, a.id, 'logged'::text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Clinics that set themselves up: a clinic exists before it is ready to be
-- found. `listed` is the owner's switch, and the public directory reads only
-- listed clinics.
-- ---------------------------------------------------------------------------
alter table clinic add column if not exists listed boolean not null default false;
alter table clinic add column if not exists email text;
alter table clinic add column if not exists maps_url text;
-- Anything that existed before this switch was already public.
update clinic set listed = true where listed = false and created_at < now();

drop function if exists public_directory();
create function public_directory()
returns table (
  id uuid, slug text, name text, area text, address text, phone text, about text,
  booking_mode text, walk_ins boolean, chairs smallint, founded smallint,
  philhealth_dental boolean, photo_keys text[],
  hours jsonb, hmos text[], dentists jsonb, fees jsonb, email text, maps_url text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.slug::text, c.name, c.area, c.address_line, c.phone, c.about,
    c.booking_mode, c.walk_ins, c.chairs, c.founded, c.philhealth_dental, c.photo_keys,
    coalesce((select jsonb_object_agg(h.dow, jsonb_build_array(h.open_min, h.close_min)) from clinic_hours h where h.clinic_id = c.id), '{}'::jsonb),
    coalesce((select array_agg(m.hmo_id order by m.hmo_id) from clinic_hmo m where m.clinic_id = c.id), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'name', s.full_name, 'specialty', s.specialty, 'practices', s.practices,
        'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member, 'since', s.practising_since, 'about', s.about,
        'days', (select coalesce(array_agg(ss.dow order by ss.dow), '{}') from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)
      ) order by s.role = 'owner' desc, s.full_name)
      from staff s
      where s.slug is not null and s.disabled_at is null
        and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'local', p.local_name, 'category', p.category,
        'min', p.default_price, 'max', p.price_max, 'from', p.price_from, 'unit', p.unit, 'minutes', p.minutes
      ) order by p.category, p.default_price)
      from procedure_catalog p where p.clinic_id = c.id and p.active), '[]'::jsonb),
    c.email, c.maps_url
  from clinic c
  where c.archived_at is null and c.listed
  order by c.name
$$;

-- Slug availability, checked before a tenant exists (sign-up).
create or replace function clinic_slug_taken(p_slug text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from clinic where slug = p_slug)
$$;

grant execute on function throttle_hit(text, integer, interval) to flossify_app;
grant execute on function sms_claim_due(integer) to flossify_app;
grant execute on function sms_mark(uuid, text, text, text, interval) to flossify_app;
grant execute on function sms_enqueue_reminders() to flossify_app;
grant execute on function sms_inbound(text, text) to flossify_app;
grant execute on function public_directory() to flossify_app;
grant execute on function clinic_slug_taken(text) to flossify_app;
