// GET /api/availability?clinic=<slug>&dentist=<slug>&minutes=45&days=14&limit=60
// The clinic's real open slots, computed from its hours, the dentist's days,
// the chair time asked for, and what is already booked. Times are Manila.
export const prerender = false;

import type { APIRoute } from 'astro';
import { loadListing, openSlots, slotIso } from '../../lib/directory-db';

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('clinic') ?? '';
  const l = await loadListing(slug);
  if (!l) return new Response(JSON.stringify({ error: 'unknown clinic' }), { status: 404, headers: { 'content-type': 'application/json' } });
  if (!l.workspace) return Response.json({ clinic: slug, mode: 'request', slots: [] });
  const dentist = url.searchParams.get('dentist') || null;
  const minutes = Math.min(180, Math.max(15, Number(url.searchParams.get('minutes')) || 30));
  const days = Math.min(28, Math.max(1, Number(url.searchParams.get('days')) || 14));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 200));
  const slots = await openSlots(l, { dentist, minutes, days, limit });
  return Response.json(
    { clinic: slug, mode: 'live', dentist, minutes, slots: slots.map((s) => ({ at: slotIso(s), date: s.date, mins: s.mins, label: s.label, dayLabel: s.dayLabel })) },
    { headers: { 'cache-control': 'no-store' } },
  );
};
