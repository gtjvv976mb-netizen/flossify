-- 040 — blocked time: lunch, closed days, a dentist's hours and leave, a chair out of use, honoured by
-- the public slots, the booking API, the status pill, the desk's calendar and its clash rule.
--
-- The weekly shape lives with the week: lunch is a break on clinic_hours; a dentist's hours are from/to on
-- staff_schedule (null = the clinic's hours). Dated exceptions live in clinic_block (no weekly rows, no
-- lunch kind: one fact, one place). clinic_unavailable() turns all of it into dated ranges and is the only
-- thing that does: the desk reads it under row-level security, the public through public_blocked_ranges(),
-- which never returns a note, an author, or whether a dentist is on leave or simply not in. The public slot
-- rule reads visits through public_busy_ranges(): times, the dentist's slug, and whether there is a dentist.
-- Deferred on purpose, for the owner to decide: a turnover buffer, a protected emergency hold, and a list of
-- Philippine holidays (Holy Week and Eid are proclaimed each year; nobody here keeps such a list current).

-- 1. Lunch: one break a weekday, inside the day's hours. A CHECK that comes out NULL passes, so "both ends
--    or neither" is its own check; with it, the second check always has both ends to compare.
alter table clinic_hours
  add column if not exists break_from_min smallint,
  add column if not exists break_to_min   smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_hours_break_pair') then
    alter table clinic_hours add constraint clinic_hours_break_pair check (num_nonnulls(break_from_min, break_to_min) in (0, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinic_hours_break_ok') then
    alter table clinic_hours add constraint clinic_hours_break_ok check (
      break_from_min is null
      or (break_from_min > open_min and break_to_min < close_min and break_to_min > break_from_min));
  end if;
end $$;

-- 2. A dentist's hours on a day they are in. Null, null = the clinic's hours that day. Both or neither.
alter table staff_schedule
  add column if not exists from_min smallint,
  add column if not exists to_min   smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_schedule_hours_pair') then
    alter table staff_schedule add constraint staff_schedule_hours_pair check (num_nonnulls(from_min, to_min) in (0, 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_schedule_hours_ok') then
    alter table staff_schedule add constraint staff_schedule_hours_ok check (
      from_min is null
      or (from_min between 0 and 1439 and to_min between 1 and 1440 and to_min > from_min));
  end if;
end $$;

-- 3. Dated blocks. Removed, never deleted or edited: a block that was wrong is removed and a new one added.
create table if not exists clinic_block (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete cascade,
  kind        text not null check (kind in ('closed', 'leave', 'chair_out')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  dentist_id  uuid references staff(id) on delete cascade,
  chair       smallint check (chair is null or chair >= 1),
  note        text check (note is null or length(btrim(note)) between 1 and 200),
  created_by  uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references staff(id) on delete set null,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '366 days'),
  check ((kind = 'leave') = (dentist_id is not null)),
  check ((kind = 'chair_out') = (chair is not null)),
  check (removed_by is null or removed_at is not null)
);
create index if not exists clinic_block_live on clinic_block (clinic_id, starts_at, ends_at) where removed_at is null;

alter table clinic_block enable row level security;
alter table clinic_block force row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clinic_block' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on clinic_block
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
      with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;
revoke all on clinic_block from flossify_app;
grant select, insert on clinic_block to flossify_app;
grant update (removed_at, removed_by) on clinic_block to flossify_app;

create or replace function clinic_block_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.removed_at is not null then raise exception 'A removed block stays removed; add a new one.'; end if;
  if new.removed_at is null then raise exception 'A block is only ever removed.'; end if;
  return new;
end $$;
drop trigger if exists clinic_block_guard on clinic_block;
create trigger clinic_block_guard before update on clinic_block for each row execute function clinic_block_guard();

-- 4. A visit left in closed time on purpose ("Book anyway", "Move anyway", a walk-in, Calls → Keep it).
--    Null = nobody has looked: if it sits in closed time it is on Calls → In closed time. Filled for visits
--    already on the book in step 6, after the reader exists.
alter table appointment add column if not exists blocked_ok_at timestamptz;

-- 5. Every range a clinic is not open for booking, dated, in [p_from, p_to). Invoker rights: under RLS the
--    app sees its own clinic only (another clinic's id returns nothing). At most 400 days a call: a longer
--    window raises rather than quietly drawing no lunch. Kinds:
--      shut      before opening, after closing, all of a weekday with no hours (none on file at all: open)
--      lunch     clinic_hours' break
--      hours     a dentist (treating role, with any day here) on a weekday they are not in, or outside from/to
--      closed | leave | chair_out   clinic_block rows not removed (block_id set)
create or replace function clinic_unavailable(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (kind text, dentist_id uuid, chair smallint, starts_at timestamptz, ends_at timestamptz, block_id uuid)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
begin
  if p_to - p_from > interval '400 days' then
    raise exception 'clinic_unavailable reads 400 days at most at a time';
  end if;
  if p_to <= p_from then return; end if;
  return query
  with day as (
    select g::date as ymd, extract(dow from g)::smallint as dow, (g::date::timestamp at time zone 'Asia/Manila') as t0
      from generate_series((p_from at time zone 'Asia/Manila')::date::timestamp,
                           (p_to at time zone 'Asia/Manila')::date::timestamp, interval '1 day') g
  ),
  known as (select exists (select 1 from clinic_hours ch where ch.clinic_id = p_clinic) as yes),
  treats as (
    select distinct ss.staff_id from staff_schedule ss join staff st on st.id = ss.staff_id
     where ss.clinic_id = p_clinic and st.disabled_at is null and st.role in ('owner', 'dentist', 'associate')
  ),
  r as (
    select 'shut'::text as kind, null::uuid as dentist_id, null::smallint as chair,
           d.t0 + make_interval(mins => x.a) as starts_at, d.t0 + make_interval(mins => x.b) as ends_at, null::uuid as block_id
      from day d cross join known k
      left join clinic_hours h on h.clinic_id = p_clinic and h.dow = d.dow
      cross join lateral (values (0, coalesce(h.open_min::int, 1440)), (coalesce(h.close_min::int, 1440), 1440)) x(a, b)
     where k.yes and x.b > x.a
    union all
    select 'lunch', null, null, d.t0 + make_interval(mins => h.break_from_min::int), d.t0 + make_interval(mins => h.break_to_min::int), null
      from day d join clinic_hours h on h.clinic_id = p_clinic and h.dow = d.dow
     where h.break_from_min is not null
    union all
    select 'hours', t.staff_id, null, d.t0 + make_interval(mins => x.a), d.t0 + make_interval(mins => x.b), null
      from day d cross join treats t
      left join staff_schedule w on w.staff_id = t.staff_id and w.clinic_id = p_clinic and w.dow = d.dow
      cross join lateral (values
        (0, case when w.dow is null then 1440 else coalesce(w.from_min::int, 0) end),
        (case when w.dow is null then 1440 else coalesce(w.to_min::int, 1440) end, 1440)) x(a, b)
     where x.b > x.a
    union all
    select b.kind, b.dentist_id, b.chair, b.starts_at, b.ends_at, b.id
      from clinic_block b
     where b.clinic_id = p_clinic and b.removed_at is null and b.starts_at < p_to and b.ends_at > p_from
  )
  select r.kind, r.dentist_id, r.chair, r.starts_at, r.ends_at, r.block_id
    from r where r.starts_at < p_to and r.ends_at > p_from;
end $$;
revoke all on function clinic_unavailable(uuid, timestamptz, timestamptz) from public;
grant execute on function clinic_unavailable(uuid, timestamptz, timestamptz) to flossify_app;

-- 6. Visits already on the book that sit in closed time were booked under the old rule ("a closed day is
--    allowed, but said"), so they count as seen. Here closed time is only the weekly shape: outside the hours,
--    a weekday with none, a dentist's weekday off (no lunch, no from/to and no dated block exist yet). Every
--    other visit stays null, so the first lunch or dentist's hours a clinic saves over it puts it on Calls.
--    The migration runs as the admin role (superuser or BYPASSRLS, scripts/db/migrate.ts), so
--    clinic_unavailable sees every clinic's rows here.
update appointment a set blocked_ok_at = now()
 where a.blocked_ok_at is null and a.ends_at > now() and a.status in ('booked', 'confirmed')
   and exists (select 1 from clinic_unavailable(a.clinic_id, a.starts_at, a.ends_at) u
                where u.kind = 'shut' or (u.kind = 'hours' and u.dentist_id = a.dentist_id));

-- 7. The public side of blocked time, next to public_booked_ranges (003): times, the dentist's slug and a
--    chair only, for a listed clinic. A dentist's rows read 'away' whether leave or not in; a chair's 'chair'.
create or replace function public_blocked_ranges(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (kind text, dentist_slug text, chair smallint, starts_at timestamptz, ends_at timestamptz)
language sql security definer stable set search_path = public as $$
  select case when u.dentist_id is not null then 'away' when u.chair is not null then 'chair' else u.kind end,
         s.slug::text, u.chair, u.starts_at, u.ends_at
    from clinic c
    cross join lateral clinic_unavailable(c.id, p_from, p_to) u
    left join staff s on s.id = u.dentist_id
   where c.id = p_clinic and c.archived_at is null and c.listed
     and (u.dentist_id is null or s.slug is not null)
$$;
revoke all on function public_blocked_ranges(uuid, timestamptz, timestamptz) from public;
grant execute on function public_blocked_ranges(uuid, timestamptz, timestamptz) to flossify_app;

-- 8. Busy time for the public slot rule (slotOpen): the dentist's slug and whether the visit has a dentist
--    at all, so a visit with a dentist who is not listed here (another branch's, disabled, no public
--    profile) holds a chair but no listed dentist. Never who is in the chair. public_booked_ranges (003)
--    stays as it is (a new column would change its return type); nothing reads it after this change.
create or replace function public_busy_ranges(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (dentist_slug text, named boolean, starts_at timestamptz, ends_at timestamptz)
language sql security definer stable set search_path = public as $$
  select s.slug::text, a.dentist_id is not null, a.starts_at, a.ends_at
    from appointment a
    join clinic c on c.id = a.clinic_id and c.archived_at is null and c.listed
    left join staff s on s.id = a.dentist_id
   where a.clinic_id = p_clinic and a.status not in ('cancelled', 'no_show')
     and a.starts_at < p_to and a.ends_at > p_from
$$;
revoke all on function public_busy_ranges(uuid, timestamptz, timestamptz) from public;
grant execute on function public_busy_ranges(uuid, timestamptz, timestamptz) to flossify_app;

-- 9. public_directory (014) with lunch in `hours` ([open, close] or [open, close, lunch from, lunch to]) and a
--    dentist's hours in `hours` ({dow: [from, to]}, only days that have them). Same signature: replace.
create or replace function public_directory()
returns table (
  id uuid, slug text, name text, area text, address text, phone text, about text,
  booking_mode text, walk_ins boolean, chairs smallint, founded smallint,
  philhealth_dental boolean, photo_keys text[],
  hours jsonb, hmos text[], dentists jsonb, fees jsonb, email text, maps_url text,
  dpo_name text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.slug::text, c.name, c.area, c.address_line, c.phone, c.about,
    c.booking_mode, c.walk_ins, c.chairs, c.founded, c.philhealth_dental, c.photo_keys,
    coalesce((select jsonb_object_agg(h.dow, case when h.break_from_min is null
                                                  then jsonb_build_array(h.open_min, h.close_min)
                                                  else jsonb_build_array(h.open_min, h.close_min, h.break_from_min, h.break_to_min) end)
                from clinic_hours h where h.clinic_id = c.id), '{}'::jsonb),
    coalesce((select array_agg(m.hmo_id order by m.hmo_id) from clinic_hmo m where m.clinic_id = c.id), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'name', s.full_name, 'specialty', s.specialty, 'practices', s.practices,
        'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member, 'since', s.practising_since, 'about', s.about,
        'days', (select coalesce(array_agg(ss.dow order by ss.dow), '{}') from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id),
        'hours', (select coalesce(jsonb_object_agg(ss.dow, jsonb_build_array(ss.from_min, ss.to_min)), '{}'::jsonb)
                    from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id and ss.from_min is not null)
      ) order by s.role = 'owner' desc, s.full_name)
      from staff s
      where s.slug is not null and s.disabled_at is null
        and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'local', p.local_name, 'category', p.category,
        'min', p.default_price, 'max', p.price_max, 'from', p.price_from, 'unit', p.unit, 'minutes', p.minutes
      ) order by p.category, p.default_price)
      from procedure_catalog p where p.clinic_id = c.id and p.active), '[]'::jsonb),
    c.email, c.maps_url,
    (select g.dpo_name from clinic_group g where g.id = c.group_id)
  from clinic c
  where c.archived_at is null and c.listed
  order by c.name
$$;
grant execute on function public_directory() to flossify_app;

-- 10. public_dentist (007) with each clinic's hours beside its days, so /dentists/<slug> says "Tue 1–6 pm"
--     as the clinic page does. Same signature: replace.
create or replace function public_dentist(p_slug text)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'slug', s.slug, 'name', s.full_name, 'prc', s.prc_licence, 'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member,
    'specialty', s.specialty, 'practices', s.practices, 'since', s.practising_since, 'about', s.about,
    'clinics', (select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'area', c.area, 'bookingMode', c.booking_mode,
                   'days', (select array_agg(ss.dow order by ss.dow) from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id),
                   'hours', (select coalesce(jsonb_object_agg(ss.dow, jsonb_build_array(ss.from_min, ss.to_min)), '{}'::jsonb)
                               from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id and ss.from_min is not null)))
                from clinic c where c.archived_at is null and c.listed
                  and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)))
  from staff s where s.slug = p_slug and s.disabled_at is null
$$;
grant execute on function public_dentist(text) to flossify_app;
