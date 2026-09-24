// The database's one migration runner, for production and development alike.
// It applies what has not been applied and never drops anything.
//
//   npm run db:migrate                          # local: DB (default flossify_dev) as the current user
//   NODE_ENV=production DATABASE_ADMIN_URL=postgres://… APP_DB_PASSWORD=… npm run db:migrate
//   npm run db:migrate -- --baseline            # a database built by the old setup.sh (see below)
//   npm run db:migrate -- --baseline=016_schedule.sql
//   npm run db:migrate -- --renamed=<old name>:<new name>
//   npm run db:migrate -- --allow-late
//
// What it does, in order:
//   1. Takes an advisory lock, so two deploys running it at once take turns.
//   2. Checks, before writing anything, that the files on disk and the names in
//      schema_migrations agree, and that the admin role can do what the run
//      needs (see "The admin role" below). Any doubt stops the run unchanged.
//   3. On an empty database, applies src/data/schema.sql and records it as
//      'schema.sql' in schema_migrations(name, applied_at).
//   4. Applies every src/data/migrations/*.sql not yet recorded, in filename
//      order, each in its own transaction on a fresh connection (as psql -1
//      did), and records it inside that same transaction: a file is either
//      applied and recorded, or neither.
//   5. Sets flossify_app's password from APP_DB_PASSWORD, if given. The
//      password goes over the wire only as a SCRAM verifier, so it never
//      appears in the server's statement log either.
//   6. Re-asserts the default privileges that let flossify_app use tables and
//      sequences later migrations create (002 and 005 set them for the role
//      that ran them; after a restore onto another server that is someone else).
//   7. Checks that every security-definer function is owned by a role that
//      bypasses row-level security (below).
//
// Names are the only record. A pending file is one whose name is not in
// schema_migrations, so the runner refuses, before touching anything:
//   - a recorded name with no file on disk. Renaming an applied file would
//     otherwise run it again under its new name, and most of these files run
//     twice without an error while putting back older functions and data.
//     Say what happened: --renamed=<old>:<new> moves the record, runs nothing.
//   - a pending file that sorts before the newest applied one. Usually a branch
//     merged late; then --allow-late applies it. Check first that it is not an
//     applied file under another name.
//   Never rename an applied migration or edit schema.sql for a change: every
//   schema change is a new src/data/migrations/NNN_*.sql.
//
// A database built before this file existed (by the old setup.sh loop) has
// every table but no schema_migrations. Migrate refuses to touch it until you
// say what it already has: `--baseline` records every current file as applied
// without running any; `--baseline=<file>` records up to and including that
// file, for a database built from an older checkout, and the next plain run
// applies the rest. Name the newest file the database REALLY has: naming an
// older one makes the next run apply newer files a second time, and the
// runner cannot tell (most of them re-run without an error).
//
// Environment (read from .env when present; the real environment wins):
//   DATABASE_ADMIN_URL  the owner/admin connection. Never the app's DATABASE_URL:
//                       flossify_app cannot create tables, and must not.
//   DB                  without DATABASE_ADMIN_URL: the local database (default
//                       flossify_dev), reached as the current OS user. The PG*
//                       variables (PGHOST, PGPORT, …) still apply.
//   DATABASE_SSL=1      TLS to a managed Postgres. Encrypted, certificate NOT
//                       verified (rejectUnauthorized: false): most managed
//                       providers sign with their own CA, which Node does not
//                       trust, so verification would refuse every connection.
//                       To verify, leave DATABASE_SSL unset and put
//                       ?sslmode=verify-full&sslrootcert=/path/to/provider-ca.pem
//                       on the URL instead; an sslmode on the URL always wins.
//                       A pasted provider URL ending in sslmode=require works
//                       as it does in psql and pg_dump (encrypted, not
//                       verified): this runner reads the URL's sslmode the
//                       libpq way. (The app's DATABASE_URL does not: see
//                       src/lib/db.ts.)
//   APP_DB_PASSWORD     flossify_app's password. Letters, digits and . _ ~ -
//                       only, because it goes into DATABASE_URL unescaped.
//                       Generate one: openssl rand -hex 24
//   NODE_ENV=production requires DATABASE_ADMIN_URL and an APP_DB_PASSWORD of
//                       16+ characters that is not the development password.
//                       The same password rule applies to any server that is
//                       not this machine (by the host the driver resolved), with
//                       or without NODE_ENV: flossify_app must never exist on a
//                       reachable server with the password in the repository.
//                       Through a tunnel on localhost, set NODE_ENV=production.
//
// The admin role (the user in DATABASE_ADMIN_URL) needs:
//   - superuser or BYPASSRLS. Every clinic table FORCEs row-level security,
//     which binds the table owner too. The public directory, sign-in's branch
//     lookup, sign-up, the text queue and the retention purge are
//     security-definer functions: they run as whoever ran this script. If that
//     role is neither, those functions see no clinic rows at all and fail
//     quietly (an empty directory, a sign-up that errors). So this script
//     refuses to apply migrations as such a role, and checks the owners again
//     at the end of every run. On a managed Postgres: ALTER ROLE … BYPASSRLS,
//     as the provider's superuser.
//   - CREATEROLE, to create flossify_app on a new server; or create flossify_app
//     yourself first (the provider's console: name flossify_app, LOGIN,
//     password APP_DB_PASSWORD) and the run leaves it be.
//   - to change flossify_app's password later: CREATEROLE and, on PostgreSQL 16
//     and later, ADMIN OPTION on flossify_app, which a role has only if it
//     created flossify_app (or was granted it). Without that, the run checks
//     that flossify_app already accepts APP_DB_PASSWORD, and stops before
//     applying anything if it does not.
//
// Roles are cluster-wide: setting flossify_app's password here changes it for
// every database on that server.
//
// Writing a migration: plain SQL, no psql meta-commands (\set, \i, …); this
// runs files through the driver, not psql. No BEGIN/COMMIT: the runner already
// wraps each file in one transaction, and a file that commits part-way would
// leave half of itself applied and unrecorded. Statements that cannot run
// inside a transaction (create index concurrently, vacuum, …) are refused
// unless the file's first line is `-- migrate: no-transaction` and the file
// holds that one statement. It then runs bare. If it fails part-way, create
// index concurrently leaves an INVALID index behind; the runner names it, and
// will not run or record a no-transaction file while any invalid index exists,
// so `if not exists` cannot quietly keep a broken index. Drop it
// (drop index concurrently <name>) and run again.

import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomBytes, pbkdf2Sync, createHmac, createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCHEMA = 'schema.sql';
const APP_ROLE = 'flossify_app';
const DEV_PASSWORD = 'flossify_dev';
/** How long one migration waits for a table the running app holds, before giving up rather than stalling the site. */
const LOCK_TIMEOUT = '20s';
const LOCK_KEY = "hashtext('flossify:db:migrate')";
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

const env = process.env;
const PROD = env.NODE_ENV === 'production';
const ADMIN_URL = env.DATABASE_ADMIN_URL?.trim() || '';
const DB = env.DB?.trim() || 'flossify_dev';
const PASSWORD = env.APP_DB_PASSWORD ?? '';

const say = (line = '') => console.log(line);
function refuse(lines: string[], code = 1): never {
  console.error(`db:migrate: ${lines[0]}`);
  for (const l of lines.slice(1)) console.error(`  ${l}`);
  process.exit(code);
}

// --- Arguments -----------------------------------------------------------------

let baseline: string | true | null = null;
let allowLate = false;
const renames: [string, string][] = [];
for (const a of process.argv.slice(2)) {
  if (a === '--baseline') baseline = true;
  else if (a.startsWith('--baseline=')) baseline = a.slice('--baseline='.length);
  else if (a === '--allow-late') allowLate = true;
  else if (a.startsWith('--renamed=')) {
    const [from, to, ...extra] = a.slice('--renamed='.length).split(':');
    if (!from || !to || extra.length) refuse([`${a}: write it as --renamed=<old name>:<new name>`], 2);
    renames.push([from, to]);
  } else if (a === '--help' || a === '-h') {
    say('npm run db:migrate                 apply every migration not yet recorded');
    say('npm run db:migrate -- --baseline   record every current file as applied, run none (old setup.sh databases)');
    say('npm run db:migrate -- --baseline=<file>');
    say('                                   record up to and including <file>, run none. Name the newest file the');
    say('                                   database really has: an older one makes the next run apply newer files');
    say('                                   again, and most of them re-run without an error.');
    say('npm run db:migrate -- --renamed=<old>:<new>');
    say('                                   an applied file was renamed: move its record, run nothing');
    say('npm run db:migrate -- --allow-late apply pending files that sort before the newest applied one');
    say('Reads DATABASE_ADMIN_URL (else local DB, default flossify_dev), DATABASE_SSL, APP_DB_PASSWORD, NODE_ENV.');
    process.exit(0);
  } else refuse([`unknown argument ${a}. Try --help.`], 2);
}
if (baseline !== null && (renames.length || allowLate)) refuse(['--baseline runs alone: it records files, it applies and renames nothing.'], 2);

// --- Refusals that need no connection ---------------------------------------------

/** Why APP_DB_PASSWORD will not do for a server other people can reach, or null. */
function passwordProblem(): string[] | null {
  const gen = 'Generate one with: openssl rand -hex 24   and use the same value in DATABASE_URL.';
  if (!PASSWORD) return ['APP_DB_PASSWORD is not set.', `flossify_app would otherwise be created with, or keep, the password "${DEV_PASSWORD}", which is in the repository.`, gen];
  if (PASSWORD === DEV_PASSWORD) return ['APP_DB_PASSWORD is the development password, which is in the repository.', gen];
  if (PASSWORD.length < 16) return ['APP_DB_PASSWORD is shorter than 16 characters.', gen];
  return null;
}

const ssl = env.DATABASE_SSL?.trim() ?? '';
if (ssl !== '' && ssl !== '0' && ssl !== '1') refuse([`DATABASE_SSL must be 1 (TLS) or unset, not "${ssl}".`]);
if (PASSWORD && !/^[A-Za-z0-9._~-]+$/.test(PASSWORD)) {
  refuse(['APP_DB_PASSWORD may hold only letters, digits and . _ ~ -', 'It goes into DATABASE_URL as it is, where other characters need escaping. Generate one with: openssl rand -hex 24']);
}
if (PROD && !ADMIN_URL) refuse(['NODE_ENV=production but DATABASE_ADMIN_URL is not set.', 'Production migrates through the admin connection, never a local default database.']);
if (PROD) {
  const p = passwordProblem();
  if (p) refuse([`NODE_ENV=production: ${p[0]}`, ...p.slice(1)]);
}

// --- The files ----------------------------------------------------------------------

interface Migration { name: string; path: string; sql: string; bare: boolean }

/**
 * The SQL with comments, string literals, quoted identifiers and dollar-quoted
 * bodies blanked out (same length, newlines kept, so an index still gives the
 * line). What is left is the statements' own keywords, which the checks below
 * read: a BEGIN inside a function body or 'commit' in a string is not one.
 */
function codeOnly(sql: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  const ident = /[A-Za-z0-9_$]/;
  const n = sql.length;
  let out = '';
  let i = 0;
  while (i < n) {
    const c = sql[i];
    let j = -1;
    if (c === '-' && sql[i + 1] === '-') {
      j = sql.indexOf('\n', i);
      if (j < 0) j = n;
    } else if (c === '/' && sql[i + 1] === '*') {
      let depth = 1;
      j = i + 2;
      while (j < n && depth) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; }
        else j++;
      }
    } else if (c === "'") {
      const esc = (sql[i - 1] === 'E' || sql[i - 1] === 'e') && !ident.test(sql[i - 2] ?? '');
      j = i + 1;
      while (j < n) {
        if (esc && sql[j] === '\\') j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") { j++; break; }
        else j++;
      }
    } else if (c === '"') {
      j = i + 1;
      while (j < n) {
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') { j++; break; }
        else j++;
      }
    } else if (c === '$' && !ident.test(sql[i - 1] ?? '')) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        j = end < 0 ? n : end + tag[0].length;
      }
    }
    if (j < 0) { out += c; i++; }
    else { j = Math.min(j, n); out += blank(sql.slice(i, j)); i = j; }
  }
  return out;
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

const NO_TX_MARK = /^--\s*migrate:\s*no-transaction\s*$/;
const NO_TX_STATEMENTS: [RegExp, string][] = [
  [/\b(create|drop)\s+index\s+concurrently\b/i, 'create/drop index concurrently'],
  [/\breindex\b[^;]*\bconcurrently\b/i, 'reindex concurrently'],
  [/\bdetach\s+partition\b[^;]*\bconcurrently\b/i, 'detach partition concurrently'],
  [/(^|;)\s*vacuum\b/i, 'vacuum'],
  [/\b(create|drop)\s+database\b/i, 'create/drop database'],
  [/\b(create|drop)\s+tablespace\b/i, 'create/drop tablespace'],
  [/\balter\s+system\b/i, 'alter system'],
];
/** A statement that opens or closes a transaction. (Savepoints are fine inside the runner's.) */
const TX_CONTROL = /(^|;)(\s*)(begin|start\s+transaction|commit|end|rollback(?!\s+to\b)|abort|prepare\s+transaction)\b/gi;

function load(name: string, path: string): Migration {
  const sql = readFileSync(path, 'utf8');
  const code = codeOnly(sql);
  const lines = code.split('\n');
  const meta = lines.findIndex((l) => /^\s*\\[A-Za-z!?]/.test(l));
  if (meta >= 0) {
    refuse([`${name} line ${meta + 1} is a psql meta-command (${sql.split('\n')[meta].trim().slice(0, 40)}).`, 'Migrations run through the database driver, not psql: write plain SQL.']);
  }
  // `begin atomic … end` is a SQL-standard function body, whose `end` follows a `;`.
  const atomic = /\bbegin\s+atomic\b/i.test(code);
  for (const m of code.matchAll(TX_CONTROL)) {
    const word = m[3].toLowerCase().replace(/\s+/g, ' ');
    if (word === 'end' && atomic) continue;
    refuse([
      `${name} line ${lineAt(code, m.index + m[1].length + m[2].length)} has its own ${word.toUpperCase()}.`,
      'db:migrate already runs each file in one transaction and records it there. A file that',
      'commits part-way leaves half of itself applied and unrecorded. Remove its BEGIN/COMMIT lines.',
    ]);
  }
  const bare = NO_TX_MARK.test(sql.split('\n')[0]?.trim() ?? '');
  if (bare) {
    const statements = code.split(';').filter((s) => s.trim()).length;
    if (statements !== 1) refuse([`${name} is marked no-transaction but holds ${statements} statements.`, 'A no-transaction file holds exactly one statement; put the others in their own files.']);
  } else {
    for (const [re, what] of NO_TX_STATEMENTS) {
      if (re.test(code)) {
        refuse([
          `${name} uses ${what}, which cannot run inside a transaction.`,
          'Move that one statement to its own file whose first line is  -- migrate: no-transaction',
        ]);
      }
    }
  }
  return { name, path, sql, bare };
}

const dir = join(ROOT, 'src/data/migrations');
const files: Migration[] = [
  load(SCHEMA, join(ROOT, 'src/data', SCHEMA)),
  ...readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => load(f, join(dir, f))),
];
const known = new Set(files.map((f) => f.name));

// --- Connecting -----------------------------------------------------------------------

/**
 * The admin URL as given, except that an sslmode of prefer, require or
 * verify-ca is read the libpq way (as psql and pg_dump read it), not as this
 * driver's alias for verify-full. A provider's pasted URL then behaves the
 * same here as in db:backup.
 */
function adminUrl(): string {
  const mode = /[?&]sslmode=([^&#]*)/i.exec(ADMIN_URL)?.[1]?.toLowerCase();
  if (!mode || !['prefer', 'require', 'verify-ca'].includes(mode) || /[?&]uselibpqcompat=/i.test(ADMIN_URL)) return ADMIN_URL;
  return `${ADMIN_URL}&uselibpqcompat=true`;
}

function config(): pg.ClientConfig {
  if (ADMIN_URL) return { connectionString: adminUrl(), ssl: ssl === '1' ? { rejectUnauthorized: false } : undefined, application_name: 'flossify db:migrate' };
  return { database: DB, application_name: 'flossify db:migrate' };
}

async function connect(): Promise<pg.Client> {
  const c = new pg.Client(config());
  await c.connect();
  return c;
}

/** Where the driver actually went: the host it resolved from the URL or PGHOST. */
const isLocal = (host: string) => !host || host.startsWith('/') || LOCAL_HOSTS.includes(host);
function where(c: pg.Client): string {
  const host = String(c.host ?? '');
  return host.startsWith('/') ? `local socket ${host}` : `${host}:${c.port}`;
}

function connectHelp(e: unknown): string[] {
  const msg = (e as Error).message ?? String(e);
  const out = [`cannot connect: ${msg}`];
  if (/certificate|self[- ]signed|unable to (get|verify)/i.test(msg)) {
    out.push("The server's TLS certificate could not be verified. Either give the provider's CA on the URL",
      '(sslmode=verify-full&sslrootcert=/path/to/ca.pem), or remove sslmode from the URL and set DATABASE_SSL=1',
      '(encrypted, not verified).');
  } else if (/no encryption|SSL.*(required|off)|does not support SSL/i.test(msg)) {
    out.push(ssl === '1' ? 'The server does not accept TLS: unset DATABASE_SSL.' : 'The server accepts only TLS connections: set DATABASE_SSL=1.');
  } else if (ADMIN_URL && (/invalid url/i.test(msg) || /ENOTFOUND base\b/.test(msg))) {
    out.push(...adminUrlShape(ADMIN_URL));
  } else {
    out.push(ADMIN_URL ? 'Check DATABASE_ADMIN_URL (and DATABASE_SSL=1 if the provider requires TLS).' : `Is Postgres running, and does the database "${DB}" exist?`);
  }
  return out;
}

/**
 * What is wrong with a DATABASE_ADMIN_URL that is not an address, described
 * without printing any of it: it holds the admin password. The usual cause is
 * a value pasted into the wrong field (a password, a key, the app's URL).
 */
function adminUrlShape(v: string): string[] {
  const facts: string[] = [];
  const scheme = /^postgres(ql)?:\/\//i.test(v);
  if (!scheme) facts.push('it does not start with postgresql://');
  if (!v.includes('@')) facts.push('it has no @ (no user and host)');
  if (/\s/.test(v)) facts.push('it contains spaces or line breaks');
  if (/^[0-9a-f]{32,}$/i.test(v)) facts.push('it looks like a generated password, not an address');
  if (/^postgres(ql)?:\/\/flossify_app:/i.test(v)) facts.push("it is the app's own DATABASE_URL, not the admin's");
  if (scheme && v.includes('@')) {
    const rest = v.replace(/^postgres(ql)?:\/\//i, '');
    const at = rest.lastIndexOf('@');
    const userinfo = rest.slice(0, at), hostpart = rest.slice(at + 1);
    const bad = [...new Set([...userinfo].filter((ch) => '/#?'.includes(ch)))];
    if (bad.length) facts.push(`the password in it contains ${bad.join(' ')}, which must be written as ${bad.map((ch) => encodeURIComponent(ch)).join(' ')}`);
    const port = hostpart.split('/')[0].split(':')[1];
    if (port !== undefined && !/^\d+$/.test(port)) facts.push('the port is not a number');
    if (!/\/flossify(\?|$)/.test(hostpart)) facts.push('it does not end in /flossify (the database name)');
  }
  return [
    `DATABASE_ADMIN_URL is not a usable database address (${v.length} characters${facts.length ? '; ' + facts.join('; ') : ''}).`,
    "It should be DigitalOcean's doadmin connection string for the flossify database, without ?sslmode=require:",
    '  postgresql://doadmin:<password>@<host>:25060/flossify',
  ];
}

// --- SCRAM ------------------------------------------------------------------------------

/** What Postgres stores for a password under scram-sha-256, computed here so the password itself never reaches the server. */
function scramVerifier(password: string): string {
  const salt = randomBytes(16), iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const hmac = (key: Buffer, text: string) => createHmac('sha256', key).update(text).digest();
  const storedKey = createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  const serverKey = hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

// --- Errors -------------------------------------------------------------------------------

function explain(e: unknown, m?: Migration): string[] {
  const err = e as pg.DatabaseError;
  const out = [err.message ?? String(e)];
  if (m && err.position) out[0] += ` (${m.name} line ${lineAt(m.sql, Number(err.position) - 1)})`;
  if (err.detail) out.push(err.detail);
  if (err.hint) out.push(`hint: ${err.hint}`);
  if (err.where) out.push(`in: ${err.where.split('\n')[0]}`);
  if (err.code === '55P03') out.push(`A table stayed locked for ${LOCK_TIMEOUT} (the app or the worker was using it).${m?.bare ? '' : ' Run db:migrate again.'}`);
  return out;
}

const RLS_HELP = (role: string) => [
  `Every clinic table forces row-level security, and the security-definer functions run as their owner.`,
  `Owned by a role without BYPASSRLS, they see no clinic rows: the public directory is empty and sign-up fails.`,
  `Fix, as a superuser (on a managed Postgres, the provider's admin): ALTER ROLE ${role} BYPASSRLS;`,
];

const MIGRATIONS_TABLE = 'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())';

async function invalidIndexes(c: pg.Client): Promise<string[]> {
  return (await c.query(`select format('%I.%I', n.nspname, x.relname) as name
    from pg_index i join pg_class x on x.oid = i.indexrelid join pg_namespace n on n.oid = x.relnamespace
    where not i.indisvalid order by 1`)).rows.map((r) => r.name as string);
}

/** Whether flossify_app accepts APP_DB_PASSWORD on the server and database the admin reached: true, or the server's refusal. */
async function appLogin(main: pg.Client): Promise<true | string> {
  const c = new pg.Client({ host: main.host, port: main.port, database: main.database, user: APP_ROLE, password: PASSWORD,
    ssl: (main as unknown as { ssl: pg.ClientConfig['ssl'] }).ssl || undefined, application_name: 'flossify db:migrate (password check)' });
  c.on('error', () => {});
  try {
    await c.connect();
    await c.query('select 1');
    return true;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await c.end().catch(() => {});
  }
}

// --- The run ----------------------------------------------------------------------------------

const main = await connect().catch((e) => refuse(connectHelp(e)));
main.on('error', () => {});
let failed = false;
try {
  const who = (await main.query(`select current_user as u, r.rolsuper as su, r.rolbypassrls as br, r.rolcreaterole as cr
    from pg_roles r where r.rolname = current_user`)).rows[0] as { u: string; su: boolean; br: boolean; cr: boolean };
  say(`db:migrate → ${main.database} on ${where(main)} as ${who.u}${main.ssl ? ', TLS' : ''}`);

  // Another machine is a server someone can reach: the production password rule
  // holds there whatever NODE_ENV says.
  if (!PROD && !isLocal(String(main.host ?? ''))) {
    const p = passwordProblem();
    if (p) refuse([`${main.host} is not localhost, 127.0.0.1, ::1 or a local socket, so the production password rule applies: ${p[0]}`, ...p.slice(1)]);
  }

  if (!(await main.query(`select pg_try_advisory_lock(${LOCK_KEY}) as ok`)).rows[0].ok) {
    say('  another db:migrate is running here; waiting for it to finish…');
    await main.query(`select pg_advisory_lock(${LOCK_KEY})`);
  }

  const state = (await main.query(`select
      to_regclass('public.schema_migrations') is not null as tracked,
      to_regclass('public.clinic') is not null as has_schema,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'schema_migrations') as tables`)).rows[0] as { tracked: boolean; has_schema: boolean; tables: number };

  const recorded = new Set<string>(state.tracked
    ? (await main.query('select name from schema_migrations')).rows.map((r) => r.name as string)
    : []);

  // --- Decide, writing nothing ------------------------------------------------------------
  let take: Migration[] = [];
  let pending: Migration[] = [];
  if (baseline !== null) {
    if (state.tracked) refuse([`this database already records its migrations (${recorded.size} rows in schema_migrations).`, '--baseline is only for a database built before db:migrate existed. Run db:migrate without it.']);
    if (!state.tables) refuse(['this database is empty: there is nothing to baseline.', 'Run db:migrate without --baseline to build it.']);
    if (!state.has_schema) refuse(['this database has tables but no clinic table: it does not look like a Flossify database.', 'Check DATABASE_ADMIN_URL / DB.']);
    let upto = files.length;
    if (baseline !== true) {
      upto = files.findIndex((f) => f.name === baseline) + 1;
      if (!upto) refuse([`--baseline=${baseline} names no file. Use one of: ${files.map((f) => f.name).join(', ')}`], 2);
    }
    take = files.slice(0, upto);
  } else {
    if (!state.tracked && state.tables > 0) {
      refuse([
        'this database already has tables but no schema_migrations table: it was built by the old scripts/db/setup.sh.',
        'Nothing was changed. Tell db:migrate what it already has:',
        `  every file up to ${files[files.length - 1].name}:   npm run db:migrate -- --baseline`,
        '  built from an older checkout:   npm run db:migrate -- --baseline=<the newest migration it REALLY has>',
        '  (naming an older file makes the next run apply newer ones a second time)',
        'then run npm run db:migrate again.',
      ]);
    }
    for (const [from, to] of renames) {
      if (!recorded.has(from)) refuse([`--renamed: ${from} is not recorded in schema_migrations; nothing to move.`], 2);
      if (known.has(from)) refuse([`--renamed: ${from} is still on disk; only a file that no longer exists can be renamed.`], 2);
      if (!known.has(to)) refuse([`--renamed: ${to} is not a file in src/data/migrations.`], 2);
      if (recorded.has(to)) refuse([`--renamed: ${to} is already recorded.`], 2);
      recorded.delete(from);
      recorded.add(to);
    }
    const gone = [...recorded].filter((n) => !known.has(n)).sort();
    if (gone.length) {
      const guess = files.filter((f) => !recorded.has(f.name) && f.name !== SCHEMA);
      refuse([
        `recorded as applied but not on disk: ${gone.join(', ')}.`,
        'Nothing was changed. A renamed file would otherwise run a second time under its new name.',
        ...(gone.length === 1 && guess.length
          ? [`If it was renamed:   npm run db:migrate -- --renamed=${gone[0]}:<its new name>   (not yet recorded: ${guess.map((f) => f.name).join(', ')})`]
          : ['If one was renamed:   npm run db:migrate -- --renamed=<old name>:<new name>']),
        'If it was deleted from the repository instead, put it back: its changes are in this database.',
      ]);
    }
    if (recorded.size && !recorded.has(SCHEMA)) {
      refuse([`schema_migrations has ${recorded.size} rows but not ${SCHEMA}: it was edited by hand.`, `Nothing was changed. Put the row back: insert into schema_migrations (name) values ('${SCHEMA}');`]);
    }
    pending = files.filter((f) => !recorded.has(f.name));
    const newest = [...recorded].filter((n) => n !== SCHEMA).sort().pop() ?? '';
    const late = pending.filter((f) => f.name !== SCHEMA && f.name < newest);
    if (late.length && !allowLate) {
      refuse([
        `not applied, yet older than ${newest}, which is: ${late.map((f) => f.name).join(', ')}.`,
        'Nothing was changed. Usually a branch merged late; then run:   npm run db:migrate -- --allow-late',
        'Check first that it is not an applied file under a new name (then use --renamed=<old>:<new>):',
        'most migrations run a second time without an error and put back older functions and data.',
      ]);
    }
    if (pending.length && !who.su && !who.br) refuse([`${who.u} is neither a superuser nor BYPASSRLS, so the migrations cannot run as it.`, ...RLS_HELP(who.u)]);
    if (pending.some((f) => f.bare)) {
      const bad = await invalidIndexes(main);
      if (bad.length) refuse([`invalid indexes exist: ${bad.join(', ')}.`, 'A no-transaction migration is pending, and it would not be recorded while one exists (a failed', 'create index concurrently leaves one, and "if not exists" would then skip it). Drop each first:', ...bad.map((b) => `  drop index concurrently ${b};`)]);
    }
  }

  // --- The admin role and flossify_app, still writing nothing ----------------------------------
  const appExists = !!(await main.query('select 1 from pg_roles where rolname = $1', [APP_ROLE])).rowCount;
  const willCreate = !appExists && pending.some((f) => f.name.startsWith('002_'));
  if (willCreate && !who.su && !who.cr) {
    refuse([
      `${APP_ROLE} does not exist on this server, and ${who.u} may not create roles (no CREATEROLE). Nothing was changed.`,
      `Either create ${APP_ROLE} in the provider's console (LOGIN, password = APP_DB_PASSWORD) and run again,`,
      `or, as the provider's superuser:   ALTER ROLE ${who.u} CREATEROLE;`,
    ]);
  }
  /** False when the admin may not change flossify_app's password, and it already accepts APP_DB_PASSWORD. */
  let setPassword = !!PASSWORD;
  if (PASSWORD && appExists) {
    let allowed = true;
    await main.query('begin');
    try {
      await main.query(`alter role ${APP_ROLE} password '${scramVerifier(PASSWORD)}'`);
    } catch (e) {
      if ((e as pg.DatabaseError).code !== '42501') throw e;
      allowed = false;
    } finally {
      await main.query('rollback');
    }
    if (!allowed) {
      const login = await appLogin(main);
      if (login !== true) {
        refuse([
          `${who.u} may not change ${APP_ROLE}'s password, and ${APP_ROLE} does not accept APP_DB_PASSWORD (${login}). Nothing was changed.`,
          `Changing another role's password needs CREATEROLE and, on PostgreSQL 16 and later, ADMIN OPTION on that role,`,
          `which ${who.u} has only if it created ${APP_ROLE}. Either set ${APP_ROLE}'s password to APP_DB_PASSWORD in the`,
          `provider's console, or, as the role that created ${APP_ROLE}:   GRANT ${APP_ROLE} TO ${who.u} WITH ADMIN OPTION;`,
        ]);
      }
      setPassword = false;
    }
  }

  // --- Write ------------------------------------------------------------------------------------
  if (baseline !== null) {
    await main.query('begin');
    await main.query(MIGRATIONS_TABLE);
    await main.query('insert into schema_migrations (name) select unnest($1::text[])', [take.map((f) => f.name)]);
    await main.query('commit');
    say(`  recorded ${take.length} files as already applied, ran none (${take[0].name} … ${take[take.length - 1].name}).`);
    const rest = files.slice(take.length);
    if (rest.length) {
      say(`  Not recorded, so the next plain run applies them: ${rest.map((f) => f.name).join(', ')}.`);
      say('  If the database already has any of those, stop: they would run a second time. Otherwise: npm run db:migrate');
    } else say('  Next runs of db:migrate apply only files added after today.');
  } else {
    if (renames.length) {
      await main.query('begin');
      for (const [from, to] of renames) await main.query('update schema_migrations set name = $2 where name = $1', [from, to]);
      await main.query('commit');
      for (const [from, to] of renames) say(`  renamed  ${from} → ${to} (record only, nothing ran)`);
    }

    // flossify_app is created by 002 with the development password. When this run
    // is about to create it, create it first with the real one, so the known
    // password never exists on a production server, not even for a second.
    if (willCreate && PASSWORD) await main.query(`create role ${APP_ROLE} login password '${scramVerifier(PASSWORD)}'`);

    const newest = [...recorded].filter((n) => n !== SCHEMA).sort().pop() ?? '';
    for (const m of pending) {
      const started = Date.now();
      const c = await connect();
      c.on('error', () => {});
      try {
        await c.query(`set lock_timeout = '${LOCK_TIMEOUT}'`);
        if (m.bare) {
          await c.query(m.sql);
          const bad = await invalidIndexes(c);
          if (bad.length) throw new Error(`it left an invalid index: ${bad.join(', ')}`);
          await c.query(MIGRATIONS_TABLE);
          await c.query('insert into schema_migrations (name) values ($1)', [m.name]);
        } else {
          await c.query('begin');
          await c.query(MIGRATIONS_TABLE);
          await c.query(m.sql);
          await c.query('insert into schema_migrations (name) values ($1)', [m.name]);
          await c.query('commit');
        }
        const late = m.name !== SCHEMA && m.name < newest ? '  (older name than applied ones: merged late)' : '';
        say(`  applied  ${m.name.padEnd(36)} ${String(Date.now() - started).padStart(5)} ms${late}`);
      } catch (e) {
        await c.query('rollback').catch(() => {});
        failed = true;
        const [first, ...rest] = explain(e, m);
        console.error(`  FAILED   ${m.name}: ${first}`);
        for (const l of rest) console.error(`           ${l}`);
        if (m.bare) {
          const bad = await invalidIndexes(main).catch(() => [] as string[]);
          console.error('           It ran outside a transaction, and was not recorded.');
          if (bad.length) {
            console.error(`           It left ${bad.length === 1 ? 'an invalid index, which enforces' : 'invalid indexes, which enforce'} nothing. Drop it, then run db:migrate again:`);
            for (const b of bad) console.error(`             drop index concurrently ${b};`);
          } else console.error('           Nothing invalid was left behind. Fix the cause, then run db:migrate again.');
        } else {
          console.error(`           Nothing from this file was kept; files above it stay applied.${(e as pg.DatabaseError).code === '55P03' ? '' : ' Fix it and run db:migrate again.'}`);
        }
        break;
      } finally {
        await c.end().catch(() => {});
      }
    }
    if (!pending.length) say(`  nothing to apply: all ${files.length} files recorded, the database is current.`);
    else if (!failed) say(`  done: ${pending.length} applied, ${files.length} recorded in all.`);
  }

  // --- After: the app's password, its reach, and the owners ------------------------------------
  const appRole = !!(await main.query('select 1 from pg_roles where rolname = $1', [APP_ROLE])).rowCount;
  const tracked = (await main.query("select to_regclass('public.schema_migrations') is not null as t")).rows[0].t as boolean;
  const done = new Set<string>(tracked ? (await main.query('select name from schema_migrations')).rows.map((r) => r.name as string) : []);
  const has = (prefix: string) => [...done].some((n) => n.startsWith(prefix));
  if (PASSWORD && appRole && setPassword) {
    await main.query(`alter role ${APP_ROLE} password '${scramVerifier(PASSWORD)}'`);
    say(`  ${APP_ROLE} password set from APP_DB_PASSWORD (server-wide: every database on this server).`);
  } else if (PASSWORD && appRole) {
    say(`  ${APP_ROLE} already accepts APP_DB_PASSWORD; ${who.u} may not change it, so it was left as it is.`);
  } else if (!appRole && has('002_')) {
    failed = true;
    console.error(`db:migrate: ${APP_ROLE} does not exist on this server, though 002 (which creates it and grants it the tables) is recorded.`);
    console.error(`  The app cannot sign in. A database restored onto a new server needs ${APP_ROLE} created before the restore:`);
    console.error('  see RESTORE in scripts/db/backup.sh, then restore again.');
  } else if (PASSWORD && !appRole) {
    say(`  ${APP_ROLE} does not exist yet; its password will be set once 002 has run.`);
  }
  if (appRole) {
    // 002 and 005 grant the app whatever tables and sequences later files create,
    // but only for the role that ran them. After a restore (--no-owner) the new
    // admin creates the tables, so say it again, as this role. No-ops when present.
    if (has('002_')) await main.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${APP_ROLE}`);
    if (has('005_')) await main.query(`alter default privileges in schema public grant usage, select on sequences to ${APP_ROLE}`);
    // 002 grants the app every table in the schema, this one included. It needs none of it.
    if (tracked) await main.query(`revoke all on schema_migrations from ${APP_ROLE}`);
  }
  const blind = (await main.query(`select r.rolname as owner, count(*)::int as n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
    where n.nspname = 'public' and p.prosecdef and not (r.rolsuper or r.rolbypassrls)
    group by r.rolname`)).rows as { owner: string; n: number }[];
  for (const b of blind) {
    failed = true;
    console.error(`db:migrate: ${b.n} security-definer functions are owned by ${b.owner}, which cannot see through row-level security.`);
    for (const l of RLS_HELP(b.owner)) console.error(`  ${l}`);
  }
} catch (e) {
  failed = true;
  const [first, ...rest] = explain(e);
  console.error(`db:migrate: ${first}`);
  for (const l of rest) console.error(`  ${l}`);
} finally {
  await main.end().catch(() => {});
}
process.exit(failed ? 1 : 0);
