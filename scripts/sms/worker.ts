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

import pg from 'pg';
import { providerFromEnv, localNumber, type SmsProvider } from '../../src/lib/sms.ts';

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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[sms] DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 2 });
pool.on('error', (e) => log(`pool: ${e.message}`));

function log(line: string) {
  console.log(`[sms] ${line}`);
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
  // Billing rides along: once a pass, issue the month's invoices and flip past-due states (idempotent).
  try { const inv = await pool.query("select billing_issue_invoices((now() at time zone 'Asia/Manila')::date) as n"); if (inv.rows[0].n) log(`invoices issued: ${inv.rows[0].n}`); } catch (e) { log(`billing pass failed: ${(e as Error).message}`); }
}

async function claim(): Promise<Claimed[]> {
  const { rows } = await pool.query('select id, clinic_id, to_address, body, kind, attempts from sms_claim_due($1)', [BATCH]);
  return rows as Claimed[];
}

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

// --- One pass -----------------------------------------------------------------

let lastEnqueue = 0;

async function pass(provider: SmsProvider) {
  if (Date.now() - lastEnqueue >= ENQUEUE_EVERY_MS) {
    await enqueueReminders();
    lastEnqueue = Date.now();
  }
  for (let round = 0; round < BATCHES_PER_TICK; round++) {
    const batch = await claim();
    // A batch, once claimed, is finished even when a stop was asked for.
    for (const m of batch) await deliver(provider, m);
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
  if (ONCE) {
    log(`one pass through ${provider.name}`);
    try {
      await pass(provider);
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
      await pass(provider);
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
