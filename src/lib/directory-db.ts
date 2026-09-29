// The public directory, read from Postgres into the same shapes the pages
// already render. `src/data/directory.ts` keeps the types (and seeds the
// database); at request time the rows come from public_directory(), which
// exposes a clinic's public face and nothing else.
//
// Blocked time (040) reaches the public through two more definer functions:
// public_blocked_ranges() (times, a listed dentist's slug or a chair, and a
// collapsed kind — never a note, an author, or leave told from a day off) and
// public_busy_ranges() (times, the dentist's slug, and whether the visit has a
// dentist at all — never who is in the chair). The slot rule over them is
// slotOpen() in lib/availability.ts: one rule for what is offered (openSlots)
// and for the re-check inside the booking's transaction (slotStillOpen).

import { publicRead, pool, type Tx } from './db';
import type { Listing, Dentist, Service, Hours, Specialty, Category } from '../data/directory';
import { manilaNow, slotsFor, slotOpen, dayPieces, openIntervals, type Slot, type Now, type BusyRange, type BlockedRange, type DayClosure } from './availability';

interface Row {
  id: string; slug: string; name: string; area: string; address: string; phone: string; about: string;
  booking_mode: 'live' | 'request'; walk_ins: boolean; chairs: number; founded: number; philhealth_dental: boolean; photo_keys: string[];
  maps_url: string | null; dpo_name: string | null;
  /** [open, close] or [open, close, lunch from, lunch to], minutes (040). */
  hours: Record<string, number[]>; hmos: string[];
  dentists: { slug: string; name: string; specialty: Specialty | null; practices: string[]; prcCheckedOn: string | null; pda: boolean; since: number; about: string; days: number[]; hours?: Record<string, [number, number]> }[];
  fees: { code: string; name: string; local: string | null; category: Category; min: string; max: string | null; from: boolean; unit: string | null; minutes: number | null }[];
}

/** `photoKeys` is every key the clinic has, in its order; `photos` keeps the two the layout shows, with the house
 *  stills as the fallback. An 'up:' key resolves to a file under /uploads/<id>/ (src/lib/uploads.ts).
 *  `lunch` is each weekday's break, in hours, only on days that have one. */
export interface DbListing extends Listing { id: string; photoKeys: string[]; fees: Service[]; dentistProfiles: Dentist[]; mapsUrl: string | null; dpoName: string | null; lunch: Record<number, [number, number]> }

const toHours = (h: Record<string, number[]>): Hours => {
  const out: Hours = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  for (const [d, [o, c]] of Object.entries(h)) out[+d] = [o / 60, c / 60];
  return out;
};
const toLunch = (h: Record<string, number[]>): Record<number, [number, number]> => {
  const out: Record<number, [number, number]> = {};
  for (const [d, [, , bf, bt]] of Object.entries(h)) if (bf != null && bt != null) out[+d] = [bf / 60, bt / 60];
  return out;
};
/** A dentist's own hours on their days ({dow: [from, to]} in minutes), in hours. */
const toDentistHours = (h: Record<string, [number, number]> | null | undefined): Record<number, [number, number]> => {
  const out: Record<number, [number, number]> = {};
  for (const [d, [f, t]] of Object.entries(h ?? {})) if (f != null && t != null) out[+d] = [f / 60, t / 60];
  return out;
};

const toListing = (r: Row): DbListing => ({
  id: r.id, slug: r.slug, name: r.name, area: r.area, address: r.address, phone: r.phone, about: r.about, mapsUrl: r.maps_url ?? null, dpoName: r.dpo_name ?? null,
  hours: toHours(r.hours), lunch: toLunch(r.hours), hmos: r.hmos, philhealth: r.philhealth_dental, workspace: r.booking_mode === 'live',
  walkIns: r.walk_ins, chairs: r.chairs, since: r.founded, photos: [r.photo_keys[0] ?? 'tray', r.photo_keys[1] ?? 'instruments'], photoKeys: r.photo_keys ?? [],
  prices: {}, dentists: r.dentists.map((d) => d.slug),
  fees: r.fees.map((f) => ({ id: f.code, name: f.name, local: f.local ?? undefined, cat: f.category, min: f.min == null ? null : +f.min, max: f.max == null ? undefined : +f.max, from: f.from, unit: f.unit ?? undefined, minutes: f.minutes ?? 30 })),
  dentistProfiles: r.dentists.map((d) => ({
    id: d.slug, slug: d.slug, name: d.name, prc: '', prcCheckedOn: d.prcCheckedOn, pda: d.pda, specialty: d.specialty, practices: d.practices, since: d.since, about: d.about,
    clinics: [{ slug: r.slug, days: d.days, hours: toDentistHours(d.hours) }],
  })),
});

export async function loadDirectory(): Promise<DbListing[]> {
  const rows = await publicRead<Row>('select * from public_directory()');
  return rows.map(toListing);
}

export async function loadListing(slug: string): Promise<DbListing | null> {
  const rows = await publicRead<Row>('select * from public_directory() where slug = $1', [slug]);
  return rows[0] ? toListing(rows[0]) : null;
}

export interface DbDentist extends Dentist { clinicsFull: { slug: string; name: string; area: string; bookingMode: 'live' | 'request'; days: number[]; hours: Record<number, [number, number]> }[] }

export async function loadDentist(slug: string): Promise<DbDentist | null> {
  const rows = await publicRead<{ d: any }>('select public_dentist($1) as d', [slug]);
  const d = rows[0]?.d;
  if (!d) return null;
  return {
    id: d.slug, slug: d.slug, name: d.name, prc: d.prc, prcCheckedOn: d.prcCheckedOn, pda: d.pda, specialty: d.specialty, practices: d.practices, since: d.since, about: d.about,
    clinics: (d.clinics ?? []).map((c: any) => ({ slug: c.slug, days: c.days ?? [], hours: toDentistHours(c.hours) })),
    clinicsFull: (d.clinics ?? []).map((c: any) => ({ ...c, hours: toDentistHours(c.hours) })),
  };
}

/** The pool, or a transaction (the booking's re-check reads inside its own). */
type Queryable = Pick<Tx, 'query'> | typeof pool;
const ms = (t: unknown) => new Date(t as string).getTime();
const DAY_MS = 86_400_000;
/** Midnight in Manila at the start of a date. */
const manilaMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`);

/**
 * Time a listed clinic is not open in [from, to): kind 'shut' (outside the hours), 'lunch', 'closed' (a
 * closure it added), 'away' (a listed dentist not in, on leave or not their day: never told apart) or
 * 'chair' (one chair out of use). Nothing for a clinic that is not listed. At most 400 days a call.
 */
export async function publicBlocked(q: Queryable, clinicId: string, from: Date, to: Date): Promise<(BlockedRange & { kind: string })[]> {
  const { rows } = await (q as Tx).query('select kind, dentist_slug, chair, starts_at, ends_at from public_blocked_ranges($1, $2, $3)', [clinicId, from, to]);
  return rows.map((r: any) => ({ kind: r.kind as string, dentist: (r.dentist_slug as string | null) ?? null, chair: r.chair == null ? null : +r.chair, s: ms(r.starts_at), e: ms(r.ends_at) }));
}

/** Visits on a listed clinic's book in [from, to), not cancelled or missed: times, the dentist's slug, whether there is a dentist. */
export async function publicBusy(q: Queryable, clinicId: string, from: Date, to: Date): Promise<BusyRange[]> {
  const { rows } = await (q as Tx).query('select dentist_slug, named, starts_at, ends_at from public_busy_ranges($1, $2, $3)', [clinicId, from, to]);
  return rows.map((r: any) => ({ dentist: (r.dentist_slug as string | null) ?? null, named: !!r.named, s: ms(r.starts_at), e: ms(r.ends_at) }));
}

/** The clinic's one dentist, when its public page lists exactly one: there, "any dentist" is her (p32). */
export const soloDentist = (l: DbListing): string | null => l.dentistProfiles.length === 1 ? l.dentistProfiles[0].slug : null;

/** The slot's start and end in epoch ms, from a Manila date and minutes. */
const slotMs = (ymd: string, mins: number) => manilaMidnight(ymd).getTime() + mins * 60_000;

/**
 * Real open slots for a clinic: its hours, the dentist's days, the service's
 * chair time, minus lunch, closures, the chosen dentist's hours and leave,
 * chairs out of use, and what is already booked (slotOpen). Read through
 * functions that return times and slugs only, never who. At a clinic whose
 * public page lists one dentist, any dentist is her (soloDentist): her days,
 * her visits and the visits with no dentist are hers, and the chairs still
 * count. The /find/ cards, /api/availability and the booking's re-check all
 * come through here, so a time tapped on a card is the time the booking checks.
 */
export async function openSlots(l: DbListing, opts: { dentist?: string | null; minutes?: number; days?: number; limit?: number; now?: Now } = {}): Promise<Slot[]> {
  const now = opts.now ?? manilaNow();
  const days = opts.days ?? 14;
  const from = manilaMidnight(now.ymd);
  const to = new Date(from.getTime() + (days + 1) * DAY_MS);
  const [busy, blocked] = await Promise.all([publicBusy(pool, l.id, from, to), publicBlocked(pool, l.id, from, to)]);
  const dentist = opts.dentist || soloDentist(l);
  const dentistDays = dentist ? l.dentistProfiles.find((d) => d.slug === dentist)?.clinics[0].days : undefined;
  const dentists = l.dentistProfiles.map((d) => d.slug);
  const isTaken = (ymd: string, start: number, end: number) =>
    !slotOpen({ s: slotMs(ymd, start), e: slotMs(ymd, end), dentist, chairs: l.chairs, dentists, busy, blocked });
  return slotsFor(l.slug, l.hours, { days, dentistDays, minutes: opts.minutes, limit: opts.limit, now, isTaken });
}

/**
 * The booking's re-check, inside its transaction and after the clinic's lock: the same two reads on `tx`
 * for [startsAt, endsAt), and the same rule the offer used.
 */
export async function slotStillOpen(tx: Tx, l: DbListing, p: { dentist: string | null; startsAt: Date; endsAt: Date }): Promise<boolean> {
  const [busy, blocked] = [await publicBusy(tx, l.id, p.startsAt, p.endsAt), await publicBlocked(tx, l.id, p.startsAt, p.endsAt)];
  return slotOpen({ s: p.startsAt.getTime(), e: p.endsAt.getTime(), dentist: p.dentist, chairs: l.chairs, dentists: l.dentistProfiles.map((d) => d.slug), busy, blocked });
}

/** Clinic-wide closed and lunch ranges as pieces per Manila day, within [from, to). */
export function toClosures(rs: (BlockedRange & { kind: string })[], from: Date, to: Date): DayClosure[] {
  const out: DayClosure[] = [];
  for (const r of rs) {
    if ((r.kind !== 'closed' && r.kind !== 'lunch') || r.dentist !== null || r.chair !== null) continue;
    for (const p of dayPieces(Math.max(r.s, from.getTime()), Math.min(r.e, to.getTime()))) out.push({ ...p, kind: r.kind });
  }
  return out.sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : a.from - b.from));
}

/**
 * The clinic's closures and lunch from today for `days` days (31 by default), per Manila day. Find a
 * clinic and the clinic page read the same span, so a card and its page never disagree; statusFor looks
 * 30 days ahead.
 */
export async function closuresFor(l: DbListing, o: { now?: Now; days?: number } = {}): Promise<DayClosure[]> {
  const from = manilaMidnight((o.now ?? manilaNow()).ymd);
  const to = new Date(from.getTime() + (o.days ?? 31) * DAY_MS);
  return toClosures(await publicBlocked(pool, l.id, from, to), from, to);
}

/**
 * Per listed dentist's slug, the days in the next `days` (30 by default) that fall on a weekday they are
 * normally in, the clinic is open, and they are away all of its open time (leave, or their own hours
 * outside it). Days the clinic itself is closed are the clinic's line, not theirs.
 */
export async function dentistsAway(l: DbListing, o: { now?: Now; days?: number } = {}): Promise<Record<string, string[]>> {
  const now = o.now ?? manilaNow(), n = o.days ?? 30;
  const from = manilaMidnight(now.ymd), to = new Date(from.getTime() + n * DAY_MS);
  const rs = await publicBlocked(pool, l.id, from, to);
  const clinicCuts = new Map<string, [number, number][]>(), awayCuts = new Map<string, [number, number][]>();
  const add = (m: Map<string, [number, number][]>, k: string, v: [number, number]) => (m.get(k) ?? m.set(k, []).get(k)!).push(v);
  for (const c of toClosures(rs, from, to)) add(clinicCuts, c.ymd, [c.from, c.to]);
  for (const r of rs) if (r.kind === 'away' && r.dentist) for (const p of dayPieces(Math.max(r.s, from.getTime()), Math.min(r.e, to.getTime()))) add(awayCuts, `${r.dentist}|${p.ymd}`, [p.from, p.to]);
  const known = Object.values(l.hours).some(Boolean);
  const out: Record<string, string[]> = {};
  for (const d of l.dentistProfiles) {
    const days = d.clinics[0]?.days ?? [];
    out[d.slug] = [];
    for (let i = 0; i < n; i++) {
      const t = new Date(from.getTime() + i * DAY_MS + 12 * 3_600_000), x = manilaNow(t);
      if (!days.includes(x.day)) continue;
      const h = known ? l.hours[x.day] : [0, 24] as [number, number];
      if (!h) continue;
      const span: [number, number] = [h[0] * 60, h[1] * 60], cuts = clinicCuts.get(x.ymd) ?? [];
      if (!openIntervals(span, cuts).length) continue;
      if (!openIntervals(span, [...cuts, ...(awayCuts.get(`${d.slug}|${x.ymd}`) ?? [])]).length) out[d.slug].push(x.ymd);
    }
  }
  return out;
}

export const slotIso = (s: Slot) => `${s.date}T${String(Math.floor(s.mins / 60)).padStart(2, '0')}:${String(s.mins % 60).padStart(2, '0')}:00+08:00`;
