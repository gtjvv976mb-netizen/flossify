-- 003 — reading the public face of every clinic without a tenant context.
--
-- Rule kept: every table with clinic data is under row-level security, and the
-- application role sees nothing until app.clinic_id is set. The public
-- directory needs the opposite — hours, fees and dentists of *all* clinics —
-- so it goes through functions that run as their owner and return exactly the
-- public fields, never a patient, never an appointment's who.

do $$
declare t text;
begin
  foreach t in array array['clinic_hours', 'clinic_hmo', 'staff_schedule']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (clinic_id = nullif(current_setting(''app.clinic_id'', true), '''')::uuid)', t);
  end loop;
end $$;

-- Everything a clinic card or clinic page shows. One row per active clinic.
create or replace function public_directory()
returns table (
  id uuid, slug text, name text, area text, address text, phone text, about text,
  booking_mode text, walk_ins boolean, chairs smallint, founded smallint,
  philhealth_dental boolean, photo_keys text[],
  hours jsonb, hmos text[], dentists jsonb, fees jsonb
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
      from procedure_catalog p where p.clinic_id = c.id and p.active), '[]'::jsonb)
  from clinic c
  where c.archived_at is null
  order by c.name
$$;

-- A dentist's public profile, by slug, with the clinics they sit at.
create or replace function public_dentist(p_slug text)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'slug', s.slug, 'name', s.full_name, 'prc', s.prc_licence, 'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member,
    'specialty', s.specialty, 'practices', s.practices, 'since', s.practising_since, 'about', s.about,
    'clinics', (select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'area', c.area, 'bookingMode', c.booking_mode,
                   'days', (select array_agg(ss.dow order by ss.dow) from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)))
                from clinic c where c.archived_at is null
                  and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)))
  from staff s where s.slug = p_slug and s.disabled_at is null
$$;

-- Booked time ranges for one clinic in a window, so free slots can be computed.
-- Returns times and the dentist only — never who is in the chair.
create or replace function public_booked_ranges(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (dentist_slug text, starts_at timestamptz, ends_at timestamptz)
language sql security definer stable set search_path = public as $$
  select s.slug::text, a.starts_at, a.ends_at
  from appointment a left join staff s on s.id = a.dentist_id
  where a.clinic_id = p_clinic and a.status not in ('cancelled', 'no_show')
    and a.starts_at < p_to and a.ends_at > p_from
$$;

grant execute on function public_directory() to flossify_app;
grant execute on function public_dentist(text) to flossify_app;
grant execute on function public_booked_ranges(uuid, timestamptz, timestamptz) to flossify_app;
