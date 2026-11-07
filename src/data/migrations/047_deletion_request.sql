-- 047: deleting an account from inside the app (Apple's App Review guideline 5.1.1(v)).
--
-- The owner's choice (7 Nov 2026): a Delete account button that sends a request, which Flossify confirms. Nothing is
-- erased by the button itself. On My page anyone signed in asks; an owner's request is for the whole clinic group (the
-- account the owner opened), anyone else's is for their own sign-in only. The operator confirms it on
-- /admin/accounts/, which calls admin_close_account().
--
--   deletion_request      one row per request. Group data, like staff: not under row-level security; the app reads only
--                         the signed-in person's own rows, and the operator's page reads them all. One open request per
--                         person. A request is withdrawn by its person or done by the operator: those two columns are
--                         the only update the app may make.
--   admin_close_account() what confirming does, in one transaction. For a person: their sign-in ends for good (switched
--                         off, every session out, password, email, mobile, two-factor secret and live codes gone) and
--                         their public profile goes (slug and the lines about them). For a clinic group: the same for
--                         every person in the group but the operator, and every branch comes off Find a clinic. The
--                         name stays on the staff row, because the records they wrote and signed must still say who.
--                         Patients' records are not touched here: what happens to them is settled with the clinic.
--
-- Additive.

create table if not exists deletion_request (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  group_id      uuid not null references clinic_group(id) on delete cascade,
  clinic_id     uuid references clinic(id) on delete set null,           -- the branch they asked from
  scope         text not null check (scope in ('me', 'clinic')),
  reason        text check (char_length(reason) <= 500),
  requested_at  timestamptz not null default now(),
  outcome       text check (outcome in ('done', 'withdrawn')),
  decided_at    timestamptz,
  decided_by    uuid references staff(id) on delete set null,
  check ((outcome is null) = (decided_at is null))
);
create unique index if not exists deletion_request_one_open on deletion_request (staff_id) where outcome is null;
create index if not exists deletion_request_open on deletion_request (requested_at) where outcome is null;

grant select, insert on deletion_request to flossify_app;
grant update (outcome, decided_at, decided_by) on deletion_request to flossify_app;

-- Confirms an open request. Returns its scope ('me' or 'clinic'), or null when there is no such open request.
create or replace function admin_close_account(p_request uuid, p_by uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare r deletion_request%rowtype;
begin
  select * into r from deletion_request where id = p_request and outcome is null for update;
  if not found then return null; end if;

  update staff set
    disabled_at = coalesce(disabled_at, now()),
    token_version = token_version + 1,
    password_hash = null,
    totp_secret = null,
    email = null,
    phone = null,
    slug = null,
    about = null
  where (case when r.scope = 'clinic' then group_id = r.group_id else id = r.staff_id end)
    and id not in (select staff_id from platform_admin);

  update one_time_code set used_at = now()
  where used_at is null
    and staff_id in (select id from staff where case when r.scope = 'clinic' then group_id = r.group_id else id = r.staff_id end);

  if r.scope = 'clinic' then
    update clinic set listed = false where group_id = r.group_id;
  end if;

  update deletion_request set outcome = 'done', decided_at = now(), decided_by = p_by where id = r.id;
  return r.scope;
end $$;

revoke all on function admin_close_account(uuid, uuid) from public;
grant execute on function admin_close_account(uuid, uuid) to flossify_app;
