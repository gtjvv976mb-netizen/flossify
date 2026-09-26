-- 034 — four things a Philippine clinic does on paper every day, on the record:
--
--   - vital_sign: blood pressure and pulse, taken before anaesthesia. A reading is never changed (a
--     wrong one is taken again); the record reads the newest.
--   - clinical_letter: a dental certificate (school, work), a referral to a specialist, and a request
--     for medical clearance to the patient's physician. Printed with the dentist's PRC licence, so a
--     letter is never rewritten; only a clearance's reply (the physician cleared, did not, or with
--     conditions) is written in afterwards.
--   - hmo_loa: an HMO's letter of authorization — asked for, approved with its code (or denied), used —
--     for the plan items it covers (treatment_plan_item.loa_id).
--   - payment_plan + plan_adjustment: braces or any treatment paid in instalments. The money is the
--     statement the plan made (invoice + payment, as every other charge), so a balance is never counted
--     twice; the plan adds the schedule (down payment, so much a month) and, for braces, the adjustment
--     visits.
--
-- All clinic data under row-level security, none of it public.

create table if not exists vital_sign (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete restrict,
  patient_id  uuid not null references patient(id) on delete restrict,
  taken_at    timestamptz not null default now(),
  systolic    smallint check (systolic between 50 and 300),
  diastolic   smallint check (diastolic between 30 and 200),
  pulse       smallint check (pulse between 20 and 250),
  note        text check (note is null or length(note) <= 300),
  taken_by    uuid references staff(id) on delete set null,
  check (systolic is not null or pulse is not null),
  check ((systolic is null) = (diastolic is null))
);
create index if not exists vital_sign_patient on vital_sign (clinic_id, patient_id, taken_at desc);

create table if not exists clinical_letter (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinic(id) on delete restrict,
  patient_id    uuid not null references patient(id) on delete restrict,
  kind          text not null check (kind in ('certificate', 'referral', 'clearance')),
  dentist_id    uuid not null references staff(id) on delete restrict,
  issued_on     date not null,
  seen_on       date,
  to_name       text check (to_name is null or length(to_name) <= 120),
  to_role       text check (to_role is null or length(to_role) <= 120),
  purpose       text check (purpose is null or length(purpose) <= 200),
  diagnosis     text check (diagnosis is null or length(diagnosis) <= 1000),
  treatment     text check (treatment is null or length(treatment) <= 1000),
  rest_days     smallint check (rest_days between 0 and 14),
  body          text check (body is null or length(body) <= 2000),
  answer        text check (answer is null or answer in ('cleared', 'not_cleared', 'conditions')),
  answer_note   text check (answer_note is null or length(answer_note) <= 1000),
  answered_on   date,
  answered_by   uuid references staff(id) on delete set null,
  created_by    uuid references staff(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists clinical_letter_patient on clinical_letter (clinic_id, patient_id, created_at desc);

create table if not exists hmo_loa (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinic(id) on delete restrict,
  patient_id    uuid not null references patient(id) on delete restrict,
  payor_name    text not null check (length(btrim(payor_name)) between 1 and 120),
  provider_id   uuid references hmo_provider(id) on delete set null,
  member_no     text check (member_no is null or length(member_no) <= 40),
  requested_on  date not null,
  status        text not null default 'requested' check (status in ('requested', 'approved', 'denied', 'used', 'cancelled')),
  loa_number    text check (loa_number is null or length(loa_number) <= 60),
  approved_on   date,
  valid_until   date,
  amount        numeric(12, 2) check (amount is null or amount >= 0),
  denial_reason text check (denial_reason is null or length(denial_reason) <= 300),
  note          text check (note is null or length(note) <= 300),
  created_by    uuid references staff(id) on delete set null,
  decided_by    uuid references staff(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (status not in ('approved', 'used') or loa_number is not null)
);
create index if not exists hmo_loa_patient on hmo_loa (clinic_id, patient_id, created_at desc);
alter table treatment_plan_item add column if not exists loa_id uuid references hmo_loa(id) on delete set null;

create table if not exists payment_plan (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinic(id) on delete restrict,
  patient_id      uuid not null references patient(id) on delete restrict,
  invoice_id      uuid not null references invoice(id) on delete restrict,
  kind            text not null default 'installment' check (kind in ('braces', 'installment')),
  title           text not null check (length(btrim(title)) between 1 and 120),
  total           numeric(12, 2) not null check (total > 0),
  down_payment    numeric(12, 2) not null default 0 check (down_payment >= 0),
  monthly         numeric(12, 2) not null check (monthly >= 0),
  months          smallint not null check (months between 1 and 60),
  start_on        date not null,
  adjust_weeks    smallint check (adjust_weeks between 1 and 26),
  status          text not null default 'active' check (status in ('active', 'finished', 'stopped')),
  note            text check (note is null or length(note) <= 300),
  created_by      uuid references staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  ended_at        timestamptz,
  check (down_payment <= total)
);
create index if not exists payment_plan_patient on payment_plan (clinic_id, patient_id, status);
create unique index if not exists payment_plan_invoice on payment_plan (invoice_id);

create table if not exists plan_adjustment (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinic(id) on delete restrict,
  plan_id     uuid not null references payment_plan(id) on delete restrict,
  patient_id  uuid not null references patient(id) on delete restrict,
  done_on     date not null,
  note        text check (note is null or length(note) <= 300),
  next_on     date,
  done_by     uuid references staff(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists plan_adjustment_plan on plan_adjustment (clinic_id, plan_id, done_on desc);

do $$
declare t text;
begin
  foreach t in array array['vital_sign', 'clinical_letter', 'hmo_loa', 'payment_plan', 'plan_adjustment'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation') then
      execute format($p$create policy tenant_isolation on %I
        using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
        with check (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)$p$, t);
    end if;
  end loop;
end $$;

-- The database's default privileges hand the app every right on a new table: what it may not do is taken
-- back here. A reading, a letter and an adjustment are written once; a letter's reply is the one thing
-- written into it later.
revoke all on vital_sign, clinical_letter, plan_adjustment from flossify_app;
grant select, insert on vital_sign, clinical_letter, plan_adjustment to flossify_app;
grant update (answer, answer_note, answered_on, answered_by) on clinical_letter to flossify_app;
revoke all on hmo_loa, payment_plan from flossify_app;
grant select, insert, update on hmo_loa, payment_plan to flossify_app;
