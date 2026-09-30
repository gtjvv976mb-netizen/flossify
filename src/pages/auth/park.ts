// Hand this device to the patient (the intake, 039; the spec §1.7(b)). A POST
// from the intake's Check step, in this order:
//   1. goLive() makes the link, already claimed by a secret made for this
//      browser, in its own transaction (canEditRecords, the intake locked, rev);
//   2. clearSession(): the desk is signed out here — no cookie merely hides a
//      live session;
//   3. fl_idev (that secret: one per browser under /f/i/, so it replaces an
//      earlier hand-over's) and the fl_park hint (src/lib/park.ts: it opens
//      nothing);
//   4. 303 to /f/i/<token>/, whose page tells every other tab on the
//      'flossify-offline' channel that this device was handed over (they cover
//      themselves) and that nobody is signed in here.
// public/sw.js already treats a navigation POST under /auth/ as a session
// change: the kept copy of a record goes, and the offline queue stops.
// An earlier hand-over on this browser that nobody unlocked (the hint names
// it) is ended first: its link retires as stopped (endHandover). A refusal
// goes back to the Check step with ?refused=<code> (LIVE_REFUSED; 'wait' for
// the save limits).
export const prerender = false;

import type { APIRoute } from 'astro';
import { readSession, clearSession, canOpen, authEvent, clinicDoor } from '../../lib/auth';
import { csrfOk } from '../../lib/csrf';
import { hit, clientIp, LIMITS } from '../../lib/throttle';
import { withClinic } from '../../lib/db';
import { Refused } from '../../lib/refused';
import { goLive, endHandover, intakeGates, isUuid, type LiveRefusal } from '../../lib/intake';
import { setPark, readPark, setDeviceSecret } from '../../lib/park';

export const POST: APIRoute = async (ctx) => {
  const form = await ctx.request.formData().catch(() => new FormData());
  const slug = String(form.get('clinic') ?? '').toLowerCase();
  const intakeId = String(form.get('intake') ?? '');
  const rev = Number(form.get('rev'));
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !isUuid(intakeId)) return ctx.redirect('/auth/login/', 303);
  const back = `/c/${slug}/patients/intake/${intakeId}/?step=check`;
  if (!csrfOk(ctx.cookies, form)) return ctx.redirect(`${back}&stale=1`, 303);
  const session = readSession(ctx.cookies);
  const access = session ? await canOpen(session, slug) : null;
  if (!session || !access) return ctx.redirect(`/auth/login/?next=${encodeURIComponent(back)}`, 303);
  const rate = await hit('record:s:' + session.staffId, ...LIMITS.chart.staff);
  if (!rate.allowed) return ctx.redirect(`${back}&refused=wait`, 303);
  const made = await hit(`intake:m:${session.staffId}`, ...LIMITS.intake.make);
  if (!made.allowed) return ctx.redirect(`${back}&refused=wait`, 303);
  // The last hand-over on this browser, if nobody unlocked it: its link stops before this one is made.
  const prev = readPark(ctx.cookies);
  if (prev && prev.i !== intakeId) {
    const at = prev.c === slug ? access.id : (await clinicDoor(prev.c))?.id ?? null;
    if (at) {
      await withClinic(at, (tx) => endHandover(tx, { clinicId: at, staffId: session.staffId, intakeId: prev.i, why: 'handed over again' }))
        .catch((e) => console.error(`[intake] ending the last hand-over failed: ${(e as { code?: string }).code ?? 'error'}`));
    }
  }
  let live: { token: string; secret: string | null };
  try {
    live = await withClinic(access.id, async (tx) => goLive(tx, {
      clinicId: access.id, staffId: session.staffId, intakeId, rev, gates: await intakeGates(tx), device: 'desk',
    }));
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    const code = (e as Refused<{ code?: LiveRefusal }>).detail?.code ?? (/changed these forms/.test(e.reasons[0] ?? '') ? 'stale' : 'allowed');
    return ctx.redirect(`${back}&refused=${code}`, 303);
  }
  clearSession(ctx.cookies);
  setDeviceSecret(ctx.cookies, live.secret!);
  setPark(ctx.cookies, { s: session.staffId, c: slug, i: intakeId });
  await authEvent('handover', { staffId: session.staffId, ip: clientIp(ctx), ua: ctx.request.headers.get('user-agent') });
  return ctx.redirect(`/f/i/${live.token}/`, 303);
};

export const GET: APIRoute = ({ redirect }) => redirect('/auth/login/', 303);
