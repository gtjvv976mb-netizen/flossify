// Staff sign-in and the session cookie.
//
// Passwords: scrypt with a per-user salt, stored as "salt:hash" (hex). The
// seed writes the same format. Sessions: a signed cookie holding the staff id,
// their group, the branch they have open, and an expiry — HMAC-SHA256 with
// SESSION_SECRET, compared in constant time. No session table to clean up;
// revocation is a password change (which we fold into the signature) or the
// two-week expiry.

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

export interface Session { staffId: string; groupId: string; clinicId: string; name: string; role: string; exp: number }

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
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}

/** Email + password → the staff row and the branches they may open. Staff is not under RLS; it is keyed by group. */
export async function authenticate(email: string, password: string) {
  const { rows } = await pool.query(
    `select s.id, s.group_id, s.full_name, s.role, s.password_hash
     from staff s where s.email = $1 and s.disabled_at is null order by s.created_at limit 1`, [email.trim()]);
  const s = rows[0];
  if (!s || !verifyPassword(password, s.password_hash)) return null;
  // Through a definer function: the clinic rows are behind RLS and there is no tenant yet.
  const access = await pool.query('select id, slug, name from staff_branches($1)', [s.id]);
  await pool.query('update staff set last_seen_at = now() where id = $1', [s.id]).catch(() => {});
  return { staffId: s.id as string, groupId: s.group_id as string, name: s.full_name as string, role: s.role as string, clinics: access.rows as { id: string; slug: string; name: string }[] };
}

/** May this session open this branch? Re-checked on every workspace request; access can be revoked. */
export async function canOpen(session: Session, clinicSlug: string) {
  const { rows } = await pool.query('select id, slug, name, group_id, can_view_finance from staff_branches($1) where slug = $2', [session.staffId, clinicSlug]);
  return rows[0] as { id: string; slug: string; name: string; group_id: string; can_view_finance: boolean } | undefined;
}
