// The sender. Runs beside the web server, not inside it: `npm run sms:worker`
// loops every ten seconds; `npm run sms:once` does one pass and exits, for a
// cron line or a check by hand.
//
// It never touches message_log directly. It has no tenant, so row-level
// security would show it nothing; instead it calls the three security-definer
// functions from migration 005 and nothing else: sms_enqueue_reminders()
// writes tomorrow's reminders, sms_claim_due(n) hands over due rows already
// marked 'sending' so a second worker cannot take them, and sms_mark() records
// what the provider said. A crash between claim and mark leaves a row in
// 'sending', on purpose: a text that may have gone out is not sent twice.
//
// Quiet hours. Reminders and the desk's own texts wait
// for 8 am Manila and stop at 9 pm. Codes (reset, invite) go out at any hour;
// the person is sitting there waiting for one.
//
// Log lines all start with "[sms] ": one per outcome, one per pass of the
// reminder pass, and the console provider's own "[sms] → number (kind) body".
//
// Email. When EMAIL_PROVIDER is set (src/lib/email.ts) the same pass sends
// the queued emails too: rows in the same message_log with channel 'email',
// claimed through email_claim_due() (023) and marked through the same
// sms_mark(), with the same four tries and the same back-off. No quiet hours:
// the only emails are sign-in codes, and the person is waiting for one. The
// emails drain beside the texts, not after them, so a slow text service never
// holds a code email back. Each
// try carries the row's id as the idempotency key, so a try that timed out
// after the service took it is not sent twice. Email outcomes log under
// "[email] ", with the address shortened (li…@example.com). With
// EMAIL_PROVIDER unset the worker claims no email rows and says so once.
//
// Settings. Before anything else the worker runs the same check as the web
// server (assertEnv('worker') in src/lib/env.ts): with NODE_ENV=production it
// refuses to start on the development database password or console texts,
// listing every problem under "[env] "; anywhere else it warns and carries on.
//
// Billing. Invoices are issued here, once a pass, only when BILLING_FINAL
// (src/lib/billing-config.ts) is true. Until the prices are real it says so
// once when it starts and issues nothing.

import pg from 'pg';
import { providerFromEnv, localNumber, type SmsProvider } from '../../src/lib/sms.ts';
import { emailProviderFromEnv, maskEmail, type EmailProvider } from '../../src/lib/email.ts';
import { assertEnv } from '../../src/lib/env.ts';
import { BILLING_FINAL } from '../../src/lib/billing-config.ts';

const ONCE = process.argv.includes('--once');
const TICK_MS = 10_000;
const ENQUEUE_EVERY_MS = 10 * 60_000;
const BATCH = 20;
/** How many batches one tick may drain before letting the loop breathe. */
const BATCHES_PER_TICK = 25;
/** Wait after the first, second and third failed try; the fourth is final. */
const BACKOFF = ['1 minute', '5 minutes', '30 minutes'];
const MAX_ATTEMPTS = 4;
const QUIET_KINDS = new Set(['reminder', 'manual']);
const QUIET_FROM = 21; // 9 pm Manila
const QUIET_UNTIL = 8; // 8 am Manila

interface Claimed { id: string; clinic_id: string; to_address: string; body: string; kind: string | null; attempts: number }
interface ClaimedEmail extends Claimed { subject: string }

// Before the pool: a production worker must not connect with settings the web server would refuse.
try {
  assertEnv('worker');
} catch (e) {
  // A refusal has already printed every problem under "[env] ".
  if ((e as Error).name !== 'FlossifyConfigError') console.error(`[sms] ${(e as Error).message}`);
  console.error('[sms] not starting: fix the settings above and start the worker again.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[sms] DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}
// DATABASE_SSL=1: TLS without certificate verification, as src/lib/db.ts does
// (an sslmode on the URL wins). Without it a TLS-only managed Postgres refuses
// every pass, and no text and no retention purge ever runs.
const pool = new pg.Pool({
  connectionString: url,
  max: 2,
  ssl: (process.env.DATABASE_SSL ?? '').trim() === '1' ? { rejectUnauthorized: false } : undefined,
});
pool.on('error', (e) => log(`pool: ${e.message}`));

function log(line: string) {
  console.log(`[sms] ${line}`);
}
function logEmail(line: string) {
  console.log(`[email] ${line}`);
}

/** 0917 000 0000, for the log. */
function pretty(to: string) {
  const n = localNumber(to);
  return /^09\d{9}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : to;
}

// --- Manila time ------------------------------------------------------------

const manila = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function manilaHourMinute(now = new Date()) {
  const parts = manila.formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { h: h === 24 ? 0 : h, m };
}

/** Minutes until the next 8 am Manila, or 0 when texts may go out now. Seconds are dropped, so the answer is never short of 08:00. */
function minutesUntilOpen(now = new Date()): number {
  const { h, m } = manilaHourMinute(now);
  if (h >= QUIET_UNTIL && h < QUIET_FROM) return 0;
  const sinceMidnight = h * 60 + m;
  const open = QUIET_UNTIL * 60;
  return h < QUIET_UNTIL ? open - sinceMidnight : 24 * 60 - sinceMidnight + open;
}

/** 432 → '7 hours 12 minutes': what Postgres reads as an interval. */
function intervalText(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const parts = [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} minute${m === 1 ? '' : 's'}` : ''].filter(Boolean);
  return parts.join(' ') || '1 minute';
}

// --- The database, through its three functions --------------------------------

async function enqueueReminders() {
  const { rows } = await pool.query('select sms_enqueue_reminders() as n');
  log(`reminders queued: ${rows[0].n}`);
  // Retention rides along too: text logs older than two years go, as the privacy notice says, and
  // patient forms (028) nobody added go 30 days after they were sent.
  try { const r = await pool.query('select retention_purge() as n'); if (r.rows[0].n) log(`retention: ${r.rows[0].n} old rows deleted (texts, patient forms)`); } catch (e) { log(`retention pass failed: ${(e as Error).message}`); }
  // Billing rides along: once a pass, issue the month's invoices and flip past-due states (idempotent).
  // Not while the prices are placeholders (BILLING_FINAL); main() says so once.
  if (BILLING_FINAL) {
    try { const inv = await pool.query("select billing_issue_invoices((now() at time zone 'Asia/Manila')::date) as n"); if (inv.rows[0].n) log(`invoices issued: ${inv.rows[0].n}`); } catch (e) { log(`billing pass failed: ${(e as Error).message}`); }
  }
}

async function claim(): Promise<Claimed[]> {
  const { rows } = await pool.query('select id, clinic_id, to_address, body, kind, attempts from sms_claim_due($1)', [BATCH]);
  return rows as Claimed[];
}

async function claimEmail(): Promise<ClaimedEmail[]> {
  const { rows } = await pool.query('select id, clinic_id, to_address, subject, body, kind, attempts from email_claim_due($1)', [BATCH]);
  return rows as ClaimedEmail[];
}

/** Records what happened to a text or an email: sms_mark() marks any row by id, whatever its channel. */
async function mark(id: string, status: 'sent' | 'queued' | 'failed', ref: string | null, error: string | null, retryIn: string | null) {
  await pool.query('select sms_mark($1, $2, $3, $4, $5::interval)', [id, status, ref, error, retryIn]);
}

// --- One text -----------------------------------------------------------------

async function deliver(provider: SmsProvider, m: Claimed) {
  const tag = `${m.id.slice(0, 8)} → ${pretty(m.to_address)} (${m.kind ?? 'text'})`;
  try {
    if (QUIET_KINDS.has(m.kind ?? '')) {
      const wait = minutesUntilOpen();
      if (wait > 0) {
        const until = intervalText(wait);
        await mark(m.id, 'queued', null, null, until);
        log(`held ${tag} until 8 am Manila, in ${until}`);
        return;
      }
    }
    let r;
    try {
      r = await provider.send(m.to_address, m.body, m.kind ?? undefined);
    } catch (e) {
      // A provider that throws instead of answering is a retryable failure, not a crash.
      r = { ok: false, error: `Provider threw: ${(e as Error).message}`, retryable: true };
    }
    if (r.ok) {
      await mark(m.id, 'sent', r.ref ?? null, null, null);
      log(`sent ${tag} ref ${r.ref ?? '—'}`);
      return;
    }
    const error = (r.error ?? 'The provider gave no reason.').slice(0, 500);
    if (r.retryable && m.attempts < MAX_ATTEMPTS) {
      const wait = BACKOFF[Math.min(Math.max(m.attempts - 1, 0), BACKOFF.length - 1)];
      await mark(m.id, 'queued', null, error, wait);
      log(`retry ${tag} in ${wait}: ${error}`);
    } else {
      await mark(m.id, 'failed', null, error, null);
      log(`failed ${tag}: ${error}`);
    }
  } catch (e) {
    // The database, not the provider. The row stays 'sending' for a person to look at; the loop goes on.
    log(`could not record ${tag}: ${(e as Error).message}`);
  }
}

// --- One email ----------------------------------------------------------------

async function deliverEmail(provider: EmailProvider, m: ClaimedEmail) {
  const tag = `${m.id.slice(0, 8)} → ${maskEmail(m.to_address)} (${m.kind ?? 'email'})`;
  try {
    let r;
    try {
      r = await provider.send({ to: m.to_address, subject: m.subject, body: m.body, kind: m.kind ?? undefined, idempotencyKey: `flossify-${m.id}` });
    } catch (e) {
      r = { ok: false, error: `Provider threw: ${(e as Error).message}`, retryable: true };
    }
    if (r.ok) {
      await mark(m.id, 'sent', r.ref ?? null, null, null);
      logEmail(`sent ${tag} ref ${r.ref ?? '—'}`);
      return;
    }
    const error = (r.error ?? 'The provider gave no reason.').slice(0, 500);
    if (r.retryable && m.attempts < MAX_ATTEMPTS) {
      const wait = BACKOFF[Math.min(Math.max(m.attempts - 1, 0), BACKOFF.length - 1)];
      await mark(m.id, 'queued', null, error, wait);
      logEmail(`retry ${tag} in ${wait}: ${error}`);
    } else {
      await mark(m.id, 'failed', null, error, null);
      logEmail(`failed ${tag}: ${error}`);
    }
  } catch (e) {
    // The database, not the provider. The row stays 'sending' for a person to look at; the loop goes on.
    logEmail(`could not record ${tag}: ${(e as Error).message}`);
  }
}

// --- One pass -----------------------------------------------------------------

let lastEnqueue = 0;

async function pass(provider: SmsProvider, mailer: EmailProvider | null) {
  if (Date.now() - lastEnqueue >= ENQUEUE_EVERY_MS) {
    await enqueueReminders();
    lastEnqueue = Date.now();
  }
  // Texts and emails drain side by side, each at its own provider's pace: a text service that hangs
  // (15 s a try) must not hold a reset email until its 15-minute code has died, and that is exactly
  // when a desk chooses "Email me a code". Each drain uses one connection at a time (the pool has two).
  const drains = [drainTexts(provider)];
  if (mailer) drains.push(drainEmails(mailer));
  const settled = await Promise.allSettled(drains);
  // Both have finished what they claimed; a database failure in either is the pass's failure.
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}

async function drainTexts(provider: SmsProvider) {
  for (let round = 0; round < BATCHES_PER_TICK; round++) {
    const batch = await claim();
    // A batch, once claimed, is finished even when a stop was asked for.
    for (const m of batch) await deliver(provider, m);
    if (batch.length < BATCH) break;
  }
}

async function drainEmails(mailer: EmailProvider) {
  for (let round = 0; round < BATCHES_PER_TICK; round++) {
    const batch = await claimEmail();
    for (const m of batch) await deliverEmail(mailer, m);
    if (batch.length < BATCH) break;
  }
}

// --- The loop -----------------------------------------------------------------

let stopping = false;
let wake: (() => void) | null = null;

function stop(signal: string) {
  if (stopping) {
    // Asked twice: the person means now. Whatever is in 'sending' stays there for a look.
    log(`${signal} again: stopping now`);
    process.exit(130);
  }
  stopping = true;
  log(`${signal}: stopping after this batch`);
  wake?.();
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

const sleep = (ms: number) => new Promise<void>((resolve) => {
  const t = setTimeout(() => { wake = null; resolve(); }, ms);
  wake = () => { clearTimeout(t); wake = null; resolve(); };
});

async function main() {
  const provider = providerFromEnv();
  const mailer = emailProviderFromEnv();
  if (!BILLING_FINAL) log('billing: not issuing invoices — BILLING_FINAL is false in src/lib/billing-config.ts');
  if (mailer) logEmail(`sending through ${mailer.name}`);
  else logEmail('off: EMAIL_PROVIDER is not set for this worker, so no email is sent. Any email the web server queues waits until it is.');
  if (ONCE) {
    log(`one pass through ${provider.name}`);
    try {
      await pass(provider, mailer);
    } catch (e) {
      log(`pass failed: ${(e as Error).message}`);
      await pool.end().catch(() => {});
      process.exit(1);
    }
    await pool.end();
    process.exit(0);
  }
  log(`worker up, sending through ${provider.name} every ${TICK_MS / 1000} s`);
  while (!stopping) {
    try {
      await pass(provider, mailer);
    } catch (e) {
      // The database was unreachable or a function is missing. Say so and try again next tick.
      log(`pass failed: ${(e as Error).message}`);
    }
    if (stopping) break;
    await sleep(TICK_MS);
  }
  await pool.end().catch(() => {});
  log('down');
}

main().catch((e) => {
  console.error(`[sms] ${(e as Error).message}`);
  process.exit(1);
});
