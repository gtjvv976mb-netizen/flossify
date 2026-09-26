// HMO and PhilHealth claims, from filing to payment: the logic behind the
// claims section of Finances (/c/<slug>/finances/?show=claims) and behind
// /c/<slug>/claims/, which stays open to people without Finances (the list
// and its notes, never the amounts). Both pages render _Claims.astro.
//
// Every query runs inside withClinic(): row-level security keeps it to this
// clinic. The aging is the point of the list — it says who is sitting on the
// clinic's money, measured against each payor's own expected days rather
// than one number for everyone.
//
// Who may do what (re-checked here on every post, whatever the page showed):
// anyone with access to the branch may read the list and leave a note; the
// amounts, a new claim, filing, the payor's answer and payment are for those
// who may see claim money — the branch's finance flag, or the owner and the
// admin (canMoneyOf, the rule the claims page has always had).
//
// Each write locks the claim and checks it is still where the button said it
// was, so two people acting on one claim cannot move it twice: the second
// comes back "missed" and the page says the list is current.
//
// The CSV is the list as filtered, as a file: BOM, CRLF, quoted cells, and a
// cell that starts like a formula is written as text, so Excel opens it
// cleanly and runs nothing.

import { withClinic, type Tx } from '../../../../lib/db';
import { hmos } from '../../../../data/directory';
import { day, isoDay, stamp, HMO_WAITING_SQL } from '../../../../lib/invoices';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TEXT_MAX = 80;
export const REASON_MAX = 200;
export const NOTE_MAX = 600;
const MONEY_MAX = 9_999_999.99;
/** Rows drawn on the page; the CSV always has every one. */
export const SHOW_MAX = 300;

/**
 * The filter. Open is what the desk has to chase: every claim the payor has
 * and has not paid yet, approved ones included, because the money is not in
 * until it lands. It is the set HMO_WAITING_SQL counts (src/lib/invoices.ts),
 * so the "Stuck with HMOs" tile and the Open list always hold the same claims.
 * Resolved is settled: denied or paid.
 */
export const CLAIM_VIEWS = {
  open: { label: 'Open', one: 'open claim', noun: 'open claims', statuses: ['filed', 'partly_approved', 'approved'] },
  drafts: { label: 'Drafts', one: 'draft', noun: 'drafts', statuses: ['draft'] },
  resolved: { label: 'Resolved', one: 'resolved claim', noun: 'resolved claims', statuses: ['denied', 'paid'] },
  all: { label: 'All', one: 'claim', noun: 'claims', statuses: ['draft', 'filed', 'partly_approved', 'approved', 'denied', 'paid'] },
} as const;
export type ClaimView = keyof typeof CLAIM_VIEWS;
export interface ClaimFilter { view: ClaimView; payor: string }

// Who may see claim money and move a claim: can(ws, 'finance.money') in src/lib/can.ts — by default the
// owner, the admin, and anyone the owner lets see money at the branch.

/** The filter from the URL; `key` is the view's parameter (Finances: claims, the old page: view). */
export function claimFilterFrom(params: URLSearchParams, key: string): ClaimFilter {
  const v = params.get(key) ?? 'open';
  const p = params.get('payor') ?? '';
  return { view: Object.hasOwn(CLAIM_VIEWS, v) ? (v as ClaimView) : 'open', payor: UUID.test(p) ? p : '' };
}

export const CLAIM_STATUS: Record<string, string> = {
  draft: 'Draft', filed: 'Filed', partly_approved: 'Partly approved', approved: 'Approved', denied: 'Denied', paid: 'Paid',
};

/** "1,500" / "₱1500.50" → 1500.5; anything that is not a peso amount → null. */
const money = (s: string): number | null => {
  const t = s.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= MONEY_MAX ? n : null;
};
const iso = (d: Date | null) => (d ? isoDay(d) : '');

export interface Claim {
  id: string; status: string; claimed: string; approved: string | null;
  loa_number: string | null; member_no: string | null; submitted_ref: string | null; notes: string | null; denial_reason: string | null;
  filed_at: Date | null; resolved_at: Date | null; created_at: Date; days: number | null;
  provider_id: string; provider: string; provider_kind: string; expected_days: number;
  patient_id: string; first_name: string; last_name: string; chart_no: string;
}
export interface Provider { id: string; name: string; kind: string; expected_days: number; active: boolean }
export interface Recent { id: string; first_name: string; last_name: string; chart_no: string; last_visit: Date }
export interface ClaimSums {
  approved_unpaid: string; approved_n: number; paid_month: string; paid_n: number;
  /** HMO_WAITING_SQL: every open claim (waiting) and those past the payor's days (stuck), with what the payor still has to send. */
  waiting_n: number; waiting: string; stuck_n: number; stuck: string;
}
export interface ClaimsData {
  providers: Provider[]; claims: Claim[]; sums: ClaimSums; recent: Recent[]; takes: string[];
  /** How many claims each filter holds (for the payor chosen, or every payor): the numbers on the pills. */
  counts: Record<ClaimView, number>;
}

const nDays = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** How long the payor has had it, against their own expected days. */
export function aging(c: Pick<Claim, 'days' | 'status' | 'expected_days'>): { text: string; late: boolean } {
  if (c.days === null) return { text: c.status === 'draft' ? 'Not filed yet' : '—', late: false };
  if (c.status === 'paid') return { text: `Paid after ${nDays(c.days)}`, late: false };
  if (c.status === 'denied') return { text: `Denied after ${nDays(c.days)}`, late: false };
  const past = c.days - c.expected_days;
  if (past > 0) return { text: `${nDays(past)} past expected`, late: true };
  return { text: `${nDays(c.days)} · expected within ${c.expected_days}`, late: false };
}

/** The chip: a word on a tone (src/components/ws/status.ts). Never colour alone. */
export function claimTone(status: string, late: boolean): 'accent' | 'alert' | 'muted' | 'neutral' {
  if (status === 'paid') return 'accent';
  if (status === 'denied') return 'alert';
  if (status === 'draft') return 'muted';
  return late ? 'alert' : 'neutral';
}

/** The next thing to do with a claim, as the row's button says it. */
export function nextStep(status: string, canMoney: boolean): string {
  if (!canMoney) return 'Notes';
  if (status === 'draft') return 'File';
  if (status === 'filed') return 'Record answer';
  if (status === 'approved' || status === 'partly_approved') return 'Mark paid';
  return 'Notes';
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function loadClaims(clinicId: string, f: ClaimFilter, canMoney: boolean): Promise<ClaimsData> {
  return withClinic(clinicId, async (tx) => {
    const providers = (await tx.query(`select id, name, kind, expected_days, active from hmo_provider order by kind = 'philhealth', name`)).rows as Provider[];
    // Open first, oldest filing on top (the most aged is the most urgent); then drafts; then settled, newest first.
    const claims = (await tx.query(
      `select c.id, c.status, c.claimed, c.approved, c.loa_number, c.member_no, c.submitted_ref, c.notes, c.denial_reason,
              c.filed_at, c.resolved_at, c.created_at,
              case when c.filed_at is null then null
                   else extract(day from coalesce(case when c.status in ('paid', 'denied') then c.resolved_at end, now()) - c.filed_at)::int end as days,
              pr.id as provider_id, pr.name as provider, pr.kind as provider_kind, pr.expected_days,
              p.id as patient_id, p.first_name, p.last_name, p.chart_no
         from hmo_claim c
         join hmo_provider pr on pr.id = c.provider_id
         join patient p on p.id = c.patient_id
        where c.status = any($1::text[]) and ($2::uuid is null or c.provider_id = $2)
        order by case when c.status in ('filed', 'partly_approved', 'approved') then 0 when c.status = 'draft' then 1 else 2 end,
                 case when c.status in ('denied', 'paid') then -extract(epoch from coalesce(c.resolved_at, c.updated_at))
                      else extract(epoch from coalesce(c.filed_at, c.created_at)) end`,
      [CLAIM_VIEWS[f.view].statuses, f.payor || null])).rows as Claim[];
    // The summary follows the payor filter, not the status filter: it is the whole picture for that payor.
    // Open and past the payor's days are HMO_WAITING_SQL's waiting and stuck: the same claims as the Open list.
    const sums = (await tx.query(
      `select coalesce(sum(c.approved) filter (where c.status in ('approved', 'partly_approved')), 0) as approved_unpaid,
              count(*) filter (where c.status in ('approved', 'partly_approved') and c.approved > 0)::int as approved_n,
              coalesce(sum(coalesce(c.approved, c.claimed)) filter (where c.status = 'paid'
                and date_trunc('month', c.resolved_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila')), 0) as paid_month,
              count(*) filter (where c.status = 'paid'
                and date_trunc('month', c.resolved_at at time zone 'Asia/Manila') = date_trunc('month', now() at time zone 'Asia/Manila'))::int as paid_n
         from hmo_claim c where ($1::uuid is null or c.provider_id = $1)`, [f.payor || null])).rows[0];
    const waiting = (await tx.query(HMO_WAITING_SQL, [f.payor || null])).rows[0];
    const byStatus = new Map<string, number>((await tx.query(
      `select status, count(*)::int as n from hmo_claim where ($1::uuid is null or provider_id = $1) group by status`, [f.payor || null],
    )).rows.map((r) => [r.status as string, r.n as number]));
    const counts = Object.fromEntries((Object.keys(CLAIM_VIEWS) as ClaimView[]).map((v) =>
      [v, (CLAIM_VIEWS[v].statuses as readonly string[]).reduce((sum, st) => sum + (byStatus.get(st) ?? 0), 0)])) as Record<ClaimView, number>;
    // Who a new claim can be for: anyone seen here in the last 90 days, today included.
    const recent = canMoney ? (await tx.query(
      `select p.id, p.first_name, p.last_name, p.chart_no, max(a.starts_at) as last_visit
         from patient p join appointment a on a.patient_id = p.id
        where p.archived_at is null and a.status not in ('cancelled', 'no_show')
          and a.starts_at between now() - interval '90 days' and now() + interval '1 day'
        group by p.id order by p.first_name, p.last_name`)).rows as Recent[] : [];
    const takes = canMoney ? (await tx.query('select hmo_id from clinic_hmo order by hmo_id')).rows.map((r) => r.hmo_id as string) : [];
    return { providers, claims, sums: { ...sums, ...waiting }, recent, takes, counts };
  });
}

/** Where a new claim may go: any active payor, or an HMO the clinic takes that has no payor row yet. */
export function payorChoices(d: ClaimsData): { value: string; label: string }[] {
  const active = d.providers.filter((p) => p.active);
  return [
    ...active.map((p) => ({ value: p.id, label: p.kind === 'philhealth' ? `${p.name} (preventive dental benefit)` : p.name })),
    ...d.takes
      .map((id) => hmos.find((h) => h.id === id))
      .filter((h): h is (typeof hmos)[number] => !!h && !d.providers.some((p) => p.name.toLowerCase() === h.name.toLowerCase()))
      .map((h) => ({ value: `hmo:${h.id}`, label: h.name })),
  ];
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface NewDraft { patient: string; payor: string; loa: string; member: string; claimed: string; notes: string }
export const EMPTY_DRAFT: NewDraft = { patient: '', payor: '', loa: '', member: '', claimed: '', notes: '' };

export type ClaimPost =
  /** Back to the list: done=<act>, missed=<act>, or nothing (a post that had nothing to do). */
  | { go: { done?: string; missed?: string } }
  /** New claim refused: its panel opens again with the sentence and what was typed. */
  | { error: string; newDraft: NewDraft }
  /** A claim's form refused: that claim's panel opens again with the sentence and what was typed. */
  | { error: string; claim: string; typed: { ref?: string; amount?: string; reason?: string; note?: string } };

export async function postClaim(
  f: FormData,
  who: { clinicId: string; staffId: string; staffName: string; canMoney: boolean },
): Promise<ClaimPost> {
  const act = String(f.get('act') ?? '');
  const s = (k: string) => String(f.get(k) ?? '').replace(/\s+/g, ' ').trim();
  const id = String(f.get('id') ?? '');
  /** A note line as it goes on the record: when, who, what. */
  const noteLine = (text: string) => `${stamp(new Date())} · ${who.staffName}: ${text}`;
  const audit = (tx: Tx, action: string, claimId: string) =>
    tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'hmo_claim', $4)`,
      [who.clinicId, who.staffId, `claim.${action}`, claimId]);

  if (act === 'note') {
    // Anyone with access may leave a note; it is appended, never edited.
    const note = s('note');
    if (!UUID.test(id)) return { go: {} };
    if (!note) return { error: 'Write the note first.', claim: id, typed: { note } };
    if (note.length > NOTE_MAX) return { error: `Keep a note under ${NOTE_MAX} characters.`, claim: id, typed: { note } };
    const changed = await withClinic(who.clinicId, async (tx) => {
      const r = await tx.query(`update hmo_claim set notes = concat_ws(E'\n', notes, $2::text), updated_at = now() where id = $1`, [id, noteLine(note)]);
      if (r.rowCount) await audit(tx, 'note', id);
      return r.rowCount ?? 0;
    });
    return { go: changed ? { done: 'note' } : { missed: 'note' } };
  }

  // Money moves are for finance. The page did not offer the form; the post changes nothing.
  if (!who.canMoney) return { go: {} };

  if (act === 'new') {
    const draft: NewDraft = { patient: s('patient'), payor: s('payor'), loa: s('loa'), member: s('member'), claimed: s('claimed'), notes: s('notes') };
    const amount = money(draft.claimed);
    let error = '';
    if (!UUID.test(draft.patient)) error = 'Pick the patient the claim is for.';
    else if (!draft.payor) error = 'Pick the payor.';
    else if (amount === null || amount <= 0) error = 'The claimed amount needs to be a number above zero, like 1500 or 1500.50.';
    else if (draft.loa.length > TEXT_MAX || draft.member.length > TEXT_MAX) error = `Keep the LOA and member numbers under ${TEXT_MAX} characters.`;
    else if (draft.notes.length > NOTE_MAX) error = `Keep the note under ${NOTE_MAX} characters.`;
    if (error) return { error, newDraft: draft };
    const outcome = await withClinic(who.clinicId, async (tx) => {
      const p = (await tx.query(`select id from patient where id = $1 and archived_at is null`, [draft.patient])).rows[0];
      if (!p) return 'That patient is not on this branch’s list. Pick one from the list.';
      let providerId: string | null = null;
      if (UUID.test(draft.payor)) {
        providerId = (await tx.query(`select id from hmo_provider where id = $1 and active`, [draft.payor])).rows[0]?.id ?? null;
      } else if (draft.payor.startsWith('hmo:')) {
        // An HMO the clinic takes (Settings → HMOs) that has never had a claim here: its payor row starts now.
        const known = hmos.find((h) => h.id === draft.payor.slice(4));
        const takes = known && (await tx.query(`select 1 from clinic_hmo where hmo_id = $1`, [known.id])).rowCount;
        if (known && takes) {
          const have = (await tx.query(`select id from hmo_provider where kind = 'hmo' and lower(name) = lower($1) order by active desc limit 1`, [known.name])).rows[0];
          providerId = have?.id ?? (await tx.query(
            `insert into hmo_provider (clinic_id, name, expected_days, kind) values ($1, $2, 60, 'hmo')
             on conflict (clinic_id, lower(name)) do update set active = true returning id`, [who.clinicId, known.name])).rows[0].id;
        }
      }
      if (!providerId) return 'That payor is not on this branch’s list. Pick one from the list.';
      const { rows } = await tx.query(
        `insert into hmo_claim (clinic_id, provider_id, patient_id, loa_number, member_no, claimed, status, notes)
         values ($1, $2, $3, $4, $5, $6, 'draft', $7) returning id`,
        [who.clinicId, providerId, draft.patient, draft.loa || null, draft.member || null, amount, draft.notes ? noteLine(draft.notes) : null]);
      await audit(tx, 'new', rows[0].id);
      return '';
    });
    return outcome ? { error: outcome, newDraft: draft } : { go: { done: 'new' } };
  }

  if (['file', 'approve', 'partly', 'deny', 'paid'].includes(act) && UUID.test(id)) {
    const amountText = s('amount');
    const amount = money(amountText);
    const reason = s('reason'), ref = s('ref');
    const typed = { ref, amount: amountText, reason };
    if (act === 'file' && ref.length > TEXT_MAX) return { error: `Keep the payor’s reference under ${TEXT_MAX} characters.`, claim: id, typed };
    if ((act === 'approve' || act === 'partly') && (amount === null || amount <= 0)) return { error: 'Enter the amount the payor approved, in pesos.', claim: id, typed };
    if (act === 'deny' && !reason) return { error: 'Say why it was denied, in a few words. It goes on the record and helps the next filing.', claim: id, typed };
    if (act === 'deny' && reason.length > REASON_MAX) return { error: `Keep the reason under ${REASON_MAX} characters.`, claim: id, typed };
    const outcome = await withClinic(who.clinicId, async (tx): Promise<'ok' | 'missed' | string> => {
      // Lock the row, check it is where the button said it was, then move it.
      const c = (await tx.query(`select status, claimed from hmo_claim where id = $1 for update`, [id])).rows[0];
      if (!c) return 'missed';
      const from: Record<string, string[]> = { file: ['draft'], approve: ['filed'], partly: ['filed'], deny: ['filed'], paid: ['approved', 'partly_approved'] };
      if (!from[act].includes(c.status)) return 'missed';
      if (act === 'partly' && amount! >= Number(c.claimed)) return 'A partly approved amount is less than what was claimed. If they approved all of it, use Approved.';
      if (act === 'approve' && amount! > Number(c.claimed)) return `That is more than was claimed (₱${Number(c.claimed).toLocaleString('en-PH', { minimumFractionDigits: 2 })}). Check the amount on the payor’s answer.`;
      if (act === 'file') await tx.query(`update hmo_claim set status = 'filed', filed_at = now(), submitted_ref = coalesce(nullif($2, ''), submitted_ref), updated_at = now() where id = $1`, [id, ref]);
      if (act === 'approve') await tx.query(`update hmo_claim set status = 'approved', approved = $2, resolved_at = now(), denial_reason = null, updated_at = now() where id = $1`, [id, amount]);
      if (act === 'partly') await tx.query(`update hmo_claim set status = 'partly_approved', approved = $2, updated_at = now() where id = $1`, [id, amount]);
      if (act === 'deny') await tx.query(`update hmo_claim set status = 'denied', denial_reason = $2, resolved_at = now(), updated_at = now() where id = $1`, [id, reason]);
      if (act === 'paid') await tx.query(`update hmo_claim set status = 'paid', approved = coalesce(approved, claimed), resolved_at = now(), updated_at = now() where id = $1`, [id]);
      await audit(tx, act, id);
      return 'ok';
    });
    if (outcome === 'ok') return { go: { done: act } };
    if (outcome === 'missed') return { go: { missed: act } };
    return { error: outcome, claim: id, typed };
  }

  return { go: {} };
}

export const CLAIM_DONE: Record<string, string> = {
  new: 'Saved as a draft. File it when the papers have gone to the payor.',
  file: 'Filed. The clock on this claim starts today.',
  approve: 'Marked approved. It stays open until the money lands; mark it paid then.',
  partly: 'Marked partly approved. It stays open until the money lands.',
  deny: 'Marked denied, with the reason on the record.',
  paid: 'Marked paid.',
  note: 'Note added.',
};
export const CLAIM_MISSED = 'That claim had already moved on since the page was drawn, so nothing changed. The list is current now.';

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** A CSV cell: quoted when it must be; a leading =, +, -, @, tab or CR is written as text. */
export const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Rows as a CSV file: a BOM so Excel reads UTF-8 (₱, ñ), CRLF line ends. */
export const csvFile = (rows: unknown[][], name: string) =>
  new Response('﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  });

export function claimsCsv(d: ClaimsData, f: ClaimFilter, canMoney: boolean, slug: string): Response {
  const head = ['Patient', 'Chart no', 'Payor', 'Kind', 'LOA', 'Member no', ...(canMoney ? ['Claimed', 'Approved'] : []), 'Status', 'Filed', 'Resolved', 'Aging', 'Submitted ref', 'Notes'];
  const rows = d.claims.map((c) => [
    `${c.last_name}, ${c.first_name}`, c.chart_no, c.provider, c.provider_kind === 'philhealth' ? 'PhilHealth' : 'HMO', c.loa_number, c.member_no,
    ...(canMoney ? [Number(c.claimed).toFixed(2), c.approved === null ? '' : Number(c.approved).toFixed(2)] : []),
    CLAIM_STATUS[c.status] ?? c.status, iso(c.filed_at), iso(c.resolved_at), aging(c).text, c.submitted_ref, c.notes,
  ]);
  const payorSlug = f.payor ? '-' + (d.providers.find((p) => p.id === f.payor)?.name ?? 'payor').toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
  return csvFile([head, ...rows], `claims-${slug}-${f.view}${payorSlug}-${isoDay()}.csv`);
}

export { day };
