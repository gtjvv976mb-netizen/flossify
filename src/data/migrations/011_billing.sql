-- 011 — what clinics pay Flossify.
--
-- One subscription per group, a monthly invoice per group while the trial is
-- over, and a person marking invoices paid against a GCash, Maya or bank
-- reference: there is no payment gateway. Neither table holds clinic data, so
-- neither is under row-level security (like staff, they are keyed by group),
-- but counting a group's branches means reading clinic, which is, so that and
-- everything the operations page needs across groups go through definer
-- functions that do one narrow thing each.
--
-- Nothing here switches a clinic off. A late payment changes a status and a
-- sentence; patients' records come first.

create table if not exists subscription (
  group_id          uuid primary key references clinic_group(id) on delete cascade,
  plan              text not null default 'clinic' check (plan in ('starter', 'clinic', 'group')),
  status            text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'cancelled')),
  trial_ends_at     timestamptz not null,
  -- Per branch per month, copied from the plan at the time; the plan table
  -- lives in src/lib/billing.ts and a price change there does not reprice
  -- anyone already on it.
  price_per_branch  numeric(10, 2) not null,
  started_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  notes             text,
  updated_at        timestamptz not null default now()
);

-- Invoice numbers: FL-<year>-<month>-<running number>. Not a BIR series;
-- Flossify's own receipts are a separate matter.
create sequence if not exists subscription_invoice_seq;

create table if not exists subscription_invoice (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references clinic_group(id) on delete cascade,
  number        text not null unique,
  period_start  date not null,
  period_end    date not null,
  branches      integer not null,
  amount        numeric(12, 2) not null,
  status        text not null default 'due' check (status in ('due', 'paid', 'void')),
  due_at        timestamptz not null,
  paid_at       timestamptz,
  paid_ref      text,
  paid_by       uuid references staff(id),
  created_at    timestamptz not null default now(),
  -- One invoice per group per month, whatever runs the issuer twice.
  unique (group_id, period_start)
);
create index if not exists subscription_invoice_open on subscription_invoice (group_id, due_at) where status = 'due';

-- How many branches a group is billed for: its clinics that are not archived.
-- clinic is under RLS, so this runs as the owner.
create or replace function group_branches(p_group uuid)
returns integer
language sql security definer stable set search_path = public as $$
  select count(*)::integer from clinic c where c.group_id = p_group and c.archived_at is null
$$;

-- Does this group have a due invoice more than fourteen days past its due
-- date, as of p_today (a Manila date)? The one definition of "overdue" that
-- the issuer and mark-paid both use, so the status cannot flap between them.
create or replace function billing_overdue(p_group uuid, p_today date)
returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from subscription_invoice i
    where i.group_id = p_group and i.status = 'due'
      and (i.due_at at time zone 'Asia/Manila')::date + 14 < p_today)
$$;

-- The group's subscription, started as a 30-day trial on the default plan if
-- it has none. Called when an owner opens the workspace; a second call is a
-- read.
create or replace function billing_ensure(p_group uuid, p_price numeric)
returns subscription
language plpgsql security definer set search_path = public as $$
declare r subscription;
begin
  insert into subscription (group_id, plan, status, trial_ends_at, price_per_branch)
  values (p_group, 'clinic', 'trial', now() + interval '30 days', p_price)
  on conflict (group_id) do nothing;
  select * into r from subscription where group_id = p_group;
  return r;
end $$;

-- The monthly run, safe to repeat. For every live subscription whose trial has
-- ended by p_today: the invoice for p_today's calendar month, if missing —
-- branches × price, due seven days into the month, or seven days from today
-- when the run comes later than that (a trial that ended on the 20th must not
-- be born overdue) — then the status: past_due when an invoice is more than
-- fourteen days overdue, otherwise active. A group with no open branch gets no
-- invoice. Returns how many invoices were created.
create or replace function billing_issue_invoices(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', p_today)::date;
  v_end   date := (date_trunc('month', p_today) + interval '1 month' - interval '1 day')::date;
  v_due   date := greatest(v_start + 7, p_today + 7);
  n integer;
begin
  insert into subscription_invoice (group_id, number, period_start, period_end, branches, amount, status, due_at)
  select s.group_id,
         'FL-' || to_char(v_start, 'YYYY-MM') || '-' || lpad(nextval('subscription_invoice_seq')::text, 4, '0'),
         v_start, v_end, b.n, round(b.n * s.price_per_branch, 2), 'due',
         v_due::timestamp at time zone 'Asia/Manila'
  from subscription s
  cross join lateral (select group_branches(s.group_id) as n) b
  where s.status in ('trial', 'active', 'past_due')
    and (s.trial_ends_at at time zone 'Asia/Manila')::date <= p_today
    and b.n > 0
    and not exists (select 1 from subscription_invoice i where i.group_id = s.group_id and i.period_start = v_start);
  get diagnostics n = row_count;

  update subscription s
     set status = case when billing_overdue(s.group_id, p_today) then 'past_due' else 'active' end,
         updated_at = now()
   where s.status in ('trial', 'active', 'past_due')
     and (s.trial_ends_at at time zone 'Asia/Manila')::date <= p_today
     and s.status is distinct from case when billing_overdue(s.group_id, p_today) then 'past_due' else 'active' end;

  return n;
end $$;

-- A person saw the money arrive. Marks the invoice paid with the reference
-- they typed, and lets the subscription back to active when nothing else of
-- the group's is overdue. Refuses an invoice that is not due, so a second
-- click cannot overwrite the first reference.
create or replace function billing_mark_paid(p_invoice uuid, p_ref text, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_group uuid;
begin
  update subscription_invoice
     set status = 'paid', paid_at = now(), paid_ref = nullif(btrim(coalesce(p_ref, '')), ''), paid_by = p_by
   where id = p_invoice and status = 'due'
  returning group_id into v_group;
  if v_group is null then
    raise exception 'billing_mark_paid: invoice % is not due', p_invoice using errcode = 'no_data_found';
  end if;
  update subscription
     set status = 'active', updated_at = now()
   where group_id = v_group and status = 'past_due'
     and not billing_overdue(v_group, (now() at time zone 'Asia/Manila')::date);
end $$;

-- Everything the operations billing page shows, one row per group that has a
-- subscription or an open branch: the plan and its state, what is owed, when
-- they last paid, and who to write to. The owner is the group's first owner
-- account; the platform's own group has neither and does not appear.
create or replace function admin_billing()
returns table (
  group_id uuid, group_name text, plan text, status text, trial_ends_at timestamptz, price_per_branch numeric,
  branches integer, due_count integer, due_amount numeric, oldest_due date, last_paid timestamptz,
  owner_name text, owner_email text, owner_phone text
)
language sql security definer stable set search_path = public as $$
  select * from (
    select g.id, g.name, s.plan, s.status, s.trial_ends_at, s.price_per_branch,
           group_branches(g.id),
           (select count(*)::integer from subscription_invoice i where i.group_id = g.id and i.status = 'due'),
           (select coalesce(sum(i.amount), 0)::numeric from subscription_invoice i where i.group_id = g.id and i.status = 'due'),
           (select min((i.due_at at time zone 'Asia/Manila')::date) from subscription_invoice i where i.group_id = g.id and i.status = 'due'),
           (select max(i.paid_at) from subscription_invoice i where i.group_id = g.id and i.status = 'paid'),
           o.full_name, o.email::text, o.phone
    from clinic_group g
    left join subscription s on s.group_id = g.id
    left join lateral (
      select st.full_name, st.email, st.phone from staff st
      where st.group_id = g.id and st.role = 'owner' and st.disabled_at is null
      order by st.created_at limit 1) o on true
    where s.group_id is not null or group_branches(g.id) > 0
  ) t (group_id, group_name, plan, status, trial_ends_at, price_per_branch, branches, due_count, due_amount, oldest_due, last_paid, owner_name, owner_email, owner_phone)
  order by (t.status = 'past_due') desc nulls last, t.oldest_due nulls last, t.group_name
$$;

-- Operations set the terms: plan, status, when the trial ends, the price per
-- branch and a note. A group with no subscription yet gets one with these
-- terms. The check constraints refuse a plan or status that is not on the list.
create or replace function admin_billing_set(p_group uuid, p_plan text, p_status text, p_trial_ends timestamptz, p_price numeric, p_notes text)
returns void
language sql security definer set search_path = public as $$
  insert into subscription (group_id, plan, status, trial_ends_at, price_per_branch, notes, cancelled_at)
  values (p_group, p_plan, p_status, p_trial_ends, p_price, nullif(btrim(coalesce(p_notes, '')), ''),
          case when p_status = 'cancelled' then now() end)
  on conflict (group_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    trial_ends_at = excluded.trial_ends_at,
    price_per_branch = excluded.price_per_branch,
    notes = excluded.notes,
    cancelled_at = case when excluded.status = 'cancelled' then coalesce(subscription.cancelled_at, now()) else null end,
    updated_at = now()
$$;

grant execute on function group_branches(uuid) to flossify_app;
grant execute on function billing_ensure(uuid, numeric) to flossify_app;
grant execute on function billing_issue_invoices(date) to flossify_app;
grant execute on function billing_mark_paid(uuid, text, uuid) to flossify_app;
grant execute on function admin_billing() to flossify_app;
grant execute on function admin_billing_set(uuid, text, text, timestamptz, numeric, text) to flossify_app;
