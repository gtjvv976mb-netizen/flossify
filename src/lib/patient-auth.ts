// A patient's session is their mobile number, proven by a texted code. No
// account, no password: the number is what the clinic already has, and the
// code is what proves the phone is in their hand. Same cookie construction as
// the staff session (HMAC-SHA256 with SESSION_SECRET, constant-time compare),
// a different cookie, a shorter life.

import './dotenv';
import { timingSafeEqual, createHmac } from 'node:crypto';
import type { AstroCookies } from 'astro';

const SECRET = process.env.SESSION_SECRET ?? '';
export const PATIENT_COOKIE = 'fl_patient';
const DAYS = 30;

export interface PatientSession { phone: string; exp: number }

const sign = (body: string) => createHmac('sha256', SECRET).update(`patient:${body}`).digest('base64url');

export function setPatientSession(cookies: AstroCookies, phone: string) {
  const body = Buffer.from(JSON.stringify({ phone, exp: Date.now() + DAYS * 86_400_000 })).toString('base64url');
  cookies.set(PATIENT_COOKIE, `${body}.${sign(body)}`, { httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD, path: '/', maxAge: DAYS * 86_400 });
}

export function clearPatientSession(cookies: AstroCookies) {
  cookies.delete(PATIENT_COOKIE, { path: '/' });
}

export function readPatientSession(cookies: AstroCookies): PatientSession | null {
  const raw = cookies.get(PATIENT_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return null;
  const body = raw.slice(0, dot), sig = raw.slice(dot + 1);
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as PatientSession;
    return typeof s.phone === 'string' && s.exp > Date.now() ? s : null;
  } catch { return null; }
}
