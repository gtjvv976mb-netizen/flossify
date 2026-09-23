// POST /api/sms/inbound — a patient's reply, forwarded by the SMS gateway.
//
// Body: JSON or form fields, the sender in `from` (or `number`, `sender`) and
// the text in `text` (or `message`, `body`), so a gateway's own spelling works
// without a translation layer. The shared secret in X-Inbound-Secret is the
// whole authentication; without it the answer is 401 and nothing is read.
//
// The SQL function does the work. sms_inbound() matches the sender's last ten
// digits to their next visit, files the reply in message_log for the desk to
// read, and a Y confirms the visit. This handler has no tenant; the function
// is security definer. Returns { action }: confirmed, logged or unmatched.
//
// Astro's own Origin check runs before this handler. A form-encoded POST that
// carries no Origin header (which is what a gateway sends) is refused there
// with 403; a gateway that posts JSON gets through as-is. Prefer JSON.
export const prerender = false;

import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '../../../lib/db';
import { hit, clientIp, LIMITS } from '../../../lib/throttle';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });

const SECRET = import.meta.env.SMS_INBOUND_SECRET ?? process.env.SMS_INBOUND_SECRET ?? '';

/** Constant-time match against the configured secret. An unset secret admits nobody. */
function secretOk(given: string | null): boolean {
  if (!SECRET || !given) return false;
  const want = Buffer.from(SECRET), got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The sender and the text, whichever names the gateway gave them. */
async function readBody(request: Request): Promise<{ from: string; text: string }> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  let fields: Record<string, unknown> = {};
  try {
    if (type.includes('application/json')) fields = await request.json();
    else if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) fields = Object.fromEntries((await request.formData()).entries());
    else {
      const raw = await request.text();
      try { fields = JSON.parse(raw); } catch { fields = Object.fromEntries(new URLSearchParams(raw)); }
    }
  } catch { fields = {}; }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fields = {};
  const pick = (...keys: string[]) => {
    for (const k of keys) { const v = fields[k]; if (v != null && String(v).trim()) return String(v).trim(); }
    return '';
  };
  return { from: pick('from', 'number', 'sender'), text: pick('text', 'message', 'body') };
}

export const POST: APIRoute = async (ctx) => {
  if (!secretOk(ctx.request.headers.get('x-inbound-secret'))) return json({ error: 'Not allowed.' }, 401);
  const gate = await hit('inbound:ip:' + clientIp(ctx), ...LIMITS.inbound.ip);
  if (!gate.allowed) return json({ error: 'Too many at once. Try again in a minute.' }, 429, { 'retry-after': String(gate.retryAfter) });
  const { from, text } = await readBody(ctx.request);
  if (!from || !text) return json({ error: 'Send the sender as from and the message as text.' }, 400);
  const { rows } = await pool.query('select clinic_id, appointment_id, action from sms_inbound($1, $2)', [from.slice(0, 40), text.slice(0, 500)]);
  return json({ action: rows[0]?.action ?? 'unmatched' });
};

export const GET: APIRoute = () => json({ error: 'Send a POST.' }, 405, { allow: 'POST' });
