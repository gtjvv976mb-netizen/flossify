-- 038 — the front desk's call log (docs/clinic-operations.md §2, "Confirmation as a 10-minute routine").
--
-- Every attempt to reach a patient about a visit that is not confirmed yet — left a message, no answer,
-- a wrong number, they will call back — so the desk sees "Called twice · left a message 3:10 pm" and does
-- not ring the same family three times, and the next shift knows where a call stands. A confirmation
-- itself is the visit's status (applyStatus in src/lib/schedule.ts), never a row here: this table says
-- what the desk did, the appointment says where the visit is.
--
-- Clinic data under row-level security, none of it public. An attempt is written once and never changed:
-- the app may read and add rows, nothing else.

create table if not exists appointment_contact (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  appointment_id  uuid not null references appointment(id) on delete restrict,
  staff_id        uuid references staff(id) on delete set null,
  outcome         text not null check (outcome in ('left_message', 'no_answer', 'wrong_number', 'will_call_back')),
  note            text check (note is null or length(note) <= 200),
  at              timestamptz not null default now()
);
create index if not exists appointment_contact_visit on appointment_contact (appointment_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['appointment_contact'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation') then
      execute format($p$create policy tenant_isolation on %I
        using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
        with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)$p$, t);
    end if;
  end loop;
end $$;

-- The database's default privileges hand the app every right on a new table: what it may not do is taken
-- back here. A call attempt is a fact about the past; it is never edited or deleted.
revoke all on appointment_contact from flossify_app;
grant select, insert on appointment_contact to flossify_app;
