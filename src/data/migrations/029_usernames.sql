-- 029 — usernames, and each clinic's own sign-in (docs/clinic-sites-design.md, P1).
--
-- Every member of a clinic signs in with their own username and password at
-- the clinic's own address, flossify.ph/<clinic-slug>/sign-in/. The address
-- says which clinic, so a username only has to be unique within the clinic's
-- group: two clinics may both have a "rosa".
--
--   - staff.username: lowercase letters, digits and . _ - , 3 to 32
--     characters, starting with a letter or digit. Filled for every existing
--     account from the email's local part (then the name), and for every new
--     row by a trigger when the insert does not say one — signup_clinic(),
--     the invitation in Settings, admin:create and the seed need no change.
--     Deduplicated within the group by counting up: rosa, rosa2, rosa3.
--   - clinic_door(slug): the one read a sign-in page needs before there is a
--     tenant — the clinic's id, group, name and slug, and its first photo if it
--     is listed (a clinic not listed yet still gets a door for its staff, but
--     shows the public nothing it has not published). Archived clinics have no
--     door.
--
-- staff and staff_access are not under row-level security (keyed by group, see
-- CLAUDE.md), so the app finds the person at the door with a plain query once
-- the door has said which clinic.

alter table staff add column if not exists username citext;

-- What a username may be. Checked here and in src/lib/username.ts.
create or replace function username_ok(p text)
returns boolean language sql immutable as $$
  select p ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
$$;

-- A free username in this group near the base: the base cleaned to the rules, then base2, base3 …
create or replace function staff_username_for(p_group uuid, p_base text, p_except uuid default null)
returns text language plpgsql stable set search_path = public as $$
declare
  root text := regexp_replace(lower(coalesce(p_base, '')), '[^a-z0-9._-]+', '.', 'g');
  cand text;
  n int := 1;
begin
  root := regexp_replace(root, '^[._-]+|[._-]+$', '', 'g');
  root := left(root, 28);
  root := regexp_replace(root, '[._-]+$', '');
  if length(root) < 3 then root := rpad(coalesce(nullif(root, ''), 'staff'), 3, '0'); end if;
  loop
    cand := case when n = 1 then root else root || n end;
    exit when not exists (select 1 from staff where group_id = p_group and username = cand and id is distinct from p_except);
    n := n + 1;
  end loop;
  return cand;
end $$;

-- Existing accounts, oldest first so the first "rosa" keeps the plain name.
do $$
declare r record;
begin
  for r in select id, group_id, email, full_name from staff where username is null order by created_at, id loop
    update staff set username = staff_username_for(
      r.group_id,
      coalesce(nullif(split_part(r.email::text, '@', 1), ''), r.full_name),
      r.id) where id = r.id;
  end loop;
end $$;

create or replace function staff_default_username()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.username is null then
    new.username := staff_username_for(new.group_id, coalesce(nullif(split_part(new.email::text, '@', 1), ''), new.full_name), new.id);
  end if;
  return new;
end $$;

drop trigger if exists staff_default_username on staff;
create trigger staff_default_username before insert on staff
  for each row execute function staff_default_username();

alter table staff alter column username set not null;
alter table staff drop constraint if exists staff_username_shape;
alter table staff add constraint staff_username_shape check (username_ok(username::text));
create unique index if not exists staff_group_username on staff (group_id, username);

-- The clinic behind a sign-in address. Nothing but what the door draws.
create or replace function clinic_door(p_slug text)
returns table (id uuid, group_id uuid, name text, slug text, listed boolean, photo_key text, phone text)
language sql security definer stable set search_path = public as $$
  select c.id, c.group_id, c.name, c.slug::text, c.listed,
         case when c.listed then c.photo_keys[1] end,
         case when c.listed then c.phone end
    from clinic c
   where c.slug = p_slug and c.archived_at is null
$$;

revoke all on function clinic_door(text) from public;
grant execute on function clinic_door(text) to flossify_app;
grant execute on function username_ok(text) to flossify_app;
grant execute on function staff_username_for(uuid, text, uuid) to flossify_app;
