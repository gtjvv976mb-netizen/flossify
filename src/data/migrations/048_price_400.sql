-- 048: the list price is ₱400 a branch a month (the owner, 13 Nov 2026: "make it 400 pesos only per month per
-- branch"). It was ₱800 (25 Sep 2026). src/lib/billing.ts PRICE_PER_BRANCH is the number new clinics start on; this
-- file moves the subscriptions that were opened on the old list price, so no clinic is left on a price above the list.
--
-- Only a subscription still at exactly the old list price moves: a price the operator set by hand for one clinic
-- (/admin/billing/, more or less than the list) is that clinic's own and stays. Invoices already written are never
-- touched: an invoice says what was asked for its month. (None has been sent: BILLING_FINAL is still false.)
-- A cancelled subscription is left as it ended.
--
-- Run again it changes nothing: no subscription is at 800 after the first run unless an operator puts one there.

do $$
declare n integer;
begin
  update subscription set price_per_branch = 400, updated_at = now()
   where price_per_branch = 800 and status <> 'cancelled';
  get diagnostics n = row_count;
  raise notice '048: % subscription(s) moved from the old list price (800) to 400 a branch a month', n;
end $$;
