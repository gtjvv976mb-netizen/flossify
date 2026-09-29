// A device handed to a patient (the intake, 039; the spec §1.7 and §0.13).
//
// "Hand this device to Juan" (/auth/park/) makes the intake's link already
// claimed by a secret made for this browser (fl_idev, scoped to that link),
// then SIGNS THE DESK OUT (clearSession): no cookie merely hides a live
// session. What stays is this hint, fl_park — who handed it over, at which
// clinic, for which intake — signed with SESSION_SECRET so it cannot be
// forged, httpOnly, SameSite=Strict, only under /auth/, for 24 hours. It opens
// nothing: readSession() never reads it, and /auth/unlock/ uses it only to
// put the clinic's door and the username on the sign-in card and to go back
// to the intake after a full sign-in (authenticateAt). Deleting it loses the
// convenience, never anything else.
import './dotenv';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

export const PARK_COOKIE = 'fl_park';
export const PARK_HOURS = 24;
/** The device secret of a handed-over desk or a phone, scoped to its own link's pages. */
export const DEVICE_COOKIE = 'fl_idev';
/** A clinic tablet's secret (Clinic settings → Clinic tablets), scoped to /f/. */
export const TABLET_COOKIE = 'fl_ctab';
export const TABLET_DAYS = 180;

export interface Park { s: string; c: string; i: string; exp: number }

const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set');
  return s;
};
const sign = (body: string) => createHmac('sha256', key()).update(`park:${body}`).digest('base64url');
const secure = () => import.meta.env.PROD;

export function setPark(cookies: AstroCookies, p: Omit<Park, 'exp'>): void {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + PARK_HOURS * 3_600_000 })).toString('base64url');
  cookies.set(PARK_COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: secure(), sameSite: 'strict', path: '/auth/', maxAge: PARK_HOURS * 3600 });
}

export function readPark(cookies: AstroCookies): Park | null {
  const raw = cookies.get(PARK_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const body = raw.slice(0, dot);
  const want = Buffer.from(sign(body)), got = Buffer.from(raw.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Park;
    return typeof p.s === 'string' && typeof p.c === 'string' && typeof p.i === 'string' && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export function clearPark(cookies: AstroCookies): void {
  cookies.delete(PARK_COOKIE, { path: '/auth/' });
}

/** The handed-over desk's own secret for one link: httpOnly, only on that link's pages, 24 hours. */
export function setDeviceSecret(cookies: AstroCookies, token: string, secret: string): void {
  cookies.set(DEVICE_COOKIE, secret, { httpOnly: true, secure: secure(), sameSite: 'lax', path: `/f/i/${token}/`, maxAge: PARK_HOURS * 3600 });
}

/** A clinic tablet's secret: httpOnly, SameSite=Strict, only under /f/, 180 days. */
export function setTabletSecret(cookies: AstroCookies, secret: string): void {
  cookies.set(TABLET_COOKIE, secret, { httpOnly: true, secure: secure(), sameSite: 'strict', path: '/f/', maxAge: TABLET_DAYS * 86400 });
}
