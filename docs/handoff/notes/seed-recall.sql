-- Test data for the recall list on Session Road Dental (slug session-road): four patients.
--   SR-0901 Recall Soon      an open check-up due in 10 days (Check-up and cleaning); seen 6 months ago
--   SR-0902 Recall Overdue   an open check-up 20 days overdue (Periodontal maintenance), reminder texted 24 Sep; seen 8 months ago
--   SR-0903 Quiet Fourteen   the only completed visit 14 months ago; history 10 months ago
--   SR-0904 Stale History    health history answered 15 months ago; seen 2 months ago
-- Each has a birth date, a mobile and a desk consent to the notice in force, so only Stale History needs attention.
-- Run as a superuser (RLS is bypassed): psql -U root -d flossify_dev -f seed-recall.sql
\set clinic '''97c56fa2-6423-4ed8-9c38-1bcaae9c247e'''
\set owner '''a7644577-cef7-437a-9290-38ffcfb64332'''

delete from recall where patient_id in (select id from patient where clinic_id = :clinic and chart_no in ('SR-0901', 'SR-0902', 'SR-0903', 'SR-0904'));
delete from patient_consent where patient_id in (select id from patient where clinic_id = :clinic and chart_no in ('SR-0901', 'SR-0902', 'SR-0903', 'SR-0904'));
delete from medical_history where patient_id in (select id from patient where clinic_id = :clinic and chart_no in ('SR-0901', 'SR-0902', 'SR-0903', 'SR-0904'));
delete from appointment where patient_id in (select id from patient where clinic_id = :clinic and chart_no in ('SR-0901', 'SR-0902', 'SR-0903', 'SR-0904'));
delete from patient where clinic_id = :clinic and chart_no in ('SR-0901', 'SR-0902', 'SR-0903', 'SR-0904');

insert into patient (clinic_id, chart_no, first_name, last_name, birth_date, sex, phone, created_at, updated_at, created_by) values
  (:clinic, 'SR-0901', 'Recall', 'Soon',     '1980-01-15', 'female', '+63 917 555 0901', now() - interval '20 months', now() - interval '20 months', :owner),
  (:clinic, 'SR-0902', 'Recall', 'Overdue',  '1972-05-20', 'male',   '+63 917 555 0902', now() - interval '20 months', now() - interval '20 months', :owner),
  (:clinic, 'SR-0903', 'Quiet',  'Fourteen', '1990-09-09', 'female', '+63 917 555 0903', now() - interval '20 months', now() - interval '20 months', :owner),
  (:clinic, 'SR-0904', 'Stale',  'History',  '1965-12-01', 'male',   '+63 917 555 0904', now() - interval '20 months', now() - interval '20 months', :owner);

-- Completed visits (chair 1, the owner as dentist), each at 10:00 Manila.
insert into appointment (clinic_id, patient_id, dentist_id, starts_at, ends_at, reason, status, source, chair, created_by)
select :clinic, p.id, :owner, t.at, t.at + interval '45 minutes', t.reason, 'completed', 'staff', 1, :owner
  from patient p
  join (values
    ('SR-0901', (now() - interval '6 months'), 'Check-up and cleaning'),
    ('SR-0902', (now() - interval '8 months'), 'Periodontal maintenance'),
    ('SR-0903', (now() - interval '14 months'), 'Check-up and cleaning'),
    ('SR-0904', (now() - interval '2 months'), 'Filling 36')
  ) as t(chart, at, reason) on t.chart = p.chart_no
 where p.clinic_id = :clinic;

-- Health histories: answered (a list), by the desk.
insert into medical_history (clinic_id, patient_id, answered_at, answered_by, answers, allergies, medications, conditions, recorded_by)
select :clinic, p.id, t.at, 'staff', '{}'::jsonb, '{}'::text[], '{}'::text[], '{}'::text[], :owner
  from patient p
  join (values
    ('SR-0901', now() - interval '6 months'),
    ('SR-0902', now() - interval '8 months'),
    ('SR-0903', now() - interval '10 months'),
    ('SR-0904', now() - interval '15 months')
  ) as t(chart, at) on t.chart = p.chart_no
 where p.clinic_id = :clinic;

-- Consent to the privacy notice in force, taken at the desk.
insert into patient_consent (clinic_id, patient_id, version_id, given_at, channel, recorded_by, agreed_as)
select :clinic, p.id, (select id from current_consent_version()), now() - interval '6 months', 'desk', :owner, 'patient'
  from patient p where p.clinic_id = :clinic and p.chart_no in ('SR-0901', 'SR-0902', 'SR-0903', 'SR-0904');

-- The check-ups.
insert into recall (clinic_id, patient_id, due_on, reason, last_sent_at, created_by, created_at)
select :clinic, p.id, t.due, t.reason, t.sent, :owner, now() - interval '6 months'
  from patient p
  join (values
    ('SR-0901', ((now() at time zone 'Asia/Manila')::date + 10), 'Check-up and cleaning', null::timestamptz),
    ('SR-0902', ((now() at time zone 'Asia/Manila')::date - 20), 'Periodontal maintenance', '2026-09-24 10:00:00+08'::timestamptz)
  ) as t(chart, due, reason, sent) on t.chart = p.chart_no
 where p.clinic_id = :clinic;

select p.chart_no, p.first_name, p.last_name, r.due_on, r.reason, r.last_sent_at,
       (select max(a.starts_at)::date from appointment a where a.patient_id = p.id and a.status = 'completed') as last_done,
       (select max(h.answered_at)::date from medical_history h where h.patient_id = p.id) as history_at
  from patient p left join recall r on r.patient_id = p.id and r.completed_at is null
 where p.clinic_id = :clinic and p.chart_no like 'SR-090%' order by p.chart_no;
