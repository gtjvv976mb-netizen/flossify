-- 042 — what a treatment in the fee guide does to the chart (tooth-first charting, step 2).
--
-- After a treatment is recorded or marked done on a permanent tooth, the record offers to update the
-- chart — "Chart 26 MO as filled. Now: caries MO." — and writes it only when the dentist confirms
-- (Update the chart, or ticking the line in Record a treatment). What a treatment does to the chart is
-- never guessed from its name: it is this column, set per fee-guide code.
--
--   procedure_catalog.chart_effect  the finding a treatment leaves on its tooth: filled, sealant,
--                                   root_canal, crown, missing or veneer. Null: no offer (consultation,
--                                   cleaning, X-ray, fluoride, dentures, bridge, whitening, braces, and any
--                                   service a clinic added itself).
--
-- The default fee guide's codes (006 signup_clinic, src/data/directory.ts, the seed) are set here for every
-- clinic, and a trigger sets them on insert when the insert says nothing, so signup_clinic(), the seed and
-- Settings → Services & fees need no change.
--
-- Additive: one nullable column with a check, one immutable function, one trigger function and trigger.
-- No policy or grant changes: procedure_catalog is already under tenant_isolation, and the app already
-- selects and inserts it. The runner connects as a superuser or BYPASSRLS role, so the update below
-- reaches every clinic's rows.

alter table procedure_catalog add column if not exists chart_effect text
  check (chart_effect is null or chart_effect in ('filled', 'sealant', 'root_canal', 'crown', 'missing', 'veneer'));

create or replace function procedure_chart_effect(p_code text) returns text
language sql immutable as $$
  select case p_code
    when 'restoration' then 'filled'
    when 'sealant'     then 'sealant'
    when 'rootcanal'   then 'root_canal'
    when 'crown'       then 'crown'
    when 'extraction'  then 'missing'
    when 'wisdom'      then 'missing'
    when 'veneers'     then 'veneer'
  end
$$;

update procedure_catalog set chart_effect = procedure_chart_effect(code) where chart_effect is null;

create or replace function procedure_catalog_chart_effect() returns trigger
language plpgsql as $$
begin
  if new.chart_effect is null then
    new.chart_effect := procedure_chart_effect(new.code);
  end if;
  return new;
end $$;

drop trigger if exists procedure_catalog_chart_effect on procedure_catalog;
create trigger procedure_catalog_chart_effect before insert on procedure_catalog
  for each row execute function procedure_catalog_chart_effect();
