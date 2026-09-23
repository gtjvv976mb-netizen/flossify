-- 004 — which branches a staff member may open, read before any tenant exists.
--
-- Sign-in has no app.clinic_id yet, so the clinic rows behind staff_access are
-- invisible to the app role. This function runs as its owner and returns only
-- the branch list for one staff id: what the switcher shows, nothing more.

-- Where this person usually sits. Sign-in lands here unless a link asked for
-- another branch; the switcher lists the rest.
alter table staff add column if not exists home_clinic_id uuid references clinic(id) on delete set null;

create or replace function staff_branches(p_staff uuid)
returns table (id uuid, slug text, name text, group_id uuid, can_view_finance boolean)
language sql security definer stable set search_path = public as $$
  select c.id, c.slug::text, c.name, c.group_id, a.can_view_finance
  from staff_access a
  join clinic c on c.id = a.clinic_id
  join staff s on s.id = a.staff_id
  where a.staff_id = p_staff and c.archived_at is null
  order by (c.id = s.home_clinic_id) desc, c.name
$$;

grant execute on function staff_branches(uuid) to flossify_app;
