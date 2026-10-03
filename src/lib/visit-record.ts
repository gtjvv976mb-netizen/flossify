// The visits: everything that happened at one visit, gathered in one place, so a date on the Treatment
// record (src/lib/treatment-record.ts) opens the whole visit — when, the dentist, the chair, why they came, the consent they signed
// (with the signature), what was done to which tooth, the notes, prescriptions and letters, blood pressure,
// X-rays and photos, what it cost and what was paid, and the texts about it.
//
// A thing belongs to a visit when it names the visit (appointment_id). Most rows written at the desk do not,
// so the rest go by the day, in Manila: a treatment, a note, a prescription, a statement on a day with a
// visit belongs to that visit (the one that had started by then, if there were two). Treatment, notes,
// prescriptions or a statement on a day with no visit on the book make a visit of their own ("At the
// clinic"), because work was done; blood pressure, files, letters and payments join a visit on their day
// when there is one and otherwise stay in their own sections. A payment goes with its
// statement's visit whatever day it came in.
//
// Money is filled in only for people who may see amounts (the page passes `money`).
import type { Tx } from './db';
import type { Clinical, Done, Note, Rx, FileRow } from './record';
import type { Extra, Vital, Letter } from './record-extra';
import type { VisitConsent } from './visit-consent';
import type { RecordDoc } from './consent-docs';
import { fromDb, pesos, statementNo, methodLabel, PAYOR_METHODS } from './invoices';

const TZ = 'Asia/Manila';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export const VISIT_STATUS: Record<string, { label: string; tone: 'neutral' | 'accent' | 'warn' | 'muted' | 'info' }> = {
  booked: { label: 'Booked', tone: 'neutral' }, confirmed: { label: 'Confirmed', tone: 'info' }, arrived: { label: 'Arrived', tone: 'warn' },
  in_lobby: { label: 'Waiting', tone: 'warn' }, in_chair: { label: 'In the chair', tone: 'warn' }, completed: { label: 'Done', tone: 'accent' },
  cancelled: { label: 'Cancelled', tone: 'muted' }, no_show: { label: 'Did not come', tone: 'muted' },
};
const SOURCE: Record<string, string> = { web: 'Booked online', request: 'Asked for online', staff: 'Booked at the desk', import: 'From old records' };
const TEXT_WORD: Record<string, string> = { confirmation: 'Booking confirmation', reminder: 'Reminder', manual: 'Text from the clinic', moved: 'New time', cancelled: 'Cancelled', aftercare: 'Aftercare text', recall: 'Check-up due' };
const CHANNEL: Record<string, string> = { web: 'when booking online', desk: 'at the desk', paper: 'on paper', form: 'on the patient forms', sms: 'by text' };

export interface VisitLine { description: string; amount: string }
export interface VisitStatement { id: string; no: string; total: string; status: string; lines: VisitLine[]; payor: string | null; payorShare: string | null }
export interface VisitPayment { id: string; amount: string; method: string; paidOn: string | null; voided: boolean; birRef: string | null; by: string | null; statementNo: string | null }
export interface VisitMoney { statements: VisitStatement[]; payments: VisitPayment[]; charged: string; paid: string; payor: string | null; owed: string; owedCents: bigint; paidCents: bigint; chargedCents: bigint }
export interface VisitAgreed { title: string; how: string; by: string | null; at: Date }
export interface VisitText { word: string; at: Date; failed: boolean; incoming: boolean }

export interface Visit {
  /** The appointment id, or "day-YYYY-MM-DD" for work done on a day with nothing on the book. */
  key: string;
  id: string | null;
  day: string;
  at: Date;
  end: Date | null;
  dateOnly: boolean;
  status: string | null;
  reason: string | null;
  dentist: string | null;
  chair: number | null;
  source: string | null;
  ref: string | null;
  bookedBy: string | null;
  arrivedAt: Date | null;
  seatedAt: Date | null;
  asked: number[];
  procs: Done[];
  notes: Note[];
  rx: Rx[];
  letters: Letter[];
  vitals: Vital[];
  files: FileRow[];
  adjustments: { id: string; wire: string | null; note: string | null; by: string | null }[];
  consents: VisitConsent[];
  /** The consent forms (039) of this visit: prepared from it, or signed through an intake or on paper on its day. */
  forms: RecordDoc[];
  agreed: VisitAgreed[];
  texts: VisitText[];
  money: VisitMoney | null;
  /** Every tooth the visit touched: treated, written about, or what the visit was booked for. */
  teeth: number[];
  future: boolean;
  /** When the visit was booked (appointment.created_at), or null for a day with nothing on the book: the Treatment
   *  record's Next visit is the appointment set by the end of a visit's day. */
  bookedAt: Date | null;
}

/** Today's visit as the record's This visit strip sees it (036): the row, its status and what it was charged. */
export interface StripVisit { id: string; startsAt: Date; status: string; reason: string | null; dentist: string | null; chair: number | null; charged: string | null }

/** A consent is signed on the tablet for a visit going ahead, today or later, or one the patient is at now. */
export const canSign = (v: Pick<Visit, 'id' | 'status' | 'day'>, today: string) =>
  !!v.id && v.status !== 'cancelled' && v.status !== 'no_show' && (v.day >= today || ['arrived', 'in_lobby', 'in_chair'].includes(v.status ?? ''));

export const sourceWords = (s: string | null) => (s ? SOURCE[s] ?? null : null);

/** Every visit, newest first, each with everything that belongs to it. */
export async function loadVisits(tx: Tx, patientId: string, c: Clinical, x: Extra, consents: VisitConsent[], money: boolean, docs: RecordDoc[] = []): Promise<Visit[]> {
  const [appts, agreed, texts, stmts, lines, pays] = await Promise.all([
    tx.query(`select a.id, a.starts_at, a.ends_at, a.status, a.reason, a.source, a.public_ref, a.date_only, a.teeth, a.chair, a.arrived_at, a.seated_at, a.created_at,
                     coalesce(s.full_name, a.dentist_name) as dentist, b.full_name as booked_by
                from appointment a left join staff s on s.id = a.dentist_id left join staff b on b.id = a.created_by
               where a.patient_id = $1 order by a.starts_at desc limit 300`, [patientId]),
    tx.query(`select c.id, c.appointment_id, c.given_at, c.channel, c.given_by_name, v.title
                from patient_consent c join consent_version v on v.id = c.version_id where c.patient_id = $1 and c.appointment_id is not null`, [patientId]),
    tx.query(`select m.id, m.appointment_id, m.created_at, m.kind, m.status, m.direction from message_log m
               where m.patient_id = $1 and m.channel = 'sms' and m.appointment_id is not null and m.kind not in ('reset', 'invite') order by m.created_at`, [patientId]),
    money ? tx.query(`select i.id, i.appointment_id, i.issued_at, i.series_prefix, i.number, i.total, i.status, i.payor_name, i.payor_share
                        from invoice i where i.patient_id = $1 and i.status <> 'draft' order by i.issued_at limit 300`, [patientId]) : Promise.resolve({ rows: [] as any[] }),
    money ? tx.query(`select l.invoice_id, l.description, l.amount from invoice_line l join invoice i on i.id = l.invoice_id
                       where i.patient_id = $1 and i.status <> 'draft' order by l.line_no nulls last, l.id`, [patientId]) : Promise.resolve({ rows: [] as any[] }),
    money ? tx.query(`select y.id, y.invoice_id, y.amount, y.method, to_char(y.paid_on, 'YYYY-MM-DD') as paid_on, y.received_at, y.voided_at, y.bir_ref, s.full_name
                        from payment y left join staff s on s.id = y.received_by where y.patient_id = $1 order by y.received_at limit 500`, [patientId]) : Promise.resolve({ rows: [] as any[] }),
  ]);

  const now = new Date();
  const visits = new Map<string, Visit>();
  const blank = (key: string, day: string, at: Date): Visit => ({
    key, id: null, day, at, end: null, dateOnly: false, status: null, reason: null, dentist: null, chair: null, source: null, ref: null, bookedBy: null,
    arrivedAt: null, seatedAt: null, asked: [], procs: [], notes: [], rx: [], letters: [], vitals: [], files: [], adjustments: [], consents: [], forms: [], agreed: [], texts: [],
    money: null, teeth: [], future: false, bookedAt: null,
  });
  for (const a of appts.rows) {
    const v = blank(a.id, dayKey(a.starts_at), a.starts_at);
    Object.assign(v, {
      id: a.id, end: a.ends_at, dateOnly: a.date_only, status: a.status, reason: a.reason, dentist: a.dentist, chair: a.chair, source: a.source,
      ref: a.public_ref, bookedBy: a.booked_by, arrivedAt: a.arrived_at, seatedAt: a.seated_at, asked: a.teeth ?? [], future: +a.starts_at > +now, bookedAt: a.created_at ?? null,
    });
    visits.set(a.id, v);
  }
  const going = (v: Visit) => v.status !== 'cancelled' && v.status !== 'no_show';
  /** The visit something done at `at` (or on `day`) belongs to; `make` opens a day of its own when there is none. */
  const onDay = (at: Date, day: string, make: boolean): Visit | null => {
    const same = [...visits.values()].filter((v) => v.day === day && (v.id === null || going(v))).sort((a, b) => +a.at - +b.at);
    if (same.length) return [...same].reverse().find((v) => +v.at <= +at) ?? same[0];
    if (!make) return null;
    const v = blank(`day-${day}`, day, at);
    visits.set(v.key, v);
    return v;
  };
  const place = (id: string | null | undefined, at: Date, day: string, make: boolean) => (id && visits.get(id)) || onDay(at, day, make);

  for (const d of c.done) { const v = place(d.visitId, d.at, dayKey(d.at), true)!; v.procs.push(d); }
  for (const n of c.notes) { const v = place(n.visitId, n.at, n.visitOn, true)!; v.notes.push(n); }
  for (const r of c.rx) { const v = place(r.visitId, r.at, dayKey(r.at), true)!; v.rx.push(r); }

  const stmtVisit = new Map<string, Visit>();
  const stmtNo = new Map<string, string>();
  const linesOf = new Map<string, VisitLine[]>();
  for (const l of lines.rows) { const arr = linesOf.get(l.invoice_id) ?? []; arr.push({ description: l.description, amount: l.amount }); linesOf.set(l.invoice_id, arr); }
  const moneyOf = (v: Visit) => (v.money ??= { statements: [], payments: [], charged: '', paid: '', payor: null, owed: '', owedCents: 0n, paidCents: 0n, chargedCents: 0n });
  for (const s of stmts.rows) {
    const v = place(s.appointment_id, s.issued_at, dayKey(s.issued_at), true)!;
    const no = statementNo(s.series_prefix, s.number);
    stmtVisit.set(s.id, v); stmtNo.set(s.id, no);
    moneyOf(v).statements.push({ id: s.id, no, total: s.total, status: s.status, lines: linesOf.get(s.id) ?? [], payor: s.payor_name, payorShare: Number(s.payor_share) > 0 ? s.payor_share : null });
  }
  const paidBy = new Map<Visit, bigint>();
  for (const y of pays.rows) {
    const v = (y.invoice_id && stmtVisit.get(y.invoice_id)) || onDay(y.received_at, y.paid_on ?? dayKey(y.received_at), false);
    if (!v) continue;
    moneyOf(v).payments.push({ id: y.id, amount: y.amount, method: methodLabel(y.method), paidOn: y.paid_on, voided: !!y.voided_at, birRef: y.bir_ref, by: y.full_name, statementNo: y.invoice_id ? stmtNo.get(y.invoice_id) ?? null : null });
    if (!y.voided_at) paidBy.set(v, (paidBy.get(v) ?? 0n) + fromDb(y.amount));
  }
  // What the visit came to: the same rule as patient_balance() (022), one statement at a time.
  for (const v of visits.values()) {
    if (!v.money) continue;
    let charged = 0n, owed = 0n, payorShare = 0n;
    const paid = paidBy.get(v) ?? 0n;
    for (const s of v.money.statements) {
      if (s.status === 'void') continue;
      const total = fromDb(s.total);
      const live = pays.rows.filter((y) => y.invoice_id === s.id && !y.voided_at);
      const got = live.reduce((n, y) => n + fromDb(y.amount), 0n);
      const payorPaid = live.filter((y) => PAYOR_METHODS.has(y.method)).reduce((n, y) => n + fromDb(y.amount), 0n);
      const share = s.payorShare ? fromDb(s.payorShare) : 0n;
      const left = total - got;
      const payorLeft = share - payorPaid;
      charged += total; payorShare += share;
      const cap = payorLeft < left ? payorLeft : left;
      owed += left - (cap > 0n ? cap : 0n);
    }
    v.money.chargedCents = charged; v.money.paidCents = paid; v.money.owedCents = owed > 0n ? owed : 0n;
    v.money.charged = pesos(charged); v.money.paid = pesos(paid); v.money.owed = pesos(owed > 0n ? owed : 0n);
    v.money.payor = payorShare > 0n ? pesos(payorShare) : null;
  }

  for (const k of consents) { const v = visits.get(k.visitId); if (v) v.consents.push(k); }
  // The consent forms (039): a form prepared from a visit belongs to it, signed or still to sign; one signed through
  // an intake or on paper with no visit named joins the visit of the day it was signed (a paper's own day), and
  // never makes a day of its own. A form nobody signed and no visit names stays in Consent.
  for (const d of docs) {
    if (d.cancelledAt) continue;
    const s = d.latest;
    let v = d.appointmentId ? visits.get(d.appointmentId) ?? null : null;
    if (!v && s) {
      const day = s.channel === 'paper' && s.signedOn ? s.signedOn : dayKey(new Date(s.signedAt));
      v = onDay(s.channel === 'paper' && s.signedOn ? new Date(`${s.signedOn}T12:00:00+08:00`) : new Date(s.signedAt), day, false);
    }
    if (v) v.forms.push(d);
  }
  for (const v of visits.values()) v.forms.sort((a, b) => (a.template?.order ?? 999) - (b.template?.order ?? 999) || +new Date(a.preparedAt) - +new Date(b.preparedAt));
  for (const k of agreed.rows) {
    const v = visits.get(k.appointment_id);
    if (v) { v.agreed.push({ title: k.title, how: CHANNEL[k.channel] ?? k.channel, by: k.given_by_name, at: k.given_at }); }
  }
  for (const m of texts.rows) {
    const v = visits.get(m.appointment_id);
    if (v) { v.texts.push({ word: m.direction === 'in' ? 'Reply from the patient' : TEXT_WORD[m.kind] ?? 'Text', at: m.created_at, failed: m.status === 'failed', incoming: m.direction === 'in' }); }
  }
  for (const s of x.vitals) { const v = place(s.visitId, s.at, dayKey(s.at), false); if (v) { v.vitals.push(s); } }
  for (const l of x.letters) { const v = onDay(l.at, l.issuedOn ?? dayKey(l.at), false); if (v) { v.letters.push(l); } }
  for (const p of x.plans) for (const a of p.adjustments) {
    const at = new Date(`${a.on}T12:00:00+08:00`);
    const v = onDay(at, a.on ?? dayKey(at), false);
    if (v) { v.adjustments.push({ id: a.id, wire: a.wire, note: a.note, by: a.by }); }
  }
  for (const f of c.files) { const v = place(f.visitId, f.at, f.takenAt ?? dayKey(f.at), false); if (v) { v.files.push(f); } }

  for (const v of visits.values()) {
    const t = new Set<number>([...v.procs.map((p) => p.fdi).filter((n): n is number => !!n), ...v.notes.flatMap((n) => n.teeth), ...v.asked, ...v.files.map((f) => f.fdi).filter((n): n is number => !!n)]);
    v.teeth = [...t].sort((a, b) => a - b);
    v.procs.sort((a, b) => +new Date(a.at) - +new Date(b.at));
    if (!v.id) {
      // A day with nothing on the book: its dentist is whoever did the work.
      v.dentist = v.procs.find((p) => p.dentist)?.dentist ?? v.notes.find((n) => n.dentist)?.dentist ?? v.rx.find((r) => r.prescriber)?.prescriber ?? null;
    }
  }
  return [...visits.values()].sort((a, b) => +b.at - +a.at);
}
