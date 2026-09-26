// POST /api/payments/checkout — the Pay now button on Settings → Billing.
//
// A form post (not JSON): fields _csrf, clinic (the branch's slug the page was
// opened on) and invoice (the invoice's id). The session must still open that
// branch (canOpen, as on every workspace request) as its owner or admin, the
// invoice must be a due one of that branch's group, and billing must be final
// with PayMongo set up (src/lib/payments.ts). Then the server opens a PayMongo
// Checkout Session for that invoice and answers 303 to PayMongo's checkout
// page. Anything else goes back to the billing page with ?pay=<why>, where one
// sentence says what happened; nothing is charged on any of those paths.
//
// Astro's Origin check runs first: this is a form post from our own page, so
// the browser's Origin matches. Rate limited per staff member: ten a
// quarter-hour, plenty for a person, and each press opens a session at PayMongo.
export const prerender = false;

import '../../../lib/dotenv';
import type { APIRoute } from 'astro';
import { readSession, canOpen, authEvent } from '../../../lib/auth';
import { can } from '../../../lib/can';
import { csrfOk } from '../../../lib/csrf';
import { hit, clientIp } from '../../../lib/throttle';
import { startCheckout } from '../../../lib/payments';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const LIMIT: [number, number] = [10, 15 * 60];

const see = (location: string) => new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

export const POST: APIRoute = async (ctx) => {
  let form: FormData;
  try { form = await ctx.request.formData(); } catch { return see('/auth/login/'); }
  const slug = String(form.get('clinic') ?? '').trim();
  if (!SLUG.test(slug)) return see('/auth/login/');
  const billing = `/c/${slug}/settings/billing/`;
  const back = (why: string) => see(`${billing}?pay=${why}`);

  const session = readSession(ctx.cookies);
  if (!session) return see(`/auth/login/?next=${encodeURIComponent(billing)}`);
  if (!csrfOk(ctx.cookies, form)) return see(`${billing}?stale=1`);
  const clinic = await canOpen(session, slug);
  if (!clinic) return see(`/auth/login/?next=${encodeURIComponent(billing)}&denied=1`);
  if (!can(clinic, 'plan.pay')) return back('role');

  const invoiceId = String(form.get('invoice') ?? '').trim();
  if (!UUID.test(invoiceId)) return back('not_due');

  const gate = await hit('paycheckout:s:' + session.staffId, ...LIMIT);
  if (!gate.allowed) return back('busy');

  const r = await startCheckout({ invoiceId, groupId: clinic.group_id, slug: clinic.slug, origin: ctx.url.origin, staffId: session.staffId });
  if (!r.ok) return back(r.reason);
  await authEvent('billing.checkout', { staffId: session.staffId, ip: clientIp(ctx), ua: ctx.request.headers.get('user-agent') });
  return see(r.url);
};

export const GET: APIRoute = () => new Response('Send a POST from the billing page.\n', { status: 405, headers: { allow: 'POST', 'content-type': 'text/plain; charset=utf-8' } });
