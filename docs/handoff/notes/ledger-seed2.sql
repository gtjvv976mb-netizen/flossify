do $$
declare
  cid uuid := (select id from clinic where slug = 'session-road');
  doc uuid := 'a7644577-cef7-437a-9290-38ffcfb64332';
  pid uuid := (select id from patient where chart_no = 'T-LEDG');
  today date := (now() at time zone 'Asia/Manila')::date;
  a uuid; b uuid; p uuid; inv uuid; n bigint; at timestamptz;
begin
  if exists (select 1 from appointment where patient_id = pid and reason = 'Seated early') then return; end if;
  -- (a) seated early: booked two hours from now, already in the chair, a treatment stamped to it
  at := date_trunc('minute', now()) + interval '2 hours';
  insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, arrived_at, seated_at, created_at)
    values (cid, pid, doc, at, at + interval '30 minutes', 'Seated early', 'in_chair', now() - interval '20 minutes', now() - interval '10 minutes', now() - interval '1 day') returning id into a;
  insert into procedure_done (clinic_id, patient_id, appointment_id, fdi, price, performed_by, performed_at, name, created_by)
    values (cid, pid, a, 48, 2500, doc, now() - interval '5 minutes', 'Early extraction', doc);
  -- (b) two visits three days ago; the treatment is unstamped (placed in A), the one-line statement names B
  at := ((today - 3) + time '09:00') at time zone 'Asia/Manila';
  insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, created_at)
    values (cid, pid, doc, at, at + interval '30 minutes', 'Morning visit', 'completed', at) returning id into a;
  insert into procedure_done (clinic_id, patient_id, fdi, price, performed_by, performed_at, name, created_by)
    values (cid, pid, 36, 1500, doc, at + interval '1 hour', 'Two-visit extraction', doc) returning id into p;
  at := ((today - 3) + time '15:00') at time zone 'Asia/Manila';
  insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, created_at)
    values (cid, pid, doc, at, at + interval '30 minutes', 'Afternoon visit', 'completed', at) returning id into b;
  n := (select next_number from invoice_series where clinic_id = cid and prefix = 'T');
  update invoice_series set next_number = next_number + 1 where clinic_id = cid and prefix = 'T';
  insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount, appointment_id)
    values (cid, pid, 'T', n, at + interval '30 minutes', 1500, 1500, 'issued', 0, 0, b) returning id into inv;
  insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, p, 'Extraction · tooth 36', 1500, 1500, 1);
  -- (c) booked at the afternoon visit, then cancelled: the Next appt. of that day says so
  at := ((today + 5) + time '10:00') at time zone 'Asia/Manila';
  insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, created_at, cancelled_at)
    values (cid, pid, doc, at, at + interval '30 minutes', 'Follow-up', 'cancelled', ((today - 3) + time '15:20') at time zone 'Asia/Manila', now());
  -- (d) a visit six days ago that booked a future one
  at := ((today - 6) + time '10:00') at time zone 'Asia/Manila';
  insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, created_at)
    values (cid, pid, doc, at, at + interval '30 minutes', 'Check-up', 'completed', at - interval '7 days');
  at := ((today + 10) + time '10:00') at time zone 'Asia/Manila';
  insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, created_at)
    values (cid, pid, doc, at, at + interval '30 minutes', 'Adjustment', 'booked', ((today - 6) + time '10:40') at time zone 'Asia/Manila');
end $$;
select a.id, a.reason, a.status, (a.starts_at at time zone 'Asia/Manila')::timestamp(0) from appointment a join patient p on p.id = a.patient_id where p.chart_no = 'T-LEDG' and a.starts_at > now() - interval '7 days' order by a.starts_at;
select patient_balance(id) from patient where chart_no = 'T-LEDG';
