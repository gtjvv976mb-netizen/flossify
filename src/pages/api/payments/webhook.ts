// POST /api/payments/webhook — PayMongo telling us a checkout was paid.
//
// Register it once in the PayMongo dashboard (Developers → Webhooks) as
// https://flossify.ph/api/payments/webhook, subscribed to
// checkout_session.payment.paid only, and put the secret it shows (whsk_…) in
// PAYMONGO_WEBHOOK_SECRET. Use the live mode endpoint and key in production.
//
// No session and no CSRF token: the Paymongo-Signature header is the whole
// authentication, checked on the raw body before anything in it is read
// (receiveWebhook in src/lib/payments.ts). Astro's Origin check runs before
// this handler and refuses a form-encoded post without our Origin; PayMongo
// posts JSON, which that check lets through (the inbound text route relies on
// the same rule). Answers are JSON, 200 for every verified event, so PayMongo
// stops retrying; see payments.ts for why a refused payment is still a 200.
export const prerender = false;

import '../../../lib/dotenv';
import type { APIRoute } from 'astro';
import { receiveWebhook, WEBHOOK_MAX_BYTES } from '../../../lib/payments';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * The body's bytes, exactly as sent (they are what is signed), or null once it
 * passes `max`. Read piece by piece and given up at the limit, so a body sent
 * without a Content-Length (chunked) cannot make the server hold more than
 * that; request.text() would read all of it first. The adapter's own limit is
 * far higher (1 GiB by default).
 */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

export const POST: APIRoute = async ({ request }) => {
  // The raw bytes, as signed. Never request.json() here: re-serialising changes them.
  let raw: Uint8Array | null;
  try { raw = await readCapped(request, WEBHOOK_MAX_BYTES); } catch { return json({ error: 'Could not read the body.' }, 400); }
  if (raw === null) return json({ error: 'Too large.' }, 413);
  const answer = await receiveWebhook(raw, request.headers.get('paymongo-signature'));
  return json(answer.body, answer.status);
};

export const GET: APIRoute = () => Response.json({ error: 'Send a POST.' }, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
