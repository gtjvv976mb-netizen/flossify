// Patient charges, payments and the papers the desk prints for them.
//
// A charge is a numbered statement of account; a payment is recorded against
// it, in parts if need be, and each has an acknowledgment of payment. Flossify
// is NOT a BIR-registered invoicing system: nothing here is an official
// receipt or a sales invoice, and nothing on screen or paper may call it one.
// The clinic issues those from its own registered booklet or system, and the
// desk can write that document's number on the payment (bir_ref) so the two
// can be matched.
//
// Money never touches a float. Amounts are bigint centavos in this file,
// numeric(12, 2) in Postgres, and strings in between; Intl formats the string.
//
// Every function that writes takes the transaction withClinic() opened, so
// row-level security scopes it to one clinic, and writes one audit_log row.
// Numbers: one running series per clinic (SERIES), handed out by an upsert on
// invoice_series in the statement's own transaction. The row lock makes
// concurrent saves take turns, and a save that rolls back gives its number
// back, so the series has no gaps and no duplicates (022 explains the rest).

import type { Tx } from './db';

export const SERIES = 'SOA';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LINES_MAX = 30;
export const QTY_MAX = 99;
export const DESC_MAX = 120;
export const ID_NO_MAX = 40;
export const REF_MAX = 60;
export const BIR_REF_MAX = 40;
export const REASON_MIN = 4;
export const REASON_MAX = 200;
/** numeric(12, 2) holds up to 9,999,999,999.99; a clinic statement stays far below. */
const MONEY_MAX = 99_999_999n; // ₱999,999.99 in centavos

/**
 * The line every paper and the billing page carry. Plain, and true. It names
 * no BIR document this paper could be taken for: the clinic's own BIR invoice
 * or receipt is a separate paper, from its own registered booklet or system.
 */
export const NOT_BIR =
  'Flossify is not a BIR-registered invoicing system. The clinic’s BIR invoice or receipt is a separate paper.';

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type Cents = bigint;

/** What the desk typed — "1,500", "₱1500.50", "800.5" — as centavos. Anything else is null. */
export function parseMoney(input: string): Cents | null {
  const t = String(input ?? '').replace(/[₱,\s]/g, '').replace(/^php/i, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const c = BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
  return c <= MONEY_MAX ? c : null;
}

/** A numeric from Postgres ("1234.50", "-12.5", "0") as centavos. */
export function fromDb(v: string | number | bigint | null | undefined): Cents {
  if (v === null || v === undefined || v === '') return 0n;
  if (typeof v === 'bigint') return v * 100n;
  const s = String(v).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`not an amount: ${s}`);
  const frac = (m[3] ?? '').padEnd(2, '0');
  // numeric(12, 2) never carries more than two places; a sum of them neither.
  const c = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2)) + (frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n);
  return m[1] ? -c : c;
}

/** Centavos as the string Postgres reads into numeric: "1500.50". */
export function toDb(c: Cents): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}

const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PESO_WHOLE = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

/** ₱1,500.50 — the same Intl peso as the rest of the workspace, with centavos, because a statement has them. */
export const pesos = (c: Cents | string): string => PESO.format((typeof c === 'bigint' ? toDb(c) : c) as any);
/** ₱1,501 — whole pesos, for tiles and hints, like the Today page. */
export const pesosWhole = (c: Cents | string): string => PESO_WHOLE.format((typeof c === 'bigint' ? toDb(c) : c) as any);
/** For inputs: "1500.50", or "1500" when there are no centavos. */
export const moneyField = (c: Cents): string => (c % 100n === 0n ? String(c / 100n) : toDb(c));

// ---------------------------------------------------------------------------
// Words the pages share
// ---------------------------------------------------------------------------

export const METHODS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Card', bank_transfer: 'Bank transfer', hmo: 'HMO', philhealth: 'PhilHealth',
};
/** Money that comes from the payor, not from the patient's pocket. */
export const PAYOR_METHODS = new Set(['hmo', 'philhealth']);
export const REF_LABEL: Record<string, string> = {
  cash: 'Reference', gcash: 'GCash reference no.', maya: 'Maya reference no.', card: 'Approval no. on the card slip',
  bank_transfer: 'Bank reference', hmo: 'LOA or HMO reference', philhealth: 'PhilHealth reference',
};
export const methodLabel = (m: string) => METHODS[m] ?? (m === 'cheque' ? 'Cheque' : m);

export const DISCOUNTS = {
  none: { label: 'No discount', line: '' },
  senior: { label: 'Senior citizen, 20%', line: 'Senior citizen discount, 20%' },
  pwd: { label: 'Person with disability, 20%', line: 'PWD discount, 20%' },
} as const;
export type DiscountKind = keyof typeof DISCOUNTS;
/** The statutory 20%, on the charges, rounded to the centavo (half up). */
export const discountOf = (subtotal: Cents, kind: string): Cents =>
  kind === 'senior' || kind === 'pwd' ? (subtotal * 20n + 50n) / 100n : 0n;

/** Status is never colour alone: each carries its word. The tones are the Today page's. */
export const STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  issued: { label: 'Unpaid', tone: 'text-caries', dot: 'bg-caries' },
  partly_paid: { label: 'Part paid', tone: 'text-crown', dot: 'bg-crown' },
  paid: { label: 'Paid', tone: 'text-accent', dot: 'bg-accent' },
  void: { label: 'Void', tone: 'text-muted', dot: 'bg-line' },
  draft: { label: 'Draft', tone: 'text-muted', dot: 'bg-line' },
};

export const statementNo = (prefix: string, n: number | string) => `${prefix}-${String(n).padStart(6, '0')}`;

/** Who may charge and record payments: the desk (secretary), the owner, the admin, and anyone the owner lets see finance here. */
export const canBill = (role: string, finance: boolean) => role === 'owner' || role === 'admin' || role === 'secretary' || finance;
/** Who may void: the owner and the admin, with a reason. */
export const canVoid = (role: string) => role === 'owner' || role === 'admin';

// ---------------------------------------------------------------------------
// Manila dates
// ---------------------------------------------------------------------------

const parts = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'Asia/Manila' }).formatToParts(d).map((p) => [p.type, p.value]));
/** 24 Sep 2026 */
export const day = (d: Date | string | null) => {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(`${d}T12:00:00+08:00`) : d;
  const p = parts(x, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${p.day} ${p.month} ${p.year}`;
};
/** 24 Sep 2026, 3:05 pm */
export const stamp = (d: Date) => {
  const p = parts(d, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
};
/** 2026-09-24, today in Manila unless told otherwise. */
export const isoDay = (d: Date = new Date()) => {
  const p = parts(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
};
/** YYYY-MM-DD that is a day on the calendar. Date.parse alone takes 2026-02-31 (as 3 Mar) and Postgres then refuses it. */
export const realDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
/** A date column (pg returns Date at local midnight, or a string) as YYYY-MM-DD, without shifting the day. */
export const dateCol = (v: Date | string) => {
  if (typeof v === 'string') return v.slice(0, 10);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// The fee guide
// ---------------------------------------------------------------------------

export interface FeeRow {
  id: string; code: string; name: string; local_name: string | null; category: string | null;
  default_price: string; price_max: string | null; price_from: boolean; unit: string | null;
}

/** The price a guide row allows. max null = no ceiling ("from ₱300"); min = max = a fixed price. */
export function priceRange(r: FeeRow): { min: Cents; max: Cents | null; fixed: boolean } {
  const min = fromDb(r.default_price);
  const max = r.price_max != null ? fromDb(r.price_max) : r.price_from ? null : min;
  return { min, max, fixed: max !== null && max === min };
}

/** "₱800 – ₱1,500 per tooth", "from ₱300", "₱500, fixed". */
export function rangeText(r: FeeRow): string {
  const { min, max, fixed } = priceRange(r);
  const core = fixed ? `${pesosWhole(min)}, fixed` : max === null ? `from ${pesosWhole(min)}` : `${pesosWhole(min)} – ${pesosWhole(max)}`;
  return r.unit ? `${core} ${r.unit}` : core;
}

export async function feeGuide(tx: Tx): Promise<FeeRow[]> {
  return (await tx.query(
    `select id, code, name, local_name, category, default_price, price_max, price_from, unit
       from procedure_catalog where active
      order by coalesce(array_position(array['prevent','restore','replace','surgery','cosmetic','ortho'], category), 99), name`)).rows;
}

// ---------------------------------------------------------------------------
// Who else pays
// ---------------------------------------------------------------------------

export interface PayorOption { value: string; kind: 'hmo' | 'philhealth'; name: string }

/**
 * The HMOs and PhilHealth this branch deals with: its payors on the Claims
 * page, the HMOs it ticked in Settings, and PhilHealth when it is accredited.
 * The posted value must be one of these; nothing is typed free.
 */
export async function payorOptions(tx: Tx, hmoNames: Map<string, string>): Promise<PayorOption[]> {
  const providers = (await tx.query(`select name, kind from hmo_provider where active order by kind = 'philhealth' desc, name`)).rows as { name: string; kind: string }[];
  const takes = (await tx.query(`select hmo_id from clinic_hmo order by hmo_id`)).rows.map((r) => hmoNames.get(r.hmo_id)).filter((n): n is string => !!n);
  const accredited = (await tx.query(`select philhealth_dental from clinic`)).rows[0]?.philhealth_dental === true;
  const out: PayorOption[] = [];
  const seen = new Set<string>();
  const push = (kind: 'hmo' | 'philhealth', name: string) => {
    const key = `${kind}:${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value: `${kind}:${name}`, kind, name });
  };
  if (accredited || providers.some((p) => p.kind === 'philhealth')) push('philhealth', 'PhilHealth');
  for (const p of providers) if (p.kind === 'hmo') push('hmo', p.name);
  for (const n of takes) push('hmo', n);
  return out;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const audit = (tx: Tx, clinicId: string, staffId: string, action: string, entity: 'invoice' | 'payment', id: string) =>
  tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, $4, $5)`, [clinicId, staffId, action, entity, id]);

// ---------------------------------------------------------------------------
// Charging: a numbered statement
// ---------------------------------------------------------------------------

export interface LineIn { catalogId: string; desc: string; qty: string; price: string }
export interface ChargeIn {
  patientId: string; lines: LineIn[]; discount: string; discountId: string;
  payor: string; payorShare: string; formKey: string;
}
export interface Totals { subtotal: Cents; discount: Cents; total: Cents; payorShare: Cents; patientPart: Cents }

/** A second post of the same form: the statement it already made. */
class AlreadySaved extends Error {
  id: string;
  constructor(id: string) { super('already saved'); this.id = id; }
}

/**
 * Check what the desk typed against the fee guide, number the statement and
 * save it with its lines. Returns the new (or already saved) statement's id,
 * or every sentence that needs fixing.
 */
export async function createStatement(
  tx: Tx, clinicId: string, staffId: string, input: ChargeIn, payors: PayorOption[],
): Promise<{ id: string } | { problems: string[] }> {
  const problems: string[] = [];

  const patient = UUID.test(input.patientId)
    ? (await tx.query(`select id from patient where id = $1 and archived_at is null`, [input.patientId])).rows[0]
    : null;
  if (!patient) problems.push('Pick the patient from the search.');

  const lines = input.lines.filter((l) => l.catalogId || l.desc.trim() || l.price.trim());
  if (lines.length === 0) problems.push('Add at least one line: a service from the fee guide, or something else with a price.');
  if (lines.length > LINES_MAX) problems.push(`A statement holds up to ${LINES_MAX} lines.`);

  const ids = [...new Set(lines.map((l) => l.catalogId).filter((id) => UUID.test(id)))];
  const guide = new Map<string, FeeRow>(
    ids.length ? (await tx.query(`select id, code, name, local_name, category, default_price, price_max, price_from, unit from procedure_catalog where id = any($1::uuid[]) and active`, [ids])).rows.map((r: FeeRow) => [r.id, r]) : [],
  );

  const clean: { catalogId: string | null; desc: string; qty: bigint; price: Cents; amount: Cents }[] = [];
  lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    const row = l.catalogId ? guide.get(l.catalogId) : undefined;
    if (l.catalogId && !row) { problems.push(`${n}: that service is no longer in the fee guide. Remove the line and add it again.`); return; }
    const desc = (l.desc.replace(/\s+/g, ' ').trim() || row?.name || '').slice(0, 400);
    if (!desc) problems.push(`${n}: say what it is for.`);
    else if (desc.length > DESC_MAX) problems.push(`${n}: keep the description under ${DESC_MAX} characters.`);
    const qtyText = l.qty.trim() || '1';
    const qty = /^\d{1,2}$/.test(qtyText) ? BigInt(qtyText) : 0n;
    if (qty < 1n || qty > BigInt(QTY_MAX)) problems.push(`${n}: quantity is a whole number from 1 to ${QTY_MAX}.`);
    const price = parseMoney(l.price);
    if (price === null) { problems.push(`${n}: the price is a peso amount, like 1500 or 1500.50.`); return; }
    if (row) {
      const { min, max, fixed } = priceRange(row);
      const label = row.name;
      if (fixed && price !== min) problems.push(`${n}: ${label} is ${pesos(min)} in the fee guide. To charge another amount, add it as something else.`);
      else if (!fixed && (price < min || (max !== null && price > max)))
        problems.push(`${n}: ${label} is ${rangeText(row)} in the fee guide. Charge within that, or add it as something else.`);
    } else if (price <= 0n) {
      problems.push(`${n}: give it a price above zero.`);
    }
    clean.push({ catalogId: row?.id ?? null, desc, qty, price, amount: qty * price });
  });

  const subtotal = clean.reduce((s, l) => s + l.amount, 0n);
  if (lines.length > 0 && problems.length === 0 && subtotal <= 0n) problems.push('The statement adds up to nothing. Give a line a price.');
  if (subtotal > MONEY_MAX) problems.push('That is more than one statement can hold. Split it in two.');

  const kind: DiscountKind = Object.hasOwn(DISCOUNTS, input.discount) ? (input.discount as DiscountKind) : 'none';
  const idNo = input.discountId.replace(/\s+/g, ' ').trim();
  if (kind !== 'none' && !idNo) problems.push(`Write the ${kind === 'senior' ? 'senior citizen (OSCA)' : 'PWD'} ID number the discount is given against.`);
  if (idNo.length > ID_NO_MAX) problems.push(`Keep the ID number under ${ID_NO_MAX} characters.`);
  const discount = discountOf(subtotal, kind);
  const total = subtotal - discount;

  const payor = input.payor ? payors.find((p) => p.value === input.payor) : undefined;
  if (input.payor && !payor) problems.push('Pick the HMO or PhilHealth from the list.');
  const shareText = input.payorShare.trim();
  let payorShare = 0n;
  if (payor) {
    const s = parseMoney(shareText);
    if (s === null || s <= 0n) problems.push(`Write how much ${payor.name} pays, in pesos.`);
    else if (s > total) problems.push(`${payor.name}’s part (${pesos(s)}) is more than the total (${pesos(total)}).`);
    else payorShare = s;
  } else if (shareText && parseMoney(shareText) !== 0n) {
    problems.push('Pick who pays that part, or clear the amount.');
  }

  if (!UUID.test(input.formKey)) problems.push('The page had gone stale. Try that once more.');
  if (problems.length > 0) return { problems };

  try {
    // The number first: the upsert takes the series row's lock, so a second
    // save waits here until this one commits or rolls back.
    const { rows: [num] } = await tx.query(
      `insert into invoice_series (clinic_id, prefix, next_number) values ($1, $2, 2)
       on conflict (clinic_id, prefix) do update set next_number = invoice_series.next_number + 1
       returning next_number - 1 as number`, [clinicId, SERIES]);
    // The same form posted twice: roll this one back (the number returns) and show the first.
    const dup = (await tx.query(`select id from invoice where form_key = $1`, [input.formKey])).rows[0];
    if (dup) throw new AlreadySaved(dup.id);

    const { rows: [inv] } = await tx.query(
      // issued_at is the moment the number was taken (clock_timestamp, not the
      // transaction's start), so number order and time order always agree.
      `insert into invoice (clinic_id, patient_id, series_prefix, number, issued_at, subtotal, discount, discount_kind, discount_id_no,
                            vat_rate, vat_amount, total, payor_kind, payor_name, payor_share, status, created_by, form_key)
       values ($1, $2, $3, $4, clock_timestamp(), $5, $6, $7, $8, 0, 0, $9, $10, $11, $12, 'issued', $13, $14) returning id`,
      [clinicId, input.patientId, SERIES, num.number, toDb(subtotal), toDb(discount), kind, kind === 'none' ? null : idNo,
       toDb(total), payor?.kind ?? null, payor?.name ?? null, toDb(payorShare), staffId, input.formKey]);
    let no = 0;
    for (const l of clean) {
      await tx.query(
        `insert into invoice_line (clinic_id, invoice_id, catalog_id, description, quantity, unit_price, amount, line_no)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [clinicId, inv.id, l.catalogId, l.desc, String(l.qty), toDb(l.price), toDb(l.amount), ++no]);
    }
    await audit(tx, clinicId, staffId, 'invoice.create', 'invoice', inv.id);
    return { id: inv.id };
  } catch (e) {
    if (e instanceof AlreadySaved) throw e;
    // Two posts of one form at the same instant: the unique index stops the second.
    if ((e as any)?.code === '23505' && String((e as any)?.constraint) === 'invoice_form_key') throw new AlreadySaved('');
    throw e;
  }
}

/** Run createStatement in its own clinic transaction, turning a repeated form into the statement it made. */
export async function saveStatement(
  withClinic: <T>(id: string, fn: (tx: Tx) => Promise<T>) => Promise<T>,
  clinicId: string, staffId: string, input: ChargeIn, payors: PayorOption[],
): Promise<{ id: string; again?: boolean } | { problems: string[] }> {
  try {
    return await withClinic(clinicId, (tx) => createStatement(tx, clinicId, staffId, input, payors));
  } catch (e) {
    if (!(e instanceof AlreadySaved)) throw e;
    const id = e.id || (await withClinic(clinicId, async (tx) => (await tx.query(`select id from invoice where form_key = $1`, [input.formKey])).rows[0]?.id));
    if (!id) throw e;
    return { id, again: true };
  }
}

// ---------------------------------------------------------------------------
// Reading a statement
// ---------------------------------------------------------------------------

export interface Statement {
  id: string; series_prefix: string; number: string; issued_at: Date; status: string;
  subtotal: string; discount: string; discount_kind: string | null; discount_id_no: string | null; total: string;
  payor_kind: string | null; payor_name: string | null; payor_share: string;
  voided_at: Date | null; void_reason: string | null; voided_by_name: string | null; created_by_name: string | null;
  patient_id: string; first_name: string; last_name: string; chart_no: string; phone: string | null;
}
export interface Line { description: string; quantity: string; unit_price: string; amount: string; catalog_id: string | null }
export interface Payment {
  id: string; seq: number | null; method: string; amount: string; reference: string | null; bir_ref: string | null;
  paid_on: string; received_at: Date; received_by_name: string | null;
  voided_at: Date | null; void_reason: string | null; voided_by_name: string | null;
  /** The latest correction of bir_ref, if any: the number it replaced and why. */
  bir_ref_was: string | null; bir_ref_fix_reason: string | null;
}
export interface Sums { paid: Cents; payorPaid: Cents; balance: Cents; payorDue: Cents; patientDue: Cents }

export async function loadStatement(tx: Tx, id: string): Promise<{ s: Statement; lines: Line[]; payments: Payment[]; sums: Sums } | null> {
  if (!UUID.test(id)) return null;
  const s = (await tx.query(
    `select i.id, i.series_prefix, i.number, i.issued_at, i.status, i.subtotal, i.discount, i.discount_kind, i.discount_id_no, i.total,
            i.payor_kind, i.payor_name, i.payor_share, i.voided_at, i.void_reason,
            vs.full_name as voided_by_name, cs.full_name as created_by_name,
            p.id as patient_id, p.first_name, p.last_name, p.chart_no, p.phone
       from invoice i
       join patient p on p.id = i.patient_id
       left join staff vs on vs.id = i.voided_by
       left join staff cs on cs.id = i.created_by
      where i.id = $1`, [id])).rows[0] as Statement | undefined;
  if (!s) return null;
  const lines = (await tx.query(
    `select description, quantity, unit_price, amount, catalog_id from invoice_line where invoice_id = $1 order by line_no nulls last, id`, [id])).rows as Line[];
  const payments = (await tx.query(
    `select y.id, y.seq, y.method, y.amount, y.reference, y.bir_ref, y.paid_on::text as paid_on, y.received_at, y.voided_at, y.void_reason,
            rs.full_name as received_by_name, vs.full_name as voided_by_name,
            fx.old_ref as bir_ref_was, fx.reason as bir_ref_fix_reason
       from payment y left join staff rs on rs.id = y.received_by left join staff vs on vs.id = y.voided_by
       left join lateral (select c.old_ref, c.reason from payment_bir_ref_change c
                           where c.payment_id = y.id order by c.changed_at desc, c.id limit 1) fx on true
      where y.invoice_id = $1 order by y.seq nulls first, y.received_at`, [id])).rows as Payment[];
  return { s, lines, payments, sums: sumsOf(s, payments) };
}

/** What is paid, what is left, and how much of what is left the payor is expected to send. */
export function sumsOf(s: { total: string; payor_share: string; status: string }, payments: { amount: string; method: string; voided_at: Date | null }[]): Sums {
  const live = payments.filter((p) => !p.voided_at);
  const paid = live.reduce((n, p) => n + fromDb(p.amount), 0n);
  const payorPaid = live.filter((p) => PAYOR_METHODS.has(p.method)).reduce((n, p) => n + fromDb(p.amount), 0n);
  const balance = s.status === 'void' ? 0n : fromDb(s.total) - paid;
  const owedByPayor = fromDb(s.payor_share) - payorPaid;
  const payorDue = s.status === 'void' || balance <= 0n || owedByPayor <= 0n ? 0n : owedByPayor < balance ? owedByPayor : balance;
  const patientDue = balance - payorDue;
  return { paid, payorPaid, balance, payorDue, patientDue: patientDue > 0n ? patientDue : 0n };
}

/**
 * The same rule in SQL, one row per statement that is not void: what is left
 * on it (left_), and how that splits between the HMO or PhilHealth still
 * expected to pay (payor_due) and the patient (patient_due; negative is a
 * credit). patient_balance() in 022 sums patient_due for one patient. The
 * tiles on Today and Billing count patient_due, so a patient is never asked
 * for the part their HMO or PhilHealth covers. Use inside withClinic().
 */
export const DUE_SQL = `
  select d.id, d.patient_id, d.issued_at, d.payor_name, d.left_,
         greatest(least(d.payor_share - d.payor_paid, d.left_), 0) as payor_due,
         d.left_ - greatest(least(d.payor_share - d.payor_paid, d.left_), 0) as patient_due
    from (select i.id, i.patient_id, i.issued_at, i.payor_name, i.payor_share,
                 i.total - coalesce(sum(y.amount), 0) as left_,
                 coalesce(sum(y.amount) filter (where y.method in ('hmo', 'philhealth')), 0) as payor_paid
            from invoice i
            left join payment y on y.invoice_id = i.id and y.voided_at is null
           where i.status in ('issued', 'partly_paid', 'paid')
           group by i.id) d`;

/** The statement's status from its payments. Called after every payment and every payment void, under the row lock. */
const restatus = (tx: Tx, id: string) =>
  tx.query(
    `update invoice i
        set status = case when s.paid >= i.total then 'paid' when s.paid > 0 then 'partly_paid' else 'issued' end
       from (select coalesce(sum(amount), 0) as paid from payment where invoice_id = $1 and voided_at is null) s
      where i.id = $1 and i.status <> 'void'`, [id]);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentIn { method: string; amount: string; reference: string; paidOn: string; birRef: string; formKey: string }

export async function recordPayment(
  tx: Tx, clinicId: string, staffId: string, invoiceId: string, input: PaymentIn,
): Promise<{ id: string; again?: boolean } | { problems: string[] }> {
  if (!UUID.test(invoiceId)) return { problems: ['That statement is not on this branch.'] };
  // Lock the statement: payments on one statement take turns, so the balance check holds.
  const inv = (await tx.query(`select id, patient_id, total, status, issued_at from invoice where id = $1 for update`, [invoiceId])).rows[0];
  if (!inv) return { problems: ['That statement is not on this branch.'] };
  if (inv.status === 'void') return { problems: ['That statement is void. Nothing can be paid on it.'] };

  if (UUID.test(input.formKey)) {
    const dup = (await tx.query(`select id from payment where form_key = $1`, [input.formKey])).rows[0];
    if (dup) return { id: dup.id, again: true };
  }

  const problems: string[] = [];
  if (!Object.hasOwn(METHODS, input.method)) problems.push('Pick how it was paid.');
  const amount = parseMoney(input.amount);
  const paid = fromDb((await tx.query(`select coalesce(sum(amount), 0) as paid from payment where invoice_id = $1 and voided_at is null`, [invoiceId])).rows[0].paid);
  const balance = fromDb(inv.total) - paid;
  if (amount === null || amount <= 0n) problems.push('Write the amount received, in pesos, like 500 or 500.50.');
  else if (balance <= 0n) problems.push('This statement is already paid in full.');
  else if (amount > balance) problems.push(`That is more than the balance of ${pesos(balance)}. Record ${pesos(balance)} and give the change.`);
  const reference = input.reference.replace(/\s+/g, ' ').trim();
  if (reference.length > REF_MAX) problems.push(`Keep the reference under ${REF_MAX} characters.`);
  const birRef = input.birRef.replace(/\s+/g, ' ').trim();
  if (birRef.length > BIR_REF_MAX) problems.push(`Keep the BIR invoice or receipt number under ${BIR_REF_MAX} characters.`);
  const today = isoDay();
  const paidOn = input.paidOn.trim() || today;
  const earliest = isoDay(new Date(Date.now() - 366 * 86_400_000));
  if (!realDay(paidOn)) problems.push('The date paid is a date, like 24 Sep 2026.');
  else if (paidOn > today) problems.push('The date paid cannot be after today.');
  else if (paidOn < earliest) problems.push('The date paid is more than a year ago. Check it.');
  if (!UUID.test(input.formKey)) problems.push('The page had gone stale. Try that once more.');
  if (problems.length > 0) return { problems };

  const seq = (await tx.query(`select coalesce(max(seq), 0) + 1 as n from payment where invoice_id = $1`, [invoiceId])).rows[0].n;
  const { rows: [pay] } = await tx.query(
    `insert into payment (clinic_id, invoice_id, patient_id, method, amount, reference, received_by, paid_on, seq, bir_ref, form_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [clinicId, invoiceId, inv.patient_id, input.method, toDb(amount!), reference || null, staffId, paidOn, seq, birRef || null, input.formKey]);
  await restatus(tx, invoiceId);
  await audit(tx, clinicId, staffId, 'payment.record', 'payment', pay.id);
  return { id: pay.id };
}

const cleanReason = (s: string) => s.replace(/\s+/g, ' ').trim();
const reasonProblem = (r: string) =>
  r.length < REASON_MIN ? 'Say why, in a few words. It stays on the record.' : r.length > REASON_MAX ? `Keep the reason under ${REASON_MAX} characters.` : '';
const birRefProblem = (ref: string) =>
  !ref ? 'Write the number from the BIR invoice or receipt you issued.'
  : ref.length > BIR_REF_MAX ? `Keep the BIR invoice or receipt number under ${BIR_REF_MAX} characters.` : '';

/**
 * Write in the BIR invoice or receipt number after the payment was recorded:
 * the desk often writes the booklet's receipt once the patient has gone. On a
 * payment that stands, when none is written yet (a second person writing at
 * the same moment gets 'missed' and sees the first). Anyone who may record a
 * payment may do this.
 */
export async function setBirRef(
  tx: Tx, clinicId: string, staffId: string, invoiceId: string, paymentId: string, refIn: string,
): Promise<'ok' | 'missed' | string> {
  const ref = cleanReason(refIn);
  const bad = birRefProblem(ref);
  if (bad) return bad;
  if (!UUID.test(invoiceId) || !UUID.test(paymentId)) return 'missed';
  const r = await tx.query(
    `update payment set bir_ref = $3 where id = $1 and invoice_id = $2 and bir_ref is null and voided_at is null`,
    [paymentId, invoiceId, ref]);
  if (!r.rowCount) return 'missed';
  await audit(tx, clinicId, staffId, 'payment.bir_ref', 'payment', paymentId);
  return 'ok';
}

/**
 * Correct a BIR invoice or receipt number already written (a typo should not
 * cost a void). Anyone who may record a payment may, with a reason, on a
 * payment that stands. The old number, the new one, who and why go to
 * payment_bir_ref_change first; 022's trigger refuses the change without that
 * row. `was` is the number the page showed: if it has changed since, nothing
 * is written ('missed').
 */
export async function fixBirRef(
  tx: Tx, clinicId: string, staffId: string, invoiceId: string, paymentId: string, was: string, refIn: string, reasonIn: string,
): Promise<'ok' | 'missed' | string> {
  const ref = cleanReason(refIn);
  const reason = cleanReason(reasonIn);
  const bad = birRefProblem(ref) || reasonProblem(reason);
  if (bad) return bad;
  if (!UUID.test(invoiceId) || !UUID.test(paymentId)) return 'missed';
  const pay = (await tx.query(
    `select id, bir_ref from payment where id = $1 and invoice_id = $2 and voided_at is null for update`, [paymentId, invoiceId])).rows[0];
  if (!pay || pay.bir_ref === null || pay.bir_ref !== was) return 'missed';
  if (pay.bir_ref === ref) return 'That is the number already written. Change it, or close this.';
  await tx.query(
    `insert into payment_bir_ref_change (clinic_id, payment_id, old_ref, new_ref, reason, changed_by) values ($1, $2, $3, $4, $5, $6)`,
    [clinicId, paymentId, pay.bir_ref, ref, reason, staffId]);
  await tx.query(`update payment set bir_ref = $2 where id = $1`, [paymentId, ref]);
  await audit(tx, clinicId, staffId, 'payment.bir_ref.fix', 'payment', paymentId);
  return 'ok';
}

export async function voidPayment(
  tx: Tx, clinicId: string, staffId: string, invoiceId: string, paymentId: string, reasonIn: string,
): Promise<'ok' | 'missed' | string> {
  const reason = cleanReason(reasonIn);
  const bad = reasonProblem(reason);
  if (bad) return bad;
  if (!UUID.test(invoiceId) || !UUID.test(paymentId)) return 'missed';
  const inv = (await tx.query(`select id from invoice where id = $1 for update`, [invoiceId])).rows[0];
  if (!inv) return 'missed';
  const r = await tx.query(
    `update payment set voided_at = now(), voided_by = $3, void_reason = $4 where id = $1 and invoice_id = $2 and voided_at is null`,
    [paymentId, invoiceId, staffId, reason]);
  if (!r.rowCount) return 'missed';
  await restatus(tx, invoiceId);
  await audit(tx, clinicId, staffId, 'payment.void', 'payment', paymentId);
  return 'ok';
}

export async function voidStatement(
  tx: Tx, clinicId: string, staffId: string, invoiceId: string, reasonIn: string,
): Promise<'ok' | 'missed' | string> {
  const reason = cleanReason(reasonIn);
  const bad = reasonProblem(reason);
  if (bad) return bad;
  if (!UUID.test(invoiceId)) return 'missed';
  const inv = (await tx.query(`select id, status from invoice where id = $1 for update`, [invoiceId])).rows[0];
  if (!inv || inv.status === 'void') return 'missed';
  const live = (await tx.query(`select count(*)::int as n from payment where invoice_id = $1 and voided_at is null`, [invoiceId])).rows[0].n;
  if (live > 0) return `A payment is still recorded on this statement. Void ${live === 1 ? 'that payment' : `those ${live} payments`} first, then the statement.`;
  await tx.query(`update invoice set status = 'void', voided_at = now(), voided_by = $2, void_reason = $3 where id = $1`, [invoiceId, staffId, reason]);
  await audit(tx, clinicId, staffId, 'invoice.void', 'invoice', invoiceId);
  return 'ok';
}

// ---------------------------------------------------------------------------
// The clinic's TIN and BIR branch code
// ---------------------------------------------------------------------------

/** 123-456-789-000: the nine digits of the TIN, then the three of the branch. */
const tinFmt = (nine: string, three: string) => `${nine.slice(0, 3)}-${nine.slice(3, 6)}-${nine.slice(6, 9)}-${three}`;

/**
 * What Settings saves. The TIN is kept as it is written on the clinic's BIR
 * Certificate of Registration: ###-###-###-### (123-456-789-000), nine digits
 * and three for the branch. The BIR branch code has its own box: five digits
 * (00000 for the main office), or three on older papers (000); the TIN's last
 * three are the branch code's last three, so the two must agree.
 *
 * Typed nine digits, the TIN takes its last three from the branch code box.
 * Typed fourteen (123-456-789-00000, the newer five-digit form), the last five
 * are the branch code. An empty TIN clears it.
 */
export function parseTin(tinIn: string, branchIn: string): { tin: string | null; branch: string; problems: string[] } {
  const problems: string[] = [];
  const tinText = tinIn.trim(), branchText = branchIn.trim();
  const td = tinText.replace(/\D/g, ''), bd = branchText.replace(/\D/g, '');
  let branch = bd;
  if (branchText && !/^[\d\s-]+$/.test(branchText)) problems.push('The BIR branch code is digits only: 00000 for the main office.');
  if (td.length === 14) {
    const five = td.slice(9);
    if (bd && bd !== five && bd !== five.slice(-3)) problems.push(`The TIN ends in branch code ${five}, but the branch code box says ${bd}. Make them the same.`);
    branch = five;
  }
  if (!branch) branch = '00000';
  const branchOk = /^(\d{3}|\d{5})$/.test(branch);
  if (!branchOk) problems.push('The BIR branch code is five digits (00000 for the main office), or three on older papers.');

  let tin: string | null = null;
  if (tinText) {
    if (!/^[\d\s-]+$/.test(tinText)) problems.push('The TIN is digits only, written like 123-456-789-000.');
    else if (td.length === 9 || td.length === 12 || td.length === 14) {
      const nine = td.slice(0, 9);
      const three = td.length === 9 ? (branchOk ? branch.slice(-3) : '000') : td.slice(-3);
      if (td.length === 12 && branchOk && bd && three !== branch.slice(-3))
        problems.push(`The TIN ends in ${three}, but the branch code box says ${branch}. The TIN’s last three digits are the branch code’s last three. Make them the same.`);
      if (/^0+$/.test(nine)) problems.push('That TIN is all zeros. Copy it from the clinic’s BIR Certificate of Registration.');
      else tin = tinFmt(nine, three);
    } else problems.push('Write the TIN like 123-456-789-000: twelve digits, as on the clinic’s BIR Certificate of Registration.');
  }
  return { tin: problems.length ? null : tin, branch, problems };
}

/** The TIN (###-###-###-###) and branch code as they print, from whatever is stored. Null when no TIN is set. */
export function tinParts(tin: string | null, branch: string | null): { tin: string; branch: string } | null {
  const d = (tin ?? '').replace(/\D/g, '');
  if (d.length < 9) return null;
  const b = (branch ?? '').replace(/\D/g, '');
  const three = d.length >= 12 ? d.slice(-3) : b ? b.slice(-3).padStart(3, '0') : '000';
  return { tin: tinFmt(d.slice(0, 9), three), branch: b || (d.length === 14 ? d.slice(9) : '00000') };
}
