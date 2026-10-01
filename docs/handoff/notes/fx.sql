insert into intake (id, clinic_id, ref, target, form_version, created_by, desk_minor)
  values ('22222222-2222-2222-2222-222222222222', 'fdd1207c-c729-4adb-95e4-bb9fb53aec23', 'IN-7K2F', 'new', 'intake-2026-10', '0bfd5c4e-0e43-4d86-aa25-3632bccb0f14', 'yes');
insert into consent_document (id, clinic_id, ref, version_id, intake_id, fields, dentist_id, explained_in, sort, prepared_by)
  values ('33333333-3333-3333-3333-333333333333', 'fdd1207c-c729-4adb-95e4-bb9fb53aec23', 'CF-7K2FQ', 'extraction-2026-10', '22222222-2222-2222-2222-222222222222', '{}', '0bfd5c4e-0e43-4d86-aa25-3632bccb0f14', 'en', 5, '0bfd5c4e-0e43-4d86-aa25-3632bccb0f14');
insert into intake_link (token, clinic_id, intake_id, device, tablet_id, created_by)
  values ('abcdefghjkmnpqrstuvwxyz234', 'fdd1207c-c729-4adb-95e4-bb9fb53aec23', '22222222-2222-2222-2222-222222222222', 'tablet', '11111111-1111-1111-1111-111111111111', '0bfd5c4e-0e43-4d86-aa25-3632bccb0f14');
update intake set status = 'out' where id = '22222222-2222-2222-2222-222222222222';
