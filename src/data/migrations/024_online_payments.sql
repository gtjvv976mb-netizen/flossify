-- 024 — a clinic pays its Flossify invoice online, through PayMongo.
--
-- 011 has a person mark each invoice paid against a GCash, Maya or bank
-- reference. This adds the second way in: the owner presses Pay now, the
-- server opens a PayMongo Checkout Session for that one invoice
-- (src/lib/payments.ts), and PayMongo's signed webhook, or the billing page
-- asking PayMongo when the owner comes back, marks it paid. Nothing here
-- creates an invoice or a charge; BILLING_FINAL (src/lib/billing-config.ts)
-- still decides whether any invoice exists to pay.
--
-- Three things:
--   subscription_checkout        every session opened for an invoice, so a
--                                payment on an older tab still finds its
--                                invoice. The newest is also on the invoice.
--   subscription_payment_event   every verified webhook (and every answer the
--                                billing page got from PayMongo), once, by its
--                                id: the idempotency key and the audit trail,
--                                with what was done about it.
--   billing_paid_online()        the one door a gateway payment comes through:
--                                it checks the session, the amount, the
--                                currency, the mode and the invoice number,
--                                then marks the invoice paid through
--                                billing_mark_paid() (011), the same function
--                                operations uses, with the PayMongo payment id
--                                as the reference.
--
-- None of it is clinic data, so none of it is under row-level security (like
-- subscription and staff). The app may read the checkouts; it writes both
-- tables only through the definer functions below, and reads the events only
-- through them too: admin_online_payments() for operations,
-- billing_open_refusals() and billing_sessions_to_check() for the owner's
-- Billing page.

alter table subscription_invoice
  -- The newest PayMongo Checkout Session opened for this invoice (cs_…).
  add column if not exists checkout_session_id text,
  -- How it was paid: null is a person marking it (011); 'paymongo' is a
  -- payment PayMongo confirmed. Shown as "Paid online" on both billing pages.
  add column if not exists paid_via text check (paid_via in ('paymongo'));

create table if not exists subscription_checkout (
  session_id       text primary key,
  invoice_id       uuid not null references subscription_invoice(id) on delete cascade,
  -- What the session asks for, in centavos, as sent to PayMongo.
  amount_centavos  bigint not null check (amount_centavos > 0),
  -- PayMongo's own answer: a test key opens test sessions.
  livemode         boolean not null,
  created_by       uuid references staff(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists subscription_checkout_invoice on subscription_checkout (invoice_id, created_at desc);

create table if not exists subscription_payment_event (
  -- evt_… for a webhook; check:<payment id> when the billing page asked PayMongo itself.
  event_id         text primary key,
  received_at      timestamptz not null default now(),
  kind             text not null,
  session_id       text,
  payment_id       text,
  amount_centavos  bigint,
  invoice_id       uuid references subscription_invoice(id) on delete set null,
  -- paid, already_paid, no_payment, unreadable, unknown_session, wrong_mode,
  -- wrong_amount, wrong_invoice, paid_twice, not_due. Set in the same
  -- transaction as the insert.
  outcome          text not null default 'received',
  -- A refused payment is on operations' list until a person has dealt with it
  -- (a refund, or the invoice marked by hand) and says so.
  reviewed_at      timestamptz,
  reviewed_by      uuid references staff(id) on delete set null
);
create index if not exists subscription_payment_event_at on subscription_payment_event (received_at desc);

-- 002's default privileges gave the app every right on both tables. It reads
-- the checkouts (to ask PayMongo about an unpaid one) and nothing else directly.
revoke insert, update, delete, truncate on subscription_checkout from flossify_app;
revoke all on subscription_payment_event from flossify_app;

-- The owner pressed Pay now and PayMongo opened a session. Records it only if
-- the invoice is still due, belongs to the group that asked, and the session
-- asks for exactly the invoice's amount; otherwise records nothing and returns
-- false (someone marked it paid in between, or the amount changed).
create or replace function billing_checkout_start(p_invoice uuid, p_group uuid, p_session text, p_amount bigint, p_livemode boolean, p_by uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from subscription_invoice
   where id = p_invoice and group_id = p_group and status = 'due' and (amount * 100)::bigint = p_amount
   for update;
  if not found then return false; end if;
  insert into subscription_checkout (session_id, invoice_id, amount_centavos, livemode, created_by)
  values (p_session, p_invoice, p_amount, p_livemode, p_by)
  on conflict (session_id) do nothing;
  update subscription_invoice set checkout_session_id = p_session where id = p_invoice;
  return true;
end $$;

-- A paid PayMongo payment, from a verified webhook or from PayMongo's own
-- answer about a session. Runs once per p_event: a second delivery of the same
-- event returns 'duplicate' and changes nothing. Otherwise the event is
-- recorded with what was done:
--   paid             the invoice was due and everything matched: marked paid
--                    through billing_mark_paid(), reference = the payment id,
--                    paid_via = 'paymongo', and an auth_event for the audit.
--   already_paid     the invoice is paid with this same payment: its reference
--                    is the payment id, or contains it (operations marked it
--                    by hand and typed PayMongo's pay_… id). Nothing to do.
--   no_payment       not a paid event, and no paid payment: nothing to do.
--   unreadable       PayMongo said the checkout was paid (p_kind is
--                    checkout_session.payment.paid) but no paid payment could
--                    be read from it: money may have moved, so a person looks.
--   unknown_session  a session Flossify never opened.
--   wrong_mode       a test payment for a live session, or the reverse.
--   wrong_amount     not the invoice's amount, or not in pesos.
--   wrong_invoice    the session's reference names a different invoice.
--   paid_twice       the invoice was already marked paid another way.
--   not_due          the invoice was cancelled (void): money to return.
-- unreadable and everything after it is refused and shown to operations.
create or replace function billing_paid_online(
  p_event text, p_kind text, p_session text, p_payment text, p_amount bigint,
  p_currency text, p_livemode boolean, p_reference text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_co  subscription_checkout;
  v_known boolean;
  v_inv subscription_invoice;
  v_out text;
begin
  insert into subscription_payment_event (event_id, kind, session_id, payment_id, amount_centavos)
  values (p_event, left(coalesce(p_kind, ''), 80), left(p_session, 120), left(p_payment, 120), p_amount)
  on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;

  select * into v_co from subscription_checkout where session_id = p_session;
  v_known := found;
  if v_known then
    -- Held until this transaction ends, so a webhook and the page asking at once take turns.
    select * into v_inv from subscription_invoice where id = v_co.invoice_id for update;
  end if;

  if p_payment is null then
    v_out := case when p_kind = 'checkout_session.payment.paid' then 'unreadable' else 'no_payment' end;
  elsif not v_known then
    v_out := 'unknown_session';
  elsif v_co.livemode is distinct from p_livemode then
    v_out := 'wrong_mode';
  elsif coalesce(p_currency, '') <> 'PHP' or p_amount is distinct from v_co.amount_centavos
        or p_amount is distinct from (v_inv.amount * 100)::bigint then
    v_out := 'wrong_amount';
  elsif p_reference is not null and p_reference <> v_inv.number then
    v_out := 'wrong_invoice';
  elsif v_inv.status = 'paid' and strpos(coalesce(v_inv.paid_ref, ''), p_payment) > 0 then
    v_out := 'already_paid';
  elsif v_inv.status = 'paid' then
    v_out := 'paid_twice';
  elsif v_inv.status <> 'due' then
    v_out := 'not_due';
  else
    perform billing_mark_paid(v_inv.id, p_payment, null);
    update subscription_invoice set paid_via = 'paymongo' where id = v_inv.id;
    insert into auth_event (kind) values ('billing.paid_online');
    v_out := 'paid';
  end if;

  update subscription_payment_event set outcome = v_out, invoice_id = v_co.invoice_id where event_id = p_event;
  return v_out;
end $$;

-- Which of one invoice's checkouts are worth asking PayMongo about: opened in
-- the last p_days, in this server's mode, and with no payment recorded for them
-- yet (a checkout session is paid once; one already recorded has nothing more
-- to say). Newest first, at most six. The invoice may be paid already: a
-- second payment on an older tab is exactly what asking finds. The owner's
-- page also uses it to say a payment is under way: a checkout whose payment
-- was already reported (and refused, then handled) is not one.
create or replace function billing_sessions_to_check(p_invoice uuid, p_livemode boolean, p_days integer)
returns table (session_id text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select c.session_id, c.created_at
    from subscription_checkout c
   where c.invoice_id = p_invoice and c.livemode = p_livemode
     and c.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 3), 1), 90))
     and not exists (select 1 from subscription_payment_event e where e.session_id = c.session_id and e.payment_id is not null)
   order by c.created_at desc
   limit 6
$$;

-- A group's online payments that no invoice took and nobody on operations has
-- handled yet, newest first. The owner's Billing page keeps saying so, and
-- keeps Pay now off that invoice, until someone presses Handled. p_outcomes
-- is the list of refused outcomes (NEEDS_LOOK in src/lib/payments.ts).
create or replace function billing_open_refusals(p_group uuid, p_outcomes text[])
returns table (invoice_id uuid, outcome text, received_at timestamptz)
language sql security definer stable set search_path = public as $$
  select e.invoice_id, e.outcome, e.received_at
    from subscription_payment_event e
    join subscription_invoice i on i.id = e.invoice_id
   where i.group_id = p_group and e.reviewed_at is null and e.outcome = any(p_outcomes)
   order by e.received_at desc
   limit 50
$$;

-- What operations sees of online payments, newest first, with the invoice and
-- group each came to (none for an unknown session) and how that invoice was
-- paid. p_outcomes keeps only those outcomes (null: every one); p_open_only
-- keeps only the ones nobody has handled; p_limit null is no limit, which is
-- what the list of payments to look at uses, so an open one never drops off
-- behind newer events.
create or replace function admin_online_payments(p_limit integer, p_outcomes text[], p_open_only boolean)
returns table (
  event_id text, received_at timestamptz, kind text, outcome text, session_id text, payment_id text, amount_centavos bigint,
  invoice_id uuid, invoice_number text, invoice_amount numeric, invoice_status text, paid_at timestamptz, paid_ref text,
  paid_via text, group_id uuid, group_name text, reviewed_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select e.event_id, e.received_at, e.kind, e.outcome, e.session_id, e.payment_id, e.amount_centavos,
         i.id, i.number, i.amount, i.status, i.paid_at, i.paid_ref, i.paid_via, g.id, g.name, e.reviewed_at
    from subscription_payment_event e
    left join subscription_invoice i on i.id = e.invoice_id
    left join clinic_group g on g.id = i.group_id
   where (p_outcomes is null or e.outcome = any(p_outcomes))
     and (not coalesce(p_open_only, false) or e.reviewed_at is null)
   order by e.received_at desc
   limit (case when p_limit is null then null else least(greatest(p_limit, 1), 500) end)
$$;

-- A person on operations dealt with a refused payment. Takes it off the list,
-- with every other report of the same PayMongo payment (the webhook and the
-- billing page asking can both have recorded it). True when anything was on
-- the list; false when not (already handled, or no such event).
create or replace function admin_payment_reviewed(p_event text, p_by uuid)
returns boolean
language sql security definer set search_path = public as $$
  with target as (
    select event_id, payment_id from subscription_payment_event where event_id = p_event and reviewed_at is null
  ), done as (
    update subscription_payment_event e set reviewed_at = now(), reviewed_by = p_by
      from target t
     where e.reviewed_at is null
       and (e.event_id = t.event_id or (t.payment_id is not null and e.payment_id = t.payment_id))
    returning 1
  )
  select count(*) > 0 from done
$$;

revoke all on function billing_checkout_start(uuid, uuid, text, bigint, boolean, uuid) from public;
revoke all on function billing_paid_online(text, text, text, text, bigint, text, boolean, text) from public;
revoke all on function billing_sessions_to_check(uuid, boolean, integer) from public;
revoke all on function billing_open_refusals(uuid, text[]) from public;
revoke all on function admin_online_payments(integer, text[], boolean) from public;
revoke all on function admin_payment_reviewed(text, uuid) from public;
grant execute on function billing_checkout_start(uuid, uuid, text, bigint, boolean, uuid) to flossify_app;
grant execute on function billing_paid_online(text, text, text, text, bigint, text, boolean, text) to flossify_app;
grant execute on function billing_sessions_to_check(uuid, boolean, integer) to flossify_app;
grant execute on function billing_open_refusals(uuid, text[]) to flossify_app;
grant execute on function admin_online_payments(integer, text[], boolean) to flossify_app;
grant execute on function admin_payment_reviewed(text, uuid) to flossify_app;
