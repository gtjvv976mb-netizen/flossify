// What clinics pay Flossify. The plans and where to pay live here; the rows
// live in subscription / subscription_invoice (migration 011) and every write
// goes through the definer functions there. Nothing in this file sends money
// anywhere: a clinic pays by GCash, Maya or bank transfer with the invoice
// number as the reference, and a person on the operations page marks it paid.
//
// PLACEHOLDERS. Every peso amount below, the pay-to details and the address
// to write to are stand-ins for the owner to set before launch. The README's
// "Before this goes live" list names them. Do not present them as final.
// Nothing is invoiced until BILLING_FINAL (below) is true.

import { pool } from './db';
import { BILLING_FINAL } from './billing-config';

/** Per branch per month, in pesos. PLACEHOLDER numbers — the owner sets the real ones. */
export const PLANS = {
  starter: { name: 'Starter', perBranch: 990, blurb: '1 chair, the day list, patients, texts' },
  clinic: { name: 'Clinic', perBranch: 1990, blurb: 'Everything, one branch' },
  group: { name: 'Group', perBranch: 1490, blurb: 'Everything, three branches or more' },
} as const;
export type PlanId = keyof typeof PLANS;
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const DEFAULT_PLAN: PlanId = 'clinic';
export const TRIAL_DAYS = 30;

/** Where a clinic sends the money. PLACEHOLDERS — replace before the first invoice goes out. */
export const PAY_TO = {
  gcash: '[YOUR GCash number]',
  maya: '[YOUR Maya number]',
  bank: '[YOUR bank, account name, account number]',
} as const;
/** The address for plan changes and questions. PLACEHOLDER. */
export const WRITE_TO = '[YOUR billing email]';
/** Days after which the public listing may be paused. Policy text only; nothing implements it. PLACEHOLDER. */
export const PAUSE_AFTER_DAYS = 30;
// Set true only once the prices, the pay-to details, the billing email and the pause policy above are the real ones.
// It lives in billing-config.ts, which has no imports, so the SMS worker can read it under plain Node; change it there.
export { BILLING_FINAL };

export type SubStatus = 'trial' | 'active' | 'past_due' | 'cancelled';
export type InvoiceStatus = 'due' | 'paid' | 'void';
export const SUB_STATUSES: SubStatus[] = ['trial', 'active', 'past_due', 'cancelled'];

export interface Subscription {
  group_id: string; plan: PlanId; status: SubStatus; trial_ends_at: Date; price_per_branch: number;
  started_at: Date; cancelled_at: Date | null; notes: string | null; updated_at: Date;
}
export interface Invoice {
  id: string; group_id: string; number: string;
  /** YYYY-MM-DD, as the database has it; never a Date, which would drift a day across time zones. */
  period_start: string; period_end: string;
  branches: number; amount: number; status: InvoiceStatus; due_at: Date; paid_at: Date | null; paid_ref: string | null;
}
export interface BillingState { sub: Subscription; invoices: Invoice[]; branches: number; monthly: number }

const toSub = (r: any): Subscription => ({ ...r, price_per_branch: Number(r.price_per_branch) });
const toInvoice = (r: any): Invoice => ({ ...r, amount: Number(r.amount) });

/** The group's subscription, started as a trial on the default plan when it has none. */
export async function ensure(groupId: string): Promise<Subscription> {
  const { rows } = await pool.query('select * from billing_ensure($1, $2)', [groupId, PLANS[DEFAULT_PLAN].perBranch]);
  return toSub(rows[0]);
}

/** Every invoice of one group, newest period first. Not clinic data, so a plain read. */
export async function invoicesOf(groupId: string): Promise<Invoice[]> {
  const { rows } = await pool.query(
    `select id, group_id, number, period_start::text, period_end::text, branches, amount, status, due_at, paid_at, paid_ref
       from subscription_invoice where group_id = $1 order by period_start desc`, [groupId]);
  return rows.map(toInvoice);
}

/** Branches a group is billed for: its clinics that are not archived, counted past RLS by the definer function. */
export async function branchesOf(groupId: string): Promise<number> {
  const { rows } = await pool.query('select group_branches($1) as n', [groupId]);
  return Number(rows[0]?.n ?? 0);
}

/** Subscription, invoices and the month's total, for the owner's page and the notice. */
export async function state(groupId: string): Promise<BillingState> {
  const [sub, invoices, branches] = await Promise.all([ensure(groupId), invoicesOf(groupId), branchesOf(groupId)]);
  return { sub, invoices, branches, monthly: branches * sub.price_per_branch };
}

// ---------------------------------------------------------------------------
// Dates. Everything is judged on the Manila calendar day.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const partsOf = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'Asia/Manila' }).formatToParts(d).map((p) => [p.type, p.value]));

/** 'YYYY-MM-DD' of an instant, in Manila. */
export function manilaDate(d: Date): string {
  const p = partsOf(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}
export const manilaToday = () => manilaDate(new Date());

/** A 'YYYY-MM-DD' as an instant at UTC noon, safe to format with timeZone 'UTC'. */
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);
/** Whole days from a to b ('YYYY-MM-DD' each); positive when b is later. */
export const daysBetween = (a: string, b: string) => Math.round((noon(b).getTime() - noon(a).getTime()) / DAY_MS);

/** Whole days of trial left, never negative; a trial ending later today counts as one. */
export function daysLeft(trialEndsAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / DAY_MS));
}

// Composed from parts, as the Messages page does: the locale strings put the
// comma and the order elsewhere, and "8 Sep 2026" is how a clinic writes it.
const utcParts = (iso: string) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(noon(iso)).map((p) => [p.type, p.value]));
/** '8 Sep 2026' for a date string. */
export const dayText = (iso: string) => { const p = utcParts(iso); return `${p.day} ${p.month} ${p.year}`; };
/** 'September 2026' for a period start. */
export const monthText = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(noon(iso));
/** '8 Sep 2026' for an instant, on the Manila calendar. */
export const whenText = (d: Date) => dayText(manilaDate(new Date(d)));

/** 'today', 'tomorrow', 'on Friday', 'on 8 Oct' — how far off a due date is, from today. */
export function dueWord(dueIso: string, todayIso: string): string {
  const n = daysBetween(todayIso, dueIso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  const p = utcParts(dueIso);
  if (n > 1 && n < 7) return `on ${p.weekday}`;
  return `on ${p.day} ${p.month}`;
}

// ---------------------------------------------------------------------------
// Words. Status is never a colour alone; every state has its sentence.
// ---------------------------------------------------------------------------

export const STATUS_WORDS: Record<SubStatus, string> = { trial: 'On trial', active: 'Active', past_due: 'Payment overdue', cancelled: 'Cancelled' };

/** The oldest invoice still to pay, or undefined. */
export const oldestDue = (invoices: Invoice[]) =>
  invoices.filter((i) => i.status === 'due').sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0];

export interface Notice { text: string; alert: boolean }

/** One sentence about where the group stands, or null when it is active with nothing to pay. Pure; `now` is for tests. */
export function describe(sub: Subscription, invoices: Invoice[], now: Date = new Date()): Notice | null {
  if (sub.status === 'cancelled') return { text: 'The subscription is cancelled. Write to us to start it again.', alert: false };
  const today = manilaDate(now);
  const due = oldestDue(invoices);
  if (due && !BILLING_FINAL) {
    // An invoice made at placeholder prices (before the switch, or by hand) is never asked for: not due, not overdue.
    const n = invoices.filter((i) => i.status === 'due').length;
    return {
      text: n === 1
        ? `Invoice ${due.number} was made before the prices were final. Do not pay it: there is nothing to pay yet.`
        : `${n} invoices were made before the prices were final. Do not pay them: there is nothing to pay yet.`,
      alert: false,
    };
  }
  if (due) {
    const over = daysBetween(manilaDate(due.due_at), today);
    if (over > 0) {
      return { text: `An invoice is ${over} day${over === 1 ? '' : 's'} overdue — please settle it or write to us; nothing is switched off.`, alert: sub.status === 'past_due' };
    }
    return { text: `Invoice ${due.number} is due ${dueWord(manilaDate(due.due_at), today)}.`, alert: false };
  }
  if (sub.status === 'trial') {
    const n = daysLeft(sub.trial_ends_at, now);
    if (n === 0) {
      // Until the prices are final no invoice is issued (see BILLING_FINAL), so do not promise one.
      if (!BILLING_FINAL) return { text: 'The trial has ended. There is nothing to pay yet: we will tell you the prices before the first invoice.', alert: false };
      return { text: 'The trial has ended. The first invoice comes with the next monthly run.', alert: false };
    }
    return { text: `Trial: ${n} day${n === 1 ? '' : 's'} left.`, alert: false };
  }
  return null;
}

/** The plain words for one invoice's state. */
export function invoiceWords(inv: Invoice, now: Date = new Date()): string {
  if (inv.status === 'paid') return inv.paid_at ? `Paid ${whenText(inv.paid_at)}` : 'Paid';
  if (inv.status === 'void') return 'Cancelled';
  if (!BILLING_FINAL) return 'Do not pay: prices not final';
  const over = daysBetween(manilaDate(inv.due_at), manilaDate(now));
  if (over > 0) return `Overdue by ${over} day${over === 1 ? '' : 's'}`;
  return 'Not yet paid';
}

// ---------------------------------------------------------------------------
// The operations side: what /admin/billing/ reads and writes, all through 011.
// ---------------------------------------------------------------------------

export interface AdminRow {
  group_id: string; group_name: string; plan: PlanId | null; status: SubStatus | null; trial_ends_at: Date | null; price_per_branch: number | null;
  branches: number; due_count: number; due_amount: number; oldest_due: string | null; last_paid: Date | null;
  owner_name: string | null; owner_email: string | null; owner_phone: string | null;
}

/** One row per group with a subscription or an open branch, overdue first. */
export async function adminRows(): Promise<AdminRow[]> {
  const { rows } = await pool.query(
    `select group_id, group_name, plan, status, trial_ends_at, price_per_branch, branches, due_count, due_amount, oldest_due::text, last_paid,
            owner_name, owner_email, owner_phone
       from admin_billing()`);
  return rows.map((r) => ({ ...r, price_per_branch: r.price_per_branch === null ? null : Number(r.price_per_branch), due_amount: Number(r.due_amount) }));
}

/** Each group's note, so the terms form shows what is there instead of blanking it. */
export async function notesByGroup(): Promise<Record<string, string>> {
  const { rows } = await pool.query('select group_id, notes from subscription where notes is not null');
  return Object.fromEntries(rows.map((r) => [r.group_id as string, r.notes as string]));
}

/** Every invoice still to pay, across groups, oldest first — what the mark-paid select offers. */
export async function allDue(): Promise<Invoice[]> {
  const { rows } = await pool.query(
    `select id, group_id, number, period_start::text, period_end::text, branches, amount, status, due_at, paid_at, paid_ref
       from subscription_invoice where status = 'due' order by due_at, number`);
  return rows.map(toInvoice);
}

/** The monthly run for a Manila date ('YYYY-MM-DD'). Returns how many invoices it created; running it twice creates none. Refuses while BILLING_FINAL is false. */
export async function issueInvoices(today: string): Promise<number> {
  if (!BILLING_FINAL) throw new Error('Invoices are not issued while BILLING_FINAL is false (src/lib/billing-config.ts): the prices are placeholders.');
  const { rows } = await pool.query('select billing_issue_invoices($1::date) as n', [today]);
  return Number(rows[0].n);
}

/** Mark one invoice paid. Throws when it is not due (already paid, or void). */
export async function markPaid(invoiceId: string, ref: string, byStaffId: string): Promise<void> {
  await pool.query('select billing_mark_paid($1, $2, $3)', [invoiceId, ref, byStaffId]);
}

export interface Terms { plan: PlanId; status: SubStatus; trialEnds: Date; price: number; notes: string }

/** Set a group's terms; a group with no subscription yet gets one. */
export async function adminSet(groupId: string, t: Terms): Promise<void> {
  await pool.query('select admin_billing_set($1, $2, $3, $4, $5, $6)', [groupId, t.plan, t.status, t.trialEnds, t.price, t.notes]);
}
