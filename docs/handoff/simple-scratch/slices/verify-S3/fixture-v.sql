\set c '(select id from clinic where slug = ''session-road'')'
\set o '(select id from staff where email = ''liwayway.domingo@example.com'')'
begin;
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, hmo_name, hmo_member_no, notes, created_by)
select '7e57a1c0-0000-4000-8000-000000000401', :c, 'T-VER1', 'Veronica', 'Villanueva-Santiago', date '1984-03-02', 'female', '09175550401', 'Health Partners Dental Access', 'HPDA-0000-1234-5678-9',
       E'Prefers afternoons; hard of hearing on the left, speak on her right side. Brings her own neck pillow.',
       :o
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-000000000401');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by, note)
select :c, '7e57a1c0-0000-4000-8000-000000000401', timestamptz '2026-09-21 10:00+08', 'staff',
       array['Penicillin', 'Latex', 'Sulfa drugs', 'Aspirin', 'Codeine'],
       array['Hypertension', 'Asthma'],
       array['Amlodipine 5 mg'],
       :o,
       'Faints at the sight of needles: lie her back before any injection and keep juice at the chair. Anxious about the drill; agree a stop signal first. Bleeds longer than usual after extractions, so pack and bite for 30 minutes and check before she leaves.'
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-000000000401');
commit;
