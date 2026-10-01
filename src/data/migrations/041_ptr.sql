-- 041 — the PTR (professional tax receipt) a dentist renews by 31 January, so a prescription and a
-- letter stop printing "PTR No. __________".
--
--   - staff.ptr_year: the year the PTR on file is for. staff.ptr_number has been in the schema from the
--     start, but no form wrote it; a person's page (Clinic settings → People) and My page now write the
--     number and its year together. staff is group data outside row-level security, as before.
--   - prescription.ptr_number / ptr_year and clinical_letter.ptr_number / ptr_year: a copy of the
--     signer's PTR, taken when the paper is saved. Both tables are written once (033 revokes update and
--     delete on prescription; 034 grants clinical_letter select and insert, and update on the reply
--     columns only), so the copy is never changed: a 2026 prescription reprinted in 2027 still carries
--     the 2026 PTR. The table-level insert grants cover the new columns; nothing is granted here.
--     A paper saved before 041 has no copy and prints the blank line, as it did; it never borrows
--     today's PTR.
--
-- Nothing is backfilled: no form ever wrote staff.ptr_number, so there is nothing true to copy. No
-- format check on any ptr_number: PTR numbers differ by city (Manila's carry "MLA-"), and a value typed
-- in by hand before 041 would then refuse every later update of that staff row (last_seen_at
-- included). The app checks the format of a new value; a value on file that nobody touches is kept.

alter table staff           add column if not exists ptr_year   smallint check (ptr_year between 2000 and 2100);
alter table prescription    add column if not exists ptr_number text;
alter table prescription    add column if not exists ptr_year   smallint check (ptr_year between 2000 and 2100);
alter table clinical_letter add column if not exists ptr_number text;
alter table clinical_letter add column if not exists ptr_year   smallint check (ptr_year between 2000 and 2100);
