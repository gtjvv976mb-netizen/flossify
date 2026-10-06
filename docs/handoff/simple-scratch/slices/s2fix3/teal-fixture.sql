\set c '(select id from clinic where slug = ''session-road'')'
insert into patient (id, clinic_id, chart_no, first_name, last_name, sex, phone, created_by)
select '7e57a1c0-0000-4000-8000-0000000000f1', :c, 'T-TEAL', 'Teal', 'Empty', 'male', '09175550977', (select id from staff where email = 'liwayway.domingo@example.com')
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-0000000000f1');
select p.id, p.chart_no, p.first_name||' '||p.last_name, pc.version_id from patient p join patient_consent pc on pc.patient_id=p.id where p.clinic_id = :c limit 5;
select id, kind, effective from consent_version order by effective;
