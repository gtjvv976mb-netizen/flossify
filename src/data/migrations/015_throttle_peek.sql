-- 015 — read a rate-limit window without spending a hit.
--
-- Sign-in used to count every attempt, so a desk that signs in nine times in
-- fifteen minutes (several devices, one owner account) locked itself out.
-- Now the lock is checked first, and only a failed attempt counts.
create or replace function throttle_peek(p_key text, p_limit integer, p_window interval)
returns table (allowed boolean, hits integer, retry_after integer)
language sql security definer stable set search_path = public as $$
  select coalesce(t.hits, 0) < p_limit or t.window_start + p_window <= now(),
         case when t.window_start + p_window <= now() then 0 else coalesce(t.hits, 0) end,
         greatest(0, coalesce(extract(epoch from (t.window_start + p_window - now()))::integer, 0))
  from (select 1) x left join throttle t on t.key = p_key
$$;
grant execute on function throttle_peek(text, integer, interval) to flossify_app;
