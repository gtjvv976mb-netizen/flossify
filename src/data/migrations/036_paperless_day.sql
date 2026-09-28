-- 036 — the paperless day: every chairside write names its visit, the recall texts the patient when it is
-- due, and the day-before reminder gets a companion two days out (docs/clinic-operations.md).
--
--   - appointment_id on prescription, vital_sign and attachment (procedure_done and clinical_note have it
--     already), so a prescription, a blood pressure and an X-ray belong to the visit they were taken at and
--     the Timeline stops placing them by day. Old rows keep null and are still placed by day.
--   - invoice_line.procedure_id (schema.sql) gets an index: "charge what was done, once" reads it.
--   - clinic.recall_texts (off until the owner turns it on: a text costs the clinic money) and
--     clinic.remind_48h (on: two reminders beat one — SMS reminders cut no-shows 38–40%, and a firm ask two
--     days before lets a broken slot be given to someone else).
--   - sms_enqueue_reminders() now also queues a text two days before a visit (dedupe remind48:<id>), when the
--     clinic has it on. dropStaleTexts() and a cancellation clear both the same way (both are kind 'reminder').
--   - sms_enqueue_recalls(): one text per open recall due within 14 days, or up to 60 days overdue, at a clinic
--     with recall texts on, to a patient with a mobile and no future visit on the book; Tuesdays and Wednesdays
--     9–11 am Manila only (the worker runs it every pass; the function itself keeps the window), once per
--     recall per 60 days (recall.last_sent_at). No link, no reply asked, the clinic's number named.

alter table prescription add column if not exists appointment_id uuid references appointment(id) on delete set null;
alter table vital_sign   add column if not exists appointment_id uuid references appointment(id) on delete set null;
alter table attachment   add column if not exists appointment_id uuid references appointment(id) on delete set null;
create index if not exists procedure_done_visit on procedure_done (appointment_id) where appointment_id is not null;
create index if not exists clinical_note_visit  on clinical_note (appointment_id) where appointment_id is not null;
create index if not exists prescription_visit   on prescription (appointment_id) where appointment_id is not null;
create index if not exists vital_sign_visit     on vital_sign (appointment_id) where appointment_id is not null;
create index if not exists attachment_visit     on attachment (appointment_id) where appointment_id is not null;
create index if not exists invoice_line_procedure on invoice_line (procedure_id) where procedure_id is not null;

alter table clinic add column if not exists recall_texts boolean not null default false;
alter table clinic add column if not exists remind_48h   boolean not null default true;

-- ---------------------------------------------------------------------------
-- The reminder two days out. Same voice as sms_reminder_body (019): the clinic's name, the fact, what to do.
-- Invoker rights, like sms_reminder_body: only the definer below reads it across clinics.
-- ---------------------------------------------------------------------------
create or replace function sms_remind48_body(p_appointment uuid)
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
      c.name || ': ' as head,
      coalesce(nullif(btrim(a.reason), ''), 'your visit') as what,
      ' is on ' || to_char(a.starts_at at time zone 'Asia/Manila', 'FMDy FMDD Mon, FMHH12:MI am') as whn,
      coalesce(' with ' || nullif(btrim(s.full_name), ''), '') as who,
      '. If you cannot come, call ' || coalesce(nullif(btrim(c.phone), ''), 'the clinic') || ' so someone else can have the time.' as tail
  ) x
  where a.id = p_appointment
$$;
revoke all on function sms_remind48_body(uuid) from public;

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
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n48 = row_count;
  return n + n48;
end $$;
grant execute on function sms_enqueue_reminders() to flossify_app;

-- ---------------------------------------------------------------------------
-- The recall text. "<Clinic>: Hi Ana, your check-up and cleaning is due this month. Call 0917 000 0000 to book."
-- ---------------------------------------------------------------------------
create or replace function sms_recall_body(p_recall uuid)
returns text
language sql stable set search_path = public as $$
  select c.name || ': Hi ' || p.first_name || ', your ' || lower(coalesce(nullif(btrim(r.reason), ''), 'check-up'))
         || case when r.due_on < (now() at time zone 'Asia/Manila')::date then ' was due on ' || to_char(r.due_on, 'FMDD Mon') else ' is due this month' end
         || '. Call ' || coalesce(nullif(btrim(c.phone), ''), 'the clinic') || ' to book.'
  from recall r
  join patient p on p.id = r.patient_id
  join clinic c on c.id = r.clinic_id
  where r.id = p_recall
$$;
revoke all on function sms_recall_body(uuid) from public;

create or replace function sms_enqueue_recalls()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
  manila timestamp := now() at time zone 'Asia/Manila';
begin
  -- Tuesday or Wednesday, 9–11 am Manila: when a recall text is best read and least likely to wake anyone.
  if extract(dow from manila) not in (2, 3) or extract(hour from manila) not between 9 and 10 then
    return 0;
  end if;
  with due as (
    select r.id, r.clinic_id, r.patient_id, p.phone
      from recall r
      join patient p on p.id = r.patient_id
      join clinic c on c.id = r.clinic_id
     where c.recall_texts
       and r.completed_at is null
       and p.archived_at is null
       and p.phone ~ '^09[0-9]{9}$'
       and r.due_on between manila::date - 60 and manila::date + 14
       and (r.last_sent_at is null or r.last_sent_at < now() - interval '60 days')
       and not exists (select 1 from appointment a where a.patient_id = p.id and a.starts_at > now() and a.status not in ('cancelled', 'no_show', 'completed'))
     for update of r skip locked
  ), queued as (
    insert into message_log (clinic_id, patient_id, channel, to_address, body, status, kind, dedupe_key)
    select d.clinic_id, d.patient_id, 'sms', d.phone, sms_recall_body(d.id), 'queued', 'recall', 'recall:' || d.id || ':' || to_char(manila, 'YYYYMM')
      from due d
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning patient_id
  )
  update recall r set last_sent_at = now() from due d where r.id = d.id and d.patient_id in (select patient_id from queued);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function sms_enqueue_recalls() to flossify_app;
