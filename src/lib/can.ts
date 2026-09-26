// What a member may see and do at a branch: one check, can(ws, key)
// (docs/clinic-sites-design.md, P2; the roles are rows, migration 030).
//
// A person holds one of their clinic group's roles (staff.role_id → clinic_role);
// the role's ticked keys are what they may do. Two per-branch switches on
// staff_access still apply on top, as before 030: "sees money here"
// (can_view_finance) adds Finances and the amounts at that branch, and
// can_edit_records false takes record editing away there. Read with branch
// access on every workspace request (canOpen in auth.ts), so a change to a role
// takes effect on the member's next click without signing them out.
//
// The page shows or hides; the server refuses. Every page and API that acts
// checks the key itself.

/** Every key, in the order and groups the roles screen lists them, with the words it uses. */
export const PERMS = {
  'records.edit':  { group: 'Patients', label: 'Add and edit patients, health history, consent and charts' },
  'schedule.edit': { group: 'Patients', label: 'Book, move and check in visits' },
  'messages.send': { group: 'Patients', label: 'Text patients and handle the Messages page' },
  'finance.bill':  { group: 'Money',    label: 'Open Finances: statements and payments' },
  'finance.money': { group: 'Money',    label: 'See amounts: balances, takings and claim amounts' },
  'finance.void':  { group: 'Money',    label: 'Void a statement' },
  'settings.edit': { group: 'Clinic',   label: 'Change clinic settings: profile, hours, prices, photos, privacy' },
  'plan.pay':      { group: 'Clinic',   label: 'See and pay the Flossify plan' },
  'people.manage': { group: 'People',   label: 'Add members, reset passwords and give roles' },
  'roles.manage':  { group: 'People',   label: 'Make and change roles' },
  'tasks.assign':  { group: 'People',   label: 'Assign tasks to others' },
} as const;
export type Perm = keyof typeof PERMS;
export const PERM_KEYS = Object.keys(PERMS) as Perm[];
export const isPerm = (k: string): k is Perm => Object.hasOwn(PERMS, k);

/** The six roles every group starts with — the rules the pages enforced before 030. Same lists as
 *  clinic_default_roles() in migration 030; change both together. */
export const DEFAULT_ROLES: { base: string; name: string; rank: number; perms: Perm[] }[] = [
  { base: 'owner', name: 'Owner', rank: 0, perms: [...PERM_KEYS] },
  { base: 'admin', name: 'Admin', rank: 10, perms: PERM_KEYS.filter((k) => k !== 'roles.manage') },
  { base: 'dentist', name: 'Dentist', rank: 20, perms: ['records.edit', 'schedule.edit'] },
  { base: 'associate', name: 'Associate dentist', rank: 30, perms: ['records.edit', 'schedule.edit'] },
  { base: 'secretary', name: 'Secretary', rank: 40, perms: ['records.edit', 'schedule.edit', 'finance.bill'] },
  { base: 'assistant', name: 'Dental assistant', rank: 50, perms: ['records.edit', 'schedule.edit'] },
];

/** A person's role at a branch, as canOpen() reads it. */
export interface RoleAccess {
  role_name: string;
  role_rank: number;
  role_owner: boolean;
  role_perms: string[];
  can_view_finance: boolean;
  can_edit_records: boolean;
}

/** The keys that hold for this person at this branch. The Owner role holds every key, whatever its row says. */
export function permsOf(a: RoleAccess): ReadonlySet<Perm> {
  const out = new Set<Perm>(a.role_owner ? PERM_KEYS : a.role_perms.filter(isPerm));
  if (a.can_view_finance) { out.add('finance.bill'); out.add('finance.money'); }
  if (!a.can_edit_records) out.delete('records.edit');
  return out;
}

/** May they? `ws` is anything carrying the branch's perms: the Workspace from requireWorkspace. */
export const can = (ws: { perms: ReadonlySet<Perm> } | null | undefined, key: Perm) => !!ws?.perms.has(key);
