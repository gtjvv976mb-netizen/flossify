-- 027 — the operator's master page (/admin/, "Flossify control").
--
-- Flossify's own people have no tenant, so everything they read across
-- clinics goes through a security-definer function that returns exactly what
-- the page shows (009 PRC and clinics, 011 billing, 024 online payments).
-- These add the master page: one row of numbers for the whole service, one
-- row per clinic, the operators' own log, and the schema's state; and the
-- text sender's heartbeat, stamped by the claim the sender already makes.
--
-- Patients and bookings are COUNTED here, never listed: none of these
-- functions returns a patient's name, number, birth date or record, the text
-- of a message, or anything keyed to one patient. What an operator may see of
-- a person is staff: an owner's name and contact (to call them), a dentist's
-- name (the PRC queue already shows it).
--
-- auth_event gains a detail line, so an operator's billing action says which
-- invoice or group it touched ("FL-2026-09-0003 · Highland Dental Group").
-- It is written only by the operations pages and never carries patient data.

alter table auth_event add column if not exists detail text;

-- ---------------------------------------------------------------------------
-- The sender's heartbeat. The text worker (scripts/sms/worker.ts) calls
-- sms_claim_due() once every pass, every ten seconds, whether or not a text is
-- due, so the claim stamps the time here as it hands over: the system pane
-- reads how long ago the sender last asked for work, which an empty queue
-- cannot tell. One row per sender ('sms'). Nothing else is kept.
--
-- sms_claim_due below is 005's, unchanged, with the stamp before it (023 left
-- it as it was). The worker needs no change.
-- ---------------------------------------------------------------------------
create table if not exists worker_heartbeat (
  name    text primary key,
  beat_at timestamptz not null
);
-- 002's default privileges gave the app every right on it. It needs none:
-- the claim (definer) writes it and admin_control() (definer) reads it.
revoke all on worker_heartbeat from flossify_app;

create or replace function sms_claim_due(p_limit integer)
returns table (id uuid, clinic_id uuid, to_address text, body text, kind text, attempts smallint)
language sql security definer set search_path = public as $$
  insert into worker_heartbeat (name, beat_at) values ('sms', now())
    on conflict (name) do update set beat_at = excluded.beat_at;
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

-- ---------------------------------------------------------------------------
-- The numbers across the service: the tiles and the sender's heartbeat.
--
-- Branch counts follow the group's subscription (011): a branch is "on trial"
-- when its group is. Staff are the people of clinic groups, not Flossify's own
-- (platform_admin) and not switched-off accounts. Texts are SMS only (the
-- email rows are sign-in codes and have their own sender switch). "Overdue" is
-- a queued text whose time came more than two minutes ago: the sender takes
-- due texts every ten seconds, and a text it holds for quiet hours is put back
-- with a later time, so a count here means the sender is behind or stopped.
-- sender_beat_at is the heartbeat above (null until the sender has run once
-- since this migration).
-- ---------------------------------------------------------------------------
drop function if exists admin_control();
create function admin_control()
returns table (
  clinics_total integer, clinics_listed integer, clinics_this_month integer,
  branches_trial integer, branches_trial_ending_7d integer, branches_trial_ended integer,
  branches_active integer, branches_past_due integer, branches_cancelled integer, branches_no_plan integer,
  staff_total integer, staff_owners integer, staff_dentists integer, staff_desk integer, staff_invited integer,
  patients_total integer, patients_this_month integer,
  visits_today integer, visits_next_7d integer, bookings_made_7d integer, bookings_web_7d integer,
  texts_queued integer, texts_overdue integer, texts_overdue_since timestamptz, texts_sending integer,
  texts_failed_7d integer, texts_sent_24h integer, last_sent_at timestamptz, sender_beat_at timestamptz,
  prc_pending integer, prc_mismatch integer
)
language sql security definer stable set search_path = public as $$
  with
  tdy as (select (now() at time zone 'Asia/Manila')::date as d),
  mon as (select date_trunc('month', now() at time zone 'Asia/Manila') as m),
  branch as (
    select c.id, c.listed, c.created_at, s.status, s.trial_ends_at
      from clinic c left join subscription s on s.group_id = c.group_id
     where c.archived_at is null
  ),
  people as (
    select s.role, s.password_hash is null as invited
      from staff s
     where s.disabled_at is null
       and not exists (select 1 from platform_admin pa where pa.staff_id = s.id)
       and exists (select 1 from clinic c where c.group_id = s.group_id and c.archived_at is null)
  ),
  texts as (
    select m.status, m.next_attempt_at, m.sent_at, m.created_at
      from message_log m where m.direction = 'out' and m.channel = 'sms'
  )
  select
    (select count(*) from branch)::integer,
    (select count(*) from branch where listed)::integer,
    (select count(*) from branch, mon where date_trunc('month', created_at at time zone 'Asia/Manila') = mon.m)::integer,
    (select count(*) from branch where status = 'trial')::integer,
    (select count(*) from branch where status = 'trial' and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days')::integer,
    (select count(*) from branch where status = 'trial' and trial_ends_at <= now())::integer,
    (select count(*) from branch where status = 'active')::integer,
    (select count(*) from branch where status = 'past_due')::integer,
    (select count(*) from branch where status = 'cancelled')::integer,
    (select count(*) from branch where status is null)::integer,
    (select count(*) from people)::integer,
    (select count(*) from people where role = 'owner')::integer,
    (select count(*) from people where role in ('dentist', 'associate'))::integer,
    (select count(*) from people where role in ('admin', 'secretary', 'assistant'))::integer,
    (select count(*) from people where invited)::integer,
    (select count(*) from patient p where p.archived_at is null)::integer,
    (select count(*) from patient p, mon where p.archived_at is null
       and date_trunc('month', p.created_at at time zone 'Asia/Manila') = mon.m)::integer,
    (select count(*) from appointment a, tdy where a.status <> 'cancelled'
       and (a.starts_at at time zone 'Asia/Manila')::date = tdy.d)::integer,
    (select count(*) from appointment a, tdy where a.status <> 'cancelled'
       and (a.starts_at at time zone 'Asia/Manila')::date between tdy.d and tdy.d + 6)::integer,
    (select count(*) from appointment a where a.created_at > now() - interval '7 days')::integer,
    (select count(*) from appointment a where a.source in ('web', 'request') and a.created_at > now() - interval '7 days')::integer,
    (select count(*) from texts where status = 'queued')::integer,
    (select count(*) from texts where status = 'queued' and next_attempt_at < now() - interval '2 minutes')::integer,
    (select min(next_attempt_at) from texts where status = 'queued' and next_attempt_at < now() - interval '2 minutes'),
    (select count(*) from texts where status = 'sending')::integer,
    (select count(*) from texts where status = 'failed' and created_at > now() - interval '7 days')::integer,
    (select count(*) from texts where sent_at > now() - interval '24 hours')::integer,
    (select max(sent_at) from texts),
    (select h.beat_at from worker_heartbeat h where h.name = 'sms'),
    (select count(*) from staff s where s.slug is not null and s.disabled_at is null and s.prc_status = 'pending')::integer,
    (select count(*) from staff s where s.slug is not null and s.disabled_at is null and s.prc_status = 'mismatch')::integer
$$;

-- ---------------------------------------------------------------------------
-- One row per clinic (branch): the clinics table and its detail drawer.
-- Newest first. Every figure about patients, visits and texts is a count.
--
-- last_activity is the latest of: the sign-up itself, a sign-in by anyone who
-- may open the branch, a booking made, a record change in its audit log (not
-- by Flossify's own people), a patient added, a text the desk wrote. Nothing
-- about what the activity was, or whose record it touched.
-- ---------------------------------------------------------------------------
create or replace function admin_clinic_rows()
returns table (
  id uuid, name text, slug text, area text, city text, province text, created_at timestamptz,
  listed boolean, booking_mode text,
  group_id uuid, group_name text, group_branches integer,
  plan_status text, trial_ends_at timestamptz, price_per_branch numeric,
  due_count integer, due_amount numeric,
  owner_name text, owner_email text, owner_phone text,
  dentists integer, team integer, invited integer,
  patients integer, bookings_30d integer, bookings_web_30d integer,
  visits_today integer, visits_next_7d integer,
  texts_failed_7d integer, texts_queued integer,
  prc_pending integer, hours_days integer, services integer, photos integer,
  last_signin timestamptz, last_activity timestamptz
)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.slug::text, c.area, c.city, c.province, c.created_at,
         c.listed, c.booking_mode,
         g.id, g.name, group_branches(g.id),
         s.status, s.trial_ends_at, s.price_per_branch,
         (select count(*) from subscription_invoice i where i.group_id = g.id and i.status = 'due')::integer,
         (select coalesce(sum(i.amount), 0) from subscription_invoice i where i.group_id = g.id and i.status = 'due')::numeric,
         o.full_name, o.email::text, o.phone,
         (select count(*) from staff_access a join staff st on st.id = a.staff_id
           where a.clinic_id = c.id and st.slug is not null and st.disabled_at is null)::integer,
         (select count(*) from staff_access a join staff st on st.id = a.staff_id
           where a.clinic_id = c.id and st.disabled_at is null)::integer,
         (select count(*) from staff_access a join staff st on st.id = a.staff_id
           where a.clinic_id = c.id and st.disabled_at is null and st.password_hash is null)::integer,
         (select count(*) from patient p where p.clinic_id = c.id and p.archived_at is null)::integer,
         (select count(*) from appointment a where a.clinic_id = c.id and a.created_at > now() - interval '30 days')::integer,
         (select count(*) from appointment a where a.clinic_id = c.id and a.source in ('web', 'request')
           and a.created_at > now() - interval '30 days')::integer,
         (select count(*) from appointment a where a.clinic_id = c.id and a.status <> 'cancelled'
           and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date)::integer,
         (select count(*) from appointment a where a.clinic_id = c.id and a.status <> 'cancelled'
           and (a.starts_at at time zone 'Asia/Manila')::date between (now() at time zone 'Asia/Manila')::date
                                                                  and (now() at time zone 'Asia/Manila')::date + 6)::integer,
         (select count(*) from message_log m where m.clinic_id = c.id and m.direction = 'out' and m.channel = 'sms'
           and m.status = 'failed' and m.created_at > now() - interval '7 days')::integer,
         (select count(*) from message_log m where m.clinic_id = c.id and m.direction = 'out' and m.channel = 'sms'
           and m.status = 'queued')::integer,
         (select count(*) from staff st where st.home_clinic_id = c.id and st.slug is not null
           and st.disabled_at is null and st.prc_status = 'pending')::integer,
         (select count(*) from clinic_hours h where h.clinic_id = c.id)::integer,
         (select count(*) from procedure_catalog pc where pc.clinic_id = c.id and pc.active)::integer,
         coalesce(cardinality(c.photo_keys), 0)::integer,
         li.at,
         greatest(
           c.created_at,
           li.at,
           (select max(a.created_at) from appointment a where a.clinic_id = c.id),
           (select max(l.at) from audit_log l where l.clinic_id = c.id
              and not exists (select 1 from platform_admin pa where pa.staff_id = l.staff_id)),
           (select max(p.created_at) from patient p where p.clinic_id = c.id),
           (select max(m.created_at) from message_log m where m.clinic_id = c.id and m.direction = 'out' and m.kind = 'manual')
         )
    from clinic c
    join clinic_group g on g.id = c.group_id
    left join subscription s on s.group_id = g.id
    left join lateral (
      select ow.full_name, ow.email, ow.phone
        from staff_access a join staff ow on ow.id = a.staff_id
       where a.clinic_id = c.id and ow.role = 'owner' and ow.disabled_at is null
       order by (ow.home_clinic_id = c.id) desc, ow.created_at
       limit 1
    ) o on true
    left join lateral (
      select max(e.at) as at
        from auth_event e
       where e.kind = 'login.ok'
         and e.staff_id in (select a.staff_id from staff_access a where a.clinic_id = c.id)
    ) li on true
   where c.archived_at is null
   order by c.created_at desc, c.name
$$;

-- ---------------------------------------------------------------------------
-- The operators' own log, newest first: what Flossify's people did — signing
-- in and out, billing actions (auth_event, with the new detail line), and PRC
-- marks (audit_log, written inside the dentist's clinic). A PRC mark names
-- the dentist and the clinic; any other audit entity is left unnamed, so a
-- patient can never appear here even if a future page logs one.
-- ---------------------------------------------------------------------------
create or replace function admin_audit(p_limit integer)
returns table (at timestamptz, staff_id uuid, staff_name text, action text, detail text, clinic_name text, subject text)
language sql security definer stable set search_path = public as $$
  select * from (
    select e.at, e.staff_id, s.full_name, e.kind, e.detail, null::text, null::text
      from auth_event e
      join platform_admin pa on pa.staff_id = e.staff_id
      join staff s on s.id = e.staff_id
    union all
    select l.at, l.staff_id, s.full_name, l.action, null::text, c.name,
           case when l.entity = 'staff' then d.full_name end
      from audit_log l
      join platform_admin pa on pa.staff_id = l.staff_id
      join staff s on s.id = l.staff_id
      left join clinic c on c.id = l.clinic_id
      left join staff d on l.entity = 'staff' and d.id = l.entity_id
  ) t (at, staff_id, staff_name, action, detail, clinic_name, subject)
  order by t.at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- The database's own state for the system pane: the newest migration it has
-- recorded and how many. schema_migrations belongs to the migration runner and
-- is not the app's to read, so this is the one narrow window onto it.
-- ---------------------------------------------------------------------------
create or replace function admin_schema()
returns table (newest text, applied integer, last_applied_at timestamptz)
language sql security definer stable set search_path = public as $$
  select max(name) filter (where name ~ '^[0-9]'), count(*)::integer, max(applied_at) from schema_migrations
$$;

revoke all on function admin_control() from public;
revoke all on function admin_clinic_rows() from public;
revoke all on function admin_audit(integer) from public;
grant execute on function admin_control() to flossify_app;
grant execute on function admin_clinic_rows() to flossify_app;
grant execute on function admin_audit(integer) to flossify_app;
revoke all on function admin_schema() from public;
grant execute on function admin_schema() to flossify_app;
