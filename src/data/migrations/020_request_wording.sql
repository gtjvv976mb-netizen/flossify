-- 020 — a request's patient is not promised a text.
--
-- 018's patient_act told a patient trying to confirm an unplaced request that
-- the clinic "will text you". It may not: the desk places a request on the
-- schedule, and a text goes only when the time changes (api/schedule), so a
-- request placed at the hour the patient asked for sends nothing. The words
-- now say what will happen. The function is 018's otherwise unchanged;
-- create or replace keeps its owner and grants.

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

  select a2.id, a2.clinic_id, a2.status, a2.source, a2.moved_at, a2.starts_at, c.name as clinic_name, c.phone as clinic_phone
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
    if a.source = 'request' and a.moved_at is null and a.status = 'booked' then
      return query select false, 'The clinic has not set a time for this request yet. They will confirm it with you; nothing to do until then.'::text, a.clinic_id, a.status;
    elsif a.status = 'booked' and a.starts_at > now() then
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
