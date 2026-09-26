-- 031 — members the owner makes (docs/clinic-sites-design.md, P3).
--
-- The owner (or anyone whose role may manage people) adds a member with a
-- username and a first password, and that member chooses their own password
-- the first time they sign in. So:
--
--   - staff.email may be empty. A member at the front desk may have no email of
--     their own; they sign in with their username at the clinic's door. Where
--     there is one it is still unique across the service (the app checks, and
--     the old (group_id, email) key still holds for the ones that exist).
--   - staff.must_change_password: set when someone else set the password (a
--     new member, or a reset by the owner); every workspace page sends the
--     member to My page until they choose their own, and choosing one clears
--     it (setPassword in src/lib/auth.ts).
--   - The roles screens write staff.role_id themselves, so the trigger from 030
--     now only fills role_id on an insert that did not say one (sign-up, the
--     seed, admin:create). It no longer moves anyone on an update: that would
--     undo a role the owner picked whenever the professional side changed.

alter table staff alter column email drop not null;
alter table staff add column if not exists must_change_password boolean not null default false;

create or replace function staff_role_row()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.role_id is null then
    perform clinic_default_roles(new.group_id);
    new.role_id := (select id from clinic_role where group_id = new.group_id and base = new.role and archived_at is null);
  end if;
  return new;
end $$;

drop trigger if exists staff_role_row on staff;
create trigger staff_role_row before insert on staff
  for each row execute function staff_role_row();
