-- 019 — the day-before reminder says only what will happen.
--
-- Texts go out through Semaphore from a registered sender name, one way: a
-- patient's reply never reaches Flossify. The reminder from 005 still asked
-- them to "Reply Y to confirm". Now it tells them to call the clinic to move
-- the visit, and asks for nothing else. sms_inbound() still takes a Y, for a
-- gateway that one day forwards replies; no text asks for one.
--
-- It said "tomorrow". But the worker holds reminders from 9 pm to 8 am Manila,
-- so a reminder written late in the evening, or retried past 9 pm, goes out at
-- 8 am on the visit day itself. It names the day instead: "Thu 25 Sep, 9:00 am",
-- the same words patient_act() uses (018).
--
-- It also reminded requests the desk had not placed. A request sits at a
-- placeholder hour (9 am, noon or 2 pm) that nobody at the clinic agreed to, so
-- the reminder named a time that was never set. Only real visits are reminded
-- now: booked by the desk or on the live schedule, or a request the desk has
-- placed. That is 018's gate: not (source = 'request' and moved_at is null).
--
-- Everything else is as 005 had it: visits on tomorrow's Manila date, booked
-- or confirmed, once each (dedupe_key reminder:<appointment id>), kind
-- 'reminder', status 'queued'. The worker's quiet hours still apply. One
-- small change: an empty booked_by_phone falls through to the patient's
-- number, as sms_inbound() already reads it (018), instead of queueing a
-- text to nobody.

-- One reminder's words. One text (160 characters) where it fits: past that the
-- dentist's name goes first; then a long reason becomes "your visit", with the
-- dentist back in if that fits. Invoker rights: it runs as
-- sms_enqueue_reminders() (a definer) when called from there, and anyone else
-- would read through row-level security. Nobody else is granted it.
create or replace function sms_reminder_body(p_appointment uuid)
returns text
language sql stable set search_path = public as $$
  select case
      when length(x.head || x.what || x.whn || x.who || x.tail) <= 160 then x.head || x.what || x.whn || x.who || x.tail
      when length(x.head || x.what || x.whn || x.tail) <= 160 then x.head || x.what || x.whn || x.tail
      when length(x.head || 'your visit' || x.whn || x.who || x.tail) <= 160 then x.head || 'your visit' || x.whn || x.who || x.tail
      else x.head || 'your visit' || x.whn || x.tail
    end
  from appointment a
  join clinic c on c.id = a.clinic_id
  left join staff s on s.id = a.dentist_id
  cross join lateral (select
      c.name || ': reminder for ' as head,
      coalesce(nullif(btrim(a.reason), ''), 'your visit') as what,
      ' on ' || to_char(a.starts_at at time zone 'Asia/Manila', 'FMDy FMDD Mon, FMHH12:MI am') as whn,
      coalesce(' with ' || nullif(btrim(s.full_name), ''), '') as who,
      '. To move it, call ' || coalesce(nullif(btrim(c.phone), ''), 'the clinic') || '.' as tail
  ) x
  where a.id = p_appointment
$$;
revoke all on function sms_reminder_body(uuid) from public;

create or replace function sms_enqueue_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, kind, dedupe_key)
  select a.clinic_id, a.patient_id, a.id, 'sms', coalesce(nullif(a.booked_by_phone, ''), p.phone),
    sms_reminder_body(a.id), 'queued', 'reminder', 'reminder:' || a.id
  from appointment a
  join patient p on p.id = a.patient_id
  where a.status in ('booked', 'confirmed')
    and not (a.source = 'request' and a.moved_at is null)
    and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date + 1
    and coalesce(nullif(a.booked_by_phone, ''), p.phone) is not null
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function sms_enqueue_reminders() to flossify_app;

-- Reminders already waiting when this runs. An unplaced request's is
-- withdrawn, and its key cleared so the visit is reminded once the desk places
-- it. Every other one not yet sent is rewritten in the new words.
update message_log m set status = 'cancelled', dedupe_key = null
  from appointment a
 where m.appointment_id = a.id
   and m.kind = 'reminder' and m.direction = 'out' and m.status = 'queued'
   and a.source = 'request' and a.moved_at is null;

update message_log m set body = coalesce(sms_reminder_body(m.appointment_id), m.body)
 where m.kind = 'reminder' and m.direction = 'out' and m.status = 'queued'
   and m.appointment_id is not null;
