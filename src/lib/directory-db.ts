// The public directory, read from Postgres into the same shapes the pages
// already render. `src/data/directory.ts` keeps the types (and seeds the
// database); at request time the rows come from public_directory(), which
// exposes a clinic's public face and nothing else.

import { publicRead, pool } from './db';
import type { Listing, Dentist, Service, Hours, Specialty, Category } from '../data/directory';
import { manilaNow, slotsFor, type Slot, type Now } from './availability';

interface Row {
  id: string; slug: string; name: string; area: string; address: string; phone: string; about: string;
  booking_mode: 'live' | 'request'; walk_ins: boolean; chairs: number; founded: number; philhealth_dental: boolean; photo_keys: string[];
  maps_url: string | null; dpo_name: string | null;
  hours: Record<string, [number, number]>; hmos: string[];
  dentists: { slug: string; name: string; specialty: Specialty | null; practices: string[]; prcCheckedOn: string | null; pda: boolean; since: number; about: string; days: number[] }[];
  fees: { code: string; name: string; local: string | null; category: Category; min: string; max: string | null; from: boolean; unit: string | null; minutes: number | null }[];
}

/** `photoKeys` is every key the clinic has, in its order; `photos` keeps the two the layout shows, with the house
 *  stills as the fallback. An 'up:' key resolves to a file under /uploads/<id>/ (src/lib/uploads.ts). */
export interface DbListing extends Listing { id: string; photoKeys: string[]; fees: Service[]; dentistProfiles: Dentist[]; mapsUrl: string | null; dpoName: string | null }

const toHours = (h: Record<string, [number, number]>): Hours => {
  const out: Hours = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  for (const [d, [o, c]] of Object.entries(h)) out[+d] = [o / 60, c / 60];
  return out;
};

const toListing = (r: Row): DbListing => ({
  id: r.id, slug: r.slug, name: r.name, area: r.area, address: r.address, phone: r.phone, about: r.about, mapsUrl: r.maps_url ?? null, dpoName: r.dpo_name ?? null,
  hours: toHours(r.hours), hmos: r.hmos, philhealth: r.philhealth_dental, workspace: r.booking_mode === 'live',
  walkIns: r.walk_ins, chairs: r.chairs, since: r.founded, photos: [r.photo_keys[0] ?? 'tray', r.photo_keys[1] ?? 'instruments'], photoKeys: r.photo_keys ?? [],
  prices: {}, dentists: r.dentists.map((d) => d.slug),
  fees: r.fees.map((f) => ({ id: f.code, name: f.name, local: f.local ?? undefined, cat: f.category, min: f.min == null ? null : +f.min, max: f.max == null ? undefined : +f.max, from: f.from, unit: f.unit ?? undefined, minutes: f.minutes ?? 30 })),
  dentistProfiles: r.dentists.map((d) => ({
    id: d.slug, slug: d.slug, name: d.name, prc: '', prcCheckedOn: d.prcCheckedOn, pda: d.pda, specialty: d.specialty, practices: d.practices, since: d.since, about: d.about,
    clinics: [{ slug: r.slug, days: d.days }],
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

export interface DbDentist extends Dentist { clinicsFull: { slug: string; name: string; area: string; bookingMode: 'live' | 'request'; days: number[] }[] }

export async function loadDentist(slug: string): Promise<DbDentist | null> {
  const rows = await publicRead<{ d: any }>('select public_dentist($1) as d', [slug]);
  const d = rows[0]?.d;
  if (!d) return null;
  return {
    id: d.slug, slug: d.slug, name: d.name, prc: d.prc, prcCheckedOn: d.prcCheckedOn, pda: d.pda, specialty: d.specialty, practices: d.practices, since: d.since, about: d.about,
    clinics: (d.clinics ?? []).map((c: any) => ({ slug: c.slug, days: c.days ?? [] })),
    clinicsFull: d.clinics ?? [],
  };
}

/** Manila local date + minutes for a timestamp, so booked ranges compare with slots. */
export function toManila(ts: Date): { ymd: string; mins: number } {
  const n = manilaNow(ts);
  return { ymd: n.ymd, mins: n.mins };
}

/**
 * Real open slots for a clinic: its hours, the dentist's days, the service's
 * chair time, minus what is already booked — read through a function that
 * returns times and dentists only, never who.
 */
export async function openSlots(l: DbListing, opts: { dentist?: string | null; minutes?: number; days?: number; limit?: number; now?: Now } = {}): Promise<Slot[]> {
  const now = opts.now ?? manilaNow();
  const days = opts.days ?? 14;
  const from = new Date(`${now.ymd}T00:00:00+08:00`);
  const to = new Date(from.getTime() + (days + 1) * 86_400_000);
  const { rows } = await pool.query('select * from public_booked_ranges($1, $2, $3)', [l.id, from, to]);
  const busy = rows.map((r: any) => ({ dentist: r.dentist_slug as string | null, s: toManila(new Date(r.starts_at)), e: toManila(new Date(r.ends_at)) }));
  const dentistDays = opts.dentist ? l.dentistProfiles.find((d) => d.slug === opts.dentist)?.clinics[0].days : undefined;
  // Any dentist: a slot is free while fewer than `chairs` appointments overlap it.
  // One dentist: free while that dentist has nothing overlapping.
  const isTaken = (ymd: string, start: number, end: number) => {
    const overlapping = busy.filter((b) => b.s.ymd === ymd && b.s.mins < end && b.e.mins > start);
    if (opts.dentist) return overlapping.some((b) => b.dentist === opts.dentist);
    return overlapping.length >= l.chairs;
  };
  return slotsFor(l.slug, l.hours, { days, dentistDays, minutes: opts.minutes, limit: opts.limit, now, isTaken });
}

export const slotIso = (s: Slot) => `${s.date}T${String(Math.floor(s.mins / 60)).padStart(2, '0')}:${String(s.mins % 60).padStart(2, '0')}:00+08:00`;
