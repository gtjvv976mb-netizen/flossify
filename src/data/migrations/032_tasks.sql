-- 032 — tasks the owner assigns (docs/clinic-sites-design.md, P4).
--
-- A to-do at one branch: a title, a few notes, a day it is due, and the member
-- it is for. Anyone whose role may assign tasks (tasks.assign; by default the
-- owner and the admin) gives them to people at the branch; everyone may note a
-- task for themselves. The member sees theirs on the Dashboard and ticks it
-- done; whoever gave it sees who has done what. Clinic data, under row-level
-- security like everything a branch keeps. Tasks carry no patient data by
-- design — the form says so — so they are not part of any record.

create table if not exists clinic_task (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinic(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 120),
  notes        text check (notes is null or length(notes) <= 1000),
  due_on       date,
  assignee_id  uuid not null references staff(id) on delete cascade,
  created_by   uuid references staff(id) on delete set null,
  created_at   timestamptz not null default now(),
  done_at      timestamptz,
  done_by      uuid references staff(id) on delete set null,
  cancelled_at timestamptz
);
create index if not exists clinic_task_assignee on clinic_task (clinic_id, assignee_id, done_at);
create index if not exists clinic_task_giver on clinic_task (clinic_id, created_by, done_at);

alter table clinic_task enable row level security;
alter table clinic_task force row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clinic_task' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on clinic_task
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
      with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;

grant select, insert, update on clinic_task to flossify_app;
