\set c '(select id from clinic where slug = ''session-road'')'
\set o '(select id from staff where email = ''liwayway.domingo@example.com'')'
begin;
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, created_by)
select '7e57a1c0-0000-4000-8000-000000000402', :c, 'T-VER2', 'Long', 'Allergy', date '1980-01-01', 'male', '09175550402', :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-000000000402');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by)
select :c, '7e57a1c0-0000-4000-8000-000000000402', timestamptz '2026-09-21 10:00+08', 'staff',
       array['Amoxicillin-clavulanate: hives and throat swelling in 2019 ok'], array[]::text[], array[]::text[], :o
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-000000000402');
commit;
select length('Amoxicillin-clavulanate: hives and throat swelling in 2019 ok');
