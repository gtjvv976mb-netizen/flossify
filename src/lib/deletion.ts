// Deleting an account from inside the app (047; Apple's App Review guideline 5.1.1(v)).
//
// The owner's choice (7 Nov 2026): the button sends a request and Flossify confirms it; nothing is erased by the
// button itself. An owner asks for the whole clinic group (the account they opened); anyone else for their own
// sign-in. My page (/c/<slug>/account/#delete) asks and withdraws; /admin/accounts/ confirms, through the definer
// admin_close_account(), which says in the migration exactly what confirming erases and what it keeps.
import { pool, withClinic } from './db';

export const DELETE_REASON_MAX = 500;

export type DeletionScope = 'me' | 'clinic';
export interface OpenDeletion { id: string; scope: DeletionScope; requested_at: Date }

/** The scope a person's request has: an owner closes the clinic group, anyone else only their own sign-in. */
export const scopeFor = (role: string): DeletionScope => (role === 'owner' ? 'clinic' : 'me');

/** The signed-in person's open request, if any. */
export async function openDeletion(staffId: string): Promise<OpenDeletion | null> {
  const { rows } = await pool.query(
    `select id, scope, requested_at from deletion_request where staff_id = $1 and outcome is null`, [staffId]);
  return (rows[0] as OpenDeletion) ?? null;
}

/**
 * Asks. Returns 'asked', or 'already' when an open request is there (two tabs, or a second press). Audited in the
 * clinic it was asked from, as account.delete_request.
 */
export async function askDeletion(p: { staffId: string; groupId: string; clinicId: string; role: string; reason: string }): Promise<'asked' | 'already'> {
  const reason = p.reason.trim().slice(0, DELETE_REASON_MAX) || null;
  const w = await pool.query(
    `insert into deletion_request (staff_id, group_id, clinic_id, scope, reason) values ($1, $2, $3, $4, $5)
     on conflict (staff_id) where outcome is null do nothing returning id`,
    [p.staffId, p.groupId, p.clinicId, scopeFor(p.role), reason]);
  if (!w.rowCount) return 'already';
  await withClinic(p.clinicId, (tx) => tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'account.delete_request', 'staff', $2)`,
    [p.clinicId, p.staffId]));
  return 'asked';
}

/** Takes back the person's own open request. Returns whether there was one. */
export async function withdrawDeletion(staffId: string, clinicId: string): Promise<boolean> {
  const w = await pool.query(
    `update deletion_request set outcome = 'withdrawn', decided_at = now(), decided_by = $1
      where staff_id = $1 and outcome is null`, [staffId]);
  if (!w.rowCount) return false;
  await withClinic(clinicId, (tx) => tx.query(
    `insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, 'account.delete_withdrawn', 'staff', $2)`,
    [clinicId, staffId]));
  return true;
}

// ---------------------------------------------------------------------------
// The operator's side (/admin/accounts/, behind requireAdmin()).
// ---------------------------------------------------------------------------

export interface DeletionRow {
  id: string; scope: DeletionScope; reason: string | null; requested_at: Date;
  full_name: string; role: string; email: string | null; phone: string | null;
  group_name: string; clinic_name: string | null; people: number; branches: number;
}

/** Every open request, oldest first: who asked, from where, and how much confirming would close. */
export async function openDeletions(): Promise<DeletionRow[]> {
  const { rows } = await pool.query(
    `select d.id, d.scope, d.reason, d.requested_at, s.full_name, s.role, s.email::text as email, s.phone,
            g.name as group_name, c.name as clinic_name,
            (select count(*)::int from staff x where x.group_id = d.group_id and x.disabled_at is null) as people,
            (select count(*)::int from clinic y where y.group_id = d.group_id) as branches
       from deletion_request d
       join staff s on s.id = d.staff_id
       join clinic_group g on g.id = d.group_id
       left join clinic c on c.id = d.clinic_id
      where d.outcome is null
      order by d.requested_at`);
  return rows as DeletionRow[];
}

/** Confirms one: the definer erases what 047 says. Returns the scope, or null when it was no longer open. */
export async function confirmDeletion(requestId: string, byStaffId: string): Promise<DeletionScope | null> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  const { rows } = await pool.query('select admin_close_account($1, $2) as scope', [requestId, byStaffId]);
  return (rows[0]?.scope as DeletionScope | null) ?? null;
}
