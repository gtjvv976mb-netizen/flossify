-- A test patient for the Treatment record: 16 visit days and every money case the ledger has to get right.
do $$
declare
  cid uuid := (select id from clinic where slug = 'session-road');
  doc uuid := 'a7644577-cef7-437a-9290-38ffcfb64332';
  pid uuid;
  today date := (now() at time zone 'Asia/Manila')::date;
  d date; a uuid; pr uuid; inv uuid; i int; n bigint;
  at timestamptz;
begin
  if exists (select 1 from patient where clinic_id = cid and chart_no = 'T-LEDG') then return; end if;
  insert into patient (clinic_id, chart_no, first_name, last_name, phone, birth_date)
    values (cid, 'T-LEDG', 'Ledger', 'Test', '0921 555 0777', date '1950-03-02') returning id into pid;
  insert into invoice_series (clinic_id, prefix, next_number) values (cid, 'T', 1) on conflict do nothing;
  for i in 1..16 loop
    d := today - (200 - i * 10);
    at := (d + time '10:00') at time zone 'Asia/Manila';
    insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, created_at)
      values (cid, pid, doc, at, at + interval '45 minutes', case when i = 8 then 'Consultation' else 'Check-up' end, 'completed', at - interval '7 days') returning id into a;
    if i <> 8 then
      insert into procedure_done (clinic_id, patient_id, appointment_id, fdi, surface, price, performed_by, performed_at, name, created_by)
        values (cid, pid, a, case when i % 3 = 0 then 36 else null end, case when i % 3 = 0 then 'O' else null end, 1000, doc, at + interval '30 minutes', case when i % 3 = 0 then 'Composite filling' else 'Oral prophylaxis' end, doc)
        returning id into pr;
    end if;
    n := (select next_number from invoice_series where clinic_id = cid and prefix = 'T');
    update invoice_series set next_number = next_number + 1 where clinic_id = cid and prefix = 'T';
    if i = 1 then -- part paid, the rest on day 3
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount, appointment_id)
        values (cid, pid, 'T', n, at + interval '40 minutes', 1000, 1000, 'paid', 0, 0, a) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Oral prophylaxis', 1000, 1000, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'cash', 400, at + interval '41 minutes', d, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'gcash', 600, at + interval '20 days', d + 20, 2);
    elsif i = 2 then -- senior discount
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, discount, discount_kind, discount_id_no, total, status, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '40 minutes', 1000, 200, 'senior', 'SC-0001', 800, 'paid', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Oral prophylaxis', 1000, 1000, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'cash', 800, at + interval '41 minutes', d, 1);
    elsif i = 4 then -- HMO share 700; patient pays 300; HMO pays 400 of it later
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, payor_kind, payor_name, payor_share, status, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '40 minutes', 1000, 1000, 'hmo', 'Maxicare', 700, 'partly_paid', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Oral prophylaxis', 1000, 1000, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'cash', 300, at + interval '41 minutes', d, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'hmo', 400, at + interval '15 days', d + 15, 2);
    elsif i = 5 then -- statement two days after the treatment
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '2 days', 1000, 1000, 'issued', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Oral prophylaxis', 1000, 1000, 1);
    elsif i = 6 then -- a payment dated before its statement
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '40 minutes', 1000, 1000, 'paid', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Composite filling, 36 O', 1000, 1000, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'card', 1000, at + interval '41 minutes', d - 3, 1);
    elsif i = 7 then -- a void statement, and a live one with a voided payment
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, voided_at, void_reason, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '35 minutes', 1000, 1000, 'void', at + interval '38 minutes', 'Wrong patient', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Oral prophylaxis', 1000, 1000, 1);
      n := (select next_number from invoice_series where clinic_id = cid and prefix = 'T');
      update invoice_series set next_number = next_number + 1 where clinic_id = cid and prefix = 'T';
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '40 minutes', 1000, 1000, 'issued', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, procedure_id, description, unit_price, amount, line_no) values (cid, inv, pr, 'Oral prophylaxis', 1000, 1000, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq, voided_at, void_reason) values (cid, inv, pid, 'cash', 1000, at + interval '41 minutes', d, 1, at + interval '1 hour', 'Counted twice');
    elsif i = 8 then -- consultation only, one line naming the visit
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount, appointment_id)
        values (cid, pid, 'T', n, at + interval '40 minutes', 500, 500, 'paid', 0, 0, a) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, description, unit_price, amount, line_no) values (cid, inv, 'Consultation', 500, 500, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'cash', 500, at + interval '41 minutes', d, 1);
    elsif i = 9 then -- an old line with no procedure link, and money on account
      insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, total, status, vat_rate, vat_amount)
        values (cid, pid, 'T', n, at + interval '40 minutes', 1000, 1000, 'paid', 0, 0) returning id into inv;
      insert into invoice_line (clinic_id, invoice_id, description, unit_price, amount, line_no) values (cid, inv, 'Cleaning', 1000, 1000, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on, seq) values (cid, inv, pid, 'cash', 1000, at + interval '41 minutes', d, 1);
      insert into payment (clinic_id, invoice_id, patient_id, method, amount, received_at, paid_on) values (cid, null, pid, 'cash', 150, at + interval '42 minutes', d);
    end if;
  end loop;
end $$;
select id from patient where chart_no = 'T-LEDG';
select patient_balance(id) from patient where chart_no = 'T-LEDG';
