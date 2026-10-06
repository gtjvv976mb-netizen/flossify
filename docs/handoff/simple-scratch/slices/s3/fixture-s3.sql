-- S3's own patients (idempotent), on flossify_simple, after baseline/fixture.sql:
--   T-PIN  "Pin Stress" 7e57a1c0-0000-4000-8000-000000000301: five long allergies, six conditions, four medicines, a BP
--          crisis today, a clearance asked and not answered, under 18 with no guardian consent, a long note for the
--          dentist, and a desk note with the import's two lines in it.
--   T-NONE "None Known" …302: a health history that says no allergies, nothing else; in credit ₱500 (money on account).
--   T-ASK  "Not Asked" …303: no health history at all.
\set c '(select id from clinic where slug = ''session-road'')'
\set o '(select id from staff where email = ''liwayway.domingo@example.com'')'
begin;
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, hmo_name, hmo_member_no, notes, created_by)
select '7e57a1c0-0000-4000-8000-000000000301', :c, 'T-PIN', 'Pin', 'Stress', date '2012-05-02', 'male', '09175550301', 'Intellicare', 'IC-0000-4455-7788',
       E'Prefers the 9 am chair; mother drives him in, call her first on 0917 555 0399.\nPhone from the old records: 074 442 1234 · Born in 2012 (the old records give only the year)',
       :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-000000000301');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by, note)
select :c, '7e57a1c0-0000-4000-8000-000000000301', timestamptz '2026-09-21 10:00+08', 'staff',
       array['Penicillin and all beta-lactam antibiotics', 'Natural rubber latex (gloves, dams)', 'Lidocaine with epinephrine 1:100,000', 'Non-steroidal anti-inflammatory drugs', 'Chlorhexidine gluconate mouthwash'],
       array['Hypertension', 'Type 1 diabetes', 'Asthma', 'Epilepsy', 'Bleeding disorder', 'Heart murmur'],
       array['Losartan 50 mg', 'Insulin glargine 20 units', 'Salbutamol inhaler', 'Levetiracetam 500 mg'],
       :o,
       'Faints at the sight of needles: lie him back before any injection and keep juice at the chair. Anxious about the drill; agree a stop signal first. Bleeds longer than usual after extractions, so pack and bite for 30 minutes and check before he leaves. Seizure plan in the chart: time it, protect the head, call the mother.'
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-000000000301');
insert into vital_sign (clinic_id, patient_id, taken_at, systolic, diastolic, pulse, taken_by)
select :c, '7e57a1c0-0000-4000-8000-000000000301', now(), 185, 115, 96, :o
 where not exists (select 1 from vital_sign where patient_id = '7e57a1c0-0000-4000-8000-000000000301' and (taken_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date);
insert into clinical_letter (clinic_id, patient_id, kind, dentist_id, issued_on, to_name, to_role, purpose, created_by)
select :c, '7e57a1c0-0000-4000-8000-000000000301', 'clearance', (select id from staff where email = 'hazel.tabanao@example.com'), date '2026-09-28', 'Dr. Ana Cruz', 'Pediatrician', 'Extraction under local', :o
 where not exists (select 1 from clinical_letter where patient_id = '7e57a1c0-0000-4000-8000-000000000301');

insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, created_by)
select '7e57a1c0-0000-4000-8000-000000000302', :c, 'T-NONE', 'None', 'Known', date '1990-01-10', 'female', '09175550302', :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-000000000302');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by)
select :c, '7e57a1c0-0000-4000-8000-000000000302', timestamptz '2026-09-22 10:00+08', 'staff', array[]::text[], array[]::text[], array[]::text[], :o
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-000000000302');
insert into payment (clinic_id, patient_id, method, amount, received_by)
select :c, '7e57a1c0-0000-4000-8000-000000000302', 'cash', 500, :o
 where not exists (select 1 from payment where patient_id = '7e57a1c0-0000-4000-8000-000000000302');

insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, created_by)
select '7e57a1c0-0000-4000-8000-000000000303', :c, 'T-ASK', 'Not', 'Asked', null, null, '09175550303', :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-000000000303');
delete from throttle where key like 'login:%';
commit;
select chart_no, patient_balance(id) from patient where id::text like '7e57a1c0-0000-4000-8000-0000000003%' order by 1;
