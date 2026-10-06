\set c '(select id from clinic where slug = ''session-road'')'
\set o '(select id from staff where email = ''liwayway.domingo@example.com'')'
begin;
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, notes, created_by)
select '7e57a1c0-0000-4000-8000-00000000fc03', :c, 'T-V6', 'Verify', 'Manyallergy', date '1975-06-01', 'male', '09175550946', null, :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-00000000fc03');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by, note)
select :c, '7e57a1c0-0000-4000-8000-00000000fc03', timestamptz '2025-01-10 10:00+08', 'staff',
 array['Penicillin and all beta-lactam antibiotics', 'Natural rubber latex (gloves, dams)', 'Lidocaine with epinephrine 1:100,000', 'Non-steroidal anti-inflammatory drugs', 'Chlorhexidine gluconate mouthwash'], array['Hypertension','Asthma'], array['Losartan'], :o, null
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-00000000fc03');
commit;
