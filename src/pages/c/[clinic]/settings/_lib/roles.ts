// Roles (Clinic settings → Roles): the owner names roles, ticks what each may
// see and do, and orders them top to bottom (docs/clinic-sites-design.md, P3).
// For anyone whose role may make and change roles (roles.manage; by default the
// owner only). The rules, checked here on every post:
//
//   - the Owner role is fixed: every permission, top of the list, never
//     renamed, moved or removed;
//   - you change only roles below your own, and move a role only among the
//     roles below yours;
//   - a role can be given only permissions you hold yourself;
//   - a role is removed only when nobody holds it (not even a disabled
//     account: their row still points at it);
//   - names are 1–40 characters and unique in the group.
//
// A change to a role's permissions counts for everyone who holds it on their
// next click (canOpen reads the role on every request); nobody is signed out.
// Roles are group data (clinic_role, outside row-level security); the audit
// line is this branch's.
import { pool, withClinic } from '../../../../../lib/db';
import { PERM_KEYS, isPerm, type Perm } from '../../../../../lib/can';
import { listRoles, type Manager, type Role } from '../../../../../lib/roles';
import { UUID } from './common';

export const ROLE_NAME_MAX = 40;

/** The acting person at this branch: their role's place and keys, and whether they may change roles at all. */
type Acting = { id: string; group_id: string } & Manager;

/** May this person change this role? */
export const mayEditRole = (m: Manager, r: Pick<Role, 'rank' | 'is_owner'>) => !r.is_owner && (m.role_owner || r.rank > m.role_rank);

export interface RoleValues { id: string; name: string; perms: Perm[] }
export interface RolesRefused { error: string; values: RoleValues }

const see = (location: string) => new Response(null, { status: 303, headers: { location } });
const cleanName = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ');
const permsFrom = (form: FormData) => [...new Set(form.getAll('perm').map(String).filter(isPerm))];

export async function rolesAction(a: { clinic: Acting; staffId: string; base: string; form: FormData }): Promise<Response | RolesRefused> {
  const { clinic, form, base } = a;
  const act = String(form.get('do') ?? '');
  const id = String(form.get('role') ?? '');
  const values: RoleValues = { id: UUID.test(id) ? id : '', name: cleanName(form.get('name')), perms: permsFrom(form) };
  const fail = (error: string): RolesRefused => ({ error, values });
  const roles = await listRoles(clinic.group_id);
  const role = roles.find((r) => r.id === values.id);
  const held = (p: Perm) => clinic.role_owner || clinic.perms.has(p);
  const audit = (action: string, roleId: string) => withClinic(clinic.id, (tx) =>
    tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'clinic_role', $4)`, [clinic.id, a.staffId, action, roleId]));
  const nameTaken = (name: string, notId: string | null) => roles.some((r) => r.id !== notId && r.name.toLowerCase() === name.toLowerCase());
  const nameProblem = (name: string, notId: string | null) =>
    !name ? 'Give the role a name, like “Front desk” or “Resident dentist”.'
    : name.length > ROLE_NAME_MAX ? `Keep the name to ${ROLE_NAME_MAX} characters.`
    : nameTaken(name, notId) ? `There is already a role called “${name}”. Choose another name.`
    : null;
  const notHeld = values.perms.filter((p) => !held(p));

  if (act === 'add') {
    const problem = nameProblem(values.name, null);
    if (problem) return fail(problem);
    if (notHeld.length) return fail('A role can only be given what you may do yourself.');
    // At the bottom of the list, which is always below your own role.
    const rank = Math.min(999, Math.max(clinic.role_rank, ...roles.map((r) => r.rank)) + 10);
    try {
      const { rows: [made] } = await pool.query(
        'insert into clinic_role (group_id, name, rank, perms, created_by) values ($1, $2, $3, $4, $5) returning id',
        [clinic.group_id, values.name, rank, values.perms, a.staffId]);
      await audit('role.add', made.id);
      return see(`${base}?role=added&id=${made.id}#roles`);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return fail(`There is already a role called “${values.name}”. Choose another name.`);
      throw e;
    }
  }

  if (!role) return fail('That role is not on the list any more. Reload the page.');
  if (!mayEditRole(clinic, role)) return fail(role.is_owner ? 'The Owner role always has everything and stays at the top.' : 'You can only change roles below your own.');

  if (act === 'edit') {
    const problem = nameProblem(values.name, role.id);
    if (problem) return fail(problem);
    // Keys you do not hold stay as they were: you can neither give nor take away what you cannot do.
    const keep = role.perms.filter((p) => !held(p));
    const perms = [...new Set([...values.perms.filter(held), ...keep])];
    if (notHeld.some((p) => !role.perms.includes(p))) return fail('A role can only be given what you may do yourself.');
    const same = role.name === values.name && perms.length === role.perms.length && perms.every((p) => role.perms.includes(p));
    if (same) return see(`${base}?role=same&id=${role.id}#roles`);
    try {
      await pool.query('update clinic_role set name = $2, perms = $3 where id = $1 and group_id = $4', [role.id, values.name, perms, clinic.group_id]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return fail(`There is already a role called “${values.name}”. Choose another name.`);
      throw e;
    }
    await audit('role.edit', role.id);
    return see(`${base}?role=saved&id=${role.id}#roles`);
  }

  if (act === 'up' || act === 'down') {
    const i = roles.findIndex((r) => r.id === role.id);
    const other = roles[act === 'up' ? i - 1 : i + 1];
    // Only among the roles below yours: never above your own, never past the Owner.
    if (!other || !mayEditRole(clinic, other)) return see(`${base}?role=moved&id=${role.id}#roles`);
    // The two change places; the list is numbered again 0, 10, 20 … in one statement, so equal ranks
    // (two roles made at the same place) can never leave the order undecided.
    const order = roles.map((r) => r.id);
    const j = act === 'up' ? i - 1 : i + 1;
    [order[i], order[j]] = [order[j], order[i]];
    await pool.query(
      `update clinic_role r set rank = v.rank from (select unnest($1::uuid[]) as id, unnest($2::int[]) as rank) v
        where r.id = v.id and r.group_id = $3`,
      [order, order.map((_, k) => k * 10), clinic.group_id]);
    await audit(`role.${act}`, role.id);
    return see(`${base}?role=moved&id=${role.id}#roles`);
  }

  if (act === 'remove') {
    const { rows: [n] } = await pool.query('select count(*)::int as n from staff where role_id = $1', [role.id]);
    if (n.n > 0) return fail(`${n.n === 1 ? 'One person holds' : `${n.n} people hold`} “${role.name}”, counting accounts that are switched off. Give them another role first.`);
    await pool.query('update clinic_role set archived_at = now() where id = $1 and group_id = $2', [role.id, clinic.group_id]);
    await audit('role.remove', role.id);
    return see(`${base}?role=removed#roles`);
  }

  return fail('Choose what to do.');
}

/** The sentence after a role action, from ?role=. */
export function roleNotice(q: URLSearchParams, roles: Role[]): string {
  const r = roles.find((x) => x.id === q.get('id'));
  switch (q.get('role')) {
    case 'added': return `Added “${r?.name ?? 'the role'}”. It is at the bottom of the list; give it to people on their page under People.`;
    case 'saved': return `Saved “${r?.name ?? 'the role'}”. Everyone who holds it has the change on their next click.`;
    case 'same': return 'Nothing changed.';
    case 'moved': return 'Moved.';
    case 'removed': return 'Removed.';
    default: return '';
  }
}

export { PERM_KEYS };
