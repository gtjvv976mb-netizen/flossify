-- 006 — a clinic that sets itself up.
--
-- Sign-up has no tenant. The clinic row does not exist yet, and RLS hides the
-- clinic table until app.clinic_id names a row, so the app role cannot make
-- the first write itself. The whole of it — group, clinic, hours, the owner,
-- their access and days, the default fee guide — happens in one function
-- that runs as its owner, in one transaction, and returns the ids the caller
-- needs to sign the owner in. Half a clinic is never left behind.
--
-- The caller (src/pages/start/index.astro) has already made the slugs unique
-- with clinic_slug_taken (005) and staff_slug_taken (below), and hashed the
-- password with the same scrypt scheme as sign-in. The function trusts
-- nothing else: it validates the fields it needs and re-checks the slug.

-- Staff slugs are unique across every group (a dentist's public address), and
-- the check has to run before there is a tenant. Same shape as clinic_slug_taken.
create or replace function staff_slug_taken(p_slug text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from staff s where s.slug = p_slug)
$$;

-- p: { name, slug, area, address, city, province, phone, email, owner_name,
--      owner_slug, owner_email, owner_phone, owner_prc, password_hash }
create or replace function signup_clinic(p jsonb)
returns table (clinic_id uuid, staff_id uuid, slug text)
language plpgsql security definer set search_path = public as $$
declare
  v_group  uuid;
  v_clinic uuid;
  v_staff  uuid;
  v_base   text;
  v_gslug  text;
  n        integer := 1;
begin
  if coalesce(p->>'name', '') = '' or coalesce(p->>'slug', '') = '' or coalesce(p->>'owner_name', '') = ''
     or coalesce(p->>'owner_slug', '') = '' or coalesce(p->>'owner_email', '') = '' or coalesce(p->>'password_hash', '') = '' then
    raise exception 'signup_clinic: name, slug, owner_name, owner_slug, owner_email and password_hash are required';
  end if;
  -- The caller checked, but two sign-ups can race and the unique constraint on clinic is per group, not global.
  if exists (select 1 from clinic c where c.slug = p->>'slug') then
    raise exception 'signup_clinic: clinic slug "%" is taken', p->>'slug';
  end if;

  -- The group is named after its first clinic and slugged the way the seed
  -- does it; a second "Smile Dental" becomes smile-dental-2.
  v_base := nullif(trim(both '-' from regexp_replace(lower(p->>'name'), '[^a-z0-9]+', '-', 'g')), '');
  if v_base is null then v_base := p->>'slug'; end if;
  v_gslug := v_base;
  while exists (select 1 from clinic_group g where g.slug = v_gslug) loop
    n := n + 1;
    v_gslug := v_base || '-' || n;
  end loop;
  insert into clinic_group (name, slug) values (p->>'name', v_gslug) returning id into v_group;

  -- Requests, walk-ins, one chair, not listed: the safe defaults until the owner says otherwise.
  insert into clinic (group_id, name, slug, address_line, city, province, phone, email, area,
                      booking_mode, walk_ins, chairs, philhealth_dental, listed, notation)
  values (v_group, p->>'name', p->>'slug', nullif(p->>'address', ''), nullif(p->>'city', ''), nullif(p->>'province', ''),
          nullif(p->>'phone', ''), nullif(p->>'email', ''), nullif(p->>'area', ''),
          'request', true, 1, false, false, 'fdi')
  returning id into v_clinic;

  -- Monday to Saturday, nine to five, in minutes from midnight.
  insert into clinic_hours (clinic_id, dow, open_min, close_min)
  select v_clinic, d, 9 * 60, 17 * 60 from generate_series(1, 6) d;

  insert into staff (group_id, full_name, email, phone, prc_licence, role, password_hash, slug, home_clinic_id, password_set_at)
  values (v_group, p->>'owner_name', p->>'owner_email', nullif(p->>'owner_phone', ''), nullif(p->>'owner_prc', ''),
          'owner', p->>'password_hash', p->>'owner_slug', v_clinic, now())
  returning id into v_staff;

  insert into staff_access (staff_id, clinic_id, can_view_finance, can_edit_records, can_manage_staff)
  values (v_staff, v_clinic, true, true, true);

  -- The owner sits at their own clinic on every day it is open, until they edit the team.
  insert into staff_schedule (staff_id, clinic_id, dow)
  select v_staff, v_clinic, d from generate_series(1, 6) d;

  -- The default fee guide: the same list as src/data/directory.ts (keep the
  -- two in step). Every price is "from" until the owner edits it, because a
  -- catalogue number is a starting point, not this clinic's quote.
  insert into procedure_catalog (clinic_id, code, name, local_name, category, default_price, price_max, price_from, unit, minutes, tooth_scoped, active)
  select v_clinic, s.code, s.name, s.local_name, s.category, s.price_min, s.price_max, true, s.unit, s.minutes,
         coalesce(s.unit, '') like '%tooth%', true
  from (values
    ('consultation', 'Consultation',          'Konsulta'::text, 'prevent',  300::numeric,   null::numeric,   null::text,  30::smallint),
    ('prophylaxis',  'Cleaning',              'Linis',          'prevent',  1500,           2500,            null,        45),
    ('xray',         'Dental X-ray',          null,             'prevent',  500,            1500,            null,        15),
    ('fluoride',     'Fluoride varnish',      null,             'prevent',  800,            null,            null,        15),
    ('sealant',      'Pit & fissure sealant', null,             'prevent',  1000,           null,            'per tooth', 20),
    ('restoration',  'Filling',               'Pasta',          'restore',  2000,           4500,            'per tooth', 45),
    ('rootcanal',    'Root canal',            null,             'restore',  8000,           15000,           null,        90),
    ('crown',        'Crown',                 null,             'restore',  12000,          16000,           null,        60),
    ('dentures',     'Dentures',              'Pustiso',        'replace',  16000,          28000,           null,        60),
    ('bridge',       'Fixed bridge',          null,             'replace',  11000,          null,            'per unit',  60),
    ('extraction',   'Extraction',            'Bunot',          'surgery',  1500,           3500,            'per tooth', 30),
    ('wisdom',       'Wisdom tooth removal',  null,             'surgery',  8000,           15000,           'per tooth', 60),
    ('whitening',    'Whitening',             null,             'cosmetic', 12000,          18000,           null,        60),
    ('veneers',      'Veneers',               null,             'cosmetic', 18000,          null,            'per tooth', 60),
    ('braces',       'Braces',                null,             'ortho',    60000,          120000,          null,        60)
  ) as s(code, name, local_name, category, price_min, price_max, unit, minutes);

  return query select v_clinic, v_staff, (p->>'slug')::text;
end $$;

grant execute on function staff_slug_taken(text) to flossify_app;
grant execute on function signup_clinic(jsonb) to flossify_app;
