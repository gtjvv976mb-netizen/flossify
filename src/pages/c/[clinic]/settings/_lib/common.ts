// What Clinic settings, a person's page and My page share: the section list,
// role words, dates said the Manila way, and the redirects that keep the old
// settings addresses working.
//
// Files under a leading-underscore folder are not pages (Astro leaves them out
// of routing), so this and the rest of _lib/ and _ui/ are modules only.
import type { AstroGlobal } from 'astro';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one Clinic settings page, section by section, in the order its list shows them: a short
 *  plain name and the shell's line icon for each (src/components/ws/icons.ts). */
export const SECTIONS = [
  { id: 'profile', label: 'Clinic profile', icon: 'clinic' },
  { id: 'hours', label: 'Opening hours', icon: 'clock' },
  { id: 'fees', label: 'Services & prices', icon: 'money' },
  { id: 'people', label: 'People', icon: 'patients' },
  { id: 'photos', label: 'Photos', icon: 'upload' },
  { id: 'privacy', label: 'Privacy', icon: 'check' },
  { id: 'plan', label: 'Your Flossify plan', icon: 'file' },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];
export const isSection = (s: string | null): s is SectionId => SECTIONS.some((x) => x.id === s);

// A person's role is a row the clinic names (clinic_role, src/lib/roles.ts); staff.role is the professional
// side these two read: an owner, or a dentist or associate who treats patients.
export const clinician = (role: string) => role === 'dentist' || role === 'associate';
/** Sees patients of their own: the roles the schedule gives a column. */
export const treats = (role: string) => role === 'owner' || clinician(role);

/** The week as a clinic says it, Monday first. dow: 0 = Sunday. */
export const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']] as const;
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Mon–Sat", "Mon, Wed, Fri", "No days here". Runs of three or more are joined with a dash. */
export function daysText(dows: number[]): string {
  const order = DAYS.map(([n]) => n as number);
  const on = order.filter((n) => dows.includes(n));
  if (!on.length) return 'No days here';
  if (on.length === 7) return 'Every day';
  const name = (n: number) => DAYS.find(([d]) => d === n)![1];
  const runs: number[][] = [];
  for (const n of on) {
    const last = runs[runs.length - 1];
    if (last && order.indexOf(n) === order.indexOf(last[last.length - 1]) + 1) last.push(n);
    else runs.push([n]);
  }
  return runs.map((r) => (r.length >= 3 ? `${name(r[0])}–${name(r[r.length - 1])}` : r.map(name).join(', '))).join(', ');
}

const dayFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' });
/** "12 Sep 2026", day first, in Manila (en-GB would say "Sept"). */
export const dateText = (d: Date | string) => {
  const p = dayFmt.formatToParts(new Date(d));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`;
};

/** 'just now', '3 hours ago', 'yesterday', then a Manila date. */
export function ago(d: Date | null): string {
  if (!d) return 'never';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return dateText(d);
}

/** "a, b and c" */
export const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The PRC line for a person, in words and a chip tone. Status is never colour alone. */
export function prcState(p: { prc_licence: string | null; prc_status: string | null; prc_checked_on: Date | string | null; role: string }) {
  if (!p.prc_licence) {
    return treats(p.role) && p.role !== 'owner'
      ? { short: 'No licence on file', long: 'No PRC licence number on file.', tone: 'alert' as const }
      : { short: 'Not needed', long: 'No PRC licence: not needed for this role.', tone: 'muted' as const };
  }
  if (p.prc_status === 'mismatch') return { short: 'Did not match', long: 'PRC’s records did not match this number. Correct it, or save it as it is to have it checked again.', tone: 'alert' as const };
  if (p.prc_status === 'checked' && p.prc_checked_on) return { short: `Checked ${dateText(p.prc_checked_on)}`, long: `Checked against PRC’s records by a person at Flossify on ${dateText(p.prc_checked_on)}.`, tone: 'accent' as const };
  return { short: 'Check pending', long: 'Waiting for a person at Flossify to check the number against PRC’s records. The public profile says “PRC check pending” until then.', tone: 'warn' as const };
}

// --- the old settings addresses -------------------------------------------------
// Settings used to be six pages. Each old address now answers with a redirect to
// its section of the one page, carrying its query along in the new page's words
// (?saved=1 on Fees becomes ?saved=fees), so a bookmark, a link in a text, the
// PayMongo return (?paid=<number>, ?unpaid=<number>) and a form drawn before the
// change all still arrive. A form posted to an old address is re-sent to the new
// one as it was (307 keeps the method and the body); ?from= says which form it is.

export type OldPage = 'fees' | 'team' | 'photos' | 'privacy' | 'billing';
const OLD_SECTION: Record<OldPage, SectionId> = { fees: 'fees', team: 'people', photos: 'photos', privacy: 'privacy', billing: 'plan' };

export async function oldSettingsPage(Astro: AstroGlobal, old: OldPage): Promise<Response> {
  const slug = Astro.params.clinic ?? '';
  const base = `/c/${slug}/settings/`;
  const section = OLD_SECTION[old];
  const q = new URLSearchParams(Astro.url.searchParams);

  if (Astro.request.method === 'POST') {
    // Team's per-person forms (days, finance, edit, codes, disable) live on the person's page now.
    if (old === 'team') {
      const form = await Astro.request.clone().formData().catch(() => null);
      const id = String(form?.get('id') ?? '');
      if (form && String(form.get('action') ?? '') !== 'add' && UUID.test(id)) return redirect(`${base}people/${id}/`, 307);
    }
    return redirect(`${base}?from=${old}`, 307);
  }

  // A person's notice from the old Team page goes to their own page.
  if (old === 'team' && q.get('done') && UUID.test(q.get('id') ?? '')) {
    const id = q.get('id')!;
    q.delete('id');
    return redirect(`${base}people/${id}/?${q}`, 302);
  }
  const out = new URLSearchParams();
  for (const [k, v] of q) {
    if (k === 'stale' && v === '1') out.set('stale', section);
    else if (k === 'saved' && v === '1') {
      if (old === 'team') out.set('person', 'added');
      else out.set('saved', section);
    }
    else if (k === 'added' && old === 'fees') out.set('added', 'fee');
    else if (k === 'added' && old === 'photos') { out.set('photos', 'added'); out.set('n', v); }
    else if ((k === 'removed' || k === 'moved') && old === 'photos') out.set('photos', k);
    else out.append(k, v);
  }
  const qs = out.toString();
  return redirect(`${base}${qs ? `?${qs}` : ''}#${section}`, 302);
}

const redirect = (location: string, status: number) =>
  new Response(null, { status, headers: { location, 'cache-control': 'no-store' } });
