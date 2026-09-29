// The chart written from the record: a treatment's finding, charted only when the dentist taps (tooth-first
// charting, step 2; migration 042).
//
// After a treatment is recorded or marked done, the record offers to update the chart (src/lib/chart-offer.ts
// decides what). This file reads the tooth for that offer and, when the person confirms — Update the chart, or the
// ticked line in Record a treatment — writes it inside the record post's own withClinic() transaction.
//
// It writes exactly what POST /api/chart writes for one tooth, and takes the same lock, so the offline chart
// (025) sees it as any other change: a sync_change ledger row stamped under the per-patient chart lock
// ('chart:' + the patient id, lower case: the key /api/chart and chartNow use), the tooth's live tooth_state rows
// superseded, the new rows under the person with the ledger id and the treatment (procedure_id), and a
// chart.update audit line. Every chart drawn before it then sees it as a newer change and keeps it. It is its own
// module: src/pages/api/chart.ts is not imported, refactored or changed.
//
// Two checks before anything is written (chartFromRecord):
//  - The sign-in. The page was drawn under a sign-in (chartSession(), the chart's own `sid`); a post from a page
//    drawn under another one — a record tab left open on a shared tablet after its dentist signed out — writes
//    nothing ('ended'). The chart's rule, as /api/chart applies it to its own changes; the CSRF cookie alone
//    would not stop it, since it outlives a sign-in.
//  - What the person saw. The form says what the tooth showed (markKey). If the tooth shows anything else now,
//    nothing is written ('changed', with who changed it and when): a finding the person did not see is never
//    replaced.
// A treatment already charted by this route answers 'nothing', so a resend writes no second row.

import './dotenv';
import type { Tx } from './db';
import { chartOffer, markKey, isPermanent, CHART_EFFECTS, type ChartEffect, type ChartOffer, type LiveMark } from './chart-offer';
import { SURFACE_SCOPED, type Surface, type ToothCondition } from '../data/demo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPED = new Set<string>(SURFACE_SCOPED);
const ORDER: Surface[] = ['mesial', 'occlusal', 'distal', 'buccal', 'lingual'];
/** How far past the server's now a page's drawing time may be (clocks, a slow line) before it is not believed. */
const BASE_SLACK_MS = 60_000;

/** sid: the tag of the sign-in this request is under — chartSession(session), computed by the page. */
export interface Ctx { clinicId: string; staffId: string; patientId: string; sid: string }

/** The tooth as the chart draws it (one mark; 'incisal' rows land in the occlusal slot), or null when sound. The
 *  same reading as the record page and chartNow: the live rows' condition, and for caries, filled and sealant the
 *  surfaces, in chart order. */
export async function liveTooth(tx: Tx, patientId: string, fdi: number): Promise<LiveMark | null> {
  const { rows } = await tx.query(
    'select surface, condition from tooth_state where patient_id = $1 and fdi = $2 and superseded_at is null order by noted_at, id',
    [patientId, fdi]);
  if (!rows.length || rows[0].condition === 'sound') return null;
  const condition = rows[0].condition as ToothCondition;
  const seen = new Set<Surface>();
  if (SCOPED.has(condition)) for (const r of rows) if (r.surface) seen.add((r.surface === 'incisal' ? 'occlusal' : r.surface) as Surface);
  return { condition, surfaces: ORDER.filter((s) => seen.has(s)) };
}

/** Who last changed this tooth and when: the newest applied ledger row for it (or a clear that cleared it),
 *  else the newest tooth_state row without a change_id (noted_at). `by` is the staff row's full name. */
export async function lastToothChange(tx: Tx, patientId: string, fdi: number): Promise<{ at: Date; by: string | null } | null> {
  const r = (await tx.query(
    `with changes as (
       select 1 as rank, l.received_at as at, l.staff_id
         from sync_change l
        where l.entity = 'chart' and l.entity_id = $1 and l.outcome = 'applied'
          and ((l.payload->>'fdi')::int = $2
               or (l.payload->>'clear' = 'true' and case when l.payload->'cleared' is not null
                     then l.payload->'cleared' @> to_jsonb($2::int)
                     else not coalesce(l.payload->'kept', '[]'::jsonb) @> to_jsonb($2::int) end))
       union all
       select 2, ts.noted_at, ts.noted_by
         from tooth_state ts
        where ts.patient_id = $1 and ts.fdi = $2 and ts.change_id is null
     )
     select c.at, s.full_name from changes c left join staff s on s.id = c.staff_id
      order by c.rank, c.at desc limit 1`, [patientId, fdi])).rows[0];
  return r ? { at: new Date(r.at), by: r.full_name ?? null } : null;
}

/** The chart lock /api/chart and chartNow take for this patient: one change to a chart at a time. */
async function lockChart(tx: Tx, patientId: string): Promise<void> {
  await tx.query('select pg_advisory_xact_lock(hashtext($1))', ['chart:' + patientId.toLowerCase()]);
}

/** The write itself, inside the caller's transaction, AFTER the lock below: ledger row, supersede, insert, audit. */
export async function writeToothFromRecord(
  tx: Tx, c: Ctx, t: { fdi: number; to: { condition: ChartEffect; surfaces: Surface[] }; procedureId: string; since: Date | null },
): Promise<{ changeId: string; at: Date }> {
  const patientId = c.patientId.toLowerCase();
  const surfaces = SCOPED.has(t.to.condition) ? ORDER.filter((s) => t.to.surfaces.includes(s)) : [];
  // What /api/chart refuses, refused here too: a tooth the chart does not draw, a surface finding with no surface.
  if (!isPermanent(t.fdi) || (SCOPED.has(t.to.condition) && !surfaces.length)) throw new Error(`chart-write: nothing to chart for ${t.fdi} ${t.to.condition}`);
  const payload = { fdi: t.fdi, condition: t.to.condition, surfaces, since: t.since ? t.since.toISOString() : null, from: 'record', procedure: t.procedureId };
  // The ledger row, stamped with the moment it reached the server, under the chart lock the caller holds.
  const { rows: [led] } = await tx.query(
    `insert into sync_change (id, clinic_id, device_id, device_seq, entity, entity_id, payload, occurred_at, received_at, staff_id, outcome, conflict_with)
     values (gen_random_uuid(), $1, gen_random_uuid(), 1, 'chart', $2, $3, now(), clock_timestamp(), $4, 'applied', null)
     returning id, received_at`,
    [c.clinicId, patientId, JSON.stringify(payload), c.staffId]);
  await tx.query('update tooth_state set superseded_at = $3 where patient_id = $1 and fdi = $2 and superseded_at is null', [patientId, t.fdi, led.received_at]);
  for (const surface of surfaces.length ? surfaces : [null]) {
    await tx.query(
      `insert into tooth_state (clinic_id, patient_id, fdi, surface, condition, noted_by, noted_at, change_id, procedure_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [c.clinicId, patientId, t.fdi, surface, t.to.condition, c.staffId, led.received_at, led.id, t.procedureId]);
  }
  await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'chart.update', 'patient', $3)`, [c.clinicId, c.staffId, patientId]);
  return { changeId: led.id, at: new Date(led.received_at) };
}

export type ChartApply =
  | { kind: 'applied'; fdi: number } | { kind: 'changed'; fdi: number; by: string | null; at: Date | null }
  | { kind: 'ended' } | { kind: 'nothing' } | { kind: 'missing' };

/** A posted drawing time (ms, the server's clock, as the chart's data-rendered-at): believed only when it is a
 *  finite number above 0 and no later than a minute past the server's now; else null. It only goes in the ledger
 *  row's payload and the words, never into a decision. */
function sinceOf(base: unknown, nowMs: number): Date | null {
  const n = typeof base === 'number' ? base : typeof base === 'string' && base.trim() !== '' ? Number(base) : NaN;
  return Number.isFinite(n) && n > 0 && n <= nowMs + BASE_SLACK_MS ? new Date(n) : null;
}

/** The treatment and what its fee-guide item does to the chart; null when it is not this patient's. */
async function treatmentOf(tx: Tx, patientId: string, treatedId: string) {
  if (!UUID.test(treatedId)) return null;
  const d = (await tx.query(
    `select d.id, coalesce(d.name, c.name, 'Treatment') as name, d.fdi, d.surface, c.chart_effect
       from procedure_done d left join procedure_catalog c on c.id = d.catalog_id
      where d.id = $1 and d.patient_id = $2`, [treatedId, patientId])).rows[0];
  if (!d) return null;
  const effect = (CHART_EFFECTS as readonly string[]).includes(d.chart_effect) ? (d.chart_effect as ChartEffect) : null;
  return { id: d.id as string, name: d.name as string, fdi: d.fdi === null ? null : Number(d.fdi), letters: (d.surface as string | null) ?? null, effect };
}

/** Whether this route already charted this treatment (a live row carries it). */
async function charted(tx: Tx, patientId: string, treatedId: string): Promise<boolean> {
  return (await tx.query('select 1 from tooth_state where patient_id = $1 and procedure_id = $2 and superseded_at is null limit 1', [patientId, treatedId])).rowCount! > 0;
}

/** Confirmed by the person: apply the offer for this treatment if the page was drawn under this sign-in and the
 *  tooth still shows `from`. */
export async function chartFromRecord(tx: Tx, c: Ctx, t: { treated: string; from: string; base: unknown; sid: string }): Promise<ChartApply> {
  // 0. The page's sign-in: nothing is read or written for a page drawn under another (or with no sign-in said).
  if (!c.sid || t.sid !== c.sid) return { kind: 'ended' };
  const patientId = c.patientId.toLowerCase();
  // 1. One change to this chart at a time: the same key as POST /api/chart and chartNow.
  await lockChart(tx, patientId);
  // 2. The treatment, on this record.
  const d = await treatmentOf(tx, patientId, t.treated);
  if (!d) return { kind: 'missing' };
  // 3. Already charted from this treatment: a resend changes nothing.
  if (await charted(tx, patientId, d.id)) return { kind: 'nothing' };
  // 4. The offer, against the chart as it is now.
  const now = d.fdi !== null && isPermanent(d.fdi) ? await liveTooth(tx, patientId, d.fdi) : null;
  const offer = chartOffer(d.effect, d.fdi, d.letters, now);
  if (offer.kind !== 'apply') return { kind: 'nothing' };
  // 5. The tooth must still show what the person was shown.
  if (markKey(now) !== t.from) {
    const last = await lastToothChange(tx, patientId, offer.fdi);
    return { kind: 'changed', fdi: offer.fdi, by: last?.by ?? null, at: last?.at ?? null };
  }
  // 6. When the page drew the chart, for the ledger row's payload only.
  const nowMs = new Date((await tx.query('select clock_timestamp() as now')).rows[0].now).getTime();
  const since = sinceOf(t.base, nowMs);
  // 7. Write it.
  await writeToothFromRecord(tx, c, { fdi: offer.fdi, to: offer.to, procedureId: d.id, since });
  return { kind: 'applied', fdi: offer.fdi };
}

export interface OfferState { treatedId: string; treatment: string; fdi: number | null; letters: string | null; effect: ChartEffect | null;
  now: LiveMark | null; applied: boolean; offer: ChartOffer; base: number; last: { at: Date; by: string | null } | null }

/** For the callout: read-only, no lock (the write re-checks under the lock). `base` is the database's time of the
 *  read, which the offer's form posts back. Null when the treatment is not on this record. */
export async function offerFor(tx: Tx, patientId: string, treatedId: string): Promise<OfferState | null> {
  const pid = patientId.toLowerCase();
  const d = await treatmentOf(tx, pid, treatedId);
  if (!d) return null;
  const base = new Date((await tx.query('select clock_timestamp() as now')).rows[0].now).getTime();
  const onChart = d.fdi !== null && isPermanent(d.fdi);
  const now = onChart ? await liveTooth(tx, pid, d.fdi!) : null;
  return {
    treatedId: d.id, treatment: d.name, fdi: d.fdi, letters: d.letters, effect: d.effect,
    now, applied: await charted(tx, pid, d.id), offer: chartOffer(d.effect, d.fdi, d.letters, now), base,
    last: onChart ? await lastToothChange(tx, pid, d.fdi!) : null,
  };
}
