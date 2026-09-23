// DELETE /api/bookings/<ref>?token=<cancelToken>&clinic=<slug>
// Within three minutes of booking: the row is removed as if it never happened
// (undo). After that: it is marked cancelled and stays, because the clinic has
// seen it. Either way the queued text is dropped if it has not gone out.
export const prerender = false;

import type { APIRoute } from 'astro';
import { withClinic, clinicIdBySlug } from '../../../lib/db';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const UNDO_MS = 3 * 60_000;

export const DELETE: APIRoute = async ({ params, url }) => {
  const token = url.searchParams.get('token') ?? '';
  const clinicId = await clinicIdBySlug(url.searchParams.get('clinic') ?? '');
  if (!clinicId || !token) return json({ error: 'Missing clinic or token.' }, 400);

  const out = await withClinic(clinicId, async (tx) => {
    const { rows } = await tx.query(`select id, patient_id, created_at, status from appointment where public_ref = $1 and cancel_token = $2`, [params.ref, token]);
    const a = rows[0];
    if (!a) return { status: 404 as const };
    if (a.status === 'cancelled') return { status: 200 as const, outcome: 'already-cancelled' as const };
    const fresh = Date.now() - new Date(a.created_at).getTime() < UNDO_MS;
    await tx.query(`delete from message_log where patient_id = $1 and status = 'queued'`, [a.patient_id]);
    if (fresh) {
      await tx.query('delete from audit_log where entity_id = $1', [a.id]);
      await tx.query('delete from appointment where id = $1', [a.id]);
      return { status: 200 as const, outcome: 'undone' as const };
    }
    await tx.query(`update appointment set status = 'cancelled', cancelled_at = now() where id = $1`, [a.id]);
    await tx.query(`insert into audit_log (clinic_id, action, entity, entity_id) values ($1, 'booking.cancel', 'appointment', $2)`, [clinicId, a.id]);
    return { status: 200 as const, outcome: 'cancelled' as const };
  });
  return out.status === 404 ? json({ error: 'No such booking.' }, 404) : json({ outcome: out.outcome });
};
