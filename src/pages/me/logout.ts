// POST /me/logout — clear the patient's cookie and go back to the door. A
// form post with the CSRF token, so a stray link cannot sign a phone out.
export const prerender = false;

import type { APIRoute } from 'astro';
import { clearPatientSession } from '../../lib/patient-auth';
import { csrfOk } from '../../lib/csrf';

export const POST: APIRoute = async (ctx) => {
  const form = await ctx.request.formData().catch(() => new FormData());
  if (!csrfOk(ctx.cookies, form)) return new Response('Stale form. Go back and try again.', { status: 403 });
  clearPatientSession(ctx.cookies);
  return ctx.redirect('/me/', 303);
};
