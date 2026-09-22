// A second lock on every form post. Astro already refuses a form post whose
// Origin is not ours; this adds the double-submit token for browsers that send
// no Origin and for the day someone turns that check off. The token lives in
// an httpOnly cookie and is echoed in a hidden field (<Csrf />); a post is
// accepted only when the two match.

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

export const CSRF_COOKIE = 'fl_csrf';
const SHAPE = /^[A-Za-z0-9_-]{32,}$/;

/** The token for this browser: the one it has, or a fresh one set on the way out. */
export function csrfToken(cookies: AstroCookies): string {
  const have = cookies.get(CSRF_COOKIE)?.value;
  if (have && SHAPE.test(have)) return have;
  const token = randomBytes(24).toString('base64url');
  cookies.set(CSRF_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD, path: '/', maxAge: 60 * 60 * 24 * 30 });
  return token;
}

/** True when the form's `_csrf` matches the cookie, compared in constant time. */
export function csrfOk(cookies: AstroCookies, form: FormData): boolean {
  const cookie = cookies.get(CSRF_COOKIE)?.value ?? '';
  const field = String(form.get('_csrf') ?? '');
  if (!cookie || !field || cookie.length !== field.length) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(field));
}

/** The sentence a page shows when the token did not match. Never blame the person. */
export const CSRF_MESSAGE = 'The page had gone stale. Try that once more.';
