// A clinic group's roles (clinic_role, 030) and the rules for handing them out
// (docs/clinic-sites-design.md, "Decisions" 4). The list is ranked: 0 is the
// top, the Owner. The rules, which every page that changes people or roles
// goes through:
//
//   - someone who manages people changes only people whose role is BELOW their
//     own (an owner changes anyone but another owner's role; only an owner
//     touches an owner's details);
//   - they hand out only roles below their own, and only a role whose every
//     permission they hold themselves — nobody grants what they do not have;
//   - the Owner role is never handed out or taken away here, and nobody
//     changes their own role, so an owner cannot lock himself out.
//
// Roles are group data outside row-level security, like staff: plain queries.
import { pool } from './db';
import { PERM_KEYS, isPerm, type Perm } from './can';

export interface Role { id: string; name: string; rank: number; perms: Perm[]; is_owner: boolean; base: string | null; holders: number }

/** Every live role of the group, top first, with how many active people hold it. */
export async function listRoles(groupId: string): Promise<Role[]> {
  const { rows } = await pool.query(
    `select r.id, r.name, r.rank, r.perms, r.is_owner, r.base,
            (select count(*)::int from staff s where s.role_id = r.id and s.disabled_at is null) as holders
       from clinic_role r where r.group_id = $1 and r.archived_at is null order by r.rank, r.created_at`, [groupId]);
  return rows.map((r) => ({ ...r, perms: r.is_owner ? [...PERM_KEYS] : (r.perms as string[]).filter(isPerm) }));
}

/** Who is acting: their role's place and what they hold at this branch (canOpen). */
export interface Manager { role_rank: number; role_owner: boolean; perms: ReadonlySet<Perm> }

/** May this manager change this person? */
export function mayManage(m: Manager, t: { role_rank: number; role_owner: boolean }, self: boolean): boolean {
  if (self) return false;
  if (t.role_owner) return m.role_owner;
  return m.role_owner || t.role_rank > m.role_rank;
}

/** May this manager hand out this role? */
export function mayGive(m: Manager, r: Pick<Role, 'rank' | 'is_owner' | 'perms'>): boolean {
  if (r.is_owner) return false;
  if (m.role_owner) return true;
  return r.rank > m.role_rank && r.perms.every((p) => m.perms.has(p));
}

/** The roles this manager may hand out, top first. */
export const giveable = (m: Manager, roles: Role[]) => roles.filter((r) => mayGive(m, r));

/**
 * staff.role, the professional side the pages still read (030), for a role and "treats patients".
 * A default role keeps its own word; a role the clinic made is 'dentist' when the person treats
 * patients and 'assistant' otherwise — neither word is shown for it: the role's own name is.
 */
export function staffRoleFor(r: Pick<Role, 'base' | 'is_owner'>, treatsPatients: boolean): string {
  if (r.is_owner) return 'owner';
  if (treatsPatients) return r.base === 'associate' ? 'associate' : 'dentist';
  if (r.base && !['owner', 'dentist', 'associate'].includes(r.base)) return r.base;
  return 'assistant';
}
