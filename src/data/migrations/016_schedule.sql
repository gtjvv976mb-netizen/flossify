-- 016 — the schedule: which chair a visit sits in, who put it on the book,
-- and when it was last moved.
--
-- chair is null until the desk places the visit. Web bookings and the seeded
-- visits arrive unplaced and sit in the Unplaced lane on the schedule page
-- until someone drags them onto a chair. No backfill, on purpose: a chair the
-- software guessed is a chair the clinic did not choose, and the lane is the
-- desk's inbox.
alter table appointment
  add column if not exists chair      smallint check (chair is null or chair >= 1),
  -- The staff member who put the visit on the book; null for web bookings and
  -- rows written before this migration.
  add column if not exists created_by uuid references staff(id) on delete set null,
  -- Set whenever the time, chair or dentist changes after the first save.
  add column if not exists moved_at   timestamptz;

-- The clash check reads one chair's, or one dentist's, visits around a time.
create index if not exists appointment_chair_time   on appointment (clinic_id, chair, starts_at) where chair is not null;
create index if not exists appointment_dentist_time on appointment (clinic_id, dentist_id, starts_at) where dentist_id is not null;
