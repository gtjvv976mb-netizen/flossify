// Flossify's own operations account (a platform admin, for /admin/): create
// it, or give it a new password. Safe to run again.
//
//   npm run admin:create -- ops@flossify.ph "Your Name"    create it, or reset its password
//   npm run admin:create -- ops@flossify.ph                reset only (keeps the name)
//
// At a terminal it asks for the password twice and shows nothing as you type.
// With no terminal (a pipe, a CI job) it reads ADMIN_PASSWORD instead. At
// least 12 characters. The password is never printed or logged, and never
// goes on the command line, where the shell's history would keep it.
//
// Same email again: the same account gets the new password, its token version
// goes up (every earlier sign-in of that account stops working at once, as
// with a reset by text), its sign-in lock is cleared, and the name is updated
// when one is given. That is also the answer to a forgotten operations
// password: this account has no mobile, so /auth/forgot/ cannot reach it.
//
// No mobile is stored. Sign-in and reset pick the earliest staff account for
// an email or a mobile across the whole service, so an operations account
// holding the owner's mobile would take it from their clinic account (Forgot
// password would find this account, which has no clinic to text from). A
// mobile left on an existing operations account is removed on reset. For the
// same reason a new account's email must not belong to any clinic's staff:
// the script refuses one that does, rather than turn a clinic account into an
// admin. A reset follows sign-in instead: it goes through when this account is
// the one the email opens (the oldest that is not switched off), and names any
// clinic account that shares the email; it refuses when sign-in would open a
// clinic's account. (Settings → Team checks emails within one group only, so a
// clinic can add this email to its staff later.)
//
// A new account goes into Flossify's own group, which has no clinic: the group
// of an existing operations account, else a new "Flossify" group.
//
// Environment (npm run reads .env when present; the real environment wins):
//   DATABASE_ADMIN_URL  the admin connection, as for db:migrate. Without it:
//   DB                  the local database (default flossify_dev), reached as
//                       the current OS user. The PG* variables still apply.
//   DATABASE_SSL=1      TLS, certificate not verified; same rules as
//                       scripts/db/migrate.ts (an sslmode on the URL wins, and
//                       a pasted sslmode=require is read the libpq way).
//   ADMIN_PASSWORD      read only when stdin is not a terminal.
//   NODE_ENV=production requires DATABASE_ADMIN_URL.
//
// Imports nothing from src/: it runs under plain node --experimental-strip-types,
// and src/lib/auth.ts needs Astro. The hash below is the one auth.ts writes
// and reads (scrypt, 16-byte salt, 64-byte key, "salt:hash" in hex); keep the two
// the same.

import pg from 'pg';
import { scryptSync, randomBytes } from 'node:crypto';

const env = process.env;
const PROD = env.NODE_ENV === 'production';
const ADMIN_URL = env.DATABASE_ADMIN_URL?.trim() || '';
const DB = env.DB?.trim() || 'flossify_dev';
const MIN = 12;
const MAX = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GROUP_NAME = 'Flossify';
const GROUP_SLUG = 'flossify';
const USAGE = 'npm run admin:create -- <email> "<Your Name>"';

function refuse(line: string, hint?: string, code = 1): never {
  console.error(`admin:create: ${line}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(code);
}

// --- Arguments ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`${USAGE}   create the operations account, or give it a new password`);
  console.log('npm run admin:create -- <email>                 new password for an existing one, name kept');
  console.log('Asks for the password at a terminal; otherwise reads ADMIN_PASSWORD (12+ characters).');
  console.log('Connects with DATABASE_ADMIN_URL (else the local DB, default flossify_dev); DATABASE_SSL=1 for TLS.');
  process.exit(0);
}
const unknown = args.find((a) => a.startsWith('-'));
if (unknown) refuse(`unknown option ${unknown}.`, `Use: ${USAGE}`, 2);
const emails = args.filter((a) => a.includes('@'));
const names = args.filter((a) => !a.includes('@'));
if (emails.length !== 1 || names.length > 1) refuse('give one email, and a name in quotes.', `Use: ${USAGE}`, 2);
const email = emails[0].trim().toLowerCase();
const name = names[0]?.trim().replace(/\s+/g, ' ') || '';
if (!EMAIL.test(email)) refuse(`"${email}" does not look like an email address.`, undefined, 2);
if (names.length && !name) refuse('the name is empty.', `Use: ${USAGE}`, 2);
if (name.length > 120) refuse('the name is longer than 120 characters.', undefined, 2);

// --- Settings that need no connection ----------------------------------------------------------

const ssl = env.DATABASE_SSL?.trim() ?? '';
if (ssl !== '' && ssl !== '0' && ssl !== '1') refuse(`DATABASE_SSL must be 1 (TLS) or unset, not "${ssl}".`);
if (PROD && !ADMIN_URL) refuse('NODE_ENV=production but DATABASE_ADMIN_URL is not set.', 'On the server this writes through the admin connection, never a local default database.');

// --- Connecting (the conventions of scripts/db/migrate.ts) ------------------------------------------

/** An sslmode of prefer, require or verify-ca read the libpq way, not as this driver's verify-full. */
function adminUrl(): string {
  const mode = /[?&]sslmode=([^&#]*)/i.exec(ADMIN_URL)?.[1]?.toLowerCase();
  if (!mode || !['prefer', 'require', 'verify-ca'].includes(mode) || /[?&]uselibpqcompat=/i.test(ADMIN_URL)) return ADMIN_URL;
  return `${ADMIN_URL}&uselibpqcompat=true`;
}

async function connect(): Promise<pg.Client> {
  const c = new pg.Client(ADMIN_URL
    ? { connectionString: adminUrl(), ssl: ssl === '1' ? { rejectUnauthorized: false } : undefined, application_name: 'flossify admin:create' }
    : { database: DB, application_name: 'flossify admin:create' });
  c.on('error', () => {});
  try {
    await c.connect();
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const hint = /certificate|self[- ]signed|unable to (get|verify)/i.test(msg)
      ? 'Remove sslmode from DATABASE_ADMIN_URL and set DATABASE_SSL=1 (encrypted, not verified).'
      : /does not support SSL/i.test(msg)
        ? 'The server does not accept TLS: unset DATABASE_SSL, and remove any sslmode from DATABASE_ADMIN_URL.'
        : /no encryption|SSL.*(required|off)/i.test(msg)
          ? 'The server accepts only TLS: set DATABASE_SSL=1.'
          : ADMIN_URL ? 'Check DATABASE_ADMIN_URL (and DATABASE_SSL=1 if the provider requires TLS).' : `Is Postgres running, and does the database "${DB}" exist?`;
    refuse(`cannot connect: ${msg}`, hint);
  }
  return c;
}

// --- What this email is now -------------------------------------------------------------------------

interface Existing { id: string; full_name: string; phone: string | null }
type Plan = { kind: 'create' } | { kind: 'reset'; staff: Existing; notes: string[] };
interface Row { id: string; full_name: string; phone: string | null; disabled_at: Date | null; group_name: string; admin: boolean; first_live: boolean; before_admin: boolean | null }

const who = (r: Row) => `${r.full_name} at ${r.group_name}`;

/** Create or reset, or refuse. Run once before the password is asked for, and again inside the write.
 *  Decided the way sign-in decides (authenticate() in src/lib/auth.ts): of the accounts with this email
 *  that are not switched off, the oldest is the one the password opens. Settings → Team checks an email
 *  only inside its own group, so a clinic can add this email to its staff after this account exists. */
async function plan(c: pg.Client): Promise<Plan> {
  const ready = (await c.query("select to_regclass('public.platform_admin') is not null as ok")).rows[0].ok as boolean;
  if (!ready) refuse(`${c.database} has no platform_admin table. Nothing changed.`, 'Run npm run db:migrate first.');
  // Ages are compared here, in microseconds; a JavaScript Date keeps only milliseconds.
  const rows = (await c.query(
    `select s.id, s.full_name, s.phone, s.disabled_at, g.name as group_name, a.staff_id is not null as admin,
            s.disabled_at is null and s.created_at = min(s.created_at) filter (where s.disabled_at is null) over () as first_live,
            s.created_at < min(s.created_at) filter (where a.staff_id is not null) over () as before_admin
       from staff s join clinic_group g on g.id = s.group_id left join platform_admin a on a.staff_id = s.id
      where s.email = $1 order by s.created_at`, [email])).rows as Row[];
  if (!rows.length) {
    if (!name) refuse(`there is no operations account for ${email} yet, so it needs a name. Nothing changed.`, `Use: ${USAGE}`, 2);
    return { kind: 'create' };
  }
  const admins = rows.filter((r) => r.admin);
  const staff = rows.filter((r) => !r.admin);
  if (!admins.length) {
    // A new account would be the newest with this email, so sign-in would never reach it.
    const on = staff.find((r) => !r.disabled_at);
    refuse(`${email} is already the sign-in of a clinic's staff account (${who(on ?? staff[0])}). Nothing changed.`,
      on ? 'Sign-in with it opens that account, not /admin/. Use an email no clinic account uses.'
        : 'That account is switched off, but if the clinic switches it back on, sign-in opens it, not /admin/. Use an email no clinic account uses.');
  }
  if (admins.length > 1) refuse(`${email} is on ${admins.length} operations accounts; sign-in only ever opens the oldest. Nothing changed.`, 'A developer should remove the extra ones first.');
  const s = admins[0];
  if (!rows.some((r) => !r.disabled_at)) {
    refuse(`the operations account ${email} is switched off (since ${new Date(s.disabled_at!).toISOString().slice(0, 10)}). Nothing changed.`,
      `To switch it back on, a developer runs: update staff set disabled_at = null where id = '${s.id}';`);
  }
  // The oldest live account opens; on a tie in created_at sign-in may open either, so any tie with a clinic account refuses.
  const first = rows.filter((r) => r.first_live);
  const opens = first.find((r) => !r.admin);
  if (opens) {
    refuse(`sign-in with ${email} ${first.length > 1 ? 'may open' : 'opens'} a clinic's staff account (${who(opens)}), not /admin/, so a new password here would not help. Nothing changed.`,
      s.disabled_at ? 'The operations account with this email is switched off. A developer must sort out the two accounts.'
        : 'That clinic can switch the account off on Settings → Team; otherwise a developer must change one of the two emails.');
  }
  const notes: string[] = [];
  const shadowed = staff.filter((r) => !r.disabled_at);
  if (shadowed.length) {
    const many = shadowed.length > 1;
    notes.push(`Note: ${shadowed.map(who).join('; ')} also ${many ? 'have' : 'has'} this email, on a clinic staff account. Sign-in opens this operations account, so ${many ? 'they' : 'that person'} cannot sign in with it until a developer changes the email on ${many ? 'their accounts' : 'theirs'}.`);
  }
  const waiting = staff.filter((r) => r.disabled_at && r.before_admin);
  if (waiting.length) {
    notes.push(`Note: ${waiting.map(who).join('; ')} is an older, switched-off clinic staff account with this email. If the clinic switches it back on, sign-in opens it, not /admin/.`);
  }
  return { kind: 'reset', staff: { id: s.id, full_name: s.full_name, phone: s.phone }, notes };
}

// --- The password -------------------------------------------------------------------------------------

class Cancelled extends Error {}

/** One line from the terminal, not echoed. Enter ends it; Ctrl-C cancels. */
function askHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (err?: Error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stderr.write('\n');
      if (err) reject(err); else resolve(value);
    };
    const onData = (chunk: string) => {
      if (chunk.startsWith('\u001b')) return; // arrow keys and other escape sequences
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new Cancelled()); // Ctrl-C
        if (ch === '\u0004') { if (!value) return finish(new Cancelled()); continue; } // Ctrl-D on an empty line
        if (ch === '\u007f' || ch === '\b') { value = [...value].slice(0, -1).join(''); continue; }
        if (ch === '\u0015') { value = ''; continue; } // Ctrl-U
        if (ch < ' ') continue;
        value += ch;
      }
    };
    // Echo off before the prompt appears: a password pasted the instant it shows must not be echoed.
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.on('data', onData);
    input.resume();
    process.stderr.write(prompt);
  });
}

function problem(pw: string): string | null {
  if (pw.length < MIN) return `The password is shorter than ${MIN} characters. A short sentence you will remember works well.`;
  if (pw.length > MAX) return `The password is longer than ${MAX} characters.`;
  if (/^(.)\1+$/.test(pw)) return 'The password is one character repeated. Use a short sentence instead.';
  if (pw.toLowerCase() === email) return 'The password is the email address.';
  return null;
}

async function password(): Promise<string> {
  if (process.stdin.isTTY) {
    if (env.ADMIN_PASSWORD !== undefined) console.error('admin:create: ADMIN_PASSWORD is ignored at a terminal; type the password instead.');
    try {
      const first = await askHidden(`New password for ${email} (${MIN}+ characters, not shown): `);
      const p = problem(first);
      if (p) refuse(`${p} Nothing changed.`);
      const again = await askHidden('Type it again: ');
      if (again !== first) refuse('the two passwords differ. Nothing changed.');
      return first;
    } catch (e) {
      if (e instanceof Cancelled) refuse('cancelled. Nothing changed.', undefined, 130);
      throw e;
    }
  }
  const pw = env.ADMIN_PASSWORD;
  delete env.ADMIN_PASSWORD;
  if (pw === undefined || pw === '') {
    // Never suggest ADMIN_PASSWORD='…' on a command line: the shell's history would keep it.
    refuse('there is no terminal to type a password into, and ADMIN_PASSWORD is not set. Nothing changed.',
      'Run it at a terminal (with docker run, add -it). Or type the password where the shell\'s\n' +
      '  history does not keep it (bash or zsh): read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD\n' +
      '  then run this command again, then: unset ADMIN_PASSWORD');
  }
  const p = problem(pw);
  if (p) refuse(`ADMIN_PASSWORD: ${p} Nothing changed.`);
  return pw;
}

/** The format src/lib/auth.ts hashPassword() writes and verifyPassword() reads. */
function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

// --- The run -----------------------------------------------------------------------------------------------

// Check first, so a wrong URL or a clinic's email is said before anyone types a password.
{
  const c = await connect();
  try { await plan(c); } finally { await c.end().catch(() => {}); }
}

const hash = hashPassword(await password());

const c = await connect();
try {
  await c.query('begin');
  // Two runs at once take turns; the second then sees the first one's account.
  await c.query("select pg_advisory_xact_lock(hashtext('flossify:admin:create'))");
  const p = await plan(c);
  const how = 'npm run admin:create';
  if (p.kind === 'create') {
    // Flossify's group: no clinic, and nobody in it but operations accounts.
    let group = (await c.query(
      `select g.id from clinic_group g
        where not exists (select 1 from clinic k where k.group_id = g.id)
          and not exists (select 1 from staff s left join platform_admin a on a.staff_id = s.id where s.group_id = g.id and a.staff_id is null)
          and (g.slug = $1 or exists (select 1 from staff s join platform_admin a on a.staff_id = s.id where s.group_id = g.id))
        order by exists (select 1 from staff s where s.group_id = g.id) desc, g.created_at limit 1`, [GROUP_SLUG])).rows[0]?.id as string | undefined;
    if (!group) {
      let slug = GROUP_SLUG;
      for (let n = 2; (await c.query('select 1 from clinic_group where slug = $1', [slug])).rowCount; n++) slug = `${GROUP_SLUG}-ops-${n}`;
      group = (await c.query('insert into clinic_group (name, slug) values ($1, $2) returning id', [GROUP_NAME, slug])).rows[0].id as string;
    }
    const id = (await c.query(
      `insert into staff (group_id, full_name, email, phone, role, password_hash, password_set_at)
       values ($1, $2, $3, null, 'admin', $4, now()) returning id`, [group, name, email, hash])).rows[0].id as string;
    await c.query('insert into platform_admin (staff_id) values ($1)', [id]);
    await c.query(`insert into auth_event (kind, email, staff_id, user_agent) values ('admin.create', $1, $2, $3)`, [email, id, how]);
    await c.query('commit');
    console.log(`Operations account created for ${name} (${email}). Sign in at /auth/login/ with the password you chose.`);
  } else {
    const s = p.staff;
    await c.query(
      `update staff set password_hash = $2, token_version = token_version + 1, password_set_at = now(),
              phone = null, full_name = coalesce($3, full_name)
        where id = $1`, [s.id, hash, name || null]);
    // The sign-in lock for this email (src/lib/throttle.ts, key login:e:<email>), so it opens now, not in 15 minutes.
    await c.query('delete from throttle where key = $1', [`login:e:${email}`]);
    await c.query(`insert into auth_event (kind, email, staff_id, user_agent) values ('admin.reset', $1, $2, $3)`, [email, s.id, how]);
    await c.query('commit');
    const renamed = name && name !== s.full_name ? `, now named ${name}` : '';
    const phone = s.phone ? ' Its mobile number was removed (operations accounts keep none).' : '';
    console.log(`New password set for ${email}${renamed}; every earlier sign-in of it is signed out.${phone}`);
    for (const n of p.notes) console.log(n);
  }
} catch (e) {
  await c.query('rollback').catch(() => {});
  // The message only: a row's detail could carry the new hash.
  const err = e as pg.DatabaseError;
  refuse(`${err.message ?? String(e)}. Nothing changed.`, err.hint);
} finally {
  await c.end().catch(() => {});
}
