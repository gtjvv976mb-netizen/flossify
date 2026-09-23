// Configuration, checked before the server serves anything that needs it.
//
// On a production server a missing or unsafe setting stops every page that
// the server renders, with one error that lists every problem at once, each
// with what to do about it. No secret is ever printed, only its name. On the
// owner's machine (astro dev, astro preview) the same checks only warn, in
// one line.
//
// What counts as production. Never the astro CLI: `astro preview` and
// `astro build` set NODE_ENV=production themselves (ensureProcessNodeEnv in
// astro/dist/core/util.js), and the owner's preview runs that way on the Mac,
// against the development database. Otherwise NODE_ENV=production, and also
// the built server (`npm start`: node ./dist/server/entry.mjs, whose argv[1]
// is the server entry) unless NODE_ENV says development or test. The built
// server is only ever a production artifact, so it fails closed: a host that
// forgets NODE_ENV, or spells it "prod", gets the checks, not a server that
// accepts the dev password and lists the demo logins. The SMS worker has no
// such tell (it runs the same way on the Mac), so it needs NODE_ENV=production.
//
// Everything here reads process.env, while the server runs. Never
// import.meta.env: Astro writes the value of import.meta.env.X into dist/ at
// build time, from whatever the build machine had in .env or its shell. A
// build made on the Mac carried the Mac's DATABASE_URL and SESSION_SECRET in
// dist/server/chunks (measured). Checking that would check the build machine.
//
// When it runs. The node adapter loads src/middleware.ts on the first request,
// not when the process starts, so the check runs on the first request that
// reaches the server: the platform's health check, if it points at /healthz,
// which is what makes a bad configuration fail the deploy. The middleware
// calls assertEnv() before any page or endpoint runs, and answers a refusal
// itself (503, security headers, a line that says the log has the list).
// src/lib/db.ts calls it again before every new database connection, for
// anything that reaches the database some other way; it does not call it
// when it is imported, because Astro loads a page's modules before the
// middleware runs, and a module that throws on import leaves that page a bare
// 500 forever. The answer is kept, so the work happens once. Prerendered
// pages are built, not served, and are never checked.
//
// No imports and only erasable TypeScript, on purpose: the SMS worker and a
// start-up script can import this file under plain Node
// (node --experimental-strip-types), outside Astro.

type Env = Record<string, string | undefined>;

/** Which process is asking. The worker needs the database and the texts; the web server needs everything. */
export type Scope = 'web' | 'worker';

interface Problem {
  /** The variable it is about. Messages name it and never quote a secret. */
  key: string;
  text: string;
  /** Not set at all. Not worth a warning on the owner's machine, where development runs on defaults. */
  missing?: boolean;
}

export interface EnvReport {
  problems: Problem[];
  /** Worth saying, not worth refusing over. */
  warnings: string[];
}

/** The password setup.sh gives flossify_app on every local database. It is written in this repository. */
const DEV_DB_PASSWORD = 'flossify_dev';
/** .env.example's placeholders all start this way. */
const PLACEHOLDER = /^change[-_ ]?me/i;
const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]']);

const read = (env: Env, key: string): string => (env[key] ?? '').trim();

/** Run by `astro preview`, `astro build` or `astro dev`: node_modules/.bin/astro or astro/astro.js. */
function underAstroCli(argv: readonly string[]): boolean {
  return /(^|[\\/])astro(\.m?js)?$/.test(argv[1] ?? '');
}

/** Run as the built server: node dist/server/entry.mjs (what npm start runs). */
function builtServer(argv: readonly string[]): boolean {
  return /(^|[\\/])dist[\\/]server[\\/]entry\.mjs$/.test(argv[1] ?? '');
}

/** Why a process counts as production, or null when it does not (see the top of this file). */
function productionReason(env: Env, argv: readonly string[]): string | null {
  if (underAstroCli(argv)) return null;
  const mode = read(env, 'NODE_ENV');
  if (mode === 'production') return 'NODE_ENV=production';
  if (builtServer(argv) && !/^(development|test)$/i.test(mode)) {
    // Quoted only when it looks like a mode name: the log never carries a pasted secret.
    const said = !mode ? 'not set' : /^[\w.-]{1,24}$/.test(mode) ? `"${mode}"` : 'set to something else';
    return `this is the built server (npm start) and NODE_ENV is ${said}`;
  }
  return null;
}

/** A production server: NODE_ENV=production, or the built server unless NODE_ENV says development; never the astro CLI. */
export function isProduction(env: Env = process.env, argv: readonly string[] = process.argv): boolean {
  return productionReason(env, argv) !== null;
}

function distinctChars(s: string): number {
  return new Set(s).size;
}

function checkSecret(p: Problem[], env: Env, key: string, min: number, make: string, what: string) {
  const v = read(env, key);
  if (!v) p.push({ key, missing: true, text: `${key} is not set. ${what} Make one: ${make}` });
  else if (PLACEHOLDER.test(v)) p.push({ key, text: `${key} is still the placeholder from .env.example. Make a real one: ${make}` });
  else if (v.length < min) p.push({ key, text: `${key} is ${v.length} characters; it needs at least ${min}. Make one: ${make}` });
  else if (distinctChars(v) < 10) p.push({ key, text: `${key} repeats too few characters to be secret. Make one: ${make}` });
}

function checkDatabase(p: Problem[], w: string[], env: Env) {
  const url = read(env, 'DATABASE_URL');
  const ssl = read(env, 'DATABASE_SSL');
  if (ssl !== '' && ssl !== '0' && ssl !== '1') {
    p.push({ key: 'DATABASE_SSL', text: 'DATABASE_SSL must be 1 (TLS) or unset.' });
  }
  if (!url) {
    p.push({ key: 'DATABASE_URL', missing: true, text: 'DATABASE_URL is not set. It is the app\'s own connection, as flossify_app: postgres://flossify_app:<APP_DB_PASSWORD>@<host>:5432/<database>' });
  } else {
    let u: URL | null = null;
    try { u = new URL(url); } catch { /* reported below */ }
    if (!u || (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:')) {
      p.push({ key: 'DATABASE_URL', text: 'DATABASE_URL is not a postgres:// URL.' });
    } else {
      let password = '';
      try { password = decodeURIComponent(u.password); } catch { password = u.password; }
      if (password === DEV_DB_PASSWORD || u.searchParams.get('password') === DEV_DB_PASSWORD) {
        p.push({ key: 'DATABASE_URL', text: `DATABASE_URL uses the development password (${DEV_DB_PASSWORD}), which is written in this repository. Set APP_DB_PASSWORD (openssl rand -hex 24), run npm run db:migrate so flossify_app takes it, and put the same password in DATABASE_URL.` });
      }
      const admin = read(env, 'DATABASE_ADMIN_URL');
      if (admin && admin === url) {
        p.push({ key: 'DATABASE_URL', text: 'DATABASE_URL is the same connection as DATABASE_ADMIN_URL. The app connects as flossify_app, never as the admin: the admin role bypasses row-level security. DATABASE_ADMIN_URL is for npm run db:migrate and npm run db:backup only.' });
      }
      let user = '';
      try { user = decodeURIComponent(u.username); } catch { user = u.username; }
      // A pooler may want user.project (Supabase's); the role is still flossify_app.
      if (user && !/^flossify_app(\.|$)/.test(user)) {
        w.push(`DATABASE_URL connects as "${user}", not flossify_app. The schema grants the app's rights to flossify_app; the server refuses superusers and roles that bypass row-level security on the first query.`);
      }
      const sslmode = (u.searchParams.get('sslmode') ?? '').toLowerCase();
      if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca') {
        w.push(`DATABASE_URL has sslmode=${sslmode}, which the pg driver treats as verify-full: it will refuse a provider whose certificate authority Node does not know. Use DATABASE_SSL=1 instead, or sslmode=verify-full&sslrootcert=/path/to/provider-ca.pem to verify.`);
      }
      const host = u.hostname.toLowerCase();
      if (!sslmode && ssl !== '1' && !LOCAL_HOSTS.has(host) && !u.searchParams.get('host')) {
        w.push('The database connection is not encrypted (DATABASE_URL points at another machine and DATABASE_SSL is not 1). Set DATABASE_SSL=1 unless the database is on a private network.');
      }
    }
  }
}

function checkTexts(p: Problem[], w: string[], env: Env) {
  const provider = (read(env, 'SMS_PROVIDER') || 'console').toLowerCase();
  if (provider === 'console') {
    if (read(env, 'ALLOW_CONSOLE_SMS') === '1') {
      w.push('SMS_PROVIDER=console with ALLOW_CONSOLE_SMS=1: texts are written to the worker\'s log (bodies withheld), not sent. Nobody can reset a password or accept an invitation. A dry run only.');
    } else {
      p.push({ key: 'SMS_PROVIDER', missing: !read(env, 'SMS_PROVIDER'), text: 'SMS_PROVIDER is console (or not set): texts would be printed, not sent, so nobody could reset a password or accept an invitation. Set SMS_PROVIDER=semaphore with SMS_API_KEY and SMS_SENDER. For a deliberate dry run, set ALLOW_CONSOLE_SMS=1.' });
    }
  } else if (provider === 'semaphore') {
    if (!read(env, 'SMS_API_KEY')) p.push({ key: 'SMS_API_KEY', missing: true, text: 'SMS_API_KEY is not set. SMS_PROVIDER=semaphore needs the API key from semaphore.co (Account → API).' });
    const sender = read(env, 'SMS_SENDER');
    if (!sender) p.push({ key: 'SMS_SENDER', missing: true, text: 'SMS_SENDER is not set. Semaphore sends under a sender name registered and approved on your account.' });
    else if (sender.length > 11) w.push(`SMS_SENDER is ${sender.length} characters. Sender names on Philippine networks are at most 11; check the name Semaphore approved.`);
  } else {
    p.push({ key: 'SMS_PROVIDER', text: `SMS_PROVIDER is "${provider}". Use semaphore.` });
  }
}

/** Every problem with this environment, for the given process. Pure: reads only what it is given. */
export function checkEnv(env: Env = process.env, scope: Scope = 'web'): EnvReport {
  const problems: Problem[] = [];
  const warnings: string[] = [];
  checkDatabase(problems, warnings, env);
  checkTexts(problems, warnings, env);
  if (scope === 'web') {
    checkSecret(problems, env, 'SESSION_SECRET', 32, 'openssl rand -base64 48', 'It signs every sign-in; rotating it signs everyone out.');
    checkSecret(problems, env, 'SMS_INBOUND_SECRET', 24, 'openssl rand -hex 24', 'Replies from the text gateway are accepted only with it.');
    const session = read(env, 'SESSION_SECRET'), inbound = read(env, 'SMS_INBOUND_SECRET');
    if (session && session === inbound) {
      problems.push({ key: 'SMS_INBOUND_SECRET', text: 'SMS_INBOUND_SECRET is the same as SESSION_SECRET. The inbound secret is handed to the text gateway, and with the same value it could sign anyone in. Make them different.' });
    }
    const demo = read(env, 'SHOW_DEMO_LOGINS');
    if (demo !== '' && demo !== '0') {
      problems.push({ key: 'SHOW_DEMO_LOGINS', text: 'SHOW_DEMO_LOGINS is set: the sign-in page would list the seeded test logins and their password. It is for the owner\'s own machine only. Remove it.' });
    }
    const uploads = read(env, 'UPLOAD_DIR');
    if (!uploads) {
      problems.push({ key: 'UPLOAD_DIR', missing: true, text: 'UPLOAD_DIR is not set. Clinic photos are stored there: point it at a persistent volume, for example /var/lib/flossify/uploads.' });
    } else if (!uploads.startsWith('/')) {
      warnings.push(`UPLOAD_DIR is a relative path, so photos land inside the app's own folder, which a redeploy may replace. Use an absolute path on a persistent volume.`);
    }
  }
  return { problems, warnings };
}

/** The one error a production server gives, every problem on its own line. */
export function formatProblems(problems: readonly Problem[], reason = 'NODE_ENV=production'): string {
  const n = problems.length;
  const lines = [
    `Flossify cannot run safely in production. Fix ${n === 1 ? 'this setting' : `these ${n} settings`}:`,
    ...problems.map((p, i) => `  ${i + 1}. ${p.text}`),
    'Fix them in the server\'s environment and restart it. Every setting is described in .env.example.',
  ];
  if (reason !== 'NODE_ENV=production') {
    lines.push(`Treated as production because ${reason}. On a server, set NODE_ENV=production. To try a build on your own machine, use npm run preview, or set NODE_ENV=development.`);
  }
  return lines.join('\n');
}

const outcome = new Map<Scope, true | Error>();

/**
 * Check once per process and scope. On a production server, throw one error
 * listing every problem (and keep throwing it: the environment cannot change
 * under a running process). Anywhere else, warn once and carry on.
 */
export function assertEnv(scope: Scope = 'web'): void {
  const known = outcome.get(scope);
  if (known === true) return;
  if (known) throw known;

  const { problems, warnings } = checkEnv(process.env, scope);
  const reason = productionReason(process.env, process.argv);
  if (reason) {
    if (reason !== 'NODE_ENV=production') {
      warnings.unshift(`Treated as production because ${reason}. Set NODE_ENV=production on every process: the SMS worker and npm run db:migrate go by NODE_ENV alone and skip their production checks without it.`);
    }
    for (const w of warnings) console.warn(`[env] ${w}`);
    if (problems.length) {
      const error = new Error(formatProblems(problems, reason));
      error.name = 'FlossifyConfigError';
      console.error(`[env] ${error.message}`);
      outcome.set(scope, error);
      throw error;
    }
  } else {
    // Not a server: the owner's machine, with .env loaded (src/lib/dotenv.ts).
    // Name what is set and would be refused, in one line.
    const set = [...new Set(problems.filter((p) => !p.missing).map((p) => p.key))];
    const why = read(process.env, 'NODE_ENV') === 'production' ? 'astro CLI (preview is for this machine; a server runs npm start)' : `NODE_ENV=${read(process.env, 'NODE_ENV') || 'unset'}`;
    if (set.length) console.warn(`[env] Not production (${why}). A production server would refuse: ${set.join(', ')}. See .env.example.`);
  }
  outcome.set(scope, true);
}
