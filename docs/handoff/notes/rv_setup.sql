\set C '97c56fa2-6423-4ed8-9c38-1bcaae9c247e'
\set PAT '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb'
\set HAZEL 'd24ab034-7d2c-4a37-b7bc-f397f8bf8c66'
begin;
select set_config('app.clinic_id', :'C', true);
insert into intake (clinic_id, ref, target, patient_id, form_version, created_by) values (:'C', 'IN-RVAA', 'existing', :'PAT', 'intake-2026-10', :'HAZEL');
insert into consent_document (clinic_id, ref, version_id, intake_id, patient_id, fields, dentist_id, explained_in, sort, prepared_by)
 select :'C', 'CF-RVAAA', 'extraction-2026-10', id, :'PAT', '{}', :'HAZEL', 'en', 30, :'HAZEL' from intake where ref='IN-RVAA';
insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by) select 'abcdefghjkmnpqrstuvwxyz234', :'C', i.id, 'tablet', t.id, :'HAZEL' from clinic_tablet t, intake i where t.name='Tab RV' and i.ref='IN-RVAA';
update intake set status='out' where ref='IN-RVAA';
commit;
