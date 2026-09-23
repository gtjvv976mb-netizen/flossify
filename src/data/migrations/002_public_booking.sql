-- 002 — what the patient side needs that the first model did not have.
--
-- Runs after schema.sql. Everything here is additive: the booking pipeline
-- (find a clinic → real open slots → book without an account) needs opening
-- hours, which dentist is in on which day, how long a procedure takes, and a
-- way for a patient to refer to and undo a booking without a login.

-- ---------------------------------------------------------------------------
-- Public face of a clinic
-- ---------------------------------------------------------------------------

alter table clinic
  add column if not exists about text,
  add column if not exists area text,
  -- 'live': the schedule is real and a booking holds a slot.
  -- 'request': the clinic confirms by text; the patient states a preference.
  add column if not exists booking_mode text not null default 'request'
    check (booking_mode in ('live', 'request')),
  add column if not exists walk_ins boolean not null default true,
  add column if not exists chairs smallint not null default 1,
  add column if not exists philhealth_dental boolean not null default false,
  add column if not exists founded smallint,
  -- House-style photo keys, never uploads of people.
  add column if not exists photo_keys text[] not null default '{}';

-- Opening hours, one row per weekday the clinic is open. Minutes from midnight,
-- in the clinic's own time zone; a day with no row is closed / by appointment.
create table if not exists clinic_hours (
  clinic_id   uuid not null references clinic(id) on delete cascade,
  dow         smallint not null check (dow between 0 and 6),   -- 0 = Sunday
  open_min    smallint not null check (open_min between 0 and 1439),
  close_min   smallint not null check (close_min between 1 and 1440),
  check (close_min > open_min),
  primary key (clinic_id, dow)
);

-- HMOs a clinic says it takes. A statement by the clinic, shown as such.
create table if not exists clinic_hmo (
  clinic_id   uuid not null references clinic(id) on delete cascade,
  hmo_id      text not null,
  primary key (clinic_id, hmo_id)
);

-- Which weekdays a dentist sits at a given branch. Drives the slot picker.
create table if not exists staff_schedule (
  staff_id    uuid not null references staff(id) on delete cascade,
  clinic_id   uuid not null references clinic(id) on delete cascade,
  dow         smallint not null check (dow between 0 and 6),
  primary key (staff_id, clinic_id, dow)
);

-- A dentist's public profile. The PRC check is a human act with a date;
-- there is no API, and the page shows the date rather than a bare badge.
alter table staff
  add column if not exists slug citext unique,
  add column if not exists prc_checked_on date,
  add column if not exists pda_member boolean not null default false,
  -- Only the seven Board-recognised fields may appear here.
  add column if not exists specialty text
    check (specialty is null or specialty in ('Endodontics', 'Oral & maxillofacial surgery', 'Orthodontics',
                                              'Pediatric dentistry', 'Periodontics', 'Prosthodontics', 'Dental public health')),
  add column if not exists practices text[] not null default '{}',
  add column if not exists practising_since smallint,
  add column if not exists about text;

-- Chair time and the patient-facing fee guide. price_max null = single price;
-- default_price is the minimum or starting price. null minutes = not bookable online.
alter table procedure_catalog
  add column if not exists local_name text,
  add column if not exists category text,
  add column if not exists price_max numeric(12, 2),
  add column if not exists price_from boolean not null default false,
  add column if not exists unit text,
  add column if not exists minutes smallint;

-- ---------------------------------------------------------------------------
-- A booking a patient made without a login
-- ---------------------------------------------------------------------------

alter table appointment
  -- Where the row came from. Staff at the desk, the public site, or a request
  -- the clinic still has to confirm.
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'web', 'request')),
  -- What the patient sees and quotes on the phone: SE-7K3Q.
  add column if not exists public_ref text unique,
  -- Lets the person who booked cancel from a text message, without an account.
  add column if not exists cancel_token text,
  -- When the visit is for someone else, the person we text.
  add column if not exists booked_by_name text,
  add column if not exists booked_by_phone text,
  add column if not exists catalog_id uuid references procedure_catalog(id),
  add column if not exists hmo_id text,
  add column if not exists notes text,
  add column if not exists cancelled_at timestamptz;

create index if not exists appointment_public_ref on appointment (public_ref) where public_ref is not null;

-- ---------------------------------------------------------------------------
-- Looking up a clinic before there is a tenant context
-- ---------------------------------------------------------------------------
-- RLS hides every clinic row until app.clinic_id is set, and the public site
-- needs to turn a slug into that id first. This function runs as its owner
-- and returns only the id, so nothing else leaks.

create or replace function public_clinic_id(p_slug text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from clinic where slug = p_slug and archived_at is null limit 1
$$;

-- The application role. Not a superuser, so RLS actually applies to it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'flossify_app') then
    create role flossify_app login password 'flossify_dev';
  end if;
end $$;

grant usage on schema public to flossify_app;
grant select, insert, update, delete on all tables in schema public to flossify_app;
grant usage, select on all sequences in schema public to flossify_app;
grant execute on function public_clinic_id(text) to flossify_app;
alter default privileges in schema public grant select, insert, update, delete on tables to flossify_app;
