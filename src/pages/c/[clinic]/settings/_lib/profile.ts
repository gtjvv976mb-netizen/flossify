// Clinic profile & listing, and Hours: who the clinic is, how it runs, the HMO
// cards it takes, its TIN, the listing switch, and when it is open. Two forms
// on the page (each section saves on its own), one handler, because the
// listing switch depends on both: it stays off until the clinic has an about,
// hours and a dentist with days here, since a listing with none of those is a
// card patients cannot act on. Every write runs inside withClinic(), so
// row-level security is the fence on top of the WHERE, and the checklist is
// computed from the same rows the forms edit: it can only say "done" when the
// data does.
//
// A form drawn before Settings became one page posts profile and hours
// together with no `form` field; saveClinic() takes both parts at once for it.
import { withClinic } from '../../../../../lib/db';
import { hmos } from '../../../../../data/directory';
import { AREAS, placeOf } from '../../../../../lib/slug';
import { parseTin, tinParts } from '../../../../../lib/invoices';
import { DAY_LONG, DAYS, listWords } from './common';

export const ABOUT_MAX = 600;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Monday first, as the week is said at a desk. */
export const DOWS = DAYS.map(([n]) => n as number);

// "09:30" ⇄ 570. clinic_hours keeps minutes from midnight.
const toMin = (s: string): number | null => { const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s); if (!m) return null; const n = +m[1] * 60 + +m[2]; return n >= 0 && n <= 1440 ? n : null; };
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface DayRow { closed: boolean; open: string; close: string }
export interface ProfileValues {
  name: string; area: string; address_line: string; phone: string; email: string; maps_url: string; about: string;
  chairs: number; walk_ins: boolean; philhealth_dental: boolean; booking_mode: string;
  hmoIds: string[]; noHmos: boolean; listed: boolean; tin: string; branch: string;
}
export type HoursValues = Record<number, DayRow>;

type Hours = { dow: number; open_min: number; close_min: number }[];

export interface ClinicData {
  c: {
    name: string; area: string | null; address_line: string | null; city: string | null; province: string | null; phone: string | null;
    email: string | null; maps_url: string | null; about: string | null; chairs: number; walk_ins: boolean; philhealth_dental: boolean;
    booking_mode: string; listed: boolean; photo_keys: string[] | null; slug: string; tin: string | null; bir_branch_code: string | null;
  };
  hours: Hours;
  hmoIds: string[];
  /** A dentist with a public profile who sits here on at least one day: what the booking page needs to offer a slot. */
  dentist: boolean;
  /** "We don't take HMOs" stores no HMO row; the choice is kept as the audit entry the save wrote. */
  saidNoHmos: boolean;
}

export async function loadClinic(clinicId: string): Promise<ClinicData> {
  return withClinic(clinicId, async (tx) => ({
    c: (await tx.query(
      `select name, area, address_line, city, province, phone, email, maps_url, about, chairs, walk_ins, philhealth_dental, booking_mode, listed,
              photo_keys, slug::text as slug, tin, bir_branch_code
         from clinic where id = $1`, [clinicId])).rows[0],
    hours: (await tx.query('select dow, open_min, close_min from clinic_hours order by dow')).rows,
    hmoIds: (await tx.query('select hmo_id from clinic_hmo order by hmo_id')).rows.map((r) => r.hmo_id as string),
    dentist: (await tx.query(
      `select exists (select 1 from staff_schedule ss join staff s on s.id = ss.staff_id
                       where ss.clinic_id = $1 and s.slug is not null and s.disabled_at is null) as yes`, [clinicId])).rows[0].yes as boolean,
    saidNoHmos: (await tx.query(`select exists (select 1 from audit_log where action = 'clinic.hmos_none') as yes`)).rows[0].yes as boolean,
  }));
}

/** What the listing still needs, from the data as it is now. */
export function missingForListing(d: ClinicData): string[] {
  return [
    !(d.c.about ?? '').trim() && 'a few sentences about the clinic',
    !d.hours.length && 'opening hours',
    !d.dentist && 'a dentist with days at this branch',
  ].filter((s): s is string => !!s);
}

/** The form's values as saved. */
export function savedProfile(d: ClinicData): ProfileValues {
  const tax = tinParts(d.c.tin, d.c.bir_branch_code);
  return {
    name: d.c.name, area: d.c.area ?? '', address_line: d.c.address_line ?? '', phone: d.c.phone ?? '', email: d.c.email ?? '',
    maps_url: d.c.maps_url ?? '', about: d.c.about ?? '', chairs: d.c.chairs, walk_ins: d.c.walk_ins, philhealth_dental: d.c.philhealth_dental,
    booking_mode: d.c.booking_mode, hmoIds: d.hmoIds, noHmos: d.hmoIds.length === 0 && d.saidNoHmos, listed: d.c.listed,
    tin: tax?.tin ?? '', branch: tax?.branch || d.c.bir_branch_code || '00000',
  };
}
export function savedHours(d: ClinicData): HoursValues {
  return Object.fromEntries(DOWS.map((dow) => {
    const h = d.hours.find((r) => r.dow === dow);
    return [dow, h ? { closed: false, open: toTime(h.open_min), close: toTime(h.close_min) } : { closed: true, open: '09:00', close: '17:00' }];
  }));
}

export interface ClinicRefused {
  part: 'profile' | 'hours';
  problems: string[];
  profile?: ProfileValues;
  hours?: HoursValues;
}

/** Validate and save the profile, the hours, or both. A redirect when saved; the problems and what was typed when not. */
export async function saveClinic(
  o: { clinicId: string; staffId: string; base: string; data: ClinicData; form: FormData; parts: { profile: boolean; hours: boolean } },
): Promise<Response | ClinicRefused> {
  const { form, data, parts } = o;
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const problems: string[] = [];

  let p: ProfileValues | undefined;
  let tax: ReturnType<typeof parseTin> | null = null;
  if (parts.profile) {
    p = {
      name: s('name'), area: s('area'), address_line: s('address_line'), phone: s('phone'), email: s('email'), maps_url: s('maps_url'), about: s('about'),
      chairs: Number(s('chairs')), walk_ins: s('walk_ins') === 'yes', philhealth_dental: s('philhealth_dental') === 'yes', booking_mode: s('booking_mode'),
      hmoIds: form.getAll('hmo').map(String).filter((id) => hmos.some((h) => h.id === id)),
      noHmos: form.get('hmo_none') === 'on', listed: form.get('listed') === 'on',
      tin: s('tin'), branch: s('bir_branch_code'),
    };
    if (!p.name) problems.push('The clinic needs a name.');
    else if (p.name.length > 80) problems.push('Keep the clinic name under 80 characters.');
    if (!(AREAS as readonly string[]).includes(p.area) && p.area !== (data.c.area ?? '')) problems.push('Pick where the clinic is from the list.');
    if (!p.address_line) problems.push('Add the clinic’s address, so patients can find the door.');
    const phoneDigits = p.phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 13) problems.push('The clinic phone needs to be a number patients can call.');
    if (p.email && !EMAIL.test(p.email)) problems.push('The clinic email does not look like an email address.');
    if (p.maps_url && !/^https?:\/\/\S{4,500}$/.test(p.maps_url)) problems.push('The map link needs to be a full web address, starting with https://.');
    if (p.about.length > ABOUT_MAX) problems.push(`Keep the about under ${ABOUT_MAX} characters; it is ${p.about.length} now.`);
    if (!Number.isInteger(p.chairs) || p.chairs < 1 || p.chairs > 12) problems.push('Chairs is a whole number from 1 to 12.');
    if (p.booking_mode !== 'live' && p.booking_mode !== 'request') problems.push('Pick how patients book.');
    if (p.noHmos && p.hmoIds.length > 0) problems.push('You ticked HMOs and also “We don’t take HMOs”. Keep one.');
    // A form drawn before these fields existed sends neither; it must not clear a saved TIN.
    tax = form.has('tin') ? parseTin(p.tin, p.branch) : null;
    if (tax) problems.push(...tax.problems);
  }

  let h: HoursValues | undefined;
  const hours: Hours = [];
  if (parts.hours) {
    h = {};
    for (const dow of DOWS) h[dow] = { closed: form.get(`closed[${dow}]`) === 'on', open: s(`open[${dow}]`), close: s(`close[${dow}]`) };
    for (const dow of DOWS) {
      const d = h[dow];
      if (d.closed) continue;
      const op = toMin(d.open), cl = toMin(d.close);
      if (op === null || cl === null) { problems.push(`${DAY_LONG[dow]} needs an opening and a closing time, or tick closed.`); continue; }
      if (cl <= op) { problems.push(`${DAY_LONG[dow]} closes before it opens.`); continue; }
      hours.push({ dow, open_min: op, close_min: cl });
    }
  }

  if (problems.length) return { part: parts.profile ? 'profile' : 'hours', problems, profile: p, hours: h };

  // The switch needs an about, hours and a dentist: the ones being saved now, else the ones already saved.
  const about = p ? p.about : (data.c.about ?? '').trim();
  const hoursAfter = parts.hours ? hours.length : data.hours.length;
  const okToList = about.length > 0 && hoursAfter > 0 && data.dentist;
  const wanted = p ? p.listed : data.c.listed;
  const listed = wanted && okToList;
  const held = (wanted || data.c.listed) && !okToList;

  await withClinic(o.clinicId, async (tx) => {
    if (p) {
      const place = placeOf(p.area);
      await tx.query(
        `update clinic set name = $2, area = $3, address_line = $4, city = $5, province = $6, phone = $7, email = $8, maps_url = $9, about = $10,
                chairs = $11, walk_ins = $12, philhealth_dental = $13, booking_mode = $14
         where id = $1`,
        [o.clinicId, p.name, p.area, p.address_line, place.city === undefined ? data.c.city : place.city, place.province === undefined ? data.c.province : place.province,
         p.phone, p.email || null, p.maps_url || null, p.about || null, p.chairs, p.walk_ins, p.philhealth_dental, p.booking_mode]);
      if (tax) await tx.query('update clinic set tin = $2, bir_branch_code = $3 where id = $1', [o.clinicId, tax.tin, tax.branch]);
      await tx.query('delete from clinic_hmo where clinic_id = $1', [o.clinicId]);
      for (const id of p.noHmos ? [] : p.hmoIds) await tx.query('insert into clinic_hmo (clinic_id, hmo_id) values ($1, $2)', [o.clinicId, id]);
      if (p.noHmos) await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'clinic.hmos_none', 'clinic', $1)`, [o.clinicId, o.staffId]);
    }
    if (parts.hours) {
      await tx.query('delete from clinic_hours where clinic_id = $1', [o.clinicId]);
      for (const r of hours) await tx.query('insert into clinic_hours (clinic_id, dow, open_min, close_min) values ($1, $2, $3, $4)', [o.clinicId, r.dow, r.open_min, r.close_min]);
    }
    await tx.query('update clinic set listed = $2 where id = $1', [o.clinicId, listed]);
    await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'clinic.settings', 'clinic', $1)`, [o.clinicId, o.staffId]);
  });
  const part = parts.profile ? 'profile' : 'hours';
  return new Response(null, { status: 303, headers: { location: `${o.base}?saved=${part}${held ? '&held=1' : ''}#${part}` } });
}

/** "Saved. The listing switch stayed off: the clinic still needs opening hours." */
export function heldText(d: ClinicData): string {
  const missing = missingForListing(d);
  return `Saved. The clinic is not listed: it still needs ${listWords(missing) || 'a moment'}.`;
}
