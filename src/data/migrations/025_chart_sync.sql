-- 025 — charting through a brownout.
--
-- The odontogram keeps each change on the device first and sends it when it
-- can (src/lib/offline-queue.ts), so the same change may arrive twice, late,
-- or after a colleague has charted the same tooth. schema.sql already has the
-- ledger for exactly this, sync_change (tenant-isolated, forced RLS), unused
-- until now. POST /api/chart writes one row per change it receives:
--
--   id           the change id the device made up; a second arrival finds it
--                and does nothing again (the replay answers with what the first
--                arrival did)
--   device_id,   the browser's own id and its running count, as schema.sql
--   device_seq   asks (unique together)
--   entity       'chart', entity_id = the patient
--   payload      what the device asked for: { fdi, condition, surfaces, since }
--                or { clear: true, kept: [...], cleared: [...] } (teeth a
--                clear left alone, and the teeth it really cleared)
--   occurred_at  when the change was made, on the server's clock (the device's
--                time corrected by how far its clock is from the server's)
--   received_at  when it reached the server, stamped under the patient's chart
--                lock: this is the order conflicts are decided in
--   conflict_with  the newer change that won, when there is one in the ledger
--
-- Added here:
--   staff_id  who made the change (the signed-in staff member who sent it)
--   outcome   'applied', or 'kept' when someone else's change to that tooth
--             reached the server after the chart the person was looking at
--             showed it: that finding stays, this change is kept here, not
--             applied, and the person is told which tooth. Conflicts are
--             surfaced, never resolved silently.
--   tooth_state.change_id  which ledger row wrote a tooth_state row. Rows
--             without one came from before this file (or the seed); for those
--             noted_at is the only time there is.
--
-- Additive only: two nullable columns, one nullable column, one index. The
-- table is empty in production, so the index builds at once.

alter table sync_change add column staff_id uuid references staff(id);
alter table sync_change add column outcome text check (outcome in ('applied', 'kept'));
alter table tooth_state add column change_id uuid references sync_change(id);

-- "Has anything changed this patient's chart since <time>?" is asked on every
-- chart save; this answers it from the patient's own ledger rows.
create index sync_change_entity_idx on sync_change (clinic_id, entity, entity_id, received_at desc);
