-- 014 — the clinic's Data Protection Officer on its public page.
--
-- The privacy notice tells a patient the clinic's DPO is named on the clinic's
-- page. The name lives on the group (012); the public directory carries it
-- for listed clinics so the page can print it. Same function, one more column.

drop function if exists public_directory();
create function public_directory()
returns table (
  id uuid, slug text, name text, area text, address text, phone text, about text,
  booking_mode text, walk_ins boolean, chairs smallint, founded smallint,
  philhealth_dental boolean, photo_keys text[],
  hours jsonb, hmos text[], dentists jsonb, fees jsonb, email text, maps_url text,
  dpo_name text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.slug::text, c.name, c.area, c.address_line, c.phone, c.about,
    c.booking_mode, c.walk_ins, c.chairs, c.founded, c.philhealth_dental, c.photo_keys,
    coalesce((select jsonb_object_agg(h.dow, jsonb_build_array(h.open_min, h.close_min)) from clinic_hours h where h.clinic_id = c.id), '{}'::jsonb),
    coalesce((select array_agg(m.hmo_id order by m.hmo_id) from clinic_hmo m where m.clinic_id = c.id), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'slug', s.slug, 'name', s.full_name, 'specialty', s.specialty, 'practices', s.practices,
        'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member, 'since', s.practising_since, 'about', s.about,
        'days', (select coalesce(array_agg(ss.dow order by ss.dow), '{}') from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)
      ) order by s.role = 'owner' desc, s.full_name)
      from staff s
      where s.slug is not null and s.disabled_at is null
        and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'local', p.local_name, 'category', p.category,
        'min', p.default_price, 'max', p.price_max, 'from', p.price_from, 'unit', p.unit, 'minutes', p.minutes
      ) order by p.category, p.default_price)
      from procedure_catalog p where p.clinic_id = c.id and p.active), '[]'::jsonb),
    c.email, c.maps_url,
    (select g.dpo_name from clinic_group g where g.id = c.group_id)
  from clinic c
  where c.archived_at is null and c.listed
  order by c.name
$$;

grant execute on function public_directory() to flossify_app;
