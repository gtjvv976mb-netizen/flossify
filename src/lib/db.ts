// One pool, two ways in.
//
// `withClinic(id, fn)` opens a transaction, sets app.clinic_id for that
// transaction only, and runs fn. Row-level security then does the isolating;
// a query in fn that forgets its WHERE clause returns that clinic's rows and
// nobody else's. `publicRead` runs the security-definer functions that expose
// a clinic's public face without a tenant.
//
// The app connects as flossify_app, a plain role. If DATABASE_URL points at a
// superuser, or at a role with BYPASSRLS (the admin role migrate asks for),
// RLS is silently bypassed — refuseSuperuser below refuses both.
//
// Configuration is read from process.env when the server runs, never from
// import.meta.env, which Astro writes into the build (src/lib/dotenv.ts puts
// the owner's .env into process.env on the Mac). With no URL at all (a clean
// build, nothing set) the module still loads; the first connection says what
// is missing.
//
// TLS. DATABASE_SSL=1 encrypts the connection without verifying the server's
// certificate (rejectUnauthorized: false), the same as npm run db:migrate
// (scripts/db/migrate.ts): DigitalOcean, AWS RDS, Supabase and others sign
// with their own certificate authority, which Node does not trust, so
// verifying by default would refuse every connection to them. That stops
// anyone reading the traffic, not someone impersonating the server. To verify
// as well, leave DATABASE_SSL unset and put
//   ?sslmode=verify-full&sslrootcert=/path/to/provider-ca.pem
// on DATABASE_URL; an sslmode on the URL always wins over DATABASE_SSL (the
// pg driver reads the URL last). Do not write sslmode=require: this driver
// reads it as verify-full.

import './dotenv';
import pg from 'pg';
import { assertEnv } from './env';

const url = process.env.DATABASE_URL;

const ssl = (process.env.DATABASE_SSL ?? '').trim() === '1' ? { rejectUnauthorized: false } : undefined;

// The configuration check (src/lib/env.ts), before every new connection:
// throws on a production server with an unsafe configuration, warns once
// elsewhere. Not on import. Astro loads a page's modules before the
// middleware runs, and a module that throws while loading makes that page a
// bare 500 for the life of the process; the middleware refuses first, with a
// proper answer. This is for whatever reaches the database without passing
// through it. pool.query() connects through connect(), so both are covered.
// A refusal arrives the way pg reports any failure to connect: a rejected
// promise, or the callback's error.
class CheckedPool extends pg.Pool {
  connect(...args: any[]): any {
    let refused: Error | null = null;
    try {
      assertEnv();
      if (!url) refused = new Error('DATABASE_URL is not set. See .env.example.');
    } catch (e) {
      refused = e as Error;
    }
    if (refused) {
      const done = args[0];
      if (typeof done === 'function') { process.nextTick(() => done(refused)); return undefined; }
      return Promise.reject(refused);
    }
    return (super.connect as any).apply(this, args);
  }
}

export const pool = new CheckedPool({
  connectionString: url || undefined,
  ssl,
  max: 8,
  // A database that cannot be reached answers in ten seconds instead of never.
  connectionTimeoutMillis: 10_000,
  application_name: 'flossify-web',
});

// An idle connection the server closes (a restart, a managed provider's
// maintenance) arrives here. Without a listener Node treats it as an
// unhandled error and the whole server exits.
pool.on('error', (e) => console.error(`[db] idle connection dropped: ${e.message}`));

let checked = false;
async function refuseSuperuser() {
  if (checked) return;
  const { rows } = await pool.query('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
  if (rows[0]?.rolsuper) throw new Error('Refusing to run as a superuser: row-level security would not apply.');
  if (rows[0]?.rolbypassrls) throw new Error('Refusing to run as a role with BYPASSRLS: row-level security would not apply. DATABASE_URL must connect as flossify_app.');
  checked = true;
}

export type Tx = pg.PoolClient;

/** Run fn inside a transaction scoped to one clinic. Everything fn queries is filtered by RLS. */
export async function withClinic<T>(clinicId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  await refuseSuperuser();
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.clinic_id', $1, true)", [clinicId]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** A read that needs no tenant: the public directory functions. */
export async function publicRead<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  await refuseSuperuser();
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

export const clinicIdBySlug = async (slug: string): Promise<string | null> =>
  (await publicRead<{ id: string | null }>('select public_clinic_id($1) as id', [slug]))[0]?.id ?? null;

let lastPing: boolean | null = null;
/**
 * For /healthz: can this process reach the database, as a role row-level
 * security applies to? Never throws. The reason for a failure goes to the
 * server's log, once per change, and never to the caller.
 */
export async function ping(timeoutMs = 3_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${timeoutMs / 1000} s`)), timeoutMs);
  });
  let ok = false;
  let why = '';
  try {
    await Promise.race([(async () => { await refuseSuperuser(); await pool.query('select 1'); })(), late]);
    ok = true;
  } catch (e) {
    why = (e as Error).message;
  } finally {
    clearTimeout(timer);
  }
  if (ok !== lastPing) {
    if (ok) { if (lastPing === false) console.log('[healthz] database reachable again'); }
    else console.error(`[healthz] database check failed: ${why}`);
    lastPing = ok;
  }
  return ok;
}
