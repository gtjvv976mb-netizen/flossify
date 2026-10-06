\set c '(select id from clinic where slug = ''session-road'')'
\set o '(select id from staff where email = ''liwayway.domingo@example.com'')'
begin;
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, notes, created_by)
select '7e57a1c0-0000-4000-8000-00000000fb01', :c, 'T-V3B', 'Verify', 'Birth', date '1980-03-15', 'female', '09175550911', null, :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-00000000fb01');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by, note)
select :c, '7e57a1c0-0000-4000-8000-00000000fb01', timestamptz '2025-01-10 10:00+08', 'staff', array['Sulfa'], array['Asthma'], array[]::text[], :o, null
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-00000000fb01');
insert into appointment (id, clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, source, chair, created_by)
select '7e57a1c0-0000-4000-8000-00000000fbe1', :c, '7e57a1c0-0000-4000-8000-00000000fb01', (select id from staff where email = 'hazel.tabanao@example.com'),
       (((now() at time zone 'Asia/Manila')::date + time '15:00') at time zone 'Asia/Manila'), (((now() at time zone 'Asia/Manila')::date + time '15:30') at time zone 'Asia/Manila'),
       'Cleaning', 'booked', 'staff', 2, :o
 where not exists (select 1 from appointment where id = '7e57a1c0-0000-4000-8000-00000000fbe1');
commit;
