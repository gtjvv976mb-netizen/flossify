-- 010 — a patient sees and manages their own visits, across clinics, with
-- nothing but their mobile.
--
-- A patient has no tenant. Their visits sit in several clinics' rows, each
-- under forced RLS, so the page cannot read them as the app role. These
-- functions run as their owner and answer one question each for one mobile
-- number: which visits are under this number, which clinic knows it, and may
-- this number confirm or cancel this one visit. The match is the phone and
-- nothing else — the last ten digits of the number, on either the person who
-- booked (appointment.booked_by_phone) or the patient's own record
-- (patient.phone) — so a number never sees another number's visits. A key
-- shorter than ten digits (empty, a sender id) matches nothing, as in 007.
--
-- Nothing here reads a clinical record: the columns are the appointment, the
-- clinic's public face, the dentist's name and the names on the booking.

-- Every visit under this number, newest first. Cancelled visits stay for
-- thirty days so a person can see what they cancelled; older ones drop off.
-- A cancelled row with no cancelled_at (cancelled at the desk before that
-- column was written) counts from the visit's own time.
create or replace function patient_visits(p_phone text)
returns table (
  appointment_id uuid, clinic_id uuid, clinic_name text, clinic_slug text, clinic_phone text, clinic_area text,
  dentist text, starts_at timestamptz, ends_at timestamptz, reason text, status text, source text, public_ref text,
  patient_name text, booked_by_name text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  with k as (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as key)
  select a.id, c.id, c.name, c.slug::text, c.phone, c.area,
         s.full_name, a.starts_at, a.ends_at, a.reason, a.status, a.source, a.public_ref,
         concat_ws(' ', p.first_name, nullif(p.last_name, '—')), a.booked_by_name, a.created_at
  from k
  join appointment a on true
  join patient p on p.id = a.patient_id
  join clinic c on c.id = a.clinic_id
  left join staff s on s.id = a.dentist_id
  where length(k.key) = 10
    and (right(regexp_replace(coalesce(a.booked_by_phone, ''), '\D', '', 'g'), 10) = k.key
      or right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = k.key)
    and (a.status <> 'cancelled' or coalesce(a.cancelled_at, a.starts_at) > now() - interval '30 days')
  order by a.starts_at desc
$$;

-- The clinic that most recently dealt with this number: where the sign-in
-- code is queued, so the text has a clinic to belong to and that clinic's
-- desk can see it left. Null when no clinic knows the number, and the caller
-- queues nothing and answers exactly as it would otherwise.
create or replace function patient_home_clinic(p_phone text)
returns uuid
language sql security definer stable set search_path = public as $$
  with k as (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as key)
  select a.clinic_id
  from k
  join appointment a on true
  join patient p on p.id = a.patient_id
  join clinic c on c.id = a.clinic_id
  where length(k.key) = 10
    and c.archived_at is null
    and (right(regexp_replace(coalesce(a.booked_by_phone, ''), '\D', '', 'g'), 10) = k.key
      or right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = k.key)
  order by a.created_at desc
  limit 1
$$;

-- Confirm or cancel one visit, from the number it is under. The row has to
-- match the phone the same way as above or nothing happens. Confirm: booked →
-- confirmed while the visit is still ahead. Cancel: booked or confirmed →
-- cancelled while it is more than two hours ahead; inside that the message
-- says to call the clinic and gives the number. Both write audit_log; a
-- cancellation also drops any text still queued for that visit (the reminder).
-- Every refusal is ok = false with one plain sentence.
create or replace function patient_act(p_phone text, p_appointment uuid, p_action text)
returns table (ok boolean, message text, clinic_id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  k text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  a record;
  v_when text;
  v_call text;
begin
  if length(k) < 10 or p_appointment is null then
    return query select false, 'That visit could not be found under this number.'::text, null::uuid, null::text; return;
  end if;

  select a2.id, a2.clinic_id, a2.status, a2.starts_at, c.name as clinic_name, c.phone as clinic_phone
    into a
  from appointment a2
  join patient p on p.id = a2.patient_id
  join clinic c on c.id = a2.clinic_id
  where a2.id = p_appointment
    and (right(regexp_replace(coalesce(a2.booked_by_phone, ''), '\D', '', 'g'), 10) = k
      or right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = k)
  for update of a2;

  if a.id is null then
    return query select false, 'That visit could not be found under this number.'::text, null::uuid, null::text; return;
  end if;

  v_when := to_char(a.starts_at at time zone 'Asia/Manila', 'FMDy FMDD Mon, FMHH12:MI am');
  v_call := 'Call ' || a.clinic_name || case when a.clinic_phone is not null then ' on ' || a.clinic_phone else '' end;

  if p_action = 'confirm' then
    if a.status = 'booked' and a.starts_at > now() then
      update appointment set status = 'confirmed' where id = a.id;
      insert into audit_log (clinic_id, action, entity, entity_id)
      values (a.clinic_id, 'appointment.confirmed_by_patient', 'appointment', a.id);
      return query select true, ('Confirmed. See you on ' || v_when || ' at ' || a.clinic_name || '.')::text, a.clinic_id, 'confirmed'::text;
    elsif a.status = 'confirmed' then
      return query select false, 'This visit is already confirmed.'::text, a.clinic_id, a.status;
    elsif a.status = 'cancelled' then
      return query select false, 'This visit was cancelled, so there is nothing to confirm.'::text, a.clinic_id, a.status;
    elsif a.starts_at <= now() then
      return query select false, 'The time for this visit has passed, so it cannot be confirmed here.'::text, a.clinic_id, a.status;
    else
      return query select false, 'This visit is no longer waiting to be confirmed.'::text, a.clinic_id, a.status;
    end if;

  elsif p_action = 'cancel' then
    if a.status in ('booked', 'confirmed') and a.starts_at > now() + interval '2 hours' then
      update appointment set status = 'cancelled', cancelled_at = now() where id = a.id;
      -- Qualified: the function's own `status` column would shadow the table's in a bare WHERE.
      update message_log m set status = 'cancelled' where m.appointment_id = a.id and m.status = 'queued';
      insert into audit_log (clinic_id, action, entity, entity_id)
      values (a.clinic_id, 'appointment.cancelled_by_patient', 'appointment', a.id);
      return query select true, ('Cancelled. Your visit on ' || v_when || ' at ' || a.clinic_name || ' is off their list.')::text, a.clinic_id, 'cancelled'::text;
    elsif a.status = 'cancelled' then
      return query select false, 'This visit was already cancelled.'::text, a.clinic_id, a.status;
    elsif a.status in ('booked', 'confirmed') and a.starts_at <= now() then
      return query select false, ('The time for this visit has passed, so it cannot be cancelled here. ' || v_call || ' if you need to.')::text, a.clinic_id, a.status;
    elsif a.status in ('booked', 'confirmed') then
      return query select false, ('This visit is less than two hours away, so it cannot be cancelled here. ' || v_call || ' to cancel or move it.')::text, a.clinic_id, a.status;
    else
      return query select false, ('This visit can no longer be cancelled here. ' || v_call || ' if something has changed.')::text, a.clinic_id, a.status;
    end if;

  else
    return query select false, 'That is not something this page can do. Nothing was changed.'::text, a.clinic_id, a.status;
  end if;
end $$;

grant execute on function patient_visits(text) to flossify_app;
grant execute on function patient_home_clinic(text) to flossify_app;
grant execute on function patient_act(text, uuid, text) to flossify_app;
