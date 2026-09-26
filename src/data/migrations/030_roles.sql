-- 030 — roles a clinic names itself, and what each may do (docs/clinic-sites-design.md, P2).
--
-- A clinic group's roles are rows: a name the owner chooses, a rank (0 is the
-- top of the list), and the permissions ticked for it (keys, src/lib/can.ts).
-- Every group starts with the six roles Flossify always had, named and ticked
-- exactly as the pages allowed them before — so on the day this ships nobody
-- sees a change. The Owner role is one per group, everything, top of the list,
-- and cannot be changed (the app refuses; the database keeps it single).
--
-- staff.role_id says which role a person holds. staff.role stays: it is the
-- professional side the pages still read (an owner, a dentist or associate who
-- treats patients and has a PRC licence and a column on the schedule; the desk),
-- and the words on the People list until the roles screens (P3) show role names.
-- A trigger keeps the two in step for everything that only knows staff.role:
-- signup_clinic(), an invitation, admin:create and the seed insert a role and
-- get that role's row; a role changed on a person's page moves them to that
-- role's row. Roles are group data, like staff: not under row-level security.

create table if not exists clinic_role (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references clinic_group(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 40),
  rank        smallint not null check (rank between 0 and 999),
  perms       text[] not null default '{}',
  is_owner    boolean not null default false,
  -- The staff.role a default role stands for ('owner', 'admin', …); null for a role the clinic made.
  base        text check (base is null or base in ('owner', 'admin', 'dentist', 'associate', 'secretary', 'assistant')),
  created_at  timestamptz not null default now(),
  created_by  uuid references staff(id) on delete set null,
  archived_at timestamptz
);
create unique index if not exists clinic_role_name on clinic_role (group_id, lower(btrim(name))) where archived_at is null;
create unique index if not exists clinic_role_owner on clinic_role (group_id) where is_owner;
create unique index if not exists clinic_role_base on clinic_role (group_id, base) where base is not null and archived_at is null;
create index if not exists clinic_role_group on clinic_role (group_id, rank);

grant select, insert, update on clinic_role to flossify_app;

-- The six a group starts with. The permission lists are the rules the pages enforced before 030
-- (the table in docs/clinic-sites-design.md); src/lib/can.ts has the same lists as DEFAULT_ROLES.
create or replace function clinic_default_roles(p_group uuid)
returns void language sql set search_path = public as $$
  insert into clinic_role (group_id, name, rank, perms, is_owner, base)
  select p_group, d.name, d.rank, d.perms, d.base = 'owner', d.base
    from (values
      ('owner',     'Owner',             0,  array['records.edit','schedule.edit','messages.send','finance.bill','finance.money','finance.void','settings.edit','plan.pay','people.manage','roles.manage','tasks.assign']),
      ('admin',     'Admin',             10, array['records.edit','schedule.edit','messages.send','finance.bill','finance.money','finance.void','settings.edit','plan.pay','people.manage','tasks.assign']),
      ('dentist',   'Dentist',           20, array['records.edit','schedule.edit']),
      ('associate', 'Associate dentist', 30, array['records.edit','schedule.edit']),
      ('secretary', 'Secretary',         40, array['records.edit','schedule.edit','finance.bill']),
      ('assistant', 'Dental assistant',  50, array['records.edit','schedule.edit'])
    ) as d(base, name, rank, perms)
   where not exists (select 1 from clinic_role r where r.group_id = p_group and r.base = d.base and r.archived_at is null)
$$;

select clinic_default_roles(id) from clinic_group;

alter table staff add column if not exists role_id uuid references clinic_role(id) on delete restrict;
update staff s set role_id = r.id from clinic_role r
 where s.role_id is null and r.group_id = s.group_id and r.base = s.role and r.archived_at is null;

-- Keep staff.role_id in step with staff.role for everything that only knows staff.role.
-- A new row with no role_id gets its role's row (the group's defaults are made first if it has none);
-- an update that changes staff.role and not role_id moves the person to that role's row. An update that
-- sets role_id (the roles screens) is left as it is.
create or replace function staff_role_row()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.role_id is null
     or tg_op = 'UPDATE' and new.role is distinct from old.role and new.role_id is not distinct from old.role_id then
    perform clinic_default_roles(new.group_id);
    new.role_id := (select id from clinic_role where group_id = new.group_id and base = new.role and archived_at is null);
  end if;
  return new;
end $$;

drop trigger if exists staff_role_row on staff;
create trigger staff_role_row before insert or update of role, role_id on staff
  for each row execute function staff_role_row();

alter table staff alter column role_id set not null;

-- A role belongs to the person's own group.
create or replace function staff_role_same_group()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from clinic_role where id = new.role_id and group_id = new.group_id) then
    raise exception 'staff role % is not a role of group %', new.role_id, new.group_id;
  end if;
  return new;
end $$;
drop trigger if exists staff_role_same_group on staff;
create constraint trigger staff_role_same_group after insert or update of role_id, group_id on staff
  deferrable initially immediate for each row execute function staff_role_same_group();

grant execute on function clinic_default_roles(uuid) to flossify_app;

-- May this person do this at this branch? The same rule as permsOf() in src/lib/can.ts, for the checks
-- that live in SQL (the inbox, the calendar's and the patient list's "may add patients", canEditRecords):
-- the role's keys (everything for the Owner role), plus Finances and amounts where the branch's
-- "sees money" switch is on, minus record editing where can_edit_records is off. staff, staff_access and
-- clinic_role are group data outside row-level security, so a plain function reads them.
create or replace function staff_can(p_staff uuid, p_clinic uuid, p_perm text)
returns boolean language sql stable set search_path = public as $$
  select coalesce((
    select case
             when p_perm = 'records.edit' and not a.can_edit_records then false
             when p_perm in ('finance.bill', 'finance.money') and a.can_view_finance then true
             else r.is_owner or p_perm = any (r.perms)
           end
      from staff s
      join staff_access a on a.staff_id = s.id and a.clinic_id = p_clinic
      join clinic_role r on r.id = s.role_id
     where s.id = p_staff and s.disabled_at is null
  ), false)
$$;
grant execute on function staff_can(uuid, uuid, text) to flossify_app;
