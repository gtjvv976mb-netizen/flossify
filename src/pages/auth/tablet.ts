// Make this device a clinic tablet (the intake, 039; the spec §1.7(a)). A POST
// from Clinic settings → Clinic tablets, done on the tablet itself. It is under
// /auth/ because it ends a sign-in: public/sw.js treats a navigation POST
// here as a session change (the kept copy of a record goes, the offline queue
// hears that nobody is signed in), as it does for sign-in and sign-out. In
// this order:
//   1. the staff member may change the clinic's settings (settings.edit);
//   2. registerTablet() keeps the new secret hashed (audit tablet.add);
//   3. this browser gets the secret (fl_ctab, only under /f/, 180 days) and is
//      SIGNED OUT (clearSession), any hand-over secret with it;
//   4. 303 to /f/t/?new=1, "Ready for the next patient", which drops the kept
//      record copy and tells every other tab this device is no longer a
//      staff device.
// A refusal goes back to Settings with ?tablet_refused=<code> (TABLET_REFUSED)
// and the name that was typed.
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, clearSession, canOpen, authEvent } from '../../lib/auth';
import { csrfOk } from '../../lib/csrf';
import { can } from '../../lib/can';
import { hit, clientIp, LIMITS } from '../../lib/throttle';
import { withClinic } from '../../lib/db';
import { Refused } from '../../lib/refused';
import { registerTablet, TABLET_NAME_MAX, type TabletRefusal } from '../../lib/intake';
import { setTabletSecret, clearDeviceSecret, clearPark } from '../../lib/park';

export const POST: APIRoute = async (ctx) => {
  const form = await ctx.request.formData().catch(() => new FormData());
  const slug = String(form.get('clinic') ?? '').toLowerCase();
  const name = String(form.get('name') ?? '');
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return ctx.redirect('/auth/login/', 303);
  const back = `/c/${slug}/settings/`;
  const refused = (code: TabletRefusal) =>
    ctx.redirect(`${back}?tablet_refused=${code}&name=${encodeURIComponent(name.replace(/\s+/g, ' ').trim().slice(0, TABLET_NAME_MAX + 10))}#tablets`, 303);
  if (!csrfOk(ctx.cookies, form)) return ctx.redirect(`${back}?stale=tablets#tablets`, 303);
  const session = readSession(ctx.cookies);
  const access = session ? await canOpen(session, slug) : null;
  if (!session || !access) return ctx.redirect(`/auth/login/?next=${encodeURIComponent(back)}`, 303);
  if (!can(access, 'settings.edit')) return refused('allowed');
  const rate = await hit('record:s:' + session.staffId, ...LIMITS.chart.staff);
  if (!rate.allowed) return refused('wait');
  let made: { id: string; secret: string };
  try {
    made = await withClinic(access.id, (tx) => registerTablet(tx, { clinicId: access.id, staffId: session.staffId, name }));
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    return refused((e as Refused<{ code?: TabletRefusal }>).detail?.code ?? 'name');
  }
  // This browser is the tablet now: its secret, and no staff session or hand-over on it.
  setTabletSecret(ctx.cookies, made.secret);
  clearSession(ctx.cookies);
  clearDeviceSecret(ctx.cookies);
  clearPark(ctx.cookies);
  await authEvent('tablet.add', { staffId: session.staffId, ip: clientIp(ctx), ua: ctx.request.headers.get('user-agent') });
  return ctx.redirect('/f/t/?new=1', 303);
};

export const GET: APIRoute = ({ redirect }) => redirect('/auth/login/', 303);
