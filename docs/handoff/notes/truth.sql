with d as (select (now() at time zone 'Asia/Manila')::date as today), c as (select '97c56fa2-6423-4ed8-9c38-1bcaae9c247e'::uuid as id)
select json_build_object(
  'inclinic', (select count(*) from appointment a, d, c where a.clinic_id=c.id and (a.starts_at at time zone 'Asia/Manila')::date=d.today and a.status in ('arrived','in_lobby','in_chair')),
  'missed', (select count(*) from appointment a, d, c where a.clinic_id=c.id and (a.starts_at at time zone 'Asia/Manila')::date=d.today and a.status in ('no_show','cancelled')),
  'uncharged', (select count(*) from procedure_done x, d, c where x.clinic_id=c.id and (x.performed_at at time zone 'Asia/Manila')::date=d.today and not exists (select 1 from invoice_line l join invoice i on i.id=l.invoice_id where l.procedure_id=x.id and i.status<>'void')),
  'unpaid', (select count(*) from invoice i, d, c where i.clinic_id=c.id and (i.issued_at at time zone 'Asia/Manila')::date=d.today and i.status in ('issued','partly_paid','paid') and not exists (select 1 from payment y where y.invoice_id=i.id and y.voided_at is null)),
  'owing_n', (select count(*) from patient p, d, c where p.clinic_id=c.id and p.archived_at is null and patient_balance(p.id)>0 and exists (select 1 from appointment a where a.patient_id=p.id and a.status='completed' and (a.starts_at at time zone 'Asia/Manila')::date=d.today)),
  'anna_owes', (select '₱' || to_char(patient_balance('dc9ec446-24d5-439b-999f-9e3013b671f5'), 'FM999,999,990.00')),
  'tm_n', (select count(*) from appointment a, d, c where a.clinic_id=c.id and (a.starts_at at time zone 'Asia/Manila')::date=d.today+1 and a.status in ('booked','confirmed')),
  'tm_unconfirmed', (select count(*) from appointment a, d, c where a.clinic_id=c.id and (a.starts_at at time zone 'Asia/Manila')::date=d.today+1 and a.status='booked'),
  'tm_nophone', (select count(*) from appointment a join patient p on p.id=a.patient_id, d, c where a.clinic_id=c.id and (a.starts_at at time zone 'Asia/Manila')::date=d.today+1 and a.status in ('booked','confirmed') and nullif(btrim(coalesce(p.phone,'')),'') is null),
  'tm_first', (select ltrim(to_char(min(a.starts_at) at time zone 'Asia/Manila', 'HH12:MI am'), '0') from appointment a, d, c where a.clinic_id=c.id and (a.starts_at at time zone 'Asia/Manila')::date=d.today+1 and a.status in ('booked','confirmed'))
);
