-- 013 — claims get their own page: HMO and PhilHealth, filing to payment.
--
-- A payor is an HMO or PhilHealth. Both go through the same table, because
-- the desk's job is the same either way: file, wait, chase, get paid. What
-- differs is the kind, which the page shows as a tag, and how long the payor
-- usually takes, which is expected_days and drives the aging column.
--
-- PhilHealth's dental benefit, as /coverage/ states it (Circular 2024-0034,
-- in force since 28 December 2024): every member and dependent has up to
-- ₱1,000 a year for preventive dental care — ₱300 for each of two visits at
-- least four months apart (oral screening, cleaning, fluoride varnish), ₱200
-- per tooth for sealants or small fillings up to two teeth, and an emergency
-- extraction. The clinic files the claim, not the patient. Nothing here
-- checks a claim against those rules; that is the payor's decision and the
-- page says so.

-- ---------------------------------------------------------------------------
-- Payor kind
-- ---------------------------------------------------------------------------
alter table hmo_provider add column if not exists kind text not null default 'hmo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hmo_provider_kind_check') then
    alter table hmo_provider add constraint hmo_provider_kind_check check (kind in ('hmo', 'philhealth'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What a claim carries that the first model did not
-- ---------------------------------------------------------------------------
alter table hmo_claim
  -- PhilHealth PIN or the HMO card number, as written on the card.
  add column if not exists member_no    text,
  -- Appended, never overwritten: each line is stamped with when and who.
  add column if not exists notes        text,
  -- The payor's own reference for the submission, when they give one.
  add column if not exists submitted_ref text,
  add column if not exists updated_at   timestamptz not null default now(),
  add column if not exists created_at   timestamptz not null default now();

-- Rows that existed before this migration got now() as their created_at;
-- where a filing date is known it is the better answer. Only touches rows
-- the default stamped, so running this again changes nothing.
update hmo_claim
   set created_at = filed_at,
       updated_at = coalesce(resolved_at, filed_at)
 where filed_at is not null and created_at > filed_at;

-- ---------------------------------------------------------------------------
-- PhilHealth as a payor, for every accredited clinic
-- ---------------------------------------------------------------------------
-- Ninety days: PhilHealth reimburses more slowly than a card, and the aging
-- column should not call a claim quiet before that.
insert into hmo_provider (clinic_id, name, expected_days, kind, active)
select c.id, 'PhilHealth', 90, 'philhealth', true
  from clinic c
 where c.philhealth_dental
   and not exists (select 1 from hmo_provider p where p.clinic_id = c.id and p.kind = 'philhealth');

-- A clinic that marks itself accredited later (Settings → PhilHealth) gets
-- the same payor at that moment, so the Claims page can file for it at once.
-- Runs as its owner: the row belongs to the clinic being updated whatever
-- tenant the caller has set.
create or replace function clinic_philhealth_payor()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.philhealth_dental and not exists (select 1 from hmo_provider p where p.clinic_id = new.id and p.kind = 'philhealth') then
    insert into hmo_provider (clinic_id, name, expected_days, kind, active) values (new.id, 'PhilHealth', 90, 'philhealth', true);
  end if;
  return new;
end $$;

drop trigger if exists clinic_philhealth_payor on clinic;
create trigger clinic_philhealth_payor
  after insert or update of philhealth_dental on clinic
  for each row execute function clinic_philhealth_payor();

create index if not exists hmo_claim_provider on hmo_claim (clinic_id, provider_id);
