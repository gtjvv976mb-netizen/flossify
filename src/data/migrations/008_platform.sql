-- 008 — the platform's own people, and codes for phones that are not staff.
--
-- Flossify staff (operations: PRC checks, billing) are staff rows in a group
-- with no clinic, marked here. They open /admin/, never a clinic workspace;
-- what they may read across clinics is spelled out in definer functions in
-- the migrations that follow (009 PRC, 011 billing), one narrow thing each.
create table if not exists platform_admin (
  staff_id      uuid primary key references staff(id) on delete cascade,
  added_at      timestamptz not null default now(),
  added_by      uuid references staff(id) on delete set null
);

-- One-time codes for a mobile number with no staff row behind it: a patient
-- signing in to see their visits. Same shape as one_time_code, keyed by the
-- normalised number (09…), same rules: HMAC-stored, short-lived, five tries,
-- one live code per purpose per number.
create table if not exists phone_code (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  purpose       text not null check (purpose in ('patient')),
  code_hash     text not null,
  attempts      smallint not null default 0,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists phone_code_live on phone_code (phone, purpose) where used_at is null;
