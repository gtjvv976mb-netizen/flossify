-- 045: the patient record as the clinic's paper form (the owner, 3 Oct 2026: "make the patient records as simple as
-- this, better a digital copy of the real form" — a Philippine clinic's three-page record: the patient's chart and
-- information record, the informed consent, and the treatment ledger DATE | PROCEDURE | WIRE | NEXT VISIT | DENTIST |
-- AMNT | BAL | SIGN).
--
--   tooth_state.condition   gains the paper chart's codes we had no finding for: Ex (extraction: the tooth is to be
--                           taken out), RF (root fragment), Ab (abutment of a bridge), P (pontic), Rm (removable
--                           denture), and the two surface restorations Am (amalgam) and I (inlay). The rest of the
--                           paper's legend already had a finding: C caries, M missing, Un unerupted, Im impacted,
--                           J jacket (crown), Fx fixed bridge, S sealant. Only widened: no row changes.
--   plan_adjustment.wire    the archwire placed at a braces adjustment ("U 0.016 NiTi · L 0.014 NiTi"), the paper
--                           ledger's WIRE column. Insert-only like the rest of the table (034's grant: select, insert).
--
-- Additive; nothing is backfilled. An old adjustment keeps its wire, if any, in its note.

alter table tooth_state drop constraint if exists tooth_state_condition_check;
alter table tooth_state add constraint tooth_state_condition_check check (condition in (
  'sound', 'caries', 'filled', 'crown', 'bridge', 'implant', 'root_canal', 'sealant', 'veneer', 'missing', 'unerupted',
  'impacted', 'extraction', 'root_fragment', 'abutment', 'pontic', 'denture', 'amalgam', 'inlay'));

alter table plan_adjustment add column if not exists wire text;
alter table plan_adjustment drop constraint if exists plan_adjustment_wire_check;
alter table plan_adjustment add constraint plan_adjustment_wire_check check (wire is null or length(btrim(wire)) between 1 and 60);
