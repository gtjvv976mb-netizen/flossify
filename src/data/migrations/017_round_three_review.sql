-- 017 — what the adversarial review of round three found.
--
-- 1. A patient could confirm a *request* (a booking at a placeholder time the
--    clinic never agreed) from /me/ or by texting Y. The functions now refuse
--    it with the page's own sentence; only the desk can turn a request into a
--    time.
-- 2. The per-email sign-in lock counted first and refunded on success, but the
--    refund needs a function the app role may call.
-- 3. Two payors with one name at one clinic were possible in a race; PhilHealth
--    could be added twice. Unique indexes, and the accreditation trigger now
--    switches the payor off as well as on.
-- 4. The privacy notice promises text logs go after two years. Now they do.

-- 1a. patient_act: a request cannot be confirmed by the patient.
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

  select a2.id, a2.clinic_id, a2.status, a2.source, a2.starts_at, c.name as clinic_name, c.phone as clinic_phone
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
    if a.source = 'request' and a.status = 'booked' then
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

-- 1b. sms_inbound: a Y on a request is kept for the desk, not turned into a confirmation.
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
  select a2.id, a2.clinic_id, a2.patient_id, a2.status, a2.source into a
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
  if upper(btrim(p_text)) in ('Y', 'YES', 'OO', 'OPO', 'CONFIRM', 'OK') and a.source <> 'request' then
    update appointment set status = 'confirmed' where id = a.id and status = 'booked';
    insert into audit_log (clinic_id, action, entity, entity_id) values (a.clinic_id, 'appointment.confirmed_by_text', 'appointment', a.id);
    return query select a.clinic_id, a.id, 'confirmed'::text;
  else
    return query select a.clinic_id, a.id, 'logged'::text;
  end if;
end $$;

-- 2. Give a hit back (a successful sign-in).
create or replace function throttle_refund(p_key text)
returns void
language sql security definer set search_path = public as $$
  update throttle set hits = greatest(hits - 1, 0) where key = p_key
$$;

-- 3. One payor per name per clinic; one PhilHealth per clinic; the trigger switches both ways.
create unique index if not exists hmo_provider_clinic_name on hmo_provider (clinic_id, lower(name));
create unique index if not exists hmo_provider_one_philhealth on hmo_provider (clinic_id) where kind = 'philhealth';

create or replace function clinic_philhealth_payor()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.philhealth_dental then
    insert into hmo_provider (clinic_id, name, expected_days, kind, active)
    values (new.id, 'PhilHealth', 90, 'philhealth', true)
    on conflict (clinic_id) where kind = 'philhealth' do update set active = true;
  else
    update hmo_provider set active = false where clinic_id = new.id and kind = 'philhealth';
  end if;
  return new;
end $$;

-- 4. Text logs go after two years, as the notice says. Visits stay: they are the clinic's record.
create or replace function retention_purge()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from message_log where created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function patient_act(text, uuid, text) to flossify_app;
grant execute on function sms_inbound(text, text) to flossify_app;
grant execute on function throttle_refund(text) to flossify_app;
grant execute on function retention_purge() to flossify_app;
