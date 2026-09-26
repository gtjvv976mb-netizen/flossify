// People: everyone who can open this branch, and what an owner does about
// them. The list and + Add person live in Clinic settings (the People
// section); everything about one person — edit their details, the days they
// sit here, who sees finance, a new invitation or reset code, switching the
// account off — lives on their own page, /c/<slug>/settings/people/<id>/.
// This file is Settings → Team as it was, moved: the same rules, the same
// sentences, the same audit lines.
//
// staff and staff_access are group tables outside row-level security, so the
// list is a plain pool query keyed on this clinic's id. Days (staff_schedule),
// the message queue, appointments and the audit trail are clinic data and go
// through withClinic(). Every action looks the target up through staff_access
// for this clinic before touching the row, so an id lifted from another
// branch's page changes nothing here.
//
// Adding a member (031): a name, a username and a role; a first password the
// owner sets — the member chooses their own the first time they sign in
// (must_change_password) — or, with no password, a code texted to their
// mobile as before. Email and mobile are optional. Who may add, change, reset
// or switch off whom, and which roles they may hand out, is src/lib/roles.ts:
// only people and roles below your own, and only what you hold yourself.
//
// Editing a person: name, role, mobile, email, PRC licence and specialty, by
// the owner or an admin; an owner's row by an owner only. The rules that make
// it safe:
//   - One email and one mobile per staff account across the whole service,
//     checked here as the add form checks them (sign-in finds people by email,
//     resets find them by mobile).
//   - A new email or a new role bumps staff.token_version, so every session
//     that person has ends at once (canOpen compares it on every request; the
//     cookie carries the role the pages read). Editing your own email keeps you
//     signed in on this device only; nobody edits their own role.
//   - A new email or mobile voids any code already sent: it went somewhere
//     that is no longer theirs. An invitation is then sent again by hand.
//   - A new PRC number, or a new name on a dentist with a public profile (a
//     PRC check pairs the two), clears the check (prc_status pending,
//     prc_checked_on null): the public profile says "PRC check pending" again
//     and the dentist goes back to the top of Flossify's queue (/admin/prc/,
//     009). A number PRC's records did not match goes back too when the form is
//     saved, corrected or not: that is the owner's way to say "it is right".
//   - Nobody changes their own role, and an owner stays an owner: the Owner
//     role is never handed out here, and a posted role must be one the person
//     acting may give (src/lib/roles.ts), so nobody is made an owner from here. A dentist moved to a role without
//     patients loses the public profile (slug null); someone moved to dentist
//     gets one, with the check pending.
//   - Every changed field is one audit_log row (staff.name, staff.email,
//     staff.phone, staff.role, staff.prc, staff.specialty).
import type { AstroCookies } from 'astro';
import { setSession, hashPassword, passwordProblem, type Session } from '../../../../../lib/auth';
import { mayManage, mayGive, staffRoleFor, type Manager, type Role } from '../../../../../lib/roles';
import type { Perm } from '../../../../../lib/can';
import { pool, withClinic, type Tx } from '../../../../../lib/db';
import { issueCode } from '../../../../../lib/codes';
import { queueText, queueEmail, texts, emails, codePageFor, normalizePhone, prettyPhone, PH_MOBILE } from '../../../../../lib/messages';
import { emailEnabled, normalizeEmail, EMAIL_ADDRESS, EMAIL_MAX } from '../../../../../lib/email';
import { UUID, clinician } from './common';
import { normalizeUsername, usernameProblem } from '../../../../../lib/username';

// The seven Board-recognised fields, exactly as staff.specialty's check constraint spells them (migration 002).
export const SPECIALTIES = ['Endodontics', 'Oral & maxillofacial surgery', 'Orthodontics', 'Pediatric dentistry', 'Periodontics', 'Prosthodontics', 'Dental public health'];
const PRC = /^\d{4,10}$/;
export { EMAIL_MAX };
/** Codes go by text, and by email too when the service has an email channel (EMAIL_PROVIDER). */
export const emailOn = () => emailEnabled();

/** The same sentence wherever a mobile is checked across the service. */
const phoneTaken = (phone: string, notId: string | null) => pool.query(
  `select 1 from staff where ($2::uuid is null or id <> $2) and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1`, [phone.slice(-10), notId]);
const usernameTaken = (groupId: string, username: string, notId: string | null) => pool.query(
  'select 1 from staff where group_id = $1 and username = $2 and ($3::uuid is null or id <> $3)', [groupId, username, notId]);
const emailTaken = (email: string, notId: string | null) => pool.query(
  'select 1 from staff where email = $1 and ($2::uuid is null or id <> $2)', [email, notId]);

export interface Person {
  id: string; full_name: string; role: string; username: string; phone: string | null; email: string | null;
  role_id: string; role_name: string; role_rank: number; role_owner: boolean; role_perms: string[]; must_change_password: boolean; prc_licence: string | null; specialty: string | null;
  slug: string | null; practices: string[] | null; has_password: boolean; disabled_at: Date | null; can_view_finance: boolean;
  prc_status: 'pending' | 'checked' | 'mismatch'; prc_checked_on: Date | null; prc_note: string | null;
  last_seen_at: Date | null; invited_at: Date | null; password_set_at: Date | null; created_at: Date;
}
const PERSON = `select s.id, s.full_name, s.role, s.username::text as username, s.phone, s.email::text as email,
                       s.role_id, r.name as role_name, r.rank as role_rank, r.is_owner as role_owner, r.perms as role_perms, s.must_change_password, s.prc_licence, s.specialty, s.slug, s.practices,
                       s.password_hash is not null as has_password, s.disabled_at, a.can_view_finance, s.prc_status, s.prc_checked_on, s.prc_note,
                       s.last_seen_at, s.invited_at, s.password_set_at, s.created_at
                  from staff_access a join staff s on s.id = a.staff_id join clinic_role r on r.id = s.role_id`;

/** Everyone who can open this branch: the owner first, then by name, the disabled last. */
export async function listPeople(clinicId: string): Promise<(Person & { days: number[] })[]> {
  const people = (await pool.query(`${PERSON} where a.clinic_id = $1 order by s.disabled_at is not null, r.rank,
    case when s.role in ('owner', 'dentist', 'associate') then 0 else 1 end, s.full_name`, [clinicId])).rows as Person[];
  const schedule = await withClinic(clinicId, async (tx) => (await tx.query('select staff_id, dow from staff_schedule where clinic_id = $1', [clinicId])).rows as { staff_id: string; dow: number }[]);
  return people.map((p) => ({ ...p, days: schedule.filter((r) => r.staff_id === p.id).map((r) => r.dow) }));
}

/** One person, only if they have access to this branch. */
export async function member(clinicId: string, id: string): Promise<Person | undefined> {
  if (!UUID.test(id)) return undefined;
  return (await pool.query(`${PERSON} where a.clinic_id = $1 and s.id = $2`, [clinicId, id])).rows[0] as Person | undefined;
}

export const daysOf = (clinicId: string, staffId: string) =>
  withClinic(clinicId, async (tx) => (await tx.query('select dow from staff_schedule where staff_id = $1 and clinic_id = $2 order by dow', [staffId, clinicId])).rows.map((r) => r.dow as number));

// --- upcoming appointments -----------------------------------------------------------

export interface Upcoming {
  id: string; startsAt: Date; endsAt: Date; status: string; chair: number | null; unplaced: boolean;
  patientId: string; patientName: string; chartNo: string; service: string | null;
}
/** A dentist's coming visits at this branch, soonest first: not cancelled, not a no-show, not done. Read only. */
export async function upcomingFor(clinicId: string, staffId: string, limit = 30): Promise<{ rows: Upcoming[]; total: number }> {
  return withClinic(clinicId, async (tx) => {
    const where = `a.dentist_id = $1 and a.ends_at > now() and a.status not in ('cancelled', 'no_show', 'completed')`;
    const { rows } = await tx.query(
      `select a.id, a.starts_at, a.ends_at, a.status, a.chair, (a.source = 'request' and a.moved_at is null) as unplaced,
              p.id as patient_id, concat_ws(' ', p.first_name, nullif(p.last_name, '—')) as patient_name, p.chart_no,
              coalesce(pc.name, nullif(a.reason, '')) as service
         from appointment a
         join patient p on p.id = a.patient_id
         left join procedure_catalog pc on pc.id = a.catalog_id
        where ${where}
        order by a.starts_at, a.chair nulls last
        limit $2`, [staffId, limit]);
    const total = (await tx.query(`select count(*)::int as n from appointment a where ${where}`, [staffId])).rows[0].n as number;
    return {
      total,
      rows: rows.map((r) => ({
        id: r.id, startsAt: new Date(r.starts_at), endsAt: new Date(r.ends_at), status: r.status, chair: r.chair, unplaced: r.unplaced,
        patientId: r.patient_id, patientName: r.patient_name, chartNo: r.chart_no, service: r.service,
      })),
    };
  });
}

// --- codes -----------------------------------------------------------------------------

/** The branch as the acting person has it open (canOpen): which clinic, and their role there. */
type Acting = { id: string; name: string; group_id: string; slug: string } & Manager;
interface Ctx { clinic: Acting; session: Session; cookies: AstroCookies; site: URL | undefined }

/** One live role of this group by id, for handing out. */
async function roleById(groupId: string, id: string): Promise<Role | undefined> {
  if (!UUID.test(id)) return undefined;
  const { rows } = await pool.query(
    'select id, name, rank, perms, is_owner, base, 0 as holders from clinic_role where id = $1 and group_id = $2 and archived_at is null', [id, groupId]);
  return rows[0] as Role | undefined;
}

const audit = (ctx: Ctx, tx: Tx, action: string, staffId: string) =>
  tx.query(`insert into audit_log (clinic_id, staff_id, action, entity, entity_id) values ($1, $2, $3, 'staff', $4)`, [ctx.clinic.id, ctx.session.staffId, action, staffId]);

/** Queue a code by every channel this person can take: text when they have a mobile, email when email is on. Returns what was used. */
async function sendCode(ctx: Ctx, tx: Tx, t: { id: string; phone: string | null; email: string | null }, kind: 'invite' | 'reset', code: string): Promise<'both' | 'sms' | 'email'> {
  const texted = !!t.phone && PH_MOBILE.test(normalizePhone(t.phone));
  if (texted) {
    await queueText(tx, { clinicId: ctx.clinic.id, to: t.phone!, body: kind === 'invite' ? texts.invite(ctx.session.name, ctx.clinic.name, code) : texts.reset(code), kind, staffId: t.id });
  }
  let emailed = false;
  if (emailOn() && t.email && EMAIL_ADDRESS.test(normalizeEmail(t.email))) {
    const page = codePageFor(ctx.site);
    const mail = kind === 'invite' ? emails.invite(ctx.session.name, ctx.clinic.name, code, page, texted) : emails.reset(code, page);
    await queueEmail(tx, { clinicId: ctx.clinic.id, to: t.email!, subject: mail.subject, body: mail.body, kind, staffId: t.id });
    emailed = true;
  }
  return texted && emailed ? 'both' : emailed ? 'email' : 'sms';
}
/** Can a code reach them at all? sendCode() then queues at least one. */
export const reachable = (t: { phone: string | null; email: string | null }) =>
  PH_MOBILE.test(normalizePhone(t.phone ?? '')) || (emailOn() && EMAIL_ADDRESS.test(normalizeEmail(t.email ?? '')));

/** 'Dr. Ana Reyes-Cariño' → 'ana-reyes-carino', then -2, -3… until no staff row has it. */
function slugify(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^dra?\.?\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'dentist';
}
async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await pool.query('select 1 from staff where slug = $1', [slug])).rowCount) return slug;
  }
}

const dows = (form: FormData) => [...new Set(form.getAll('dow').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
const see = (location: string) => new Response(null, { status: 303, headers: { location } });

// --- + Add person (Clinic settings → People) -------------------------------------------------

export interface AddValues {
  name: string; username: string; roleId: string; treats: boolean; phone: string; email: string; prc: string; specialty: string; days: number[]; finance: boolean;
}
export const emptyPerson = (roleId = ''): AddValues => ({ name: '', username: '', roleId, treats: false, phone: '', email: '', prc: '', specialty: '', days: [1, 2, 3, 4, 5, 6], finance: false });
export interface AddRefused { error: string; add: AddValues }

export async function addPerson(ctx: Ctx & { base: string }, form: FormData): Promise<Response | AddRefused> {
  const isOwner = ctx.clinic.role_owner;
  const add = emptyPerson();
  add.name = String(form.get('name') ?? '').trim().replace(/\s+/g, ' ');
  add.username = normalizeUsername(String(form.get('username') ?? ''));
  add.roleId = String(form.get('role_id') ?? '');
  add.treats = form.get('treats') === 'on';
  add.phone = String(form.get('phone') ?? '').trim();
  add.email = normalizeEmail(String(form.get('email') ?? ''));
  add.prc = String(form.get('prc') ?? '').trim();
  add.specialty = String(form.get('specialty') ?? '');
  add.days = dows(form);
  add.finance = isOwner && form.get('finance') === 'on';
  // Never echoed back: a refused form asks for the password again.
  const password = String(form.get('password') ?? '');
  const phone = add.phone ? normalizePhone(add.phone) : '';
  const { clinic } = ctx;
  const role = await roleById(clinic.group_id, add.roleId);
  const dentist = add.treats;
  let error = '';
  if (add.name.length < 2 || add.name.length > 80) error = 'Give us their full name, as patients should see it.';
  else if (usernameProblem(add.username)) error = usernameProblem(add.username)!;
  else if ((await usernameTaken(clinic.group_id, add.username, null)).rowCount) error = `Someone at ${clinic.name} already signs in as “${add.username}”. Choose another username.`;
  else if (!role) error = 'Choose a role.';
  else if (!mayGive(clinic, role)) error = `You can’t give the role “${role.name}”: only roles below yours, with nothing you don’t have yourself.`;
  else if (password && passwordProblem(password)) error = passwordProblem(password)!;
  else if (!password && !phone) error = 'Set a first password for them, or give their mobile so we can text them an invitation code.';
  else if (phone && !PH_MOBILE.test(phone)) error = 'Use a Philippine mobile number, like 0917 000 0000.';
  else if (add.email && (!EMAIL_ADDRESS.test(add.email) || add.email.length > EMAIL_MAX)) error = 'That email doesn’t look complete. Leave it empty if they have none.';
  else if (dentist && !PRC.test(add.prc)) error = 'Someone who treats patients needs their PRC licence number: digits only, usually seven.';
  else if (dentist && add.specialty && !SPECIALTIES.includes(add.specialty)) error = 'Pick a specialty from the list, or leave it blank for a general dentist.';
  // Across the whole service, not just this group: sign-in finds a person by email and a reset
  // finds them by mobile, so each may belong to one staff account only (as /start/ checks).
  else if (add.email && (await emailTaken(add.email, null)).rowCount) error = 'That email is already on a Flossify staff account. Use another one for them, or leave it empty.';
  else if (phone && (await phoneTaken(phone, null)).rowCount) error = 'That mobile number is already on a Flossify staff account. Use another one for them.';
  if (error || !role) return { error: error || 'Choose a role.', add };

  // The staff row and its access are group data and commit first; a code references the row, so it
  // is minted after. Days, the text, the email and the audit line are clinic data and go in one
  // clinic transaction.
  const slug = dentist ? await uniqueSlug(add.name) : null;
  const specialty = dentist && add.specialty ? add.specialty : null;
  const staffRole = staffRoleFor(role, dentist);
  let created: { id: string };
  try {
    ({ rows: [created] } = await pool.query(
      `insert into staff (group_id, full_name, username, email, phone, prc_licence, role, role_id, specialty, slug, practices, home_clinic_id,
                          password_hash, password_set_at, must_change_password, invited_at, invited_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, case when $13::text is null then null else now() end, $13::text is not null,
               case when $13::text is null then now() end, $14) returning id`,
      [clinic.group_id, add.name, add.username, add.email || null, phone || null, dentist ? add.prc : null, staffRole, role.id, specialty, slug,
       dentist && !specialty ? ['General dentistry'] : [], clinic.id, password ? hashPassword(password) : null, ctx.session.staffId]));
  } catch (e) {
    const { code, constraint } = e as { code?: string; constraint?: string };
    if (code !== '23505') throw e;
    return { error: /username/.test(constraint ?? '') ? `Someone at ${clinic.name} already signs in as “${add.username}”. Choose another username.`
      : /email/.test(constraint ?? '') ? 'That email is already on a Flossify staff account. Use another one for them, or leave it empty.'
      : 'Someone saved a change to the team at the same moment. Check the details and add again.', add };
  }
  await pool.query(
    'insert into staff_access (staff_id, clinic_id, can_view_finance, can_edit_records, can_manage_staff) values ($1, $2, $3, true, $4)',
    [created.id, clinic.id, add.finance, role.perms.includes('people.manage' as Perm)]);
  const code = password ? null : await issueCode(created.id, 'invite');
  const via = await withClinic(clinic.id, async (tx) => {
    for (const d of add.days) await tx.query('insert into staff_schedule (staff_id, clinic_id, dow) values ($1, $2, $3)', [created.id, clinic.id, d]);
    if (!code) { await audit(ctx, tx, 'staff.add', created.id); return 'password'; }
    const used = await sendCode(ctx, tx, { id: created.id, phone: phone || null, email: add.email || null }, 'invite', code);
    await audit(ctx, tx, 'staff.invite', created.id);
    return used;
  });
  return see(`${ctx.base}?person=added&via=${via}&id=${created.id}#people`);
}

/** The sentence after + Add person. */
export function addedText(name: string, via: string, signIn?: { slug: string; username: string }): string {
  if (via === 'password') return `Added. ${name} signs in at flossify.ph/${signIn?.slug ?? ''}/sign-in as “${signIn?.username ?? ''}” with the password you set, and chooses their own the first time.`;
  const how = via === 'both' ? 'by text and email' : via === 'email' ? 'by email' : '';
  return how ? `Added. We sent ${name} a code ${how}. It works for 24 hours.` : `Added. We texted ${name} a code that works for 24 hours.`;
}

// --- one person (their page) -----------------------------------------------------------------

export interface EditValues { name: string; username: string; role: string; roleId: string; treats: boolean; phone: string; email: string; prc: string; specialty: string }
export interface ActionRefused { error: string; action: string; edit?: EditValues }

/** Everything the person page's forms do. `here` is the person's page. */
export async function personAction(ctx: Ctx & { here: string }, t: Person, form: FormData): Promise<Response | ActionRefused> {
  const { session, clinic } = ctx;
  const isOwner = clinic.role_owner;
  const action = String(form.get('action') ?? '');
  const here = ctx.here;
  const fail = (error: string, edit?: EditValues): ActionRefused => ({ error, action, edit });
  const self = t.id === session.staffId;
  // Only people whose role is below yours (an owner: anyone but another owner's role). src/lib/roles.ts.
  const manages = mayManage(clinic, t, self);
  const BELOW = t.role_owner ? 'Only an owner can do that for an owner.' : `Only someone whose role is above ${t.role_name} can do that.`;
  if (['invite', 'reset', 'password', 'disable', 'enable', 'finance'].includes(action) && !manages && !(self && action === 'finance')) {
    return fail(self && action === 'disable' ? 'You can’t disable your own account. Ask another owner.' : self ? 'Ask the owner to do that for you.' : BELOW);
  }
  if (action === 'password') {
    if (t.disabled_at) return fail(`${t.full_name} is disabled. Enable them first.`);
    const pw = String(form.get('password') ?? '');
    const problem = passwordProblem(pw);
    if (problem) return fail(problem);
    // Everything they are signed in on ends (the version), any code sent to them stops working, and
    // they choose their own password the next time they sign in.
    await pool.query(
      `update staff set password_hash = $2, token_version = token_version + 1, password_set_at = now(), must_change_password = true where id = $1`,
      [t.id, hashPassword(pw)]);
    await pool.query('update one_time_code set used_at = now() where staff_id = $1 and used_at is null', [t.id]);
    await withClinic(clinic.id, (tx) => audit(ctx, tx, 'staff.password', t.id));
    return see(`${here}?done=password`);
  }

  if (action === 'invite') {
    if (t.disabled_at) return fail(`${t.full_name} is disabled. Enable them first.`);
    if (t.has_password) return fail(`${t.full_name} already has a password. ${emailOn() ? 'Send' : 'Text'} a reset code instead.`);
    if (!reachable(t)) return fail(`${t.full_name} has no mobile number on file, so there is nowhere to send the code. Add one under Edit details.`);
    const code = await issueCode(t.id, 'invite');
    await pool.query('update staff set invited_at = now(), invited_by = $2 where id = $1', [t.id, session.staffId]);
    const via = await withClinic(clinic.id, async (tx) => {
      const used = await sendCode(ctx, tx, t, 'invite', code);
      await audit(ctx, tx, 'staff.invite', t.id);
      return used;
    });
    return see(`${here}?done=invite&via=${via}`);
  }
  if (action === 'reset') {
    if (t.disabled_at) return fail(`${t.full_name} is disabled. Enable them first.`);
    if (!t.has_password) return fail(`${t.full_name} hasn’t set a password yet. Resend the invitation instead.`);
    if (!reachable(t)) return fail(`${t.full_name} has no mobile number on file, so there is nowhere to send the code. Add one under Edit details.`);
    const code = await issueCode(t.id, 'reset');
    const via = await withClinic(clinic.id, async (tx) => {
      const used = await sendCode(ctx, tx, t, 'reset', code);
      await audit(ctx, tx, 'staff.reset', t.id);
      return used;
    });
    return see(`${here}?done=reset&via=${via}`);
  }
  if (action === 'edit') {
    if (t.role_owner && !isOwner) return fail('Only an owner can change an owner’s details.');
    const me = self;
    if (!me && !manages) return fail(BELOW);
    // An owner stays an owner, and nobody changes their own role: the posted role is ignored for both,
    // and so is "treats patients" (the professional side goes with the role).
    const roleLocked = t.role_owner || me;
    const roleId = roleLocked ? t.role_id : String(form.get('role_id') ?? '');
    const role = roleLocked ? null : await roleById(clinic.group_id, roleId);
    const treatsNow = roleLocked ? clinician(t.role) : form.get('treats') === 'on';
    const edit: EditValues = {
      name: String(form.get('name') ?? '').trim().replace(/\s+/g, ' '),
      username: form.has('username') ? normalizeUsername(String(form.get('username'))) : t.username,
      roleId,
      treats: treatsNow,
      role: t.role_owner ? 'owner' : roleLocked ? t.role : role ? staffRoleFor(role, treatsNow) : t.role,
      phone: String(form.get('phone') ?? '').trim(),
      email: normalizeEmail(String(form.get('email') ?? '')),
      prc: String(form.get('prc') ?? '').replace(/\s+/g, ''),
      specialty: String(form.get('specialty') ?? ''),
    };
    const phone = edit.phone ? normalizePhone(edit.phone) : '';
    // A public profile after the change: dentists always; an owner keeps theirs if they have one.
    const profile = edit.role === 'owner' ? !!t.slug : clinician(edit.role);
    let error = '';
    if (edit.name.length < 2 || edit.name.length > 80) error = 'Give their full name, as patients should see it.';
    else if (edit.username !== t.username && usernameProblem(edit.username)) error = usernameProblem(edit.username)!;
    else if (edit.username !== t.username && (await usernameTaken(clinic.group_id, edit.username, t.id)).rowCount) error = `Someone at ${clinic.name} already signs in as “${edit.username}”. Choose another username.`;
    // The Owner role is never handed out here, and a role must be one this person may give (below their
    // own, nothing they do not hold) — unless it is the one they already have.
    else if (!roleLocked && !role) error = 'Choose a role.';
    else if (!roleLocked && role && role.id !== t.role_id && !mayGive(clinic, role)) error = `You can’t give the role “${role.name}”: only roles below yours, with nothing you don’t have yourself.`;
    else if (!phone && t.phone) error = 'Keep a mobile number on file: invitation and reset codes go there by text.';
    else if (phone && !PH_MOBILE.test(phone)) error = 'Use a Philippine mobile number, like 0917 000 0000.';
    else if (edit.email && (!EMAIL_ADDRESS.test(edit.email) || edit.email.length > EMAIL_MAX)) error = 'That email doesn’t look complete. Leave it empty if they have none.';
    else if (clinician(edit.role) && !PRC.test(edit.prc)) error = 'Someone who treats patients needs their PRC licence number: digits only, usually seven.';
    else if (profile && edit.prc && !PRC.test(edit.prc)) error = 'A PRC licence number is digits only, usually seven.';
    else if (profile && edit.specialty && !SPECIALTIES.includes(edit.specialty)) error = 'Pick a specialty from the list, or leave it blank for a general dentist.';
    else if (edit.email && edit.email !== normalizeEmail(t.email ?? '') && (await emailTaken(edit.email, t.id)).rowCount) error = 'That email is already on another Flossify staff account. Use another one for them.';
    else if (phone && normalizePhone(t.phone ?? '') !== phone && (await phoneTaken(phone, t.id)).rowCount) error = 'That mobile number is already on another Flossify staff account. Codes go to one person only.';
    if (error) return fail(error, edit);

    // What the row becomes. Someone who is no longer a dentist keeps no licence, specialty or profile.
    const next = {
      name: edit.name,
      username: edit.username,
      role: edit.role,
      roleId: edit.roleId,
      phone: phone || null,
      email: edit.email || null,
      prc: profile ? (edit.prc || null) : edit.role === 'owner' ? t.prc_licence : null,
      specialty: profile ? (edit.specialty || null) : edit.role === 'owner' ? t.specialty : null,
      slug: profile ? (t.slug ?? await uniqueSlug(edit.name)) : edit.role === 'owner' ? t.slug : null,
    };
    const practices = profile && !next.specialty && !(t.practices?.length) ? ['General dentistry'] : (t.practices ?? []);
    const changed = {
      name: next.name !== t.full_name,
      username: next.username !== t.username,
      email: (next.email ?? '') !== normalizeEmail(t.email ?? ''),
      phone: (next.phone ?? '') !== normalizePhone(t.phone ?? ''),
      role: next.role !== t.role || next.roleId !== t.role_id,
      prc: (next.prc ?? '') !== (t.prc_licence ?? ''),
      specialty: (next.specialty ?? '') !== (t.specialty ?? ''),
    };
    // A PRC check pairs the licence number with the licensee's name, so a public profile goes back
    // for a check when either changes: the old "checked" date must not stand under a name nobody
    // checked. A number PRC's records did not match goes back too when the clinic saves the form,
    // corrected or as it is (the mismatch text tells the owner to look here).
    const checkable = !!next.slug && !!next.prc;
    const mismatchKept = checkable && t.prc_status === 'mismatch' && !changed.prc && !changed.name;
    const prcReset = changed.prc || (checkable && changed.name) || mismatchKept;
    if (!Object.values(changed).some(Boolean) && !mismatchKept) return see(`${here}?done=same`);
    // For Flossify's PRC queue: why this dentist is waiting again.
    const prcNote = !checkable ? null : [
      changed.prc && (t.prc_licence ? `The clinic changed the number (was ${t.prc_licence}).` : 'The clinic added the number.'),
      changed.name && `The clinic changed the name (was ${t.full_name}).`,
      mismatchKept && 'The clinic says the number on file is right. Check it again.',
    ].filter(Boolean).join(' ') || null;
    // A new email, or a new professional side (staff.role, which the cookie carries), ends every session
    // they have. A new role alone does not: what they may do is read from it on every request (canOpen).
    const signOut = changed.email || next.role !== t.role;
    let tv: number;
    try {
      const { rows } = await pool.query(
        `update staff set full_name = $2, email = $3, phone = $4, role = $5, prc_licence = $6, specialty = $7, slug = $8, practices = $9,
                token_version = token_version + case when $10::boolean then 1 else 0 end,
                prc_status     = case when $11::boolean then 'pending' else prc_status end,
                prc_checked_on = case when $11::boolean then null else prc_checked_on end,
                prc_checked_by = case when $11::boolean then null else prc_checked_by end,
                prc_note       = case when $11::boolean then $12 else prc_note end,
                username = $13, role_id = $14
          where id = $1
          returning token_version`,
        // The mobile is written only when it changed, so a number on file as '0917 555 2003' is left as it was.
        [t.id, next.name, next.email, changed.phone ? next.phone : t.phone, next.role, next.prc, next.specialty, next.slug, practices, signOut, prcReset, prcNote, next.username, next.roleId]);
      tv = rows[0].token_version;
    } catch (e) {
      // Two edits at once can both pass the checks above; the database's own unique keys have the last word.
      const { code, constraint } = e as { code?: string; constraint?: string };
      if (code !== '23505') throw e;
      return fail(/email/.test(constraint ?? '')
        ? 'That email is already on another Flossify staff account. Use another one for them.'
        : /username/.test(constraint ?? '')
        ? `Someone at ${clinic.name} already signs in as “${next.username}”. Choose another username.`
        : 'Someone saved a change to the team at the same moment. Check the details and save again.', edit);
    }
    if (changed.role) await pool.query('update staff_access set can_manage_staff = $3 where staff_id = $1 and clinic_id = $2', [t.id, clinic.id, t.role_owner || !!role?.perms.includes('people.manage' as Perm)]);
    // A code already sent to the old mobile or email stops working: it went somewhere that is no longer theirs.
    if (changed.email || changed.phone) await pool.query('update one_time_code set used_at = now() where staff_id = $1 and used_at is null', [t.id]);
    await withClinic(clinic.id, async (tx) => {
      // And a code still waiting in the queue would arrive dead: it does not go.
      if (changed.email || changed.phone) {
        await tx.query(`update message_log set status = 'cancelled' where staff_id = $1 and direction = 'out' and status = 'queued' and kind in ('invite', 'reset')`, [t.id]);
      }
      for (const [field, did] of Object.entries(changed)) if (did) await audit(ctx, tx, `staff.${field}`, t.id);
      // Nothing typed changed, but the number went back for a check: that is a PRC change too.
      if (mismatchKept) await audit(ctx, tx, 'staff.prc', t.id);
    });
    // Your own new email ends your other sessions; this one carries on with the new version and name.
    if (me && (changed.email || changed.name)) {
      // Whole hours: the cookie's maxAge must be a whole number of seconds. What is left, rounded down.
      const hours = Math.max(1, Math.floor((session.exp - Date.now()) / 3_600_000));
      setSession(ctx.cookies, { staffId: session.staffId, groupId: session.groupId, clinicId: session.clinicId, name: next.name, role: session.role, tv: tv! }, hours);
    }
    const flags = [
      changed.email && 'email=1',
      // Signed out for the new role; only worth saying to someone who has a password to sign in with.
      next.role !== t.role && !changed.email && t.has_password && !t.disabled_at && 'role=1',
      prcReset && checkable && `prc=${changed.prc ? 'number' : changed.name ? 'name' : 'again'}`,
      !t.slug && next.slug && 'profile=on',
      t.slug && !next.slug && 'profile=off',
      (changed.email || changed.phone) && !t.has_password && !t.disabled_at && 'resend=1',
    ].filter(Boolean).join('&');
    return see(`${here}?done=edit${flags ? `&${flags}` : ''}`);
  }
  if (action === 'disable') {
    // disabled_at is checked on every workspace request, so they are out at once, at every branch.
    await pool.query('update staff set disabled_at = coalesce(disabled_at, now()) where id = $1', [t.id]);
    await withClinic(clinic.id, (tx) => audit(ctx, tx, 'staff.disable', t.id));
    return see(`${here}?done=disable`);
  }
  if (action === 'enable') {
    await pool.query('update staff set disabled_at = null where id = $1', [t.id]);
    await withClinic(clinic.id, (tx) => audit(ctx, tx, 'staff.enable', t.id));
    return see(`${here}?done=enable`);
  }
  if (action === 'schedule') {
    if (!self && !manages) return fail(BELOW);
    const days = dows(form);
    await withClinic(clinic.id, async (tx) => {
      await tx.query('delete from staff_schedule where staff_id = $1 and clinic_id = $2', [t.id, clinic.id]);
      for (const d of days) await tx.query('insert into staff_schedule (staff_id, clinic_id, dow) values ($1, $2, $3)', [t.id, clinic.id, d]);
      await audit(ctx, tx, 'staff.schedule', t.id);
    });
    return see(`${here}?done=schedule#days`);
  }
  if (action === 'finance') {
    if (!isOwner) return fail('Only an owner can change who sees finance.');
    if (t.id === session.staffId) return fail('You always see finance here.');
    await pool.query('update staff_access set can_view_finance = $3 where staff_id = $1 and clinic_id = $2', [t.id, clinic.id, form.get('sees') === '1']);
    await withClinic(clinic.id, (tx) => audit(ctx, tx, 'staff.finance', t.id));
    return see(`${here}?done=finance#finance`);
  }
  return fail('Choose what to do.');
}

/** The sentence after an action on a person's page, from its ?done= and flags. */
export function personNotice(q: URLSearchParams, p: Person, myId: string): string {
  const who = p.full_name;
  const via = q.get('via') ?? 'sms';
  const how = via === 'both' ? 'by text and email' : via === 'email' ? 'by email' : '';
  const editWords = [
    `Saved ${who}’s details.`,
    q.get('email') === '1' && q.get('resend') !== '1' && (p.id === myId ? 'Your other devices are signed out; sign in there with the new email.' : `${who} is signed out everywhere and signs in with the new email.`),
    q.get('profile') === 'off' && 'Their public profile is down: only dentists have one.',
    q.get('role') === '1' && `${who} is signed out everywhere and signs in again as ${p.role_name}.`,
    q.get('profile') === 'on' && 'They have a public profile now, marked “PRC check pending” until Flossify checks the number.',
    q.get('profile') !== 'on' && ({
      number: 'The new PRC number goes back for a check; their profile says “PRC check pending” until then.',
      name: 'A PRC licence is checked against the name, so the new name goes back for a check; their profile says “PRC check pending” until then.',
      again: 'The number goes back to Flossify for another check; their profile says “PRC check pending” until then.',
    } as Record<string, string>)[q.get('prc') ?? ''],
    q.get('resend') === '1' && 'The code we sent before no longer works: resend the invitation.',
  ].filter(Boolean).join(' ');
  const NOTICES: Record<string, string> = {
    invite: how ? `We sent ${who} a new code ${how}. It works for 24 hours.` : `We texted ${who} a new code. It works for 24 hours.`,
    reset: how ? `We sent ${who} a reset code ${how}. It works for 15 minutes.` : `We texted ${who} a reset code. It works for 15 minutes.`,
    edit: editWords,
    same: `Nothing changed in ${who}’s details.`,
    disable: `${who} can no longer sign in.`,
    enable: `${who} can sign in again.`,
    schedule: `Saved ${who}’s days.`,
    password: `Saved. Tell ${who} the new password: they choose their own when they next sign in, and every device they were signed in on is signed out.`,
    finance: `Saved what ${who} can see.`,
  };
  return NOTICES[q.get('done') ?? ''] ?? '';
}

/** Where their sign-in stands, in words and a chip tone. */
export const accountState = (p: Pick<Person, 'disabled_at' | 'has_password'>) =>
  p.disabled_at ? { label: 'Disabled', tone: 'muted' as const }
  : !p.has_password ? { label: 'Invited', tone: 'warn' as const }
  : { label: 'Active', tone: 'accent' as const };

export { prettyPhone };
