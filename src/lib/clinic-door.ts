// Each clinic's own door: flossify.ph/<clinic-slug>/sign-in/ (docs/clinic-sites-design.md, P1).
//
// The device remembers the last clinic signed in to (fl_clinic, a year), so the
// top bar's "Clinic sign-in" opens that clinic's door next time instead of
// asking. It holds a public address only — never who signed in — and is
// cleared the moment it names a clinic that has no door any more.
import type { AstroCookies } from 'astro';
import { loadDirectory } from './directory-db';
import { clinicDoor, type Door } from './auth';

export const CLINIC_COOKIE = 'fl_clinic';
const YEAR = 365 * 24 * 3600;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const doorPath = (slug: string) => `/${slug}/sign-in/`;

export function rememberClinic(cookies: AstroCookies, slug: string) {
  cookies.set(CLINIC_COOKIE, slug, { httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD, path: '/', maxAge: YEAR });
}

export function forgetClinic(cookies: AstroCookies) {
  cookies.delete(CLINIC_COOKIE, { path: '/' });
}

/** The remembered clinic's slug, if it still looks like one. */
export function rememberedClinic(cookies: AstroCookies): string | null {
  const v = cookies.get(CLINIC_COOKIE)?.value?.toLowerCase() ?? '';
  return SLUG.test(v) ? v : null;
}

/** "Find your clinic": its address typed (flossify.ph/session-road, or just session-road) opens any clinic's
 *  door, listed or not; words search the listed clinics by name and area only, so a clinic that is not
 *  public yet is never offered to a stranger. At most eight. */
export async function findClinics(q: string): Promise<{ exact: Door | null; matches: { slug: string; name: string; area: string }[] }> {
  const raw = q.trim().toLowerCase();
  if (!raw) return { exact: null, matches: [] };
  const typed = raw.replace(/^https?:\/\//, '').replace(/^(www\.)?flossify\.ph\/?/, '').replace(/^\/+|\/+$/g, '').split(/[/?#]/)[0];
  const exact = SLUG.test(typed) ? (await clinicDoor(typed)) ?? null : null;
  const words = raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return { exact, matches: [] };
  const hay = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const listed = await loadDirectory().catch(() => []);
  const matches = listed
    .filter((l) => l.slug !== exact?.slug && words.every((w) => hay(`${l.name} ${l.area} ${l.slug}`).includes(w)))
    .slice(0, 8)
    .map((l) => ({ slug: l.slug, name: l.name, area: l.area }));
  return { exact, matches };
}
