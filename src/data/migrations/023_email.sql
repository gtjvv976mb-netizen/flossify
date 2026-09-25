-- 023 — email, beside texts.
--
-- Emails go through the same queue as texts: a row in message_log with
-- channel = 'email' (schema.sql already allows it), written by the app inside
-- a clinic transaction, so the Messages page, the audit trail and the
-- two-year retention (retention_purge, 017: every row, any channel) treat an
-- email exactly like a text. to_address holds the email address.
--
-- An email needs a subject, which a text does not have. The subject never
-- carries a code (src/lib/email.ts), so a page may show it; the body of a
-- reset or invite row is never shown anywhere, like a text's.
--
-- The worker claims due emails through email_claim_due() and records what
-- happened through sms_mark() (005), which marks any row by id whatever its
-- channel. sms_claim_due() is unchanged and still hands over texts only.

alter table message_log add column if not exists subject text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'message_log_email_subject') then
    alter table message_log add constraint message_log_email_subject
      check (channel <> 'email' or (subject is not null and btrim(subject) <> ''));
  end if;
end $$;

-- Claim up to p_limit due emails, across clinics, marking them 'sending' so a
-- second worker cannot take them. The same discipline as sms_claim_due():
-- oldest due first, skip rows another worker holds, one attempt counted per
-- claim. Emails have no quiet hours; the worker sends them when they are due.
create or replace function email_claim_due(p_limit integer)
returns table (id uuid, clinic_id uuid, to_address text, subject text, body text, kind text, attempts smallint)
language sql security definer set search_path = public as $$
  with due as (
    select m.id from message_log m
    where m.direction = 'out' and m.channel = 'email' and m.status = 'queued' and m.next_attempt_at <= now()
    order by m.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update message_log m set status = 'sending', attempts = m.attempts + 1
  from due where m.id = due.id
  returning m.id, m.clinic_id, m.to_address, m.subject, m.body, m.kind, m.attempts
$$;

grant execute on function email_claim_due(integer) to flossify_app;
