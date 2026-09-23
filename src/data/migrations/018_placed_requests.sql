-- 018 — a request becomes confirmable once the desk has placed it.
--
-- 017 stopped a patient (and a texted Y) from confirming a `source = 'request'`
-- row, because a request sits at a placeholder hour the clinic never agreed.
-- But nothing ever cleared that: once the desk gave the request a real time on
-- the schedule, the patient still could not confirm, while the move's own text
-- asked them to reply Y. The gate is now "the desk has not placed this yet" —
-- `source = 'request' and moved_at is null` — and `moved_at` is exactly what
-- the schedule sets when it moves a visit.
--
-- `patient_visits` gains `placed`, so /me/ can show Confirm on a request the
-- clinic has since timed without the page having to know about moved_at.

drop function if exists patient_visits(text);
create function patient_visits(p_phone text)
returns table (
  appointment_id uuid, clinic_id uuid, clinic_name text, clinic_slug text, clinic_phone text, clinic_area text,
  dentist text, starts_at timestamptz, ends_at timestamptz, reason text, status text, source text, public_ref text,
  patient_name text, booked_by_name text, created_at timestamptz, placed boolean
)
language sql security definer stable set search_path = public as $$
  select a.id, a.clinic_id, c.name, c.slug::text, c.phone, c.area,
         s.full_name, a.starts_at, a.ends_at, a.reason, a.status, a.source, a.public_ref,
         concat_ws(' ', p.first_name, nullif(p.last_name, '—')), a.booked_by_name, a.created_at,
         (a.source <> 'request' or a.moved_at is not null)
  from appointment a
  join patient p on p.id = a.patient_id
  join clinic c on c.id = a.clinic_id
  left join staff s on s.id = a.dentist_id
  where length(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10)) = 10
    and (right(regexp_replace(coalesce(a.booked_by_phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
      or right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10))
    and (a.status <> 'cancelled' or coalesce(a.cancelled_at, a.starts_at) > now() - interval '30 days')
  order by a.starts_at desc
$$;

-- The confirm gate, in both places a confirmation can come from.
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
      return query select false, 'The clinic has not set a time for this request yet; they will text you. Nothing to confirm until then.'::text, a.clinic_id, a.status;
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
  select m.clinic_id, m.appointment_id into o
  from message_log m
  where m.direction = 'out' and m.channel = 'sms'
    and right(regexp_replace(m.to_address, '\D', '', 'g'), 10) = k
  order by m.created_at desc limit 1;
  if o.clinic_id is null then
    return query select null::uuid, null::uuid, 'unmatched'::text; return;
  end if;
  select a2.id, a2.clinic_id, a2.patient_id, a2.status, a2.source, a2.moved_at into a
  from appointment a2 join patient p on p.id = a2.patient_id
  where a2.clinic_id = o.clinic_id
    and a2.status in ('booked', 'confirmed') and a2.starts_at > now()
    and (a2.id = o.appointment_id
         or right(regexp_replace(coalesce(nullif(a2.booked_by_phone, ''), p.phone, ''), '\D', '', 'g'), 10) = k)
  order by (a2.id = o.appointment_id) desc, a2.starts_at
  limit 1;
  if a.id is null then
    insert into message_log (clinic_id, channel, to_address, body, status, direction, kind)
    values (o.clinic_id, 'sms', p_from, left(p_text, 500), 'delivered', 'in', 'reply');
    return query select o.clinic_id, null::uuid, 'logged'::text; return;
  end if;
  insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, direction, kind)
  values (a.clinic_id, a.patient_id, a.id, 'sms', p_from, left(p_text, 500), 'delivered', 'in', 'reply');
  if upper(btrim(p_text)) in ('Y', 'YES', 'OO', 'OPO', 'CONFIRM', 'OK')
     and not (a.source = 'request' and a.moved_at is null) then
    update appointment set status = 'confirmed' where id = a.id and status = 'booked';
    insert into audit_log (clinic_id, action, entity, entity_id) values (a.clinic_id, 'appointment.confirmed_by_text', 'appointment', a.id);
    return query select a.clinic_id, a.id, 'confirmed'::text;
  else
    return query select a.clinic_id, a.id, 'logged'::text;
  end if;
end $$;

grant execute on function patient_visits(text) to flossify_app;
grant execute on function patient_act(text, uuid, text) to flossify_app;
grant execute on function sms_inbound(text, text) to flossify_app;
