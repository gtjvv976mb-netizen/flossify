// POST /auth/logout — clear the session cookie and go home. A form post with
// the CSRF token, so a stray link cannot sign a desk out mid-morning.
export const prerender = false;

import type { APIRoute } from 'astro';
import { clearSession, readSession, authEvent } from '../../lib/auth';
import { csrfOk } from '../../lib/csrf';
import { clientIp } from '../../lib/throttle';

export const POST: APIRoute = async (ctx) => {
  const form = await ctx.request.formData().catch(() => new FormData());
  if (!csrfOk(ctx.cookies, form)) return new Response('Stale form. Go back and try again.', { status: 403 });
  const s = readSession(ctx.cookies);
  clearSession(ctx.cookies);
  await authEvent('logout', { staffId: s?.staffId, ip: clientIp(ctx), ua: ctx.request.headers.get('user-agent') });
  return ctx.redirect('/auth/login/?done=out', 303);
};
