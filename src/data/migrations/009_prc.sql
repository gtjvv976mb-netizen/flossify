-- 009 — PRC licence checks, and what Flossify's own operations pages read.
--
-- A PRC check is a person's act: someone at Flossify looks the number up at
-- verification.prc.gov.ph and records what they found. Until then the public
-- profile says "PRC check pending" (prc_checked_on is null). A licence that
-- does not match is recorded as such and the date is cleared, so the public
-- pages fall back to pending on their own; the owner is told by text from
-- the page, not from here.
--
-- Operations admins (platform_admin, 008) have no tenant, so everything they
-- read across clinics goes through the definer functions below, each of which
-- returns exactly the columns its page shows: never a patient's name, never
-- the text of a message.

-- ---------------------------------------------------------------------------
-- Staff: the outcome of the check, who recorded it, and a note.
-- ---------------------------------------------------------------------------
alter table staff add column if not exists prc_checked_by uuid references staff(id) on delete set null;
alter table staff add column if not exists prc_note text;
alter table staff add column if not exists prc_status text not null default 'pending';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_prc_status_check') then
    alter table staff add constraint staff_prc_status_check check (prc_status in ('pending', 'checked', 'mismatch'));
  end if;
end $$;
-- A date already on file was a check somebody made; it keeps its standing.
update staff set prc_status = 'checked' where prc_checked_on is not null and prc_status = 'pending';

-- ---------------------------------------------------------------------------
-- The queue: every dentist with a public profile, their home clinic, and who
-- owns it. Pending first, then the longest-waiting.
-- ---------------------------------------------------------------------------
drop function if exists admin_prc_queue();
create function admin_prc_queue()
returns table (
  staff_id uuid, full_name text, prc_licence text, prc_status text, prc_checked_on date,
  prc_checked_by_name text, prc_note text, role text,
  clinic_id uuid, clinic_name text, clinic_slug text, clinic_listed boolean,
  owner_id uuid, owner_name text, owner_phone text, added_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select s.id, s.full_name, s.prc_licence, s.prc_status, s.prc_checked_on,
         b.full_name, s.prc_note, s.role,
         c.id, c.name, c.slug::text, c.listed,
         o.id, o.full_name, o.phone, s.created_at
  from staff s
  left join staff b on b.id = s.prc_checked_by
  left join clinic c on c.id = s.home_clinic_id and c.archived_at is null
  left join lateral (
    select ow.id, ow.full_name, ow.phone
    from staff_access a join staff ow on ow.id = a.staff_id
    where a.clinic_id = c.id and ow.role = 'owner' and ow.disabled_at is null
    order by (ow.home_clinic_id = c.id) desc, ow.created_at
    limit 1
  ) o on true
  where s.slug is not null and s.disabled_at is null
  order by (s.prc_status = 'pending') desc, s.created_at
$$;

-- Record the outcome. 'checked' stamps today; 'mismatch' and 'pending' clear
-- the date so the public profile says pending. Only a dentist with a public
-- profile can be marked: the same rows the queue shows.
create or replace function admin_prc_mark(p_staff uuid, p_status text, p_note text, p_by uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_status not in ('pending', 'checked', 'mismatch') then
    raise exception 'admin_prc_mark: status must be pending, checked or mismatch';
  end if;
  update staff set
    prc_status = p_status,
    prc_checked_on = case when p_status = 'checked' then (now() at time zone 'Asia/Manila')::date else null end,
    prc_checked_by = p_by,
    prc_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_staff and slug is not null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------------------
-- The overview: the numbers on /admin/, and nothing behind them.
-- ---------------------------------------------------------------------------
drop function if exists admin_overview();
create function admin_overview()
returns table (
  dentists_pending integer, dentists_mismatch integer,
  clinics_total integer, clinics_listed integer, clinics_this_month integer,
  texts_failed_7d integer, texts_queued integer, bookings_web_7d integer
)
language sql security definer stable set search_path = public as $$
  select
    (select count(*) from staff s where s.slug is not null and s.disabled_at is null and s.prc_status = 'pending')::integer,
    (select count(*) from staff s where s.slug is not null and s.disabled_at is null and s.prc_status = 'mismatch')::integer,
    (select count(*) from clinic c where c.archived_at is null)::integer,
    (select count(*) from clinic c where c.archived_at is null and c.listed)::integer,
    (select count(*) from clinic c where c.archived_at is null
       and date_trunc('month', c.created_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila'))::integer,
    (select count(*) from message_log m where m.direction = 'out' and m.status = 'failed' and m.created_at > now() - interval '7 days')::integer,
    (select count(*) from message_log m where m.direction = 'out' and m.status = 'queued')::integer,
    (select count(*) from appointment a where a.source in ('web', 'request') and a.created_at > now() - interval '7 days')::integer
$$;

-- ---------------------------------------------------------------------------
-- The clinics list: one row per clinic, its owner, and three counts. Newest
-- first, because a new clinic is the one operations has something to do for.
-- Dentists are counted through staff_access (who may open the branch), not
-- staff_schedule: Team can add a dentist before giving them any days.
-- ---------------------------------------------------------------------------
drop function if exists admin_clinics();
create function admin_clinics()
returns table (
  id uuid, name text, slug text, area text, listed boolean, booking_mode text, created_at timestamptz,
  owner_name text, owner_email text, owner_phone text,
  dentists integer, patients integer, bookings_web_30d integer
)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.slug::text, c.area, c.listed, c.booking_mode, c.created_at,
         o.full_name, o.email::text, o.phone,
         (select count(*) from staff_access a join staff s on s.id = a.staff_id
           where a.clinic_id = c.id and s.slug is not null and s.disabled_at is null)::integer,
         (select count(*) from patient p where p.clinic_id = c.id and p.archived_at is null)::integer,
         (select count(*) from appointment a where a.clinic_id = c.id and a.source in ('web', 'request')
           and a.created_at > now() - interval '30 days')::integer
  from clinic c
  left join lateral (
    select ow.full_name, ow.email, ow.phone
    from staff_access a join staff ow on ow.id = a.staff_id
    where a.clinic_id = c.id and ow.role = 'owner' and ow.disabled_at is null
    order by (ow.home_clinic_id = c.id) desc, ow.created_at
    limit 1
  ) o on true
  where c.archived_at is null
  order by c.created_at desc, c.name
$$;

grant execute on function admin_prc_queue() to flossify_app;
grant execute on function admin_prc_mark(uuid, text, text, uuid) to flossify_app;
grant execute on function admin_overview() to flossify_app;
grant execute on function admin_clinics() to flossify_app;
