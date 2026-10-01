-- The data every measurement of the simpler record runs on (S0 baseline, S2 … S8). Idempotent: run it before
-- every measurement, on flossify_simple:
--   psql -U root -h /var/run/postgresql -d flossify_simple -f /tmp/fl-simple-scratch/baseline/fixture.sql
-- 1. Maria's confirmed "Filling, tooth 36" visit (5a055ab9…) is TODAY at 9:30 am Manila, as in spec §2.5, so the
--    record has its This visit strip / Today card whatever day the measurement runs. Nothing is attached to it.
-- 2. The 030 snapshot's seven sign-ins (snap.admin, snap.assoc, snap.sec, snap.asst, snap.desk with a custom
--    "Front desk (snap)" role) at session-road, password = ramon's ("flossify").
-- 3. One certificate on Maria (the snapshot's letter print page needs one; she had none).
\set g '(select group_id from clinic where slug = ''session-road'')'
\set c '(select id from clinic where slug = ''session-road'')'
begin;
update appointment
   set starts_at = (((now() at time zone 'Asia/Manila')::date + time '09:30') at time zone 'Asia/Manila'),
       ends_at = (((now() at time zone 'Asia/Manila')::date + time '09:30') at time zone 'Asia/Manila') + (ends_at - starts_at)
 where id = '5a055ab9-8eaa-42aa-9951-395736601384'
   and starts_at <> (((now() at time zone 'Asia/Manila')::date + time '09:30') at time zone 'Asia/Manila');

insert into clinic_role (group_id, name, rank, perms, is_owner, base)
select group_id, 'Front desk (snap)', 60, array['schedule.edit','messages.send'], false, null from clinic
 where slug = 'session-road'
   and not exists (select 1 from clinic_role r where r.group_id = clinic.group_id and r.name = 'Front desk (snap)');
with h as (select password_hash from staff where email = 'ramon.cari.o@example.com'),
roles as (select r.id, r.name from clinic_role r join clinic c on c.group_id = r.group_id where c.slug = 'session-road' and r.archived_at is null)
insert into staff (group_id, full_name, email, username, role, role_id, password_hash, password_set_at, home_clinic_id, prc_licence)
select :g, 'Snap ' || x.label, 'snap.' || x.key || '@example.com', 'snap.' || x.key, x.srole, (select id from roles where name = x.rname), (select password_hash from h), now(), :c, x.prc
  from (values ('admin', 'Admin', 'Admin', 'admin', null), ('assoc', 'Associate', 'Associate dentist', 'associate', '0099001'), ('sec', 'Secretary', 'Secretary', 'secretary', null),
               ('asst', 'Assistant', 'Dental assistant', 'assistant', null), ('desk', 'Desk', 'Front desk (snap)', 'assistant', null)) as x(key, label, rname, srole, prc)
 where not exists (select 1 from staff s where s.email = 'snap.' || x.key || '@example.com');
insert into staff_access (staff_id, clinic_id, can_view_finance, can_edit_records, can_manage_staff)
select s.id, :c, false, true, s.email = 'snap.admin@example.com' from staff s
 where s.email in ('snap.admin@example.com', 'snap.assoc@example.com', 'snap.sec@example.com', 'snap.asst@example.com', 'snap.desk@example.com')
   and not exists (select 1 from staff_access a where a.staff_id = s.id and a.clinic_id = :c);

insert into clinical_letter (clinic_id, patient_id, kind, dentist_id, issued_on, seen_on, diagnosis, rest_days, created_by)
select :c, '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', 'certificate', id, date '2026-09-28', date '2026-09-28', 'Caries on 26', 0, id from staff
 where email = 'liwayway.domingo@example.com'
   and not exists (select 1 from clinical_letter where patient_id = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb');
-- 4. "Rich Test" (T-RICH, id 7e57a1c0-0000-4000-8000-000000000001): the cards Maria does not have, for the landing
--    of #loas and #treatment-lab when they are present, a chart offer (?treated=), and the sticky-height check (S3):
--    five allergies, three conditions, two medicines and a long note for the dentist; a high blood pressure today;
--    an HMO LOA waiting with a plan item under it; a lab case at the lab; a filling on 36 O done yesterday
--    (catalog Filling → chart effect filled); in the chair today at 11:00 am with Dr. Hazel Tabanao.
--    Created once; never changed after (a later slice that needs more makes its own patient).
insert into patient (id, clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, hmo_name, hmo_member_no, created_by)
select '7e57a1c0-0000-4000-8000-000000000001', :c, 'T-RICH', 'Rich', 'Test', date '1979-03-14', 'female', '09175550901', 'Maxicare', 'MX-2231-0901',
       (select id from staff where email = 'liwayway.domingo@example.com')
 where not exists (select 1 from patient where id = '7e57a1c0-0000-4000-8000-000000000001');
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, allergies, conditions, medications, recorded_by, note)
select :c, '7e57a1c0-0000-4000-8000-000000000001', timestamptz '2026-09-20 10:00+08', 'staff',
       array['Penicillin', 'Latex', 'Lidocaine with epinephrine', 'Ibuprofen', 'Chlorhexidine'],
       array['Hypertension', 'Type 2 diabetes', 'Asthma'], array['Losartan 50 mg', 'Metformin 500 mg'],
       (select id from staff where email = 'liwayway.domingo@example.com'),
       'Faints at the sight of needles: lie her back before any injection and keep juice at the chair. Anxious about the drill; agree a stop signal first. Bleeds longer than usual after extractions, so pack and bite for 30 minutes and check before she leaves.'
 where not exists (select 1 from medical_history where patient_id = '7e57a1c0-0000-4000-8000-000000000001');
insert into vital_sign (clinic_id, patient_id, taken_at, systolic, diastolic, pulse, taken_by)
select :c, '7e57a1c0-0000-4000-8000-000000000001', now(), 165, 102, 88, (select id from staff where email = 'liwayway.domingo@example.com')
 where not exists (select 1 from vital_sign where patient_id = '7e57a1c0-0000-4000-8000-000000000001' and (taken_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date);
insert into hmo_loa (id, clinic_id, patient_id, payor_name, member_no, requested_on, status, created_by)
select '7e57a1c0-0000-4000-8000-0000000000a1', :c, '7e57a1c0-0000-4000-8000-000000000001', 'Maxicare', 'MX-2231-0901', date '2026-09-25', 'requested', (select id from staff where email = 'liwayway.domingo@example.com')
 where not exists (select 1 from hmo_loa where id = '7e57a1c0-0000-4000-8000-0000000000a1');
insert into treatment_plan (id, clinic_id, patient_id, name)
select '7e57a1c0-0000-4000-8000-0000000000b1', :c, '7e57a1c0-0000-4000-8000-000000000001', 'Treatment plan'
 where not exists (select 1 from treatment_plan where id = '7e57a1c0-0000-4000-8000-0000000000b1');
insert into treatment_plan_item (clinic_id, plan_id, patient_id, catalog_id, name, fdi, price, status, loa_id, created_by)
select :c, '7e57a1c0-0000-4000-8000-0000000000b1', '7e57a1c0-0000-4000-8000-000000000001', id, 'Root canal', 46, 8000, 'accepted', '7e57a1c0-0000-4000-8000-0000000000a1',
       (select id from staff where email = 'hazel.tabanao@example.com')
  from procedure_catalog where id = '6bbea4ba-4ec4-47e4-88fc-d9e5e9fcebbd'
   and not exists (select 1 from treatment_plan_item where plan_id = '7e57a1c0-0000-4000-8000-0000000000b1');
insert into lab_order (clinic_id, patient_id, lab_name, description, shade, sent_on, due_on, status, created_by)
select :c, '7e57a1c0-0000-4000-8000-000000000001', 'Baguio Dental Lab', 'Porcelain crown 46', 'A2', date '2026-09-26', date '2026-10-06', 'sent', (select id from staff where email = 'hazel.tabanao@example.com')
 where not exists (select 1 from lab_order where patient_id = '7e57a1c0-0000-4000-8000-000000000001');
insert into procedure_done (id, clinic_id, patient_id, catalog_id, fdi, surface, price, performed_by, performed_at, created_by, name)
select '7e57a1c0-0000-4000-8000-0000000000d1', :c, '7e57a1c0-0000-4000-8000-000000000001', '95551920-f449-4422-af5a-e9673cc02d00', 36, 'O', 1500,
       (select id from staff where email = 'hazel.tabanao@example.com'), timestamptz '2026-09-29 15:00+08', (select id from staff where email = 'hazel.tabanao@example.com'), 'Filling'
 where not exists (select 1 from procedure_done where id = '7e57a1c0-0000-4000-8000-0000000000d1');
insert into appointment (id, clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, source, chair, created_by)
select '7e57a1c0-0000-4000-8000-0000000000e1', :c, '7e57a1c0-0000-4000-8000-000000000001', (select id from staff where email = 'hazel.tabanao@example.com'),
       now(), now() + interval '1 hour', 'Root canal, tooth 46', 'in_chair', 'staff', 3, (select id from staff where email = 'liwayway.domingo@example.com')
 where not exists (select 1 from appointment where id = '7e57a1c0-0000-4000-8000-0000000000e1');
update appointment
   set starts_at = (((now() at time zone 'Asia/Manila')::date + time '11:00') at time zone 'Asia/Manila'),
       ends_at = (((now() at time zone 'Asia/Manila')::date + time '12:00') at time zone 'Asia/Manila')
 where id = '7e57a1c0-0000-4000-8000-0000000000e1'
   and starts_at <> (((now() at time zone 'Asia/Manila')::date + time '11:00') at time zone 'Asia/Manila');
delete from throttle where key like 'login:%';
commit;
select 'maria today', to_char(starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI'), status from appointment where id = '5a055ab9-8eaa-42aa-9951-395736601384';
select 'rich', chart_no, first_name, last_name from patient where id = '7e57a1c0-0000-4000-8000-000000000001';
select 'snap', s.email, r.name from staff s join clinic_role r on r.id = s.role_id where s.email like 'snap.%' order by 2;
