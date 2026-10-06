-- 046: a PRC check needs a PRC number (the simplification plan, item 1.4).
--
-- The operator's queue listed a dentist with no PRC number on file beside a working "Matches" button: one tap would
-- publish "PRC licence · checked <date>" on their public profile for no licence at all. From now on:
--
--   admin_prc_mark()   refuses 'checked' (returns false) when the dentist has no PRC number on file. 'pending' and
--                      'mismatch' are unchanged.
--   existing rows      any dentist already marked checked with no number goes back to pending (their profile says
--                      "PRC check pending" again). The count and the clinics are raised as a NOTICE, so the deploy log
--                      names them for the owner.
--
-- Additive: the function keeps its signature and grant.

do $$
declare n integer; who text;
begin
  select count(*), string_agg(distinct coalesce(c.name, '(no home clinic)'), ', ')
    into n, who
  from staff s left join clinic c on c.id = s.home_clinic_id
  where s.prc_status = 'checked' and coalesce(btrim(s.prc_licence), '') = '';
  if n > 0 then
    update staff set prc_status = 'pending', prc_checked_on = null
    where prc_status = 'checked' and coalesce(btrim(prc_licence), '') = '';
    raise notice '046: % dentist(s) were marked PRC checked with no PRC number on file; back to pending. Clinics: %', n, who;
  else
    raise notice '046: no dentist was marked PRC checked without a PRC number.';
  end if;
end $$;

create or replace function admin_prc_mark(p_staff uuid, p_status text, p_note text, p_by uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_status not in ('pending', 'checked', 'mismatch') then
    raise exception 'admin_prc_mark: status must be pending, checked or mismatch';
  end if;
  update staff set
    prc_status = p_status,
    prc_checked_on = case when p_status = 'checked' then (now() at time zone 'Asia/Manila')::date else null end,
    prc_checked_by = p_by,
    prc_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_staff and slug is not null
    and (p_status <> 'checked' or coalesce(btrim(prc_licence), '') <> '');
  get diagnostics n = row_count;
  return n > 0;
end $$;
