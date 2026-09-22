// Staff sign-in and the session cookie.
//
// Passwords: scrypt with a per-user salt, stored as "salt:hash" (hex). The
// seed writes the same format. Sessions: a signed cookie holding the staff id,
// their group, the branch they have open, their token version and an expiry —
// HMAC-SHA256 with SESSION_SECRET, compared in constant time. No session
// table to clean up. Revocation is the token version: a password change bumps
// it and every cookie carrying the old number stops opening anything, checked
// on every workspace request by canOpen(). The two-week expiry is the ceiling.

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { pool } from './db';

const SECRET = import.meta.env.SESSION_SECRET ?? process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters. See .env.example.');

export const COOKIE = 'fl_session';
const DAYS = 14;

export const hashPassword = (pw: string) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
};

export const verifyPassword = (pw: string, stored: string | null) => {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const got = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(hashHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
};

/** What a password has to be. Length is the only rule that holds up; a sentence beats a symbol. */
export const PASSWORD_MIN = 10;
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters. A short sentence you will remember works well.`;
  if (/^(.)\1+$/.test(pw)) return 'That is one character repeated. Use a short sentence instead.';
  if (pw.length > 200) return 'That is longer than it needs to be. Keep it under 200 characters.';
  return null;
}

export interface Session { staffId: string; groupId: string; clinicId: string; name: string; role: string; tv: number; exp: number }

const sign = (body: string) => createHmac('sha256', SECRET!).update(body).digest('base64url');

export function setSession(cookies: AstroCookies, s: Omit<Session, 'exp'>) {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + DAYS * 86_400_000 })).toString('base64url');
  cookies.set(COOKIE, `${body}.${sign(body)}`, { httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD, path: '/', maxAge: DAYS * 86_400 });
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' });
}

export function readSession(cookies: AstroCookies): Session | null {
  const raw = cookies.get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1);
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (typeof s.tv !== 'number') s.tv = 0;
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}

export interface Who { staffId: string; groupId: string; name: string; role: string; tv: number; homeClinicId: string | null; clinics: { id: string; slug: string; name: string }[] }

/** Email + password → the staff row and the branches they may open. Staff is not under RLS; it is keyed by group. */
export async function authenticate(email: string, password: string): Promise<Who | null> {
  const { rows } = await pool.query(
    `select s.id, s.group_id, s.full_name, s.role, s.password_hash, s.token_version, s.home_clinic_id
     from staff s where s.email = $1 and s.disabled_at is null order by s.created_at limit 1`, [email.trim()]);
  const s = rows[0];
  // Verify against a real hash even when there is no such account, so the two answers take the same time.
  const ok = verifyPassword(password, s?.password_hash ?? DUMMY_HASH);
  if (!s || !ok) return null;
  return whoFor(s);
}

/** The session-worthy shape of a staff row, with their branches read through the definer function (no tenant yet). */
export async function whoFor(s: { id: string; group_id: string; full_name: string; role: string; token_version: number; home_clinic_id: string | null }): Promise<Who> {
  const access = await pool.query('select id, slug, name from staff_branches($1)', [s.id]);
  await pool.query('update staff set last_seen_at = now() where id = $1', [s.id]).catch(() => {});
  return { staffId: s.id, groupId: s.group_id, name: s.full_name, role: s.role, tv: s.token_version ?? 0, homeClinicId: s.home_clinic_id, clinics: access.rows };
}
const DUMMY_HASH = hashPassword('not-a-real-password');

/** May this session open this branch? Re-checked on every workspace request: access can be revoked,
 *  the account disabled, or the password changed (token version) — all take effect at once. */
export async function canOpen(session: Session, clinicSlug: string) {
  const { rows } = await pool.query(
    `select b.id, b.slug, b.name, b.group_id, b.can_view_finance
       from staff_branches($1) b, staff s
      where b.slug = $2 and s.id = $1 and s.disabled_at is null and s.token_version = $3`,
    [session.staffId, clinicSlug, session.tv ?? 0]);
  return rows[0] as { id: string; slug: string; name: string; group_id: string; can_view_finance: boolean } | undefined;
}

/** Set a password. The version bump signs out every session this person has, including the one asking. */
export async function setPassword(staffId: string, password: string): Promise<number> {
  const { rows } = await pool.query(
    `update staff set password_hash = $2, token_version = token_version + 1, password_set_at = now() where id = $1 returning token_version`,
    [staffId, hashPassword(password)]);
  return rows[0].token_version as number;
}

/** Whose mobile is this. Staff rows are per group, so one person at two groups is two rows; the earliest wins. */
export async function staffByPhone(phone: string) {
  const key = String(phone).replace(/\D/g, '').slice(-10);
  if (key.length < 10) return undefined;
  const { rows } = await pool.query(
    `select id, group_id, full_name, email, phone, role, token_version, home_clinic_id, password_hash
       from staff where disabled_at is null and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
       order by created_at limit 1`, [key]);
  return rows[0] as { id: string; group_id: string; full_name: string; email: string; phone: string; role: string; token_version: number; home_clinic_id: string | null; password_hash: string | null } | undefined;
}

/** What happened at the door. Kept apart from clinic data: no tenant, no patient. Never throws. */
export async function authEvent(kind: string, d: { email?: string | null; staffId?: string | null; ip?: string | null; ua?: string | null }) {
  await pool.query('insert into auth_event (kind, email, staff_id, ip, user_agent) values ($1, $2, $3, $4, $5)',
    [kind, d.email || null, d.staffId ?? null, d.ip || null, d.ua?.slice(0, 300) ?? null]).catch(() => {});
}
