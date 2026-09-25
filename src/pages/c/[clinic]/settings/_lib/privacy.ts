// Privacy & consent: the group's Data Protection Officer and NPC registration,
// and what consent the clinic holds.
//
// The DPO belongs to the clinic group — one officer for every branch — and
// clinic_group is not under row-level security, so the save is a plain pool
// query keyed on this clinic's group id, which requireWorkspace() has already
// checked this person may open. The audit entry and the consent counts are
// clinic data and go through withClinic().
import { pool, withClinic } from '../../../../../lib/db';
import { normalizePhone, PH_MOBILE, prettyPhone } from '../../../../../lib/messages';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PrivacyValues { dpo_name: string; dpo_email: string; dpo_phone: string; npc_registration_no: string }
export interface PrivacyData {
  group: { dpo_name: string | null; dpo_email: string | null; dpo_phone: string | null; npc_registration_no: string | null; dpo_updated_at: Date | null };
  version: { id: string; title: string; effective: string } | undefined;
  counts: { agreed: number; none: number };
}

export async function loadPrivacy(clinicId: string, groupId: string): Promise<PrivacyData> {
  // clinic_group has no tenant; the group id came from requireWorkspace().
  const group = (await pool.query(
    `select dpo_name, dpo_email, dpo_phone, npc_registration_no, dpo_updated_at from clinic_group where id = $1`, [groupId])).rows[0];
  // The notice in force, through the definer function. No row means nothing is in force yet.
  const version = (await pool.query(
    `select v.id, v.title, to_char(v.effective_from, 'FMDD FMMonth YYYY') as effective from current_consent_version() v where v.id is not null`)).rows[0];
  // Consent on record, counted on the patients of this branch that are not archived.
  const counts = await withClinic(clinicId, async (tx) => (await tx.query(
    `select count(*) filter (where exists (select 1 from patient_consent c where c.patient_id = p.id and c.version_id = $1))::int as agreed,
            count(*) filter (where not exists (select 1 from patient_consent c where c.patient_id = p.id and c.version_id = $1))::int as none
       from patient p where p.archived_at is null`, [version?.id ?? ''])).rows[0]);
  return { group, version, counts };
}

export const savedPrivacy = (d: PrivacyData): PrivacyValues => ({
  dpo_name: d.group.dpo_name ?? '', dpo_email: d.group.dpo_email ?? '', dpo_phone: d.group.dpo_phone ? prettyPhone(d.group.dpo_phone) : '', npc_registration_no: d.group.npc_registration_no ?? '',
});

export interface PrivacyRefused { problems: string[]; posted: PrivacyValues }

export async function savePrivacy(o: { clinicId: string; groupId: string; staffId: string; base: string; form: FormData }): Promise<Response | PrivacyRefused> {
  const s = (k: string) => String(o.form.get(k) ?? '').trim().replace(/\s+/g, ' ');
  const p: PrivacyValues = { dpo_name: s('dpo_name'), dpo_email: s('dpo_email').toLowerCase(), dpo_phone: s('dpo_phone'), npc_registration_no: s('npc_registration_no') };
  const problems: string[] = [];
  if (p.dpo_name.length > 120) problems.push('Keep the officer’s name under 120 characters.');
  if (p.dpo_email && !EMAIL.test(p.dpo_email)) problems.push('The officer’s email does not look like an email address.');
  const phone = p.dpo_phone ? normalizePhone(p.dpo_phone) : '';
  if (p.dpo_phone && !PH_MOBILE.test(phone)) problems.push('The officer’s mobile needs to be a Philippine mobile number, like 0917 000 0000.');
  if (p.npc_registration_no.length > 60) problems.push('Keep the registration number under 60 characters.');
  if ((p.dpo_email || p.dpo_phone) && !p.dpo_name) problems.push('Name the officer the email or mobile belongs to.');
  if (problems.length) return { problems, posted: p };

  await pool.query(
    `update clinic_group set dpo_name = $2, dpo_email = $3, dpo_phone = $4, npc_registration_no = $5, dpo_updated_at = now() where id = $1`,
    [o.groupId, p.dpo_name || null, p.dpo_email || null, phone || null, p.npc_registration_no || null]);
  await withClinic(o.clinicId, (tx) =>
    tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'group.privacy', 'clinic_group', $3)`, [o.clinicId, o.staffId, o.groupId]));
  return new Response(null, { status: 303, headers: { location: `${o.base}?saved=privacy#privacy` } });
}
