-- 007 — what the adversarial review of 005/006 found.
--
-- 1. A reply was matched to the earliest upcoming visit for that number across
--    every clinic, so a Y meant for one clinic could confirm a visit at another.
--    The reply now belongs to the clinic that last texted that number, and the
--    visit it confirms is the one that text was about when there is one.
-- 2. A sender with fewer than ten digits (an alphanumeric sender id, an empty
--    string) produced an empty key that matched every patient with no phone.
-- 3. clinic.slug was unique per group only; two sign-ups racing for one name
--    could both win. The slug is the public address, so it is unique outright.
-- 4. public_dentist() listed a dentist's unlisted clinics.

create or replace function sms_inbound(p_from text, p_text text)
returns table (clinic_id uuid, appointment_id uuid, action text)
language plpgsql security definer set search_path = public as $$
declare
  k text := right(regexp_replace(p_from, '\D', '', 'g'), 10);
  o record;
  a record;
begin
  if length(k) < 10 then
    return query select null::uuid, null::uuid, 'unmatched'::text; return;
  end if;
  -- The conversation is with whoever texted this number last.
  select m.clinic_id, m.appointment_id into o
  from message_log m
  where m.direction = 'out' and m.channel = 'sms'
    and right(regexp_replace(m.to_address, '\D', '', 'g'), 10) = k
  order by m.created_at desc limit 1;
  if o.clinic_id is null then
    return query select null::uuid, null::uuid, 'unmatched'::text; return;
  end if;
  -- The visit that text was about, if it is still ahead; else their next one at that clinic.
  select a2.id, a2.clinic_id, a2.patient_id, a2.status into a
  from appointment a2 join patient p on p.id = a2.patient_id
  where a2.clinic_id = o.clinic_id
    and a2.status in ('booked', 'confirmed') and a2.starts_at > now()
    and (a2.id = o.appointment_id
         or right(regexp_replace(coalesce(nullif(a2.booked_by_phone, ''), p.phone, ''), '\D', '', 'g'), 10) = k)
  order by (a2.id = o.appointment_id) desc, a2.starts_at
  limit 1;
  if a.id is null then
    -- Nothing to confirm, but the clinic should still see what was said.
    insert into message_log (clinic_id, channel, to_address, body, status, direction, kind)
    values (o.clinic_id, 'sms', p_from, left(p_text, 500), 'delivered', 'in', 'reply');
    return query select o.clinic_id, null::uuid, 'logged'::text; return;
  end if;
  insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, direction, kind)
  values (a.clinic_id, a.patient_id, a.id, 'sms', p_from, left(p_text, 500), 'delivered', 'in', 'reply');
  if upper(btrim(p_text)) in ('Y', 'YES', 'OO', 'OPO', 'CONFIRM', 'OK') then
    update appointment set status = 'confirmed' where id = a.id and status = 'booked';
    insert into audit_log (clinic_id, action, entity, entity_id) values (a.clinic_id, 'appointment.confirmed_by_text', 'appointment', a.id);
    return query select a.clinic_id, a.id, 'confirmed'::text;
  else
    return query select a.clinic_id, a.id, 'logged'::text;
  end if;
end $$;

-- The public address of a clinic is one name for the whole service.
create unique index if not exists clinic_slug_key on clinic (slug);

-- A dentist's public profile names only clinics that are listed.
create or replace function public_dentist(p_slug text)
returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'slug', s.slug, 'name', s.full_name, 'prc', s.prc_licence, 'prcCheckedOn', s.prc_checked_on, 'pda', s.pda_member,
    'specialty', s.specialty, 'practices', s.practices, 'since', s.practising_since, 'about', s.about,
    'clinics', (select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'area', c.area, 'bookingMode', c.booking_mode,
                   'days', (select array_agg(ss.dow order by ss.dow) from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)))
                from clinic c where c.archived_at is null and c.listed
                  and exists (select 1 from staff_schedule ss where ss.staff_id = s.id and ss.clinic_id = c.id)))
  from staff s where s.slug = p_slug and s.disabled_at is null
$$;

grant execute on function sms_inbound(text, text) to flossify_app;
grant execute on function public_dentist(text) to flossify_app;
