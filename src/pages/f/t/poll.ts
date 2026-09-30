// A clinic tablet asks for work (the intake, 039; the spec §1.7(a)): every 4
// seconds while /f/t/ is open, known only by the hash of its own secret
// (fl_ctab). Answers { status: 'ready' } or { status: 'link', to: '/f/i/<token>/' }
// — the link the desk sent it, already claimed by this tablet — or unknown.
// Limit LIMITS.intake.tablet per tablet. No staff session is needed, and a
// staff sign-in found on a clinic tablet is ended (endStaffOnTablet).
export const prerender = false;

import type { APIRoute } from 'astro';
import { hit, clientIp, LIMITS } from '../../../lib/throttle';
import { pollTablet, tabletProof, endStaffOnTablet } from '../../../lib/intake-public';

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });

export const GET: APIRoute = async (ctx) => {
  const { cookies } = ctx;
  const proof = tabletProof(cookies);
  if (!proof) return json({ status: 'unknown' }, 404);
  const r = await hit(`intake:t:${proof}`, ...LIMITS.intake.tablet);
  if (!r.allowed) return json({ status: 'wait', retryAfter: r.retryAfter }, 429, { 'retry-after': String(r.retryAfter) });
  const p = await pollTablet(proof);
  if (p.status === 'unknown') return json({ status: 'unknown' }, 404);
  await endStaffOnTablet(cookies, { ip: clientIp(ctx), ua: ctx.request.headers.get('user-agent') });
  return json(p.status === 'link' && p.token ? { status: 'link', to: `/f/i/${p.token}/` } : { status: 'ready' });
};
