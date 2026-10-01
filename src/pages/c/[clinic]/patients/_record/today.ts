// This visit's lines (Today's first card, ./VisitStrip.astro), worked out once on the server: the page counts them on
// the Today tab ("Today 4"), the card draws them. In the order a visit runs — before we start (the health history,
// the privacy notice, blood pressure, the consent to treatment), during (what was done, the dentist's note), before
// they leave (the next check-up, the charge) — each line what is still missing, in words, with its own buttons. The
// first button of the first line is the screen's teal one (the next step). What is done is one line of ticked words;
// only a prescription and the aftercare sheet stay links there (Print). Nothing here only switches tabs, but for the
// privacy notice: it is recorded on Patient info, where the notice is shown to the patient full screen.
import { answered, dateText, type HealthVersion } from '../../../../../lib/health';
import { bpWords, type Extra } from '../../../../../lib/record-extra';
import type { Clinical } from '../../../../../lib/record';
import type { VisitConsent } from '../../../../../lib/visit-consent';
import { canSign, type StripVisit } from '../../../../../lib/visit-record';
import { fromDb, pesos } from '../../../../../lib/invoices';
import { AFTERCARE, kindForCatalog } from '../../../../../lib/aftercare';

export type LineTone = 'plain' | 'warn' | 'alert';
/** One button: a form post (`form`: its intent), a link (`href`), a side panel (`open`, with the opener's data-*), or
 *  a way to another tab (`go`, a TAB_OF name). */
export interface Act { label: string; href?: string; open?: string; go?: string; form?: string; data?: Record<string, string>; icon?: 'check' | 'calendar' | 'money' }
export interface Line { tone: LineTone; words: string; acts: Act[] }
export interface DoneWord { words: string; href?: string }
export interface VisitPlan { lines: Line[]; done: DoneWord[]; started: boolean; finished: boolean }

export interface VisitIn {
  visit: StripVisit;
  c: Clinical;
  x: Extra;
  signed: VisitConsent[];
  /** When the health history was last asked (health.asked), or null. */
  health: HealthVersion | null;
  privacy: { ok: boolean; words: string };
  minor: boolean;
  laterVisitAt: Date | null;
  canEdit: boolean;
  money: boolean;
  today: string;
  /** The record's address (sign/, aftercare/ hang off it), the prescriptions' print address, Charge this visit. */
  action: string;
  printBase: string;
  chargeHref: string;
}

const tz = 'Asia/Manila';
export const dayOf = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
export const timeOf = (d: Date | string) => new Intl.DateTimeFormat('en-PH', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(d)).toLowerCase();

export function thisVisitPlan(i: VisitIn): VisitPlan {
  const { visit, c, x, signed, health, privacy, minor, laterVisitAt, canEdit, money, today, action, printBase, chargeHref } = i;
  /** Belongs to this visit: stamped with it, or written today with no visit named. */
  const ofVisit = (id: string | null, at: Date | string) => id === visit.id || (!id && dayOf(at) === today);
  const done = c.done.filter((d) => ofVisit(d.visitId, d.at));
  const notes = c.notes.filter((n) => !n.amends && (n.visitId === visit.id || (!n.visitId && n.visitOn === today)));
  const rx = c.rx.filter((r) => ofVisit(r.visitId, r.at));
  const files = c.files.filter((f) => f.visitId === visit.id || (!f.visitId && (f.takenAt ?? dayOf(f.at)) === today));
  const bp = x.vitals.find((v) => v.sys && v.dia && ofVisit(v.visitId, v.at)) ?? null;
  const bpW = bp ? bpWords(bp.sys!, bp.dia!) : null;
  const consent = signed.find((k) => k.visitId === visit.id) ?? null;
  const asked = !!health && answered(health);
  const checkedDay = asked ? dayOf(health!.at) : null;
  const stale = !!checkedDay && Date.now() - +new Date(health!.at) > 365 * 864e5;
  const started = visit.status === 'in_chair' || visit.status === 'completed';
  const finished = visit.status === 'completed';

  const lines: Line[] = [];
  const ok: DoneWord[] = [];

  // Before we start: the health history, the privacy notice, blood pressure, the consent to treatment.
  if (!asked) lines.push({ tone: 'warn', words: 'Health history: not asked yet', acts: canEdit ? [{ label: 'Ask now', go: 'health' }] : [] });
  else if (checkedDay === today) ok.push({ words: 'Health history checked' });
  else lines.push({ tone: stale ? 'warn' : 'plain', words: `Health history: last checked ${dateText(checkedDay)}${stale ? ', over a year ago' : ''}`,
    acts: canEdit ? [{ label: 'No change', form: 'health-checked', icon: 'check' }, { label: 'Something changed', go: 'health' }] : [] });
  if (!privacy.ok) lines.push({ tone: 'warn', words: privacy.words, acts: canEdit ? [{ label: 'Record it', go: 'consent' }] : [] });
  if (bp && bpW) {
    if (bpW.tone === 'neutral') ok.push({ words: `BP ${bp.sys}/${bp.dia} · ${bpW.label.toLowerCase()}` });
    else {
      // A reading that asks for a physician's word (160/100 and over): the request for medical clearance, one tap.
      const clearance = bpW.level === 'high' || bpW.level === 'crisis';
      lines.push({ tone: bpW.tone === 'alert' ? 'alert' : 'warn', words: `Blood pressure ${bp.sys}/${bp.dia}: ${bpW.label.toLowerCase()}. ${bpW.advice}`,
        acts: canEdit ? [{ label: 'Take again', open: 'rec-vitals-add' }, ...(clearance ? [{ label: 'Ask for clearance', open: 'rec-letter-add', data: { 'data-letter-kind': 'clearance' } }] : [])] : [] });
    }
  } else if (!finished) lines.push({ tone: 'plain', words: 'Blood pressure: not taken', acts: canEdit ? [{ label: 'Take it', open: 'rec-vitals-add' }] : [] });
  // Signing on the tablet is for a visit today or later (canSign, the same rule as the signing page): a visit done today
  // can still be signed while the patient is at the desk.
  const signable = canEdit && canSign({ id: visit.id, status: visit.status, day: dayOf(visit.startsAt) }, today);
  if (consent) ok.push({ words: `Consent signed by ${consent.signedBy}, ${timeOf(consent.at)}` });
  else lines.push({ tone: 'warn', words: `Consent to treatment: not signed${minor && signable ? ' (a parent or guardian signs)' : finished ? ' at this visit' : ''}`,
    acts: signable ? [{ label: 'Sign on this tablet', href: `${action}sign/${visit.id}/` }] : [] });

  // During the visit.
  for (const d of done) ok.push({ words: `${d.name}${d.fdi ? ` ${d.fdi}${d.surface ? ` ${d.surface}` : ''}` : ''}` });
  if (started && !done.length) lines.push({ tone: 'plain', words: 'Treatment done: nothing recorded yet', acts: canEdit ? [{ label: 'Record it', open: 'rec-done-add' }] : [] });
  if (notes.length) ok.push({ words: `Note by ${notes[0].dentist ?? notes[0].by ?? 'the dentist'}` });
  else if (started) lines.push({ tone: 'plain', words: 'Clinical note: none yet', acts: canEdit ? [{ label: 'Write it', open: 'rec-note-add', data: { 'data-amends': '' } }] : [] });
  for (const r of rx) ok.push({ words: 'Prescription · Print', href: `${printBase}${r.id}/` });
  // The aftercare sheet for what was done (src/lib/aftercare.ts): printed for the patient to take home.
  const sheet = done.map((d) => kindForCatalog(d.code, d.name, d.category)).find((k) => k) ?? null;
  if (sheet) ok.push({ words: `Aftercare: ${AFTERCARE[sheet].title} · Print`, href: `${action}aftercare/${sheet}/?visit=${visit.id}` });
  if (files.length) ok.push({ words: files.length === 1 ? 'One file' : `${files.length} files` });

  // Before they leave.
  if (finished || visit.status === 'in_chair') {
    if (laterVisitAt) ok.push({ words: `Next visit ${dateText(dayOf(laterVisitAt))}` });
    else if (c.recall) ok.push({ words: `Next check-up ${dateText(c.recall.dueOn)}` });
    else lines.push({ tone: finished ? 'warn' : 'plain', words: 'Next check-up: not set', acts: canEdit ? [{ label: 'Set the next check-up', open: 'rec-recall-set' }] : [] });
  }
  if (finished && money) {
    if (visit.charged) ok.push({ words: `Charged ${pesos(fromDb(visit.charged))}` });
    else lines.push({ tone: 'warn', words: 'Not charged yet', acts: [{ label: 'Charge this visit', href: chargeHref, icon: 'money' }] });
  }
  return { lines, done: ok, started, finished };
}

// --- Needs attention ----------------------------------------------------------------------------------------
// What the record is missing or waiting on, outside this visit: each line in words with its one action, drawn only
// when it applies. The head's old to-do chips (an LOA waiting, a payment plan behind, a health history over a year
// old) are lines here now; the safety line in the head stays facts only.
export interface Need { tone: LineTone; words: string; act?: Act; link?: { label: string; href: string } }
export interface NeedsIn {
  /** Details not on file, in words ("email", "address", "HMO", …). */
  missing: string[];
  /** Visits of an earlier day still marked as going on (arrived, waiting, in the chair): the Dashboard's day. */
  stuck: { day: string; status: string; href: string }[];
  loas: { id: string; payor: string; items: string[] }[];
  /** Payment plans behind (finance.bill only): the statement to take a payment on. */
  behind: { title: string; missed: number; href: string }[];
  /** The health history was last asked over a year ago (and This visit is not asking already). */
  staleHealth: string | null;
  clearances: { id: string; issuedOn: string; to: string | null }[];
  canEdit: boolean;
}
export function needsAttention(i: NeedsIn): Need[] {
  const out: Need[] = [];
  if (i.missing.length) out.push({ tone: 'plain', words: `Not on file: ${i.missing.join(', ')}`, act: i.canEdit ? { label: 'Add them', open: 'details' } : undefined });
  for (const s of i.stuck) out.push({ tone: 'warn', words: `${s.day} visit is still marked ${s.status}.`, link: { label: 'Open that day', href: s.href } });
  for (const a of i.loas) out.push({ tone: 'warn', words: `Waiting for the LOA from ${a.payor}${a.items.length ? ` for ${a.items.join(', ')}` : ''}`,
    act: i.canEdit ? { label: 'Record the answer', go: 'loas', data: { 'data-loa': a.id, 'data-loa-payor': a.payor } } : undefined });
  for (const b of i.behind) out.push({ tone: 'alert', words: `${b.title}: behind ${b.missed === 1 ? 'one payment' : `${b.missed} payments`}`, act: { label: 'Take a payment', href: b.href, icon: 'money' } });
  if (i.staleHealth) out.push({ tone: 'warn', words: `Health history last checked ${i.staleHealth}, over a year ago`, act: i.canEdit ? { label: 'Check it', go: 'health' } : undefined });
  for (const l of i.clearances) out.push({ tone: 'warn', words: `Medical clearance asked ${dateText(l.issuedOn)}${l.to ? ` of ${l.to}` : ''}: no reply yet`,
    act: i.canEdit ? { label: 'Physician replied', open: 'rec-letter-answer', data: { 'data-letter': l.id } } : undefined });
  return out;
}
