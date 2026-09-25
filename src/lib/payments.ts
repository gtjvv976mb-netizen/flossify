// Paying a Flossify invoice online: PayMongo's hosted Checkout (GCash, Maya,
// card), for the subscription invoices in 011. A clinic's owner presses Pay
// now on Settings → Billing, the server opens a Checkout Session for that one
// invoice and sends the browser to PayMongo's page; PayMongo takes the money
// and tells us in a signed webhook (POST /api/payments/webhook). Migration 024
// holds the sessions, the events and the one function that marks an invoice
// paid from a gateway payment, billing_paid_online(), which goes through
// billing_mark_paid() (011), the same function operations uses.
//
// The gate stays where it was. While BILLING_FINAL (src/lib/billing-config.ts)
// is false no invoice is issued and no session is opened: startCheckout()
// refuses, and the billing page shows no button. The webhook still records a
// payment that arrives, because a session can only exist if it was opened
// while billing was final, and money that moved has to be written down.
//
// Settings, read from process.env when used (never import.meta.env):
//   PAYMONGO_SECRET_KEY      sk_live_… on the production server, sk_test_…
//                            anywhere else. Opens sessions and reads them back.
//   PAYMONGO_WEBHOOK_SECRET  whsk_…, shown by PayMongo when the webhook
//                            endpoint is added (Developers → Webhooks), for
//                            https://flossify.ph/api/payments/webhook with the
//                            event checkout_session.payment.paid.
// Both or neither. Neither: online payment is off and the billing page shows
// the transfer instructions only, as before. One without the other, a key in
// the wrong shape, or a key of the wrong mode for this server (a test key in
// production would let a payment that moves no money mark a real invoice
// paid) also leaves it off, and paymentsProblems() says why.
//
// PayMongo's API as documented at docs.paymongo.com (read September 2026):
//   POST /v2/checkout_sessions        HTTP Basic, the secret key as the user,
//                                     no password; amounts in centavos.
//   GET  /v1/checkout_sessions/{id}   the session with its payments[].
//   POST /v1/checkout_sessions/{id}/expire
//   Webhook header Paymongo-Signature: t=<unix seconds>,te=<hex>,li=<hex>.
//   The signature is HMAC-SHA256, keyed with the webhook secret, of
//   "<t>.<raw body>"; te is the test-mode signature and li the live one.
//
// Once an invoice is paid, its other open checkouts are closed (expired) at
// PayMongo, so an older tab cannot take a second payment; and asking PayMongo
// about an invoice also looks at its checkouts that nothing has reported yet,
// so a second payment that did get through is recorded and reaches operations.
//
// Only erasable TypeScript, and no import that needs Astro, so a plain Node
// script can load this file to test it.

import './dotenv';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { pool } from './db';
import { isProduction } from './env';
import { hit } from './throttle';
import { BILLING_FINAL } from './billing-config';
import { monthText } from './billing';

export const PAYMONGO_API = 'https://api.paymongo.com';
/** What the clinic may pay with, in PayMongo's names. Maya is 'paymaya' there. */
export const METHODS = ['gcash', 'paymaya', 'card'] as const;
/** The one event the webhook acts on; subscribe the endpoint to it alone. */
export const PAID_EVENT = 'checkout_session.payment.paid';
/** A webhook signed further than this from now, either way, is refused. */
export const SIGNATURE_TOLERANCE_S = 300;
/** A webhook body larger than this is refused: at once when its length is declared, and after this many bytes when it is not (the route reads it in pieces). A session with one line is a few kilobytes. */
export const WEBHOOK_MAX_BYTES = 1_000_000;
/** The billing page asks PayMongo about checkouts this recent, and shows one as "started" for this long. */
export const CONFIRM_WITHIN_DAYS = 3;
/** Operations' "Check with PayMongo" looks this far back. */
export const ADMIN_CONFIRM_DAYS = 60;
/** Asking PayMongo about one group's invoices: at most this many times a minute, whoever asks. Each ask is up to six calls, and PayMongo's rate limit is the whole account's. */
export const CONFIRM_LIMIT: [number, number] = [6, 60];

const SESSION_ID = /^cs_[A-Za-z0-9]{8,64}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{8,64}$/;
const EVENT_ID = /^evt_[A-Za-z0-9]{8,64}$/;
const HEX64 = /^[0-9a-f]{64}$/i;

type Env = Record<string, string | undefined>;

export interface PayConfig { secretKey: string; webhookSecret: string; live: boolean }

const read = (env: Env, key: string) => (env[key] ?? '').trim();

/**
 * Everything wrong with the two PayMongo settings, one sentence each; empty
 * when both are right or both are unset (online payment off). Names settings,
 * never quotes them.
 */
export function paymentsProblems(env: Env = process.env, production: boolean = isProduction(env)): string[] {
  const key = read(env, 'PAYMONGO_SECRET_KEY');
  const hook = read(env, 'PAYMONGO_WEBHOOK_SECRET');
  if (!key && !hook) return [];
  const p: string[] = [];
  if (!key) p.push('PAYMONGO_WEBHOOK_SECRET is set but PAYMONGO_SECRET_KEY is not. Set both to take payments online, or neither.');
  if (!hook) p.push('PAYMONGO_SECRET_KEY is set but PAYMONGO_WEBHOOK_SECRET is not: nothing could confirm a payment. Set both, or neither.');
  if (key && !/^sk_(live|test)_[A-Za-z0-9]+$/.test(key)) {
    p.push('PAYMONGO_SECRET_KEY is not a PayMongo secret key (sk_live_… or sk_test_…, under Developers → API keys). The public key (pk_…) is not it.');
  }
  if (hook && !/^whsk_[A-Za-z0-9]+$/.test(hook)) {
    p.push('PAYMONGO_WEBHOOK_SECRET is not a webhook secret (whsk_…). PayMongo shows it when the webhook endpoint is added.');
  }
  if (production && key.startsWith('sk_test_')) {
    p.push('PAYMONGO_SECRET_KEY is a test key on the production server. A test payment moves no money but would mark a real invoice paid. Use the live key and the live webhook\'s secret.');
  }
  if (!production && key.startsWith('sk_live_')) {
    p.push('PAYMONGO_SECRET_KEY is a live key outside production. A payment made here would take real money for a test invoice. Use the test key (sk_test_…) on this machine.');
  }
  return p;
}

let told = '';
/** The settings when online payment can run, or null. Says once in the log why not, when they are set but wrong. */
export function payConfig(env: Env = process.env, production: boolean = isProduction(env)): PayConfig | null {
  const problems = paymentsProblems(env, production);
  if (problems.length) {
    const line = problems.join(' ');
    if (line !== told) { told = line; console.error(`[payments] Online payment is off. ${line}`); }
    return null;
  }
  const secretKey = read(env, 'PAYMONGO_SECRET_KEY');
  const webhookSecret = read(env, 'PAYMONGO_WEBHOOK_SECRET');
  if (!secretKey || !webhookSecret) return null;
  return { secretKey, webhookSecret, live: secretKey.startsWith('sk_live_') };
}

/** Can a clinic pay online right now: billing is final and PayMongo is set up. What the Pay now button waits for. */
export function onlinePayReady(): boolean {
  return BILLING_FINAL && payConfig() !== null;
}

/** '1990.50' (a numeric from Postgres) → 199050. Exact, no floating point. NaN when it is not a peso amount. */
export function toCentavos(amount: string | number): number {
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(amount).trim());
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

// ---------------------------------------------------------------------------
// Talking to PayMongo.
// ---------------------------------------------------------------------------

class GatewayError extends Error {}

async function call(cfg: PayConfig, method: 'GET' | 'POST', path: string, body?: unknown, extra: Record<string, string> = {}, timeoutMs = 10_000): Promise<any> {
  let res: Response;
  try {
    res = await fetch(PAYMONGO_API + path, {
      method,
      headers: {
        authorization: 'Basic ' + Buffer.from(`${cfg.secretKey}:`).toString('base64'),
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new GatewayError(`${method} ${path.replace(/cs_\w+/, 'cs_…')}: no answer (${(e as Error).name})`);
  }
  let json: any = null;
  try { json = await res.json(); } catch { /* reported below */ }
  if (!res.ok) {
    // Codes only: PayMongo's `detail` is for us, and a log is not the place for everything in it.
    const codes = Array.isArray(json?.errors) ? json.errors.map((e: any) => String(e?.code ?? '?')).join(', ') : 'no error body';
    throw new GatewayError(`${method} ${path.replace(/cs_\w+/, 'cs_…')}: ${res.status} (${codes})`);
  }
  return json;
}

/** Where PayMongo may send the browser: its own checkout page over https, nowhere else. */
function checkoutUrlOk(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && (url.hostname === 'paymongo.com' || url.hostname.endsWith('.paymongo.com'));
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Opening a checkout.
// ---------------------------------------------------------------------------

export type CheckoutResult =
  | { ok: true; url: string; sessionId: string; number: string }
  /** off: billing not final or PayMongo not set up. not_due: paid, cancelled, or not this group's. gateway: PayMongo did not open one. */
  | { ok: false; reason: 'off' | 'not_due' | 'gateway'; number?: string };

/**
 * Open a PayMongo Checkout Session for one due invoice of this group and
 * record it on the invoice. `origin` is this site's own (https://flossify.ph
 * behind the proxy); PayMongo sends the browser back to the group's billing
 * page with ?paid=<number> or ?unpaid=<number>. Nothing is charged here.
 */
export async function startCheckout(o: { invoiceId: string; groupId: string; slug: string; origin: string; staffId: string }): Promise<CheckoutResult> {
  if (!BILLING_FINAL) return { ok: false, reason: 'off' };
  const cfg = payConfig();
  if (!cfg) return { ok: false, reason: 'off' };

  const { rows } = await pool.query(
    `select id, number, amount::text as amount, period_start::text as period_start, branches
       from subscription_invoice where id = $1 and group_id = $2 and status = 'due'`, [o.invoiceId, o.groupId]);
  const inv = rows[0] as { id: string; number: string; amount: string; period_start: string; branches: number } | undefined;
  if (!inv) return { ok: false, reason: 'not_due' };
  const centavos = toCentavos(inv.amount);
  if (!Number.isSafeInteger(centavos) || centavos <= 0) return { ok: false, reason: 'not_due', number: inv.number };

  const back = `${o.origin}/c/${encodeURIComponent(o.slug)}/settings/billing/`;
  const ref = encodeURIComponent(inv.number);
  const body = {
    data: {
      attributes: {
        line_items: [{
          name: `Flossify, ${monthText(inv.period_start)}`,
          description: `Invoice ${inv.number}, ${inv.branches} branch${inv.branches === 1 ? '' : 'es'}`,
          amount: centavos,
          currency: 'PHP',
          quantity: 1,
        }],
        payment_method_types: [...METHODS],
        description: `Flossify invoice ${inv.number}`,
        reference_number: inv.number,
        metadata: { invoice_id: inv.id, invoice_number: inv.number },
        success_url: `${back}?paid=${ref}`,
        cancel_url: `${back}?unpaid=${ref}`,
        show_description: true,
        show_line_items: true,
      },
    },
  };

  let json: any;
  try {
    // A fresh key per press: two presses are two sessions, and both lead to this invoice (024 keeps them all).
    json = await call(cfg, 'POST', '/v2/checkout_sessions', body, { 'idempotency-key': randomUUID() });
  } catch (e) {
    console.error(`[payments] could not open a checkout for ${inv.number}: ${(e as Error).message}`);
    return { ok: false, reason: 'gateway', number: inv.number };
  }
  const sessionId = json?.data?.id;
  const url = json?.data?.attributes?.checkout_url;
  const live = json?.data?.attributes?.livemode;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId) || !checkoutUrlOk(url) || live !== cfg.live) {
    console.error(`[payments] PayMongo's answer for ${inv.number} was not a usable checkout session (id, https checkout_url on paymongo.com, livemode ${cfg.live}).`);
    return { ok: false, reason: 'gateway', number: inv.number };
  }

  const { rows: rec } = await pool.query('select billing_checkout_start($1, $2, $3, $4, $5, $6) as ok',
    [inv.id, o.groupId, sessionId, centavos, live, o.staffId]);
  if (!rec[0]?.ok) {
    // Paid or cancelled a moment ago. Close the session so nobody can pay it; best effort.
    await call(cfg, 'POST', `/v1/checkout_sessions/${sessionId}/expire`, {}).catch(() => {});
    return { ok: false, reason: 'not_due', number: inv.number };
  }
  // A new payment replaces the older ones: close them, so an old tab cannot be paid as well. Not awaited.
  void closeCheckouts({ invoiceId: inv.id, keep: sessionId });
  return { ok: true, url, sessionId, number: inv.number };
}

/**
 * Close (expire) an invoice's PayMongo checkouts from the last week, all but
 * `keep`: after the invoice is paid (online or by hand), or when a newer
 * checkout replaces them. Best effort, and never throws: a checkout that is
 * already paid or expired just refuses, and a payment that gets through anyway
 * is still recorded (billing_paid_online) and reaches operations. Give the
 * invoice, or `keep` alone for "the invoice that checkout belongs to".
 * Resolves to how many it asked PayMongo to close.
 */
export async function closeCheckouts(o: { invoiceId?: string | null; keep?: string | null }): Promise<number> {
  try {
    const cfg = payConfig();
    if (!cfg) return 0;
    const { rows } = await pool.query(
      `select session_id from subscription_checkout
        where invoice_id = coalesce($1::uuid, (select invoice_id from subscription_checkout where session_id = $2::text))
          and session_id is distinct from $2::text and livemode = $3
          and created_at > now() - interval '7 days'
        order by created_at desc limit 10`, [o.invoiceId ?? null, o.keep ?? null, cfg.live]);
    await Promise.all(rows.map((r: { session_id: string }) =>
      call(cfg, 'POST', `/v1/checkout_sessions/${r.session_id}/expire`, {}, {}, 4_000)
        .catch((e) => console.error(`[payments] could not close an older checkout: ${(e as Error).message}`))));
    return rows.length;
  } catch (e) {
    console.error(`[payments] closing older checkouts failed: ${(e as Error).message}`);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// The webhook.
// ---------------------------------------------------------------------------

export type SignatureCheck = 'ok' | 'missing' | 'bad' | 'stale';

/**
 * Check a Paymongo-Signature header against the raw body: HMAC-SHA256 of
 * "<t>.<body>" with the webhook secret, compared in constant time with the
 * live (li) or test (te) signature, whichever this server's key is for. A
 * timestamp more than SIGNATURE_TOLERANCE_S from now is 'stale'.
 */
export function verifySignature(raw: string | Uint8Array, header: string | null, secret: string, live: boolean, nowMs: number = Date.now()): SignatureCheck {
  if (!header || !secret) return 'missing';
  const parts: Record<string, string> = {};
  for (const piece of header.split(',')) {
    const eq = piece.indexOf('=');
    if (eq > 0) parts[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }
  const t = parts.t ?? '';
  const given = parts[live ? 'li' : 'te'] ?? '';
  if (!/^\d{1,12}$/.test(t) || !HEX64.test(given)) return 'bad';
  // Over the bytes as they arrived: a string is taken as its UTF-8, which is what was sent.
  const want = createHmac('sha256', secret).update(`${t}.`).update(raw).digest();
  if (!timingSafeEqual(want, Buffer.from(given, 'hex'))) return 'bad';
  if (Math.abs(nowMs / 1000 - Number(t)) > SIGNATURE_TOLERANCE_S) return 'stale';
  return 'ok';
}

/** What billing_paid_online() did, in its words (see 024). */
export type Outcome =
  | 'paid' | 'duplicate' | 'already_paid' | 'no_payment' | 'unreadable' | 'unknown_session'
  | 'wrong_mode' | 'wrong_amount' | 'wrong_invoice' | 'paid_twice' | 'not_due';

/** Outcomes where money may have moved and no invoice took it: operations has to look. */
export const NEEDS_LOOK_LIST = ['unreadable', 'unknown_session', 'wrong_mode', 'wrong_amount', 'wrong_invoice', 'paid_twice', 'not_due'];
export const NEEDS_LOOK: ReadonlySet<string> = new Set(NEEDS_LOOK_LIST);

/** One sentence per outcome, for the operations page. */
export const OUTCOME_WORDS: Record<string, string> = {
  paid: 'Marked paid.',
  already_paid: 'Already marked paid with this payment.',
  no_payment: 'No paid payment on the session yet.',
  unreadable: 'PayMongo said this checkout was paid, but the payment could not be read. Find the checkout in the PayMongo dashboard, and mark the invoice by hand if it was paid.',
  unknown_session: 'A payment on a checkout Flossify has no record of.',
  wrong_mode: 'A test payment for a live checkout, or the reverse.',
  wrong_amount: 'The amount paid is not the invoice’s amount.',
  wrong_invoice: 'The checkout names a different invoice.',
  paid_twice: 'The invoice was marked paid before this payment came. If that mark was for this same payment, press Handled. If the clinic paid twice, return one payment, then press Handled.',
  not_due: 'The invoice was cancelled before this payment. Return it, or apply it by hand.',
};

interface Paid { id: string | null; amount: number | null; currency: string | null; livemode: boolean | null }

/** The first paid payment on a checkout session resource, or nulls. */
function paidPayment(session: any): Paid {
  const list = Array.isArray(session?.attributes?.payments) ? session.attributes.payments : [];
  const p = list.find((x: any) => x?.attributes?.status === 'paid' && typeof x?.id === 'string' && PAYMENT_ID.test(x.id));
  if (!p) return { id: null, amount: null, currency: null, livemode: null };
  const a = p.attributes;
  return {
    id: p.id,
    amount: Number.isSafeInteger(a.amount) ? a.amount : null,
    currency: typeof a.currency === 'string' ? a.currency : null,
    livemode: typeof a.livemode === 'boolean' ? a.livemode : null,
  };
}

async function settle(eventId: string, kind: string, session: any, fallbackLive: boolean): Promise<Outcome> {
  const sid = typeof session?.id === 'string' && SESSION_ID.test(session.id) ? session.id as string : null;
  const pay = paidPayment(session);
  const ref = session?.attributes?.reference_number;
  const { rows } = await pool.query('select billing_paid_online($1, $2, $3, $4, $5, $6, $7, $8) as outcome', [
    eventId, kind, sid, pay.id, pay.amount, pay.currency, pay.livemode ?? fallbackLive,
    typeof ref === 'string' && ref ? ref.slice(0, 120) : null,
  ]);
  const outcome = rows[0].outcome as Outcome;
  if (NEEDS_LOOK.has(outcome)) console.error(`[payments] ${outcome}: ${eventId}, session ${sid ?? 'none'}, payment ${pay.id ?? 'none'}. See /admin/billing/, Online payments to look at.`);
  // Paid: nothing else should take money for this invoice. Not awaited, so PayMongo gets its answer at once.
  if (outcome === 'paid' && sid) void closeCheckouts({ keep: sid });
  return outcome;
}

export interface WebhookAnswer { status: number; body: Record<string, unknown> }

/**
 * One delivery to POST /api/payments/webhook. Verifies the signature on the
 * raw body before reading anything in it, then acts on
 * checkout_session.payment.paid through billing_paid_online(), once per event
 * id. Every verified event gets a 200 with a JSON body, including one it
 * ignores or refuses: PayMongo retries anything else, and a refused payment
 * does not become right on the twelfth try. The refusal is recorded for
 * operations instead. An unsigned, badly signed or stale delivery gets 401
 * and touches nothing; a server with online payment off answers 503.
 */
export async function receiveWebhook(raw: string | Uint8Array, signature: string | null, nowMs: number = Date.now()): Promise<WebhookAnswer> {
  const cfg = payConfig();
  if (!cfg) return { status: 503, body: { error: 'Online payment is not set up on this server.' } };

  const check = verifySignature(raw, signature, cfg.webhookSecret, cfg.live, nowMs);
  if (check !== 'ok') return { status: 401, body: { error: check === 'stale' ? 'Signature too old.' : 'Signature does not match.' } };

  let doc: any;
  try { doc = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return { status: 400, body: { error: 'Not JSON.' } }; }
  const ev = doc?.data;
  const a = ev?.attributes;
  if (!ev || typeof ev.id !== 'string' || !EVENT_ID.test(ev.id) || !a || typeof a !== 'object') {
    return { status: 400, body: { error: 'Not a PayMongo event.' } };
  }
  if (a.livemode !== cfg.live) return { status: 200, body: { received: true, ignored: 'mode' } };
  if (a.type !== PAID_EVENT) return { status: 200, body: { received: true, ignored: 'type' } };
  // A paid event is always recorded, even one whose checkout or payment cannot be
  // read: PayMongo says money moved, so it goes on operations' list ('unreadable',
  // or 'unknown_session' with a payment and no checkout of ours) instead of vanishing.
  const outcome = await settle(ev.id, PAID_EVENT, a.data ?? null, cfg.live);
  return { status: 200, body: { received: true, outcome } };
}

// ---------------------------------------------------------------------------
// Asking PayMongo, for the billing page.
// ---------------------------------------------------------------------------

/**
 * What asking PayMongo about one invoice found:
 *   paid      the invoice is paid with a PayMongo payment (just now, or already)
 *   refused   PayMongo has a payment the invoice did not take; it is on
 *             operations' list (billing_open_refusals says which)
 *   unpaid    PayMongo answered: no paid payment on any checkout asked about
 *   noanswer  PayMongo did not answer in time
 *   busy      this group was asked about too often in the last minute (CONFIRM_LIMIT)
 *   none      nothing to ask about: no checkout of that invoice in the window
 *             that has not already been reported
 *   off       online payment is not set up on this server
 */
export type Asked = 'paid' | 'refused' | 'unpaid' | 'noanswer' | 'busy' | 'none' | 'off';

/**
 * Ask PayMongo about one invoice of this group (by number): each of its
 * checkouts from the last `days` that nothing has reported a payment for yet,
 * at most six, in parallel, four seconds each. A paid one is settled the
 * webhook's way (event id check:<payment id>, so asking twice is one record).
 * The invoice may already be paid: a second payment from an older tab is then
 * recorded as paid_twice and reaches operations.
 *
 * Called when the owner comes back from PayMongo (?paid=<number>) or presses
 * Check again, and from operations' Check with PayMongo. Never on a plain view
 * of the page, and at most CONFIRM_LIMIT times a minute per group, because
 * PayMongo's rate limit covers every clinic at once. PayMongo not answering is
 * not an error here; the page says so.
 */
export async function confirmPending(groupId: string, invoiceNumber: string, days: number = CONFIRM_WITHIN_DAYS): Promise<Asked> {
  const cfg = payConfig();
  if (!cfg) return 'off';
  const { rows: found } = await pool.query('select id from subscription_invoice where group_id = $1 and number = $2', [groupId, invoiceNumber]);
  const invoiceId = found[0]?.id as string | undefined;
  if (!invoiceId) return 'none';
  const { rows } = await pool.query('select session_id from billing_sessions_to_check($1, $2, $3)', [invoiceId, cfg.live, days]);
  if (rows.length === 0) return 'none';
  if (!(await hit('payconfirm:g:' + groupId, ...CONFIRM_LIMIT)).allowed) return 'busy';

  const results: Asked[] = await Promise.all(rows.map(async (r: { session_id: string }): Promise<Asked> => {
    try {
      const json = await call(cfg, 'GET', `/v1/checkout_sessions/${r.session_id}`, undefined, {}, 4_000);
      const s = json?.data;
      if (!s || s.id !== r.session_id) return 'noanswer';
      const pay = paidPayment(s);
      if (!pay.id) return 'unpaid';
      const outcome = await settle(`check:${pay.id}`, 'checkout_session.checked', s, cfg.live);
      if (outcome === 'paid' || outcome === 'already_paid') return 'paid';
      if (NEEDS_LOOK.has(outcome)) return 'refused';
      if (outcome === 'duplicate') {
        // Recorded a moment ago (the webhook and this raced). The invoice says which way it went.
        const { rows: inv } = await pool.query('select status, paid_ref from subscription_invoice where id = $1', [invoiceId]);
        return inv[0]?.status === 'paid' && String(inv[0]?.paid_ref ?? '').includes(pay.id) ? 'paid' : 'refused';
      }
      return 'unpaid';
    } catch (e) {
      if (!(e instanceof GatewayError)) throw e;
      console.error(`[payments] could not ask about a checkout for ${invoiceNumber}: ${e.message}`);
      return 'noanswer';
    }
  }));
  for (const k of ['refused', 'paid', 'unpaid'] as const) if (results.includes(k)) return k;
  return 'noanswer';
}

// ---------------------------------------------------------------------------
// Reads for the two billing pages.
// ---------------------------------------------------------------------------

/** Which of these invoices PayMongo confirmed (paid_via 'paymongo'), by id. */
export async function paidOnline(invoiceIds: string[]): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set();
  const { rows } = await pool.query(`select id from subscription_invoice where id = any($1::uuid[]) and paid_via = 'paymongo'`, [invoiceIds]);
  return new Set(rows.map((r: { id: string }) => r.id));
}

/**
 * Payments under way: for each of these invoices, when the newest checkout was
 * opened among those from the last `days` that nothing has reported a payment
 * for yet (billing_sessions_to_check, this server's mode). The owner's page
 * shows Check again instead of Pay now for these.
 */
export async function pendingCheckouts(invoiceIds: string[], days: number = CONFIRM_WITHIN_DAYS): Promise<Map<string, Date>> {
  const cfg = payConfig();
  if (!cfg || invoiceIds.length === 0) return new Map();
  const { rows } = await pool.query(
    `select x.id as invoice_id, max(s.created_at) as at
       from unnest($1::uuid[]) as x(id) cross join lateral billing_sessions_to_check(x.id, $2, $3) s
      group by x.id`, [invoiceIds, cfg.live, days]);
  return new Map(rows.map((r: { invoice_id: string; at: Date }) => [r.invoice_id, r.at]));
}

/** When an online payment was last started for each of these invoices, by id (every mode, any age). */
export async function checkoutsStarted(invoiceIds: string[]): Promise<Map<string, Date>> {
  if (invoiceIds.length === 0) return new Map();
  const { rows } = await pool.query(
    `select invoice_id, max(created_at) as at from subscription_checkout where invoice_id = any($1::uuid[]) group by invoice_id`, [invoiceIds]);
  return new Map(rows.map((r: { invoice_id: string; at: Date }) => [r.invoice_id, r.at]));
}

/**
 * The group's refused online payments nobody on operations has handled yet,
 * newest per invoice: invoice id → outcome. The owner's page keeps saying so,
 * and shows no Pay now on that invoice, until operations press Handled.
 */
export async function openRefusals(groupId: string): Promise<Map<string, { outcome: Outcome; at: Date }>> {
  const { rows } = await pool.query('select invoice_id, outcome, received_at from billing_open_refusals($1, $2)', [groupId, NEEDS_LOOK_LIST]);
  const m = new Map<string, { outcome: Outcome; at: Date }>();
  for (const r of rows as { invoice_id: string; outcome: Outcome; received_at: Date }[]) if (!m.has(r.invoice_id)) m.set(r.invoice_id, { outcome: r.outcome, at: r.received_at });
  return m;
}

/** The groups whose most recent paid invoice was paid online: "paid online" under Last paid on the operations page. */
export async function lastPaidOnline(): Promise<Set<string>> {
  const { rows } = await pool.query(
    `select group_id from (
       select distinct on (group_id) group_id, paid_via from subscription_invoice
        where status = 'paid' order by group_id, paid_at desc nulls last) t
      where paid_via = 'paymongo'`);
  return new Set(rows.map((r: { group_id: string }) => r.group_id));
}

export interface OnlineEvent {
  event_id: string; received_at: Date; kind: string; outcome: string; session_id: string | null; payment_id: string | null;
  amount_centavos: number | null; invoice_id: string | null; invoice_number: string | null; invoice_amount: number | null;
  invoice_status: string | null; paid_at: Date | null; paid_ref: string | null;
  /** How the invoice was paid: 'paymongo', or null for a person marking it. */
  paid_via: string | null;
  group_id: string | null; group_name: string | null;
  /** When a person on operations said a refused payment was dealt with; null while it is on their list. */
  reviewed_at: Date | null;
}

/**
 * Recorded online payment events, newest first (admin_online_payments, 024).
 * `outcomes` keeps only those; `openOnly` keeps only the ones nobody has
 * handled; `limit` null is every one.
 */
export async function onlineEvents(o: { limit?: number | null; outcomes?: readonly string[] | null; openOnly?: boolean } = {}): Promise<OnlineEvent[]> {
  const { rows } = await pool.query('select * from admin_online_payments($1, $2, $3)',
    [o.limit === undefined ? 100 : o.limit, o.outcomes ? [...o.outcomes] : null, o.openOnly ?? false]);
  return rows.map((r: any) => ({
    ...r,
    amount_centavos: r.amount_centavos === null ? null : Number(r.amount_centavos),
    invoice_amount: r.invoice_amount === null ? null : Number(r.invoice_amount),
  }));
}

/** Refused payments nobody has handled, every one of them, one row per PayMongo payment (the webhook and the page asking can both report one). */
export async function paymentsToLookAt(): Promise<(OnlineEvent & { reports: number })[]> {
  const all = await onlineEvents({ limit: null, outcomes: NEEDS_LOOK_LIST, openOnly: true });
  const byPayment = new Map<string, OnlineEvent & { reports: number }>();
  for (const e of all) {
    const key = e.payment_id ?? e.event_id;
    const seen = byPayment.get(key);
    if (seen) seen.reports++;
    else byPayment.set(key, { ...e, reports: 1 });
  }
  return [...byPayment.values()];
}

/** "Thu 24 Sep, 4:58 pm", Manila time: when a payment was started. */
export function momentText(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h12',
  }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toLowerCase()}`;
}

/** Take a refused payment off operations' list (with every other report of the same payment), once it has been refunded or applied by hand. False when it was not on the list. */
export async function markReviewed(eventId: string, staffId: string): Promise<boolean> {
  const { rows } = await pool.query('select admin_payment_reviewed($1, $2) as ok', [eventId, staffId]);
  return rows[0]?.ok === true;
}
