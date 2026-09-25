// POST /api/chart — one change to a patient's tooth chart.
//
// The odontogram on the patient record keeps every change on the device first
// (src/lib/offline-queue.ts) and posts it here as soon as it can: at once when
// the line is up, later when it comes back. Body, as JSON, with this browser's
// CSRF token in the X-CSRF header:
//   { clinic, patientId, fdi, condition, surfaces, change }   one tooth; condition null (or 'sound') clears it
//   { clinic, patientId, clear: true, change }                 the whole chart
// where change = { id, staff, sid, device, seq, madeAt, sentAt, base?, known? }:
// an id the device made up for this change, the staff member who made it and
// the sign-in they made it under (see "Whose sign-in" below), the
// device's own id and running count, the device's clock when the change was
// made and when this request left, and what the chart it was made on showed —
// `base`, the server's time (ms) when that chart was drawn or last heard from
// here, and for a clear `known` = { fdi: ms } for teeth heard about later than
// that. A body without `change` (a page from before offline charting) is taken
// as made now, on a chart drawn now.
//
// The staff session must be able to open the clinic (canOpen, re-checked here
// like on every workspace request) and the patient must belong to it, which
// row-level security answers. Nothing is deleted: the tooth's live rows are
// superseded and the new finding is inserted — one row per surface, or one
// whole-tooth row with a null surface — under the signed-in staff member.
//
// Every change is written to the sync_change ledger (025), which makes a
// resend harmless and conflicts visible:
//  - The same change id twice changes nothing the second time; the answer is
//    what the first arrival did (`replay: true`).
//  - A change replaces a whole tooth, so it must not replace a finding the
//    person never saw. Their chart showed the tooth as of `base` (or, without
//    one, as of when the change was made: the device's time corrected by how
//    far its clock is from ours, madeAt + (our now − sentAt)). If anyone else
//    changed that tooth on the server after that — a colleague charted it
//    while this device was offline, or while this chart sat open — theirs
//    stays: the change is kept in the ledger but not applied, and the answer
//    says which tooth, who changed it and when it reached the server (outcome
//    'kept'). "After" is when a change reached the server (received_at,
//    stamped under the chart lock below), never the time a device says it was
//    made: two tablets offline together must not decide the winner by which
//    one reconnects first. The one exception is this device's own earlier
//    changes by the same person, which it ordered itself (device_seq). A clear
//    leaves such teeth alone and lists them (`kept`); the ledger also notes
//    the teeth it really cleared (`cleared`), and only those count as changed
//    by it — a tooth that was already sound was not.
//
// Answers: 200 { ok, at, seen, outcome: 'applied' | 'kept', replay?, tooth?,
// newer?, kept?, madeAt? } — `seen` is the time the tooth (or chart) in the
// answer is current as of, which the device sends back as the next change's
// `base`, and `at` the same time: a chart drawn after it (chartNow, the
// odontogram's data-rendered-at, on the same database clock) already shows
// this change. Errors are { error, code } where code says what the
// device should do: 'auth' (sign in again, keep the change — also when a
// password change elsewhere signed this session out), 'csrf' (reload,
// keep it), 'owner' (the change was made by someone other than the person
// signed in now — on a shared tablet, another person signed in since: keep it
// for its author, never save it under this name), 'session' (made on a page
// drawn under an earlier sign-in of this same person: keep it and show it to
// them, and send it only when they choose to), 'rate' (wait, keep it),
// 'resequence' (the device's id or count is taken: renumber and send again),
// 'access' / 'patient' / 'bad' (it can never be saved: tell the person and
// drop it).
//
// Whose sign-in: every change carries `change.sid`, the tag of the sign-in
// the chart it was made on was drawn under (chartSession(), rendered by the
// odontogram as data-sid). A change is saved only under that same sign-in.
// A chart tab left open after its person signed out, on a shared front-desk
// tablet, can therefore never file a tap under their name later: whatever it
// kept waits for that person to see it and choose (the device shows it on
// that patient's chart, with Save and Delete). The device also locks such a
// tab as soon as it learns the sign-in ended; this is the backstop.
//
// GET /api/chart answers who is signed in on this browser now — { ok, staff,
// sid } or 401 { code: 'auth' } — so a page can check the server's word
// instead of trusting what the device last remembered. It changes nothing
// and returns nothing about patients.
//
// When the chart was drawn: chartNow() below reads the chart for the
// odontogram together with the database's time, under a shared hold on the
// same per-patient lock a change takes, so "drawn at" means exactly this —
// every change stamped before it is on the chart, every change stamped after
// it is not. The device sends that time back as `base`.
//
// Rate limited per staff member (LIMITS.chart.staff): a dentist charting a
// whole mouth never meets it, nor does a device catching up after a brownout;
// a script does.
export const prerender = false;

import '../../lib/dotenv';
import type { APIRoute } from 'astro';
import { randomUUID, createHmac } from 'node:crypto';
import { readSession, canOpen, type Session } from '../../lib/auth';
import { withClinic, pool } from '../../lib/db';
import { csrfHeaderOk, CSRF_MESSAGE } from '../../lib/csrf';
import { hit, waitText, LIMITS } from '../../lib/throttle';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fail = (status: number, code: string, error: string) => json({ error, code }, status);

// The 32 permanent teeth the chart draws: quadrants 1–4, positions 1–8.
const FDI = new Set([1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => q * 10 + p)));
// The check constraints on tooth_state, as written in schema.sql.
const CONDITIONS = new Set(['sound', 'caries', 'filled', 'crown', 'bridge', 'implant', 'root_canal', 'sealant', 'veneer', 'missing', 'unerupted', 'impacted']);
const SURFACES = new Set(['mesial', 'distal', 'buccal', 'lingual', 'occlusal', 'incisal']);
// Recorded per surface; everything else describes the whole tooth (SURFACE_SCOPED in demo.ts).
const SURFACE_SCOPED = new Set(['caries', 'filled', 'sealant']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// How old a change may say it is. A tablet whose clock was reset mid-brownout
// can claim anything; past a year it is taken as a year old.
const MAX_AGE_S = 366 * 24 * 3600;
const SID = /^[A-Za-z0-9_-]{22}$/;

/** The tag of one sign-in: the same for every page drawn under it, different for the next sign-in (a new
 *  cookie has a new expiry) and after a password change (token version). Not a secret and not a key —
 *  the session cookie stays the proof of who is asking; this only tells two sign-ins of one person apart. */
export function chartSession(s: Pick<Session, 'staffId' | 'exp' | 'tv'>): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? '')
    .update(`chart-session|${s.staffId}|${s.exp}|${s.tv ?? 0}`).digest('base64url').slice(0, 22);
}

/** A patient's chart as the odontogram draws it — one mark per tooth, the way the patient record page builds
 *  it (an 'incisal' row lands in the chart's one biting-surface slot) — and the database's time it is current
 *  as of (ms). Read under a shared hold on the patient's chart lock (the one POST takes below), so a change
 *  already stamped is committed and on it, and one stamped after that time is not. Null when this session
 *  cannot open that clinic's patient. */
export async function chartNow(session: Session, clinicSlug: string, patientId: string): Promise<{ at: number; marks: Record<number, { condition: string; surfaces?: string[] }> } | null> {
  if (!UUID.test(patientId)) return null;
  const clinic = await canOpen(session, clinicSlug);
  if (!clinic) return null;
  return withClinic(clinic.id, async (tx) => {
    await tx.query('select pg_advisory_xact_lock_shared(hashtext($1))', ['chart:' + patientId.toLowerCase()]);
    const at = new Date((await tx.query('select clock_timestamp() as at')).rows[0].at).getTime();
    const { rows } = await tx.query(
      'select fdi, surface, condition from tooth_state where patient_id = $1 and superseded_at is null order by fdi', [patientId]);
    const marks: Record<number, { condition: string; surfaces?: string[] }> = {};
    for (const r of rows) {
      const m = (marks[Number(r.fdi)] ??= { condition: r.condition });
      if (!r.surface) continue;
      const surface = r.surface === 'incisal' ? 'occlusal' : r.surface;
      if (!(m.surfaces ??= []).includes(surface)) m.surfaces.push(surface);
    }
    return { at, marks };
  });
}

/** The signed-in staff member, if the session still opens anything: not switched off, token version current. */
async function liveSession(session: Session | null): Promise<Session | null> {
  if (!session) return null;
  const who = (await pool.query('select token_version, disabled_at from staff where id = $1', [session.staffId])).rows[0];
  return who && !who.disabled_at && who.token_version === (session.tv ?? 0) ? session : null;
}

export const GET: APIRoute = async ({ cookies }) => {
  const session = await liveSession(readSession(cookies));
  if (!session) return fail(401, 'auth', 'Nobody is signed in on this browser.');
  return json({ ok: true, staff: session.staffId, sid: chartSession(session) });
};

interface Change {
  id: string; staff: string | null; device: string; seq: number; ageS: number;
  /** The sign-in the chart it was made on was drawn under (chartSession); null from a device that did not say. */
  sid: string | null;
  /** When the chart this change was made on was drawn or last heard from here (server clock, ms); null from older pages. */
  base: number | null;
  /** For a clear: teeth the device heard about later than `base`, fdi → server ms. */
  known: Map<number, number>;
}
interface Tooth { fdi: number; condition: string | null; surfaces: string[] }
interface Newer { at: string; by: string | null; you: boolean }
type Found = Newer & { changeId: string | null };

/** The device's change envelope, or null when the page predates it, or 'bad'. */
function parseChange(raw: unknown): Change | null | 'bad' {
  if (raw == null) return null;
  if (typeof raw !== 'object') return 'bad';
  const c = raw as Record<string, unknown>;
  const id = String(c.id ?? ''), device = String(c.device ?? '');
  const staff = c.staff == null ? null : String(c.staff).toLowerCase();
  const seq = Number(c.seq), madeAt = Number(c.madeAt), sentAt = Number(c.sentAt);
  if (!UUID.test(id) || !UUID.test(device) || !Number.isSafeInteger(seq) || seq < 1) return 'bad';
  if (staff !== null && !UUID.test(staff)) return 'bad';
  const sid = c.sid == null ? null : String(c.sid);
  if (sid !== null && !SID.test(sid)) return 'bad';
  if (!Number.isFinite(madeAt) || !Number.isFinite(sentAt)) return 'bad';
  // Only the difference between the two readings of the device's own clock is
  // trusted, so a device set to the wrong day still orders its changes right.
  const ageS = Math.min(MAX_AGE_S, Math.max(0, (sentAt - madeAt) / 1000));
  // base and known are our own clock's times, handed to the page by us.
  const base = c.base == null ? null : Number(c.base);
  if (base !== null && !(Number.isFinite(base) && base > 0)) return 'bad';
  const known = new Map<number, number>();
  if (c.known != null) {
    if (typeof c.known !== 'object' || Array.isArray(c.known)) return 'bad';
    const pairs = Object.entries(c.known as Record<string, unknown>);
    if (pairs.length > FDI.size) return 'bad';
    for (const [k, v] of pairs) {
      const fdi = Number(k), at = Number(v);
      if (!FDI.has(fdi) || !Number.isFinite(at) || at <= 0) return 'bad';
      known.set(fdi, at);
    }
  }
  return { id: id.toLowerCase(), staff, device: device.toLowerCase(), seq, ageS, sid, base, known };
}

type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

/** For each tooth, the newest change that reached the server after `since`
 *  (when the chart the person was looking at showed that tooth), from the
 *  ledger (a clear counts only for the teeth it really cleared — its
 *  `cleared` list; a tooth that was already sound was not changed by it.
 *  Clear rows written before that list existed count for every tooth they
 *  did not leave alone) and from
 *  tooth_state rows that predate the ledger, with who made it and when it
 *  reached the server. The exception: this device's own earlier changes by the
 *  same person are ordered by the device's own count, never by time — a slow
 *  save followed by a fast one, or an answer lost on the way back, must not
 *  look like a conflict with oneself. */
async function newerChanges(tx: Tx, patientId: string, teeth: { fdi: number; since: Date }[], me: string, device: string, seq: number) {
  if (!teeth.length) return new Map<number, Found>();
  const { rows } = await tx.query(
    `with teeth as (select * from unnest($2::int[], $3::timestamptz[]) as t(fdi, since)),
     changes as (
       select t.fdi, l.received_at as at, l.staff_id, l.id as change_id
         from teeth t join sync_change l
           on l.entity = 'chart' and l.entity_id = $1 and l.outcome = 'applied'
          and ((l.payload->>'fdi')::int = t.fdi
               or (l.payload->>'clear' = 'true' and case when l.payload->'cleared' is not null
                     then l.payload->'cleared' @> to_jsonb(t.fdi)
                     else not coalesce(l.payload->'kept', '[]'::jsonb) @> to_jsonb(t.fdi) end))
          and case when l.device_id = $5 and l.staff_id = $4 then l.device_seq > $6 else l.received_at > t.since end
       union all
       select ts.fdi, ts.noted_at, ts.noted_by, null
         from tooth_state ts join teeth t on t.fdi = ts.fdi
        where ts.patient_id = $1 and ts.change_id is null and ts.noted_at > t.since
     )
     select distinct on (c.fdi) c.fdi, c.at, c.staff_id, c.change_id, s.full_name
       from changes c left join staff s on s.id = c.staff_id
      order by c.fdi, c.at desc`,
    [patientId, teeth.map((t) => t.fdi), teeth.map((t) => t.since), me, device, seq]);
  return new Map<number, Found>(rows.map((r) => [Number(r.fdi), {
    at: new Date(r.at).toISOString(), by: r.full_name ?? null, you: r.staff_id === me, changeId: r.change_id ?? null,
  }]));
}

/** The ledger row a kept change lost to, as the answer names it. */
async function changeBy(tx: Tx, id: string, me: string): Promise<Newer | undefined> {
  const r = (await tx.query(
    'select l.received_at, l.staff_id, s.full_name from sync_change l left join staff s on s.id = l.staff_id where l.id = $1', [id])).rows[0];
  return r ? { at: new Date(r.received_at).toISOString(), by: r.full_name ?? null, you: r.staff_id === me } : undefined;
}

/** What the chart shows for these teeth now: one mark per tooth, as the patient page builds it. */
async function toothNow(tx: Tx, patientId: string, teeth: number[]): Promise<Map<number, Tooth>> {
  const { rows } = await tx.query(
    `select fdi, surface, condition from tooth_state
      where patient_id = $1 and fdi = any($2::int[]) and superseded_at is null order by fdi`, [patientId, teeth]);
  const out = new Map<number, Tooth>(teeth.map((fdi) => [fdi, { fdi, condition: null, surfaces: [] }]));
  for (const r of rows) {
    const t = out.get(Number(r.fdi))!;
    t.condition ??= r.condition;
    // The chart has one biting-surface slot and calls it incisal on anteriors itself.
    const s = r.surface === 'incisal' ? 'occlusal' : r.surface;
    if (s && !t.surfaces.includes(s)) t.surfaces.push(s);
  }
  return out;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = readSession(cookies);
  if (!session) return fail(401, 'auth', 'Sign in to save the chart.');

  let b: any;
  try { b = await request.json(); } catch { return fail(400, 'bad', 'Send JSON.'); }
  if (!b || typeof b !== 'object') return fail(400, 'bad', 'Send JSON.');

  const clinic = await canOpen(session, String(b.clinic ?? ''));
  if (!clinic) {
    // A password change (here or on another device) signs every other session
    // out by bumping token_version. That is a sign-in to renew, not a refusal:
    // the device keeps the change and sends it after the person signs in again.
    // Only an account switched off, or one without this branch, is refused.
    const who = (await pool.query('select token_version, disabled_at from staff where id = $1', [session.staffId])).rows[0];
    if (who && !who.disabled_at && who.token_version !== (session.tv ?? 0)) return fail(401, 'auth', 'Sign in again to save the chart.');
    return fail(403, 'access', 'This account cannot open that clinic.');
  }
  if (!csrfHeaderOk(cookies, request)) return fail(403, 'csrf', CSRF_MESSAGE);

  const rate = await hit('chart:s:' + session.staffId, ...LIMITS.chart.staff);
  if (!rate.allowed) return fail(429, 'rate', 'Too many chart changes at once. ' + waitText(rate.retryAfter));

  const patientId = String(b.patientId ?? '').toLowerCase();
  if (!UUID.test(patientId)) return fail(400, 'bad', 'Which patient?');

  const clear = b.clear === true;
  let fdi = 0;
  let condition: string | null = null;
  let surfaces: string[] = [];
  if (!clear) {
    fdi = Number(b.fdi);
    if (!Number.isInteger(fdi) || !FDI.has(fdi)) return fail(400, 'bad', 'That is not a tooth on this chart.');
    condition = b.condition == null || b.condition === 'sound' ? null : String(b.condition);
    if (condition !== null && !CONDITIONS.has(condition)) return fail(400, 'bad', 'That is not a finding the chart knows.');
    const raw: unknown[] = Array.isArray(b.surfaces) ? b.surfaces : [];
    surfaces = [...new Set(raw.map(String))];
    if (surfaces.some((s) => !SURFACES.has(s))) return fail(400, 'bad', 'A surface is mesial, distal, buccal, lingual, occlusal or incisal.');
    if (condition === null) surfaces = [];
    else if (SURFACE_SCOPED.has(condition)) { if (!surfaces.length) return fail(400, 'bad', 'Caries, fillings and sealants need at least one surface.'); }
    else if (surfaces.length) return fail(400, 'bad', 'Surfaces apply to caries, fillings and sealants only.');
  }

  const parsed = parseChange(b.change);
  if (parsed === 'bad') return fail(400, 'bad', 'That change has no usable id or time.');
  const me = session.staffId;
  const mySid = chartSession(session);
  // A page from before offline charting: its change is made now, on this sign-in, under an id of our own.
  const change: Change = parsed ?? { id: randomUUID(), staff: null, device: randomUUID(), seq: 1, ageS: 0, sid: mySid, base: null, known: new Map() };
  // Made by someone else on this device: it is theirs to send, never ours to sign.
  if (change.staff && change.staff !== me.toLowerCase()) return fail(403, 'owner', 'This change was made by someone else on this device. It is kept for them.');

  const result = await withClinic(clinic.id, async (tx) => {
    // RLS scopes this to the clinic the session opened, so a patient id from another clinic is simply not found.
    const { rowCount } = await tx.query('select 1 from patient where id = $1 and archived_at is null', [patientId]);
    if (!rowCount) return { kind: 'none' as const };
    // One change to a patient's chart at a time, so "changed since?" and the write that follows see the same
    // chart, and a change stamped (clock_timestamp, below) after ours is one that took this lock after ours.
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', ['chart:' + patientId]);

    // Already here: say what happened the first time and change nothing.
    const prior = (await tx.query(
      'select outcome, payload, occurred_at, received_at, entity_id, conflict_with, staff_id, clock_timestamp() as now from sync_change where id = $1', [change.id])).rows[0];
    // Someone else's change id (a clash of made-up ids, never a resend): this device renumbers.
    if (prior && prior.staff_id !== me) return { kind: 'resequence' as const };
    if (prior) {
      // The answer's chart is as of the first arrival, except a kept tooth's, which is read again now.
      const out: Record<string, unknown> = { outcome: prior.outcome, replay: true, seen: new Date(prior.received_at).toISOString(), madeAt: new Date(prior.occurred_at).toISOString() };
      if (prior.entity_id === patientId && prior.outcome === 'kept' && !clear) {
        out.tooth = (await toothNow(tx, patientId, [fdi])).get(fdi);
        out.seen = new Date(prior.now).toISOString();
        const n = prior.conflict_with
          ? await changeBy(tx, prior.conflict_with, me)
          : (await newerChanges(tx, patientId, [{ fdi, since: new Date(prior.payload?.since ?? prior.occurred_at) }], me, change.device, change.seq)).get(fdi);
        if (n) out.newer = { at: n.at, by: n.by, you: n.you };
      }
      const keptTeeth: number[] = Array.isArray(prior.payload?.kept) ? prior.payload.kept.map(Number) : [];
      if (prior.entity_id === patientId && clear && keptTeeth.length) {
        const now = await toothNow(tx, patientId, keptTeeth);
        out.kept = keptTeeth.map((t) => ({ ...now.get(t)! }));
      }
      return { kind: 'done' as const, out };
    }

    // New to us, and made on a chart drawn under another sign-in (the person signed out and in again, their
    // sign-in ran out, or a tab was left open after they signed out and someone tapped it): not saved under
    // this name unless the person has looked at it and chosen to (the device then sends it with this sign-in).
    // A resend of a change already here is answered above whatever sign-in sends it: it changes nothing.
    if (change.sid !== mySid) return { kind: 'session' as const };

    const { made } = (await tx.query('select now() - make_interval(secs => $1::double precision) as made', [change.ageS])).rows[0];
    // What the person's chart showed each tooth as of: the chart's time, or a tooth's own when the device heard
    // about it later, never later than the change itself; without a chart time, when the change was made.
    const since = (t: number) => {
      const seen = change.known.get(t) ?? change.base;
      return new Date(seen === null ? made.getTime() : Math.min(made.getTime(), seen));
    };
    // The ledger row, stamped with the time it reached the server (under the lock above). Null when the id or
    // this device's count is taken — by another clinic's change or this device's own: it renumbers and sends again.
    const record = async (payload: object, outcome: 'applied' | 'kept', conflictWith: string | null): Promise<Date | null> => {
      const ins = await tx.query(
        `insert into sync_change (id, clinic_id, device_id, device_seq, entity, entity_id, payload, occurred_at, received_at, staff_id, outcome, conflict_with)
         values ($1, $2, $3, $4, 'chart', $5, $6, $7, clock_timestamp(), $8, $9, $10)
         on conflict do nothing returning received_at`,
        [change.id, clinic.id, change.device, change.seq, patientId, JSON.stringify(payload), made, me, outcome, conflictWith]);
      return ins.rows[0]?.received_at ?? null;
    };

    if (clear) {
      const live = (await tx.query('select distinct fdi from tooth_state where patient_id = $1 and superseded_at is null', [patientId])).rows.map((r) => Number(r.fdi));
      const newer = await newerChanges(tx, patientId, live.map((t) => ({ fdi: t, since: since(t) })), me, change.device, change.seq);
      const keptTeeth = live.filter((t) => newer.has(t)).sort((x, y) => x - y);
      const outcome = live.length > 0 && keptTeeth.length === live.length ? 'kept' : 'applied';
      const first = keptTeeth.length ? newer.get(keptTeeth[0])!.changeId : null;
      // The teeth this clear really changes: those with a finding, less those it leaves alone. A later change made on
      // a chart drawn before the clear conflicts with it only on these (newerChanges), never on a tooth that was sound.
      const cleared = outcome === 'applied' ? live.filter((t) => !newer.has(t)).sort((x, y) => x - y) : [];
      const seen = await record({ clear: true, kept: keptTeeth, cleared }, outcome, first);
      if (!seen) return { kind: 'resequence' as const };
      if (outcome === 'applied') {
        await tx.query('update tooth_state set superseded_at = now() where patient_id = $1 and superseded_at is null and not (fdi = any($2::int[]))', [patientId, keptTeeth]);
        await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'chart.clear', 'patient', $3)`, [clinic.id, me, patientId]);
      }
      const now = await toothNow(tx, patientId, keptTeeth);
      const kept = keptTeeth.map((t) => { const n = newer.get(t)!; return { ...now.get(t)!, newer: { at: n.at, by: n.by, you: n.you } }; });
      return { kind: 'done' as const, out: { outcome, kept, seen: new Date(seen).toISOString(), madeAt: new Date(made).toISOString() } };
    }

    const newer = (await newerChanges(tx, patientId, [{ fdi, since: since(fdi) }], me, change.device, change.seq)).get(fdi);
    // `since` goes in the ledger too, so a replay of a kept change can say again what it lost to.
    const payload = { fdi, condition, surfaces, since: since(fdi).toISOString() };
    if (newer) {
      // Someone changed this tooth after the person's chart showed it: theirs stands.
      const seen = await record(payload, 'kept', newer.changeId);
      if (!seen) return { kind: 'resequence' as const };
      const tooth = (await toothNow(tx, patientId, [fdi])).get(fdi);
      return { kind: 'done' as const, out: { outcome: 'kept', tooth, newer: { at: newer.at, by: newer.by, you: newer.you }, seen: new Date(seen).toISOString(), madeAt: new Date(made).toISOString() } };
    }
    const seen = await record(payload, 'applied', null);
    if (!seen) return { kind: 'resequence' as const };
    await tx.query('update tooth_state set superseded_at = now() where patient_id = $1 and fdi = $2 and superseded_at is null', [patientId, fdi]);
    if (condition !== null) {
      for (const surface of surfaces.length ? surfaces : [null]) {
        await tx.query(
          'insert into tooth_state (clinic_id, patient_id, fdi, surface, condition, noted_by, change_id) values ($1, $2, $3, $4, $5, $6, $7)',
          [clinic.id, patientId, fdi, surface, condition, me, change.id]);
      }
    }
    // Who changed the chart.
    await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'chart.update', 'patient', $3)`, [clinic.id, me, patientId]);
    return { kind: 'done' as const, out: { outcome: 'applied', seen: new Date(seen).toISOString(), madeAt: new Date(made).toISOString() } };
  });

  if (result.kind === 'none') return fail(404, 'patient', 'No such patient at this clinic.');
  if (result.kind === 'resequence') return fail(409, 'resequence', 'That change number is taken. The page renumbers it and sends it again.');
  if (result.kind === 'session') return fail(409, 'session', 'This change was made before you last signed in. Open that patient’s chart to check it and save it.');
  // `at` is on the database's clock, like a chart's drawing time: see the answers above.
  return json({ ok: true, at: result.out.seen ?? new Date().toISOString(), ...result.out });
};
