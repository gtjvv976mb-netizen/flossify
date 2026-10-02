-- 044: the owner's three open questions, built as each clinic's own choice (Clinic settings → Clinic profile,
-- "How you work"). Every default keeps what clinics have today.
--
--   clinic.turnover_min           minutes a chair is kept free after each visit: online booking (slotOpen) and the
--                                 calendar's suggested times leave it; the desk may still book back to back by hand.
--                                 0, 5, 10, 15, 20 or 30. Default 0.
--   clinic.hold_closed_reminders  a reminder waits while its visit sits in closed time nobody has kept (Calls → In
--                                 closed time): the reminder pass skips it, and a reminder already queued for it is
--                                 withdrawn when it falls into closed time (src/lib/blocks.ts). Keep it or Move it,
--                                 and the next pass writes it. Default false (p07 §7.1's default: reminders go).
--   clinic.consent_ask_at         where the board asks why a visit goes ahead without a consent form that is not
--                                 agreed: 'chair' (In the chair, as built) or 'arrived' (Arrived or In the lobby, and
--                                 In the chair when nobody answered at the door). Default 'chair'.
--
-- consent_override.context gains 'arrived'. public_clinic_turnover() is the public side's only read of the gap.
-- sms_enqueue_reminders() is 036's, with the hold added to both passes. Additive; nothing is backfilled.

alter table clinic add column if not exists turnover_min smallint not null default 0;
alter table clinic drop constraint if exists clinic_turnover_min_check;
alter table clinic add constraint clinic_turnover_min_check check (turnover_min in (0, 5, 10, 15, 20, 30));
alter table clinic add column if not exists hold_closed_reminders boolean not null default false;
alter table clinic add column if not exists consent_ask_at text not null default 'chair';
alter table clinic drop constraint if exists clinic_consent_ask_at_check;
alter table clinic add constraint clinic_consent_ask_at_check check (consent_ask_at in ('chair', 'arrived'));

alter table consent_override drop constraint if exists consent_override_context_check;
alter table consent_override add constraint consent_override_context_check check (context in ('plan_done', 'in_chair', 'strip', 'arrived'));

-- The gap online booking keeps after each visit: a listed clinic's only, a number, nothing else.
create or replace function public_clinic_turnover(p_clinic uuid)
returns smallint
language sql security definer stable set search_path = public as $$
  select coalesce((select c.turnover_min from clinic c where c.id = p_clinic and c.archived_at is null and c.listed), 0::smallint)
$$;
revoke all on function public_clinic_turnover(uuid) from public;
grant execute on function public_clinic_turnover(uuid) to flossify_app;

-- Is this visit in closed time that nobody kept, at a clinic that holds reminders then? The same scope rule as
-- src/lib/blocks.ts IN_SCOPE_SQL (clinic-wide, its dentist, its chair) over clinic_unavailable().
create or replace function appointment_reminder_held(p_appointment uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((
    select c.hold_closed_reminders and a.blocked_ok_at is null and exists (
      select 1 from clinic_unavailable(a.clinic_id, a.starts_at, a.ends_at) u
       where ((u.dentist_id is null and u.chair is null) or u.dentist_id = a.dentist_id or u.chair = a.chair)
         and u.starts_at < a.ends_at and u.ends_at > a.starts_at)
      from appointment a join clinic c on c.id = a.clinic_id
     where a.id = p_appointment), false)
$$;
revoke all on function appointment_reminder_held(uuid) from public;
grant execute on function appointment_reminder_held(uuid) to flossify_app;

create or replace function sms_enqueue_reminders()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; n48 integer;
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
    and not appointment_reminder_held(a.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;

  -- Two days before, for clinics that want it: a visit still only booked (a confirmed one has said yes).
  insert into message_log (clinic_id, patient_id, appointment_id, channel, to_address, body, status, kind, dedupe_key)
  select a.clinic_id, a.patient_id, a.id, 'sms', coalesce(nullif(a.booked_by_phone, ''), p.phone),
    sms_remind48_body(a.id), 'queued', 'reminder', 'remind48:' || a.id
  from appointment a
  join patient p on p.id = a.patient_id
  join clinic c on c.id = a.clinic_id
  where c.remind_48h
    and a.status = 'booked'
    and not (a.source = 'request' and a.moved_at is null)
    and (a.starts_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date + 2
    and coalesce(nullif(a.booked_by_phone, ''), p.phone) is not null
    and not appointment_reminder_held(a.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n48 = row_count;
  return n + n48;
end $$;
grant execute on function sms_enqueue_reminders() to flossify_app;
