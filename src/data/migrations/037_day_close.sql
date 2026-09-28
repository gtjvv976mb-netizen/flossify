-- 037 — the end-of-day close (docs/clinic-operations.md §2, "End-of-day close": received = recorded =
-- deposited). The front desk counts the drawer at /c/<slug>/finances/close/; one row is one close:
-- the day, the cash counted, the cash the payments say should be there (today's cash payments that
-- are not void), the difference, a note, who closed and when.
--
-- More than one close a day is allowed: a correction (a payment voided, one recorded late) is closed
-- again, the newest counts, and the old ones stay — a re-close leaves a trace. So the app may add a
-- close and read them, never change or delete one (the database's default privileges would hand it
-- every right on a new table; what it may not do is taken back here). Clinic data under row-level
-- security like every other table.

create table if not exists day_close (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinic(id) on delete restrict,
  day           date not null,
  cash_counted  numeric(12, 2) not null check (cash_counted >= 0),
  cash_expected numeric(12, 2) not null check (cash_expected >= 0),
  -- counted − expected: negative is short, positive is over. Kept as its own column so a report
  -- never recomputes it; the check keeps it honest.
  variance      numeric(12, 2) not null check (variance = cash_counted - cash_expected),
  note          text check (note is null or length(note) <= 500),
  closed_by     uuid references staff(id) on delete set null,
  closed_at     timestamptz not null default now()
);
create index if not exists day_close_clinic_day on day_close (clinic_id, day desc, closed_at desc);

alter table day_close enable row level security;
alter table day_close force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'day_close' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on day_close
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
      with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

revoke all on day_close from flossify_app;
grant select, insert on day_close to flossify_app;
