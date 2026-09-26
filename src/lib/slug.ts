// The names a clinic and its owner get on the way in.
//
// A slug is a public address — flossify.ph/c/<slug>, /dentists/<slug> — and
// is never renamed once issued, so it is made once, from the name, and made
// unique by counting up: smile-dental, smile-dental-2, smile-dental-3. The
// availability checks run through definer functions (clinic_slug_taken,
// staff_slug_taken) because at sign-up there is no tenant yet and the app
// role cannot see the clinic table.
//
// The area list lives here too, because sign-up and settings both offer it
// and both derive city and province from it the same way.

import { pool } from './db';

const MAX = 48;

/** "Dr. Cariño's Smile Dental" → "dr-carinos-smile-dental". Lowercase ascii and hyphens, at most 48 characters. */
export function slugify(name: string): string {
  return String(name ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX)
    .replace(/-+$/, '');
}

/** First path segments the site already uses, so no clinic's own address (flossify.ph/<slug>/) can be
 *  one of them: a clinic called "Find" becomes find-2. docs/clinic-sites-design.md, "Reserved addresses".
 *  A page added at a new first segment belongs on this list. */
export const RESERVED: ReadonlySet<string> = new Set([
  'find', 'start', 'me', 'c', 'f', 'auth', 'admin', 'api', 'coverage', 'websites', 'privacy', 'offline', 'uploads',
  'samples', 'video', 'img', 'icons', 'fonts', 'shots', 'healthz', 'clinics', 'today', 'dentists', 'sign-in', 'login',
  'logout', 'account', 'settings', 'help', 'about', 'contact', 'terms', 'pricing', 'blog', 'www', 'mail', 'app',
  'sitemap', '404', '500',
]);

async function unique(base: string, fallback: string, fn: 'clinic_slug_taken' | 'staff_slug_taken'): Promise<string> {
  const root = base || fallback;
  for (let n = 1; n < 1000; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = root.slice(0, MAX - suffix.length).replace(/-+$/, '') + suffix;
    if (fn === 'clinic_slug_taken' && RESERVED.has(candidate)) continue;
    const { rows } = await pool.query(`select ${fn}($1) as taken`, [candidate]);
    if (!rows[0]?.taken) return candidate;
  }
  throw new Error(`No free slug near "${root}".`);
}

/** The clinic's slug: the base, or the first of base-2, base-3… that no clinic has. */
export const uniqueClinicSlug = (base: string) => unique(base, 'clinic', 'clinic_slug_taken');

/** A staff member's public slug, unique across every group. */
export const uniqueStaffSlug = (base: string) => unique(base, 'dentist', 'staff_slug_taken');

/** Where a clinic can say it is. Benguet's city and towns first — the directory's home ground — then the rest. */
export const AREAS = [
  'Baguio City', 'La Trinidad', 'Itogon', 'Tuba', 'Tublay', 'Sablan',
  'Elsewhere in Benguet', 'Metro Manila', 'Elsewhere',
] as const;
export type Area = (typeof AREAS)[number];

const BENGUET_TOWNS: readonly string[] = AREAS.slice(0, 6);

/** City and province for an area. `undefined` means "leave what is there": a clinic that says
 *  "Elsewhere" has told us nothing about its city, and its province should not be blanked for it. */
export function placeOf(area: string): { city?: string | null; province?: string | null } {
  if (BENGUET_TOWNS.includes(area)) return { city: area, province: 'Benguet' };
  if (area === 'Elsewhere in Benguet') return { province: 'Benguet' };
  if (area === 'Metro Manila') return { province: 'Metro Manila' };
  return {};
}
