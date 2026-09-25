-- 022 — patient charges, payments and receipts, written from the workspace
-- (/c/<slug>/billing/).
--
-- schema.sql already has invoice, invoice_line, payment and invoice_series,
-- all under forced RLS on app.clinic_id; until now only the development seed
-- wrote them. What they could not say:
--
--   - the senior citizen / PWD ID number the 20% discount was given against;
--   - the part an HMO or PhilHealth is expected to pay;
--   - who made a statement, who voided it, and a key that makes a
--     double-clicked Save one statement instead of two;
--   - the order of a statement's lines and which fee-guide row each came from;
--   - on a payment: the day the money came in, its place on its statement
--     (payment 1, 2, 3), the number of the BIR invoice or receipt the clinic
--     issued from its OWN registered booklet or system, a void with who and
--     why, and PhilHealth as a way of paying.
--
-- Flossify is not a BIR-registered invoicing system. What it prints is a
-- "Statement of account" and an "Acknowledgment of payment"; bir_ref only
-- records the number of the clinic's own BIR document so the two can be
-- matched. invoice_series.permit_number / valid_until stay unused.
--
-- Numbering: one running series per clinic (prefix 'SOA'), handed out by an
-- upsert on invoice_series inside the statement's own transaction
-- (src/lib/invoices.ts). The row lock serialises concurrent saves and a
-- rolled-back save returns its number, so the series has no gaps and no
-- duplicates; unique (clinic_id, series_prefix, number) is the backstop.
--
-- Additive only: nullable columns or defaults, constraints that the seed's
-- rows already meet (and NOT VALID where a row written before this file
-- could not be checked), one widened check (payment.method), one new table
-- (payment_bir_ref_change), and triggers that refuse edits and deletes of
-- what was saved.

-- ---------------------------------------------------------------------------
-- Statements
-- ---------------------------------------------------------------------------
alter table invoice
  -- The OSCA / PWD ID number, required when discount_kind is senior or pwd.
  add column if not exists discount_id_no text,
  -- Who else pays part of it, as the desk chose it, and how much.
  add column if not exists payor_kind   text,
  add column if not exists payor_name   text,
  add column if not exists payor_share  numeric(12, 2) not null default 0,
  add column if not exists created_by   uuid references staff(id),
  add column if not exists voided_by    uuid references staff(id),
  -- One per form the page drew: a second post of the same form finds the first statement.
  add column if not exists form_key     uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payor_kind_check') then
    alter table invoice add constraint invoice_payor_kind_check
      check (payor_kind is null or payor_kind in ('hmo', 'philhealth'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_money_check') then
    alter table invoice add constraint invoice_money_check
      check (subtotal >= 0 and discount >= 0 and discount <= subtotal and total >= 0
             and payor_share >= 0 and payor_share <= total) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_discount_id_check') then
    alter table invoice add constraint invoice_discount_id_check
      check (coalesce(discount_kind, 'none') not in ('senior', 'pwd') or nullif(trim(discount_id_no), '') is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoice_void_check') then
    alter table invoice add constraint invoice_void_check
      check (status <> 'void' or (voided_at is not null and nullif(trim(void_reason), '') is not null)) not valid;
  end if;
end $$;

create unique index if not exists invoice_form_key on invoice (clinic_id, form_key) where form_key is not null;
create index if not exists invoice_patient on invoice (clinic_id, patient_id, issued_at);
create index if not exists invoice_issued on invoice (clinic_id, issued_at);

alter table invoice_line
  add column if not exists catalog_id uuid references procedure_catalog(id),
  add column if not exists line_no    smallint;

create index if not exists invoice_line_invoice on invoice_line (clinic_id, invoice_id, line_no);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
alter table payment
  -- The day the money came in, as the desk says. received_at is when it was typed.
  add column if not exists paid_on     date not null default ((now() at time zone 'Asia/Manila')::date),
  -- 1, 2, 3 on its statement: the acknowledgment's number is the statement's plus this.
  add column if not exists seq         smallint,
  -- The number of the BIR invoice or receipt the clinic issued for this
  -- money from its own registered booklet or system. Printed on the acknowledgment.
  add column if not exists bir_ref     text,
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references staff(id),
  add column if not exists void_reason text,
  add column if not exists form_key    uuid;

-- A payment written before this file was paid the day it was typed, not the
-- day this file ran. (Before the trigger below, which would refuse it.)
update payment set paid_on = (received_at at time zone 'Asia/Manila')::date
 where paid_on is distinct from (received_at at time zone 'Asia/Manila')::date;

-- PhilHealth pays clinics too; the first check did not list it.
alter table payment drop constraint if exists payment_method_check;
alter table payment add constraint payment_method_check
  check (method in ('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'hmo', 'philhealth', 'cheque'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_amount_positive') then
    alter table payment add constraint payment_amount_positive check (amount > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_void_check') then
    alter table payment add constraint payment_void_check
      check (voided_at is null or nullif(trim(void_reason), '') is not null) not valid;
  end if;
end $$;

create unique index if not exists payment_form_key on payment (clinic_id, form_key) where form_key is not null;
create unique index if not exists payment_seq on payment (invoice_id, seq) where seq is not null;
create index if not exists payment_invoice on payment (clinic_id, invoice_id);
create index if not exists payment_patient on payment (clinic_id, patient_id);
create index if not exists payment_paid_on on payment (clinic_id, paid_on);

-- ---------------------------------------------------------------------------
-- A statement is never edited, and neither is a payment
-- ---------------------------------------------------------------------------
-- The number, the patient, the lines and the amounts are fixed when the
-- statement is saved; a mistake is a void (with a reason) and a new one.
-- What may still change: the status (payments move it), and the void
-- columns, once. A void cannot be undone. The same for a payment: only its
-- void columns change, once, and the BIR invoice or receipt number may be
-- written in later while the payment stands (the desk often writes the
-- booklet's receipt after the money is recorded). A number already written
-- can be corrected (a typo should not cost a void), but only with a row in
-- payment_bir_ref_change, written in the same transaction, that keeps the old
-- number, the new one, who and why.
--
-- Nor is either deleted. Row deletes are refused outright (flossify_app holds
-- DELETE on every table, from 002): a deleted statement would leave a hole in
-- the numbering and a deleted payment would change a balance without a trace.

-- Every correction of a payment's BIR invoice or receipt number.
create table if not exists payment_bir_ref_change (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete restrict,
  payment_id  uuid not null references payment(id) on delete restrict,
  old_ref     text not null,
  new_ref     text,
  reason      text not null check (length(trim(reason)) >= 4),
  changed_by  uuid references staff(id),
  changed_at  timestamptz not null default now()
);

create index if not exists payment_bir_ref_change_payment on payment_bir_ref_change (payment_id, changed_at);

-- Same fence as every other clinic table: enabled, forced, keyed on app.clinic_id.
alter table payment_bir_ref_change enable row level security;
alter table payment_bir_ref_change force row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_bir_ref_change' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on payment_bir_ref_change
      using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
  end if;
end $$;
create or replace function invoice_frozen()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clinic_id is distinct from old.clinic_id or new.patient_id is distinct from old.patient_id
     or new.series_prefix is distinct from old.series_prefix or new.number is distinct from old.number
     or new.issued_at is distinct from old.issued_at
     or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount
     or new.discount_kind is distinct from old.discount_kind or new.discount_id_no is distinct from old.discount_id_no
     or new.total is distinct from old.total or new.payor_share is distinct from old.payor_share
     or new.payor_name is distinct from old.payor_name or new.payor_kind is distinct from old.payor_kind
     or new.vat_rate is distinct from old.vat_rate or new.vat_amount is distinct from old.vat_amount
     or new.created_by is distinct from old.created_by then
    raise exception 'A saved statement is not edited. Void it and make a new one.' using errcode = 'check_violation';
  end if;
  if old.status = 'void' and (new.status <> 'void' or new.voided_at is distinct from old.voided_at
                              or new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by) then
    raise exception 'A void statement stays void.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists invoice_frozen on invoice;
create trigger invoice_frozen before update on invoice for each row execute function invoice_frozen();

create or replace function invoice_line_frozen()
returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'The lines of a saved statement are not edited. Void it and make a new one.' using errcode = 'check_violation';
end $$;

drop trigger if exists invoice_line_frozen on invoice_line;
create trigger invoice_line_frozen before update on invoice_line for each row execute function invoice_line_frozen();

create or replace function payment_frozen()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clinic_id is distinct from old.clinic_id or new.invoice_id is distinct from old.invoice_id
     or new.patient_id is distinct from old.patient_id or new.method is distinct from old.method
     or new.amount is distinct from old.amount or new.reference is distinct from old.reference
     or new.paid_on is distinct from old.paid_on or new.seq is distinct from old.seq
     or new.received_by is distinct from old.received_by
     or new.received_at is distinct from old.received_at then
    raise exception 'A recorded payment is not edited. Void it and record it again.' using errcode = 'check_violation';
  end if;
  if new.bir_ref is distinct from old.bir_ref then
    if old.voided_at is not null or (new.bir_ref is not null and nullif(trim(new.bir_ref), '') is null) then
      raise exception 'The BIR invoice or receipt number is written on a payment that stands.' using errcode = 'check_violation';
    end if;
    -- A correction of a number already written leaves its trace first, in this transaction.
    if old.bir_ref is not null and not exists (
         select 1 from payment_bir_ref_change c
          where c.payment_id = old.id and c.old_ref = old.bir_ref and c.new_ref is not distinct from new.bir_ref
            and c.changed_at = now()) then
      raise exception 'A BIR invoice or receipt number is corrected with a reason (payment_bir_ref_change).' using errcode = 'check_violation';
    end if;
  end if;
  if old.voided_at is not null and (new.voided_at is distinct from old.voided_at
                                    or new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by) then
    raise exception 'A void payment stays void.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists payment_frozen on payment;
create trigger payment_frozen before update on payment for each row execute function payment_frozen();

create or replace function billing_row_kept()
returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'payment' then
    raise exception 'A recorded payment is not deleted. Void it, with a reason.' using errcode = 'check_violation';
  elsif tg_table_name = 'payment_bir_ref_change' then
    raise exception 'The record of a BIR number correction is kept as it was written.' using errcode = 'check_violation';
  end if;
  raise exception 'A saved statement is not deleted. Void it, with a reason; its number stays used.' using errcode = 'check_violation';
end $$;

drop trigger if exists invoice_kept on invoice;
create trigger invoice_kept before delete on invoice for each row execute function billing_row_kept();
drop trigger if exists invoice_line_kept on invoice_line;
create trigger invoice_line_kept before delete on invoice_line for each row execute function billing_row_kept();
drop trigger if exists payment_kept on payment;
create trigger payment_kept before delete on payment for each row execute function billing_row_kept();
drop trigger if exists payment_bir_ref_change_kept on payment_bir_ref_change;
create trigger payment_bir_ref_change_kept before delete or update on payment_bir_ref_change for each row execute function billing_row_kept();

-- ---------------------------------------------------------------------------
-- A patient's balance, one definition for every page
-- ---------------------------------------------------------------------------
-- What the patient themself still owes: on each of their statements that is
-- not void, the total less its payments that are not void, less the part an
-- HMO or PhilHealth is still expected to send (payor_share less what came in
-- by HMO or PhilHealth, never more than what is left); then less any payment
-- of theirs not tied to a statement. The same rule as sumsOf() and
-- DUE_SQL in src/lib/invoices.ts. A payment on a void statement counts for
-- nothing (the void is refused while one stands). Negative is a credit.
--
-- A security invoker, so it runs under the caller's app.clinic_id and
-- row-level security like any query in withClinic(). The Patients list and
-- the patient record used a formula that dropped paid statements but kept
-- their payments, and counted void payments; this one is the replacement.
create or replace function patient_balance(p_patient uuid)
returns numeric
language sql stable set search_path = public as $$
  select coalesce((select sum(d.left_ - greatest(least(d.payor_share - d.payor_paid, d.left_), 0))
                     from (select i.payor_share,
                                  i.total - coalesce(sum(y.amount), 0) as left_,
                                  coalesce(sum(y.amount) filter (where y.method in ('hmo', 'philhealth')), 0) as payor_paid
                             from invoice i
                             left join payment y on y.invoice_id = i.id and y.voided_at is null
                            where i.patient_id = p_patient and i.status in ('issued', 'partly_paid', 'paid')
                            group by i.id) d), 0)
       - coalesce((select sum(y.amount) from payment y
                    where y.patient_id = p_patient and y.voided_at is null and y.invoice_id is null), 0)
$$;

grant execute on function patient_balance(uuid) to flossify_app;
