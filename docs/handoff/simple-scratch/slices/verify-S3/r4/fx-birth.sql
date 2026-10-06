\set c '(select id from clinic where slug = ''session-road'')'
\set o '(select id from staff where email = ''liwayway.domingo@example.com'')'
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, notes, created_by)
select '7e57a1c0-0000-4000-8000-0000009fb177', :c, 'T-R4B', 'Birth', 'Verify', date '1980-02-02', 'female', '09175550947', 'Prefers mornings', :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-0000009fb177');
update patient set birth_date = date '1980-02-02', first_name='Birth', notes='Prefers mornings' where id = '7e57a1c0-0000-4000-8000-0000009fb177';
