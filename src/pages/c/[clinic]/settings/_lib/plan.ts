// Your Flossify plan (it was "Billing", which now means patient money): what
// this group pays Flossify — the plan, the branches it is counted on, the
// month's total, every invoice, and how to pay. A clinic pays by GCash, Maya
// or bank transfer with the invoice number as the reference, and a person on
// our side marks it paid. When online payment is on (billing final and
// PayMongo set up: src/lib/payments.ts) each due invoice also gets a Pay now
// button: a form post to /api/payments/checkout, which sends the owner to
// PayMongo's page for GCash, Maya or card, and PayMongo sends them back with
// ?paid=<number> or ?unpaid=<number> (to /settings/billing/, which redirects
// here with its query). There is no card form on this site. Plan changes are
// a note to us, not a button, until self-service is worth building.
//
// Coming back (?paid=<number>), or pressing Check again, the webhook may not
// have landed yet, so the page asks PayMongo itself about that invoice's
// checkouts (confirmPending) before it reads the invoices: the owner sees
// Paid, not an invoice that looks unpaid and asks to be paid twice. A plain
// view never calls PayMongo (its rate limit is the whole account's); it reads
// what is recorded. A due invoice with a payment started in the last
// CONFIRM_WITHIN_DAYS shows that, with Check again, instead of the big Pay
// now; one with a payment PayMongo reported that did not match shows that,
// with no button, until operations have handled it. ?paid= and ?unpaid= mean
// nothing while online payment is off.
//
// The owner's and the admin's, like the rest of Clinic settings. The
// subscription rows are group data outside row-level security (like staff);
// the branch count reads clinic through the definer function in migration 011.
import { CSRF_MESSAGE } from '../../../../../lib/csrf';
import {
  PLANS, PAY_TO, WRITE_TO, STATUS_WORDS, BILLING_FINAL,
  state, describe, daysLeft, manilaDate, dueWord, daysBetween, whenText,
  type Invoice, type BillingState, type Notice,
} from '../../../../../lib/billing';
import {
  onlinePayReady, confirmPending, paidOnline, checkoutsStarted, pendingCheckouts, openRefusals,
  type Asked, type Outcome,
} from '../../../../../lib/payments';

export type PayState = { kind: 'pay' } | { kind: 'started'; at: Date } | { kind: 'refused' };

export interface PlanView {
  billing: BillingState;
  plan: (typeof PLANS)[keyof typeof PLANS];
  notice: Notice | null;
  flash: { text: string; alert: boolean } | null;
  online: boolean;
  pricesFinal: boolean;
  owed: number;
  standing: string;
  due: { inv: Invoice; line: string; over: boolean; state: PayState }[];
  byOnline: Set<string>;
  payTo: { name: string; value: string }[];
  writeTo: string;
  /** For the index: one short line. */
  short: string;
}

// billing.ts marks what the owner of the service has not filled in yet as "[YOUR …]". Those are
// notes for us, never text for a clinic: an unset address or pay-to line is left out, and with no
// pay-to line at all the page says not to send money yet.
const isSet = (v: string) => !!v.trim() && !v.trim().startsWith('[');

export async function loadPlan(o: { groupId: string; q: URLSearchParams }): Promise<PlanView | null> {
  const { q } = o;
  // Paying online: only while the prices are final and PayMongo is set up.
  const online = BILLING_FINAL && onlinePayReady();
  // Back from PayMongo, or Check again: ask about that one invoice before the invoices are read,
  // so a payment PayMongo already took shows as paid. Rate limited per group inside confirmPending.
  const backNumber = online ? (q.get('paid') ?? '').trim().slice(0, 40) : '';
  const asked: Asked | null = backNumber ? await confirmPending(o.groupId, backNumber) : null;
  let billing: BillingState;
  try { billing = await state(o.groupId); } catch (e) { console.error('settings: could not read the plan', e); return null; }
  const plan = PLANS[billing.sub.plan];
  if (!plan) return null;
  const notice = describe(billing.sub, billing.invoices);
  const trialLeft = billing.sub.status === 'trial' ? daysLeft(billing.sub.trial_ends_at) : null;
  // Prices and the late-payment policy cannot be checked for a "[": a placeholder price is a
  // number like any other. So they count as final only when BILLING_FINAL (src/lib/billing-config.ts,
  // re-exported by billing.ts) says so outright. Until then the prices carry "not final yet", the
  // pause policy, which nothing implements, is not stated to a clinic, no invoice is issued, and an
  // invoice made earlier at placeholder prices is marked "do not pay": nothing is owed or overdue.
  const pricesFinal = BILLING_FINAL;
  const owed = pricesFinal ? billing.invoices.filter((i) => i.status === 'due').reduce((n, i) => n + i.amount, 0) : 0;

  const standing = billing.sub.status === 'trial'
    ? trialLeft === 0 ? 'Trial ended' : `Trial: ${trialLeft} day${trialLeft === 1 ? '' : 's'} left`
    : billing.sub.status === 'past_due' && !pricesFinal ? 'Nothing to pay yet'
    : STATUS_WORDS[billing.sub.status];

  const payTo = [
    { name: 'GCash', value: PAY_TO.gcash as string },
    { name: 'Maya', value: PAY_TO.maya as string },
    { name: 'Bank transfer', value: PAY_TO.bank as string },
  ].filter((p) => isSet(p.value));
  const writeTo = isSet(WRITE_TO) ? WRITE_TO : '';

  // Invoices still due, oldest first, each with what is known about paying it online.
  const today = manilaDate(new Date());
  const dueList: Invoice[] = online
    ? billing.invoices.filter((i) => i.status === 'due').sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    : [];
  const byOnline = await paidOnline(billing.invoices.filter((i) => i.status === 'paid').map((i) => i.id));
  const [started, pending, refused] = online
    ? await Promise.all([checkoutsStarted(billing.invoices.map((i) => i.id)), pendingCheckouts(dueList.map((i) => i.id)), openRefusals(o.groupId)])
    : [new Map<string, Date>(), new Map<string, Date>(), new Map<string, { outcome: Outcome; at: Date }>()];

  const invoiceNamed = (n: string | null) => (n ? billing.invoices.find((i) => i.number === n) : undefined);
  // Only an invoice that really has an online payment started answers to ?paid= or ?unpaid=.
  const withCheckout = (inv: Invoice | undefined) => (inv && started.has(inv.id) ? inv : undefined);
  const back = online ? withCheckout(invoiceNamed(backNumber)) : undefined;
  const quit = online ? withCheckout(invoiceNamed(q.get('unpaid'))) : undefined;

  // Per due invoice: pay (the Pay now button), started (a checkout from the last CONFIRM_WITHIN_DAYS
  // that nothing has reported yet: Check again instead), or refused (PayMongo reported a payment
  // that did not match: no button until operations handle it).
  const payState = (inv: Invoice): PayState => {
    if (refused.has(inv.id)) return { kind: 'refused' };
    const at = pending.get(inv.id);
    // Back from PayMongo's Cancel for this invoice: the owner just said it was not paid.
    if (at && quit?.id !== inv.id) return { kind: 'started', at };
    return { kind: 'pay' };
  };
  const due = dueList.map((inv) => {
    const over = daysBetween(manilaDate(inv.due_at), today);
    return { inv, over: over > 0, line: over > 0 ? `Overdue by ${over} day${over === 1 ? '' : 's'}` : `Due ${dueWord(manilaDate(inv.due_at), today)}`, state: payState(inv) };
  });

  // A refused payment, in the owner's words: nothing for them to do but not pay again.
  const refusedWords = (number: string, outcome: Outcome) =>
    outcome === 'paid_twice'
      ? `Invoice ${number} was already marked paid, and PayMongo reports another payment for it. Flossify will check it and return any payment made twice. Do not pay again.`
      : outcome === 'not_due'
        ? `PayMongo reports a payment for ${number}, but that invoice was cancelled. Flossify will check it and return it or put it toward another invoice. Do not pay again.`
        : `PayMongo has a payment for ${number} that does not match this invoice, so it was not marked paid. It is on Flossify’s list to sort out. Do not pay again.`;

  // One sentence about what just happened: back from PayMongo, a refused press, or a stale form.
  let flash: { text: string; alert: boolean } | null = null;
  const pay = q.get('pay') ?? '';
  const backRefused = back ? refused.get(back.id) : undefined;
  if (q.get('stale') === 'plan') flash = { text: CSRF_MESSAGE, alert: true };
  else if (back && backRefused) flash = { text: refusedWords(back.number, backRefused.outcome), alert: true };
  else if (back && back.status === 'paid') flash = { text: `Thank you. Invoice ${back.number} is paid.`, alert: false };
  else if (back && back.status === 'due') {
    // The invoice's own row says the rest (started, Check again); this says what asking just found.
    flash = asked === 'busy'
      ? { text: `PayMongo was asked about ${back.number} a moment ago. Wait a minute, then check again. If you finished paying, do not pay again.`, alert: false }
      : asked === 'noanswer'
        ? { text: `PayMongo did not answer just now, so ${back.number} still shows as due. If you finished paying, do not pay again. Check again in a minute.`, alert: false }
        : asked === 'unpaid'
          ? { text: `Checked with PayMongo just now: no payment for ${back.number} is confirmed yet. If you finished paying, do not pay again.`, alert: false }
          : { text: `PayMongo has not confirmed a payment for ${back.number} yet. If you finished paying, do not pay again.`, alert: false };
  }
  else if (quit && quit.status === 'due' && !refused.has(quit.id)) flash = { text: `The payment for ${quit.number} was not finished. The invoice is still due; pay it whenever you are ready.`, alert: false };
  else if (pay === 'off') flash = { text: 'Paying online is not switched on right now. Nothing was charged.', alert: true };
  else if (pay === 'not_due') flash = { text: 'That invoice is not due any more: it is paid or cancelled. Nothing was charged.', alert: false };
  else if (pay === 'gateway') flash = { text: 'PayMongo did not open the payment page. Nothing was charged. Try again in a minute.', alert: true };
  else if (pay === 'busy') flash = { text: 'Too many tries in a short time. Wait a few minutes, then try again. Nothing was charged.', alert: true };
  else if (pay === 'role') flash = { text: 'Only the owner or an admin pays Flossify’s invoices. Nothing was charged.', alert: true };

  const short = owed > 0 && due.some((d) => d.over) ? 'Overdue'
    : owed > 0 ? 'Invoice due'
    : billing.sub.status === 'trial' ? (trialLeft === 0 ? 'Trial ended' : `Trial · ${trialLeft} day${trialLeft === 1 ? '' : 's'}`)
    : STATUS_WORDS[billing.sub.status];

  return { billing, plan, notice, flash, online, pricesFinal, owed, standing, due, byOnline, payTo, writeTo, short };
}

/** The fourth tile's note: where the subscription stands, and the trial's end date. */
export const standingNote = (v: PlanView) =>
  `${v.standing}${v.billing.sub.status === 'trial' ? `${daysLeft(v.billing.sub.trial_ends_at) === 0 ? ' on' : ' · ends'} ${whenText(v.billing.sub.trial_ends_at)}` : ''}`;
