// Flossify's own pages (/admin/): the gate, what the master page reads, and
// the actions its forms (and the billing sub-page's) carry out.
//
// The gate: a staff session whose owner is in platform_admin, not disabled,
// with a current token version. Checked on every request, like
// requireWorkspace. Admins have no tenant; anything they read across clinics
// goes through a definer function that returns exactly what the page shows
// (009, 011, 024, 027). Patients and bookings are counted, never listed:
// nothing here can return a patient's name, number or record.
//
// Every action is a form post the page has already checked with csrfOk(). A
// billing action is recorded in auth_event ('billing.<action>', with the
// operator's staff id and a detail line naming the invoice or group); a PRC
// mark in the dentist's clinic's audit_log, as before. admin_audit() (027)
// reads both back as the operations log.

import './dotenv';
import type { AstroGlobal } from 'astro';
import { readSession, type Session } from './auth';
import { pool, publicRead, withClinic } from './db';
import { queueText, normalizePhone, PH_MOBILE, texts as wording } from './messages';
import { peso } from '../data/demo';
import {
  PLAN_IDS, SUB_STATUSES, BILLING_FINAL, PLANS,
  allDue, issueInvoices, markPaid, adminSet, manilaToday, monthText,
  type PlanId, type SubStatus,
} from './billing';
import { markReviewed, closeCheckouts, confirmPending, ADMIN_CONFIRM_DAYS, type Asked } from './payments';

export interface Admin { session: Session; name: string; email: string }

export async function requireAdmin(Astro: AstroGlobal): Promise<Admin | Response> {
  const session = readSession(Astro.cookies);
  const next = encodeURIComponent(Astro.url.pathname);
  if (!session) return Astro.redirect(`/auth/login/?next=${next}`);
  const { rows } = await pool.query(
    `select s.full_name, s.email::text as email from platform_admin a join staff s on s.id = a.staff_id
      where a.staff_id = $1 and s.disabled_at is null and s.token_version = $2`, [session.staffId, session.tv ?? 0]);
  if (!rows[0]) return Astro.redirect(`/auth/login/?next=${next}&denied=1`);
  return { session, name: rows[0].full_name, email: rows[0].email ?? '' };
}

/** Who did it, from where: every action records these. */
export interface Actor { staffId: string; ip: string | null; ua: string | null }

/** One line in auth_event for an operator's action, with what it touched. Never throws: the action has happened. */
export async function adminEvent(kind: string, who: Actor, detail: string | null): Promise<void> {
  await pool.query('insert into auth_event (kind, staff_id, ip, user_agent, detail) values ($1, $2, $3, $4, $5)',
    [kind, who.staffId, who.ip || null, who.ua?.slice(0, 300) ?? null, detail?.slice(0, 300) ?? null]).catch(() => {});
}

// ---------------------------------------------------------------------------
// Time, on the Manila clock. The operator is in Manila and so are the clinics.
// ---------------------------------------------------------------------------

const TZ = 'Asia/Manila';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: TZ });
const clockFmt = fmt({ hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
const dayFmt = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const shortDayFmt = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const ymd = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
const parts = (f: Intl.DateTimeFormat, d: Date) => Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));

/** '2:41 pm' */
export const clock = (d: Date) => { const p = parts(clockFmt, d); return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toLowerCase()}`; };
/** '25 Sep 2026' */
export const dateText = (d: Date) => { const p = parts(dayFmt, d); return `${p.day} ${p.month} ${p.year}`; };
/** 'Fri 25 Sep' */
export const shortDay = (d: Date) => { const p = parts(shortDayFmt, d); return `${p.weekday} ${p.day} ${p.month}`; };
/** 'YYYY-MM-DD' on the Manila calendar. */
export const manilaYmd = (d: Date) => { const p = parts(ymd, d); return `${p.year}-${p.month}-${p.day}`; };

/** 'just now', '4 min ago', '3 h ago', 'yesterday', '12 days ago', then the date. */
export function ago(d: Date | null, now: Date = new Date()): string {
  if (!d) return 'never';
  const s = Math.max(0, (now.getTime() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.round((Date.parse(manilaYmd(now)) - Date.parse(manilaYmd(new Date(d)))) / 86_400_000);
  if (days <= 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  return dateText(new Date(d));
}

/** 'today', 'yesterday', '62 days ago': how long since a date, in days, on the Manila calendar. */
export function daysSince(d: Date, now: Date = new Date()): string {
  const k = Math.round((Date.parse(manilaYmd(now)) - Date.parse(manilaYmd(new Date(d)))) / 86_400_000);
  return k <= 0 ? 'today' : k === 1 ? 'yesterday' : `${k.toLocaleString('en-PH')} days ago`;
}

/** Whole days from now until d (negative when past), on the Manila calendar. */
export const daysUntil = (d: Date, now: Date = new Date()) =>
  Math.round((Date.parse(manilaYmd(new Date(d))) - Date.parse(manilaYmd(now))) / 86_400_000);

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

export interface Control {
  clinics_total: number; clinics_listed: number; clinics_this_month: number;
  branches_trial: number; branches_trial_ending_7d: number; branches_trial_ended: number;
  branches_active: number; branches_past_due: number; branches_cancelled: number; branches_no_plan: number;
  staff_total: number; staff_owners: number; staff_dentists: number; staff_desk: number; staff_invited: number;
  patients_total: number; patients_this_month: number;
  visits_today: number; visits_next_7d: number; bookings_made_7d: number; bookings_web_7d: number;
  texts_queued: number; texts_overdue: number; texts_overdue_since: Date | null; texts_sending: number;
  texts_failed_7d: number; texts_sent_24h: number; last_sent_at: Date | null;
  /** When the text sender last asked for work (027's heartbeat, stamped by its claim every pass); null until it has run once since 027. */
  sender_beat_at: Date | null;
  prc_pending: number; prc_mismatch: number;
}
/** The numbers across the service (admin_control, 027): counts, never rows. */
export async function control(): Promise<Control> {
  return (await publicRead<Control>('select * from admin_control()'))[0];
}

export interface ClinicRow {
  id: string; name: string; slug: string; area: string | null; city: string | null; province: string | null; created_at: Date;
  listed: boolean; booking_mode: string;
  group_id: string; group_name: string; group_branches: number;
  plan_status: SubStatus | null; trial_ends_at: Date | null; price_per_branch: number | null;
  due_count: number; due_amount: number;
  owner_name: string | null; owner_email: string | null; owner_phone: string | null;
  dentists: number; team: number; invited: number;
  patients: number; bookings_30d: number; bookings_web_30d: number;
  visits_today: number; visits_next_7d: number;
  texts_failed_7d: number; texts_queued: number;
  prc_pending: number; hours_days: number; services: number; photos: number;
  last_signin: Date | null; last_activity: Date | null;
}
/** One row per clinic, newest first (admin_clinic_rows, 027). */
export async function clinicRows(): Promise<ClinicRow[]> {
  const rows = await publicRead<ClinicRow>('select * from admin_clinic_rows()');
  return rows.map((r) => ({
    ...r,
    price_per_branch: r.price_per_branch === null ? null : Number(r.price_per_branch),
    due_amount: Number(r.due_amount),
  }));
}

/** A clinic is inactive when nobody has signed in, booked, changed a record or added a patient there in this many days. */
export const QUIET_DAYS = 14;
export const isQuiet = (r: ClinicRow, now: Date = new Date()) =>
  !r.last_activity || now.getTime() - new Date(r.last_activity).getTime() > QUIET_DAYS * 86_400_000;

export interface LogRow { at: Date; staff_id: string; staff_name: string; action: string; detail: string | null; clinic_name: string | null; subject: string | null }
/** What Flossify's own people did, newest first (admin_audit, 027). */
export async function operatorLog(limit = 40): Promise<LogRow[]> {
  return publicRead<LogRow>('select * from admin_audit($1)', [limit]);
}

/** The log's words for an action. */
export const ACTION_WORDS: Record<string, string> = {
  'login.ok': 'Signed in',
  'logout': 'Signed out',
  'login.fail': 'Sign-in refused',
  'login.locked': 'Sign-in locked after too many tries',
  'prc.checked': 'PRC licence checked: matches',
  'prc.mismatch': 'PRC licence did not match',
  'prc.pending': 'PRC check put back to waiting',
  'billing.issue': 'Issued the month’s invoices',
  'billing.paid': 'Marked an invoice paid',
  'billing.check': 'Asked PayMongo about an invoice',
  'billing.reviewed': 'Handled an online payment',
  'billing.set': 'Set a group’s terms',
};

export interface PrcRow {
  staff_id: string; full_name: string; prc_licence: string | null;
  prc_status: 'pending' | 'checked' | 'mismatch'; prc_checked_on: Date | null;
  prc_checked_by_name: string | null; prc_note: string | null; role: string;
  clinic_id: string | null; clinic_name: string | null; clinic_slug: string | null; clinic_listed: boolean | null;
  owner_id: string | null; owner_name: string | null; owner_phone: string | null; added_at: Date;
}
/** Every dentist with a public profile, waiting first (admin_prc_queue, 009). */
export async function prcQueue(): Promise<PrcRow[]> {
  return publicRead<PrcRow>('select * from admin_prc_queue()');
}

export interface Health {
  db: { ok: boolean; ms: number | null; version: string | null; size: string | null; newest: string | null; applied: number | null; migratedAt: Date | null };
  deploy: { commit: string | null; branch: string | null; startedAt: Date; node: string };
  sms: string;
}
/** The system pane: the database's answer and state, the deployed commit, this server's start. Never throws. */
export async function health(): Promise<Health> {
  const db: Health['db'] = { ok: false, ms: null, version: null, size: null, newest: null, applied: null, migratedAt: null };
  try {
    const t0 = performance.now();
    await pool.query('select 1');
    db.ms = Math.max(1, Math.round(performance.now() - t0));
    db.ok = true;
    const [v, s, m] = await Promise.all([
      pool.query('show server_version').catch(() => null),
      pool.query('select pg_size_pretty(pg_database_size(current_database())) as size').catch(() => null),
      pool.query('select * from admin_schema()').catch(() => null),
    ]);
    db.version = (v?.rows[0]?.server_version as string | undefined)?.split(' ')[0] ?? null;
    db.size = (s?.rows[0]?.size as string | undefined) ?? null;
    db.newest = m?.rows[0]?.newest ?? null;
    db.applied = m?.rows[0]?.applied ?? null;
    db.migratedAt = m?.rows[0]?.last_applied_at ?? null;
  } catch {
    /* ok stays false: the pane says the database did not answer */
  }
  // Render sets these on every deploy; elsewhere they are absent and the pane says so.
  const commit = (process.env.RENDER_GIT_COMMIT ?? '').trim() || null;
  const branch = (process.env.RENDER_GIT_BRANCH ?? '').trim() || null;
  const sms = (process.env.SMS_PROVIDER ?? 'console').trim().toLowerCase() || 'console';
  return {
    db,
    deploy: { commit, branch, startedAt: new Date(Date.now() - process.uptime() * 1000), node: process.version },
    sms,
  };
}

export interface PaidRow { number: string; amount: number; paid_at: Date; paid_ref: string | null; paid_via: string | null; group_name: string }
/** The latest invoices paid, and what came in this Manila month. subscription_invoice is not clinic data (011): a plain read. */
export async function paidLately(limit = 6): Promise<{ recent: PaidRow[]; monthTotal: number; monthCount: number }> {
  const [recent, month] = await Promise.all([
    pool.query(
      `select i.number, i.amount, i.paid_at, i.paid_ref, i.paid_via, g.name as group_name
         from subscription_invoice i join clinic_group g on g.id = i.group_id
        where i.status = 'paid' and i.paid_at is not null
        order by i.paid_at desc limit $1`, [limit]),
    pool.query(
      `select coalesce(sum(amount), 0) as total, count(*)::integer as n from subscription_invoice
        where status = 'paid' and date_trunc('month', paid_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')`),
  ]);
  return {
    recent: recent.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    monthTotal: Number(month.rows[0]?.total ?? 0),
    monthCount: Number(month.rows[0]?.n ?? 0),
  };
}

// ---------------------------------------------------------------------------
// PRC: record what the PRC page showed.
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRC_STATUS = new Set(['checked', 'mismatch', 'pending']);
export const PRC_NOTE_MAX = 200;

/**
 * Mark a dentist's licence. The mark and its audit entry are written inside
 * the dentist's home clinic, so they belong to that clinic; a mismatch texts
 * the clinic's owner, once a day per dentist. Returns what to say:
 * status + texted (sent | again | nophone | noclinic | none), or 'missed'
 * when the dentist is no longer in the queue, or 'bad' for a hand-made post.
 */
export async function markPrc(form: FormData, who: Actor): Promise<{ status: string; texted: string } | 'missed' | 'bad'> {
  const staffId = String(form.get('staff_id') ?? '');
  const status = String(form.get('status') ?? '');
  const note = String(form.get('note') ?? '').replace(/\s+/g, ' ').trim().slice(0, PRC_NOTE_MAX) || null;
  if (!UUID.test(staffId) || !PRC_STATUS.has(status)) return 'bad';

  const row = (await publicRead<PrcRow>('select * from admin_prc_queue() where staff_id = $1', [staffId]))[0];
  if (!row) return 'missed';

  const MARK = 'select admin_prc_mark($1, $2, $3, $4) as ok';
  const args = [staffId, status, note, who.staffId];
  const manilaDay = manilaYmd(new Date());
  let texted = 'noclinic';
  if (row.clinic_id) {
    texted = await withClinic(row.clinic_id, async (tx) => {
      const ok = (await tx.query(MARK, args)).rows[0]?.ok as boolean;
      if (!ok) return 'missed';
      await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id, ip, user_agent) values ($1, $2, $3, 'staff', $4, $5, $6)`,
        [row.clinic_id, who.staffId, `prc.${status}`, staffId, who.ip || null, who.ua?.slice(0, 300) ?? null]);
      if (status !== 'mismatch') return 'none';
      if (!row.owner_phone || !PH_MOBILE.test(normalizePhone(row.owner_phone))) return 'nophone';
      const id = await queueText(tx, {
        clinicId: row.clinic_id!, to: row.owner_phone, body: wording.prcMismatch(row.full_name, row.prc_licence ?? '(none on file)'),
        kind: 'manual', staffId: row.owner_id, dedupeKey: `prc-mismatch:${staffId}:${manilaDay}`,
      });
      return id ? 'sent' : 'again';
    });
  } else {
    const ok = (await pool.query(MARK, args)).rows[0]?.ok as boolean;
    if (!ok) texted = 'missed';
    // No clinic to hold the audit entry: the operations log keeps it instead.
    else await adminEvent(`prc.${status}`, who, `${row.full_name} · no home clinic on file`);
  }
  if (texted === 'missed') return 'missed';
  return { status, texted };
}

/** The sentence after a PRC mark, from the redirect's query. */
export function prcNotice(q: URLSearchParams): string {
  const done = q.get('prc') ?? '';
  const texted = q.get('texted') ?? '';
  const tail =
    texted === 'sent' ? 'The clinic’s owner is texted with the next pass of the sender.'
    : texted === 'again' ? 'The clinic’s owner was already texted about this today, so no second text went out.'
    : texted === 'noclinic' ? 'This dentist has no home clinic on file, so there was no owner to text.'
    : 'The clinic’s owner has no mobile on file, so nobody was texted; reach them another way.';
  if (done === 'checked') return 'Marked as checked. The public profile now says the licence was checked today.';
  if (done === 'pending') return 'Back in the waiting list. The public profile says “PRC check pending” again.';
  if (done === 'mismatch') return `Marked as not matching. The public profile says “PRC check pending” until it is sorted. ${tail}`;
  if (done === 'missed') return 'That dentist is no longer in the queue. The lists are current.';
  return '';
}

// ---------------------------------------------------------------------------
// Billing: the actions both /admin/ and /admin/billing/ carry out.
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const REF_MAX = 120;
export const NOTES_MAX = 500;
export const PRICE_MAX = 99_999.99;
export const NOT_DUE = 'That invoice is no longer due. It may have been marked paid a moment ago; check the list.';

const groupName = async (id: string) =>
  ((await pool.query('select name from clinic_group where id = $1', [id])).rows[0]?.name as string | undefined) ?? 'a group';

/**
 * Why an invoice chosen for Mark paid is not in the due list any more, in one
 * sentence naming it: most often two people marked it at once. The group, so
 * a page can reopen it. subscription_invoice is not clinic data (011).
 */
async function notDue(id: string): Promise<{ error: string; group?: string }> {
  if (!UUID.test(id)) return { error: 'Choose an invoice from the list. Nothing was changed.' };
  const r = (await pool.query('select number, status, paid_at, group_id from subscription_invoice where id = $1', [id]).catch(() => null))?.rows[0];
  if (!r) return { error: NOT_DUE };
  const group = r.group_id as string;
  if (r.status === 'paid') {
    const lately = r.paid_at && Date.now() - new Date(r.paid_at).getTime() < 15 * 60_000;
    return { group, error: `${r.number} was already marked paid${r.paid_at ? ` ${ago(r.paid_at)}` : ''}${lately ? ', perhaps by someone else at the same time' : ''}. Nothing was changed, and the reference you typed was not saved.` };
  }
  if (r.status === 'void') return { group, error: `${r.number} was voided, so there is nothing to mark. Nothing was changed.` };
  return { group, error: `${r.number} could not be marked just now. Nothing was changed; try once more.` };
}

export type BillingResult =
  | { ok: true; done: Record<string, string> }
  | { ok: false; error: string; action: string; invoice?: string; ref?: string; group?: string };

/**
 * One billing action from a posted form (the page has checked CSRF): issue,
 * paid, check, reviewed or set. On success, the query to redirect with
 * (done=…); on a miss, one plain sentence and nothing changed.
 */
export async function billingAction(form: FormData, who: Actor): Promise<BillingResult> {
  const action = String(form.get('action') ?? '');
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const today = manilaToday();

  if (action === 'issue') {
    if (!BILLING_FINAL) return { ok: false, action, error: 'Invoices are not issued yet: the prices are still placeholders. Nothing was created.' };
    const n = await issueInvoices(today);
    await adminEvent('billing.issue', who, `${n} invoice${n === 1 ? '' : 's'} for ${monthText(today)}`);
    return { ok: true, done: { done: 'issue', n: String(n) } };
  }

  if (action === 'paid') {
    const id = s('invoice'), ref = s('ref').replace(/\s+/g, ' ');
    const inv = UUID.test(id) ? (await allDue()).find((i) => i.id === id) : undefined;
    if (!inv) return { ok: false, action, ...(await notDue(id)), invoice: id, ref };
    const group = inv.group_id;
    if (!ref) return { ok: false, action, error: 'Type the reference you saw in the account, so the payment can be traced later.', invoice: id, ref, group };
    if (ref.length > REF_MAX) return { ok: false, action, error: `Keep the reference under ${REF_MAX} characters.`, invoice: id, ref, group };
    try {
      await markPaid(inv.id, ref, who.staffId);
    } catch {
      // Marked by someone else between the list and the save, most likely.
      return { ok: false, action, ...(await notDue(id)), invoice: id, ref };
    }
    await adminEvent('billing.paid', who, `${inv.number} · ${await groupName(inv.group_id)} · ${peso(inv.amount)} · ref ${ref}`);
    // Paid now: close any PayMongo checkout still open for it, so the clinic cannot pay it twice. Not awaited.
    void closeCheckouts({ invoiceId: inv.id });
    return { ok: true, done: { done: 'paid', number: inv.number, group: inv.group_id } };
  }

  if (action === 'check') {
    // Before marking by hand: ask PayMongo about the invoice's checkouts, and mark it paid online if it was.
    const id = s('invoice');
    const inv = UUID.test(id) ? (await allDue()).find((i) => i.id === id) : undefined;
    if (!inv) return { ok: false, action, error: NOT_DUE };
    const r = await confirmPending(inv.group_id, inv.number, ADMIN_CONFIRM_DAYS);
    await adminEvent('billing.check', who, `${inv.number} · ${await groupName(inv.group_id)} · PayMongo: ${r}`);
    return { ok: true, done: { done: 'check', r, number: inv.number, group: inv.group_id } };
  }

  if (action === 'reviewed') {
    // A refused online payment, dealt with in the PayMongo dashboard or by marking an invoice by hand.
    const id = s('event');
    if (!/^(evt_|check:pay_)[A-Za-z0-9]{8,64}$/.test(id) || !(await markReviewed(id, who.staffId))) {
      return { ok: false, action, error: 'That payment is not on the list any more. Someone may have marked it a moment ago.' };
    }
    await adminEvent('billing.reviewed', who, id);
    return { ok: true, done: { done: 'reviewed' } };
  }

  if (action === 'set') {
    const group = s('group'), plan = s('plan'), status = s('status'), ends = s('trial_ends'), notes = s('notes');
    const rawPrice = s('price');
    const price = /^\d{1,6}(\.\d{1,2})?$/.test(rawPrice) ? Number(rawPrice) : NaN;
    let error = '';
    if (!UUID.test(group)) error = 'That group is not on the list.';
    else if (!(PLAN_IDS as string[]).includes(plan)) error = 'Pick a plan from the list.';
    else if (!(SUB_STATUSES as string[]).includes(status)) error = 'Pick a status from the list.';
    else if (!ISO_DAY.test(ends) || Number.isNaN(Date.parse(`${ends}T00:00:00Z`))) error = 'The trial end needs a date.';
    else if (!Number.isFinite(price) || price > PRICE_MAX) error = 'Enter the price per branch in pesos, like 800 or 800.50 (from 0 up to 99,999.99).';
    else if (notes.length > NOTES_MAX) error = `Keep the note under ${NOTES_MAX} characters.`;
    if (error) return { ok: false, action, error, group };
    // The trial ends at the end of that Manila day.
    const trialEnds = new Date(`${ends}T23:59:59+08:00`);
    const amount = Math.round(price * 100) / 100;
    try {
      await adminSet(group, { plan: plan as PlanId, status: status as SubStatus, trialEnds, price: amount, notes });
    } catch {
      return { ok: false, action, error: 'That could not be saved. Check that the group still exists and try once more.', group };
    }
    await adminEvent('billing.set', who, `${await groupName(group)} · ${PLANS[plan as PlanId].name} · ${status.replace('_', ' ')} · trial ends ${ends} · ${peso(amount)} per branch`);
    return { ok: true, done: { done: 'set', group } };
  }

  return { ok: false, action, error: 'That action is not one this page knows. Nothing was changed.' };
}

/** The sentence after a billing action, from the redirect's query. `groupNameOf` names the group the query points at. */
export function billingNotice(q: URLSearchParams, groupNameOf: (id: string) => string | undefined): string {
  const done = q.get('done') ?? '';
  const today = manilaToday();
  const named = groupNameOf(q.get('group') ?? '') ?? 'the group';
  const n = Number(q.get('n') ?? 0);
  if (done === 'issue') return n > 0 ? `Issued ${n} invoice${n === 1 ? '' : 's'} for ${monthText(today)}.` : `Nothing to issue: every group past its trial already has its ${monthText(today)} invoice, or has no open branch.`;
  if (done === 'paid') return `Marked ${q.get('number') ?? 'the invoice'} paid. If nothing else of theirs was overdue, ${named} is active again.`;
  if (done === 'set') return `Saved ${named}’s terms.`;
  if (done === 'reviewed') return 'Taken off the list of online payments to look at.';
  if (done === 'check') {
    const num = q.get('number') ?? 'the invoice';
    const said: Record<Asked, string> = {
      paid: `PayMongo has a payment for ${num}: it is marked paid online.`,
      refused: `PayMongo has a payment for ${num} that the invoice did not take. It is under Online payments to look at.`,
      unpaid: `PayMongo has no payment for ${num} yet. If the clinic paid by transfer instead, mark it by hand with that reference.`,
      noanswer: 'PayMongo did not answer. Nothing was changed. Try again in a minute.',
      busy: `PayMongo was asked about ${named} a moment ago. Nothing was changed. Try again in a minute.`,
      none: `There is no online payment for ${num} from the last ${ADMIN_CONFIRM_DAYS} days left to ask PayMongo about. Anything it already reported is in the lists.`,
      off: 'PayMongo is not set up on this server, so it cannot be asked. Nothing was changed.',
    };
    const r = q.get('r') ?? '';
    return Object.hasOwn(said, r) ? said[r as Asked] : '';
  }
  return '';
}
