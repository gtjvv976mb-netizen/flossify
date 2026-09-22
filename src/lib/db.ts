// One pool, two ways in.
//
// `withClinic(id, fn)` opens a transaction, sets app.clinic_id for that
// transaction only, and runs fn. Row-level security then does the isolating;
// a query in fn that forgets its WHERE clause returns that clinic's rows and
// nobody else's. `publicRead` runs the security-definer functions that expose
// a clinic's public face without a tenant.
//
// The app connects as flossify_app, a plain role. If DATABASE_URL points at a
// superuser, RLS is silently bypassed — the check below refuses to start.

import pg from 'pg';

const url = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');

export const pool = new pg.Pool({ connectionString: url, max: 8 });

let checked = false;
async function refuseSuperuser() {
  if (checked) return;
  const { rows } = await pool.query('select rolsuper from pg_roles where rolname = current_user');
  if (rows[0]?.rolsuper) throw new Error('Refusing to run as a superuser: row-level security would not apply.');
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
