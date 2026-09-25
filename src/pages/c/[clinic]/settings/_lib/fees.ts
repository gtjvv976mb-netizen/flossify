// Services & fees: what patients see on the clinic's page and what the desk
// quotes. One table, one Save; a second small form (in a side panel) adds a
// service. Prices are pesos. A blank "up to" prints a single price, "from"
// prints "from ₱300", and a service that is not offered stays in the list but
// off the page. Rows are updated by id inside withClinic(), so an id from
// another clinic matches nothing.
import { withClinic } from '../../../../../lib/db';
import { CATEGORY_LABEL, type Category } from '../../../../../data/directory';
import { peso } from '../../../../../data/demo';
import { UUID } from './common';

// procedure_catalog.category has no check constraint; these six are the ones the directory renders.
export const CATS = Object.keys(CATEGORY_LABEL) as Category[];
const CODE = /^[a-z][a-z-]{0,39}$/;

export interface FeeRow { id: string; code: string; name: string; local_name: string | null; category: string | null; default_price: string; price_max: string | null; price_from: boolean; unit: string | null; minutes: number | null; active: boolean }
export interface FeeAdd { code: string; name: string; local_name: string; category: string; price: string; unit: string; minutes: string }
export const emptyAdd = (): FeeAdd => ({ code: '', name: '', local_name: '', category: 'prevent', price: '', unit: '', minutes: '' });

export const loadFees = (clinicId: string) => withClinic(clinicId, async (tx) => (await tx.query(
  `select id, code, name, local_name, category, default_price, price_max, price_from, unit, minutes, active
     from procedure_catalog
    order by coalesce(array_position($1::text[], category), 99), default_price, name`, [CATS])).rows as FeeRow[]);

// "1,500" → 1500; "" → null; anything else → NaN, which is the one sentence below.
const num = (s: FormDataEntryValue | null): number | null => {
  const t = String(s ?? '').trim().replace(/[,₱\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export type FeesRefused =
  | { kind: 'table'; problems: string[]; keep: FormData }
  | { kind: 'add'; problems: string[]; add: FeeAdd };

/** Save the whole table. */
export async function saveFees(o: { clinicId: string; staffId: string; base: string; rows: FeeRow[]; form: FormData }): Promise<Response | FeesRefused> {
  const { form, rows } = o;
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const [k] of form) { const m = /^price\[([0-9a-f-]{36})\]$/.exec(k); if (m && UUID.test(m[1])) ids.add(m[1]); }
  const updates: { id: string; price: number; max: number | null; from: boolean; active: boolean; minutes: number | null }[] = [];
  let bad = false;
  for (const id of ids) {
    const price = num(form.get(`price[${id}]`)), max = num(form.get(`max[${id}]`)), minutes = num(form.get(`minutes[${id}]`));
    if (price === null || Number.isNaN(price) || Number.isNaN(max) || Number.isNaN(minutes)) { bad = true; continue; }
    const row = rows.find((r) => r.id === id);
    if (max !== null && max < price) problems.push(`“Up to” is less than the price on ${row?.name ?? 'one service'}.`);
    if (minutes !== null && (minutes < 5 || minutes > 480)) problems.push(`Minutes is a whole number from 5 to 480 on ${row?.name ?? 'one service'}.`);
    if (price > 9_999_999_999 || (max !== null && max > 9_999_999_999)) problems.push(`The price on ${row?.name ?? 'one service'} is more than the fee guide can hold.`);
    updates.push({ id, price, max, from: form.get(`from[${id}]`) === 'on', active: form.get(`active[${id}]`) === 'on', minutes: minutes === null ? null : Math.round(minutes) });
  }
  if (bad) problems.unshift('Prices and minutes are numbers, zero or more — no letters, no negatives.');
  if (problems.length) return { kind: 'table', problems, keep: form };
  await withClinic(o.clinicId, async (tx) => {
    for (const u of updates) await tx.query(
      `update procedure_catalog set default_price = $2, price_max = $3, price_from = $4, active = $5, minutes = $6 where id = $1`,
      [u.id, u.price, u.max, u.from, u.active, u.minutes]);
    await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity) values ($1, $2, 'catalog.update', 'procedure_catalog')`, [o.clinicId, o.staffId]);
  });
  return see(`${o.base}?saved=fees#fees`);
}

/** Add one service. */
export async function addFee(o: { clinicId: string; staffId: string; base: string; form: FormData }): Promise<Response | FeesRefused> {
  const add = emptyAdd();
  for (const k of Object.keys(add) as (keyof FeeAdd)[]) add[k] = String(o.form.get(k) ?? '').trim();
  add.code = add.code.toLowerCase();
  // The code is optional on the form: left empty, it is made from the name ("Night guard" → night-guard).
  if (!add.code && add.name) add.code = codeFrom(add.name);
  const problems: string[] = [];
  const price = num(add.price), minutes = num(add.minutes);
  if ((add.code || add.name) && !CODE.test(add.code)) problems.push('The code is lowercase letters and hyphens, like root-canal.');
  if (!add.name) problems.push('The service needs a name.');
  if (!CATS.includes(add.category as Category)) problems.push('Pick a category.');
  if (price === null || Number.isNaN(price)) problems.push('The price is a number, zero or more.');
  if (minutes === null || Number.isNaN(minutes) || minutes < 5 || minutes > 480) problems.push('Minutes is a whole number from 5 to 480: the chair time the schedule blocks.');
  if (problems.length) return { kind: 'add', problems, add };
  try {
    await withClinic(o.clinicId, async (tx) => {
      const { rows: made } = await tx.query(
        `insert into procedure_catalog (clinic_id, code, name, local_name, category, default_price, price_from, unit, minutes, tooth_scoped, active)
         values ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, true) returning id`,
        [o.clinicId, add.code, add.name, add.local_name || null, add.category, price, add.unit || null, Math.round(minutes as number), /tooth/i.test(add.unit)]);
      await tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'catalog.update', 'procedure_catalog', $3)`, [o.clinicId, o.staffId, made[0].id]);
    });
  } catch (e: any) {
    if (e?.code === '23505') return { kind: 'add', problems: [`There is already a service with the code “${add.code}”. Pick another.`], add };
    throw e;
  }
  return see(`${o.base}?added=fee#fees`);
}

/** A service's code from its name: plain lowercase letters and single hyphens, up to 40, starting with a letter. */
export function codeFrom(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
}

/** The line the public page prints, so the desk sees what a patient sees. */
export function shows(r: FeeRow): string {
  if (!r.active) return 'Not offered';
  const min = Number(r.default_price);
  const core = r.price_max != null ? `${peso(min)} – ${peso(Number(r.price_max))}` : r.price_from ? `from ${peso(min)}` : peso(min);
  return r.unit ? `${core} ${r.unit}` : core;
}

const see = (location: string) => new Response(null, { status: 303, headers: { location } });
