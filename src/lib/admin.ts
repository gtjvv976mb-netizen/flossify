// The gate on Flossify's own pages (/admin/): a staff session whose owner is
// in platform_admin, not disabled, with a current token version. Checked on
// every request, like requireWorkspace. Admins have no tenant; anything they
// read across clinics goes through a definer function that returns exactly
// what the page shows.

import type { AstroGlobal } from 'astro';
import { readSession, type Session } from './auth';
import { pool } from './db';

export interface Admin { session: Session; name: string }

export async function requireAdmin(Astro: AstroGlobal): Promise<Admin | Response> {
  const session = readSession(Astro.cookies);
  const next = encodeURIComponent(Astro.url.pathname);
  if (!session) return Astro.redirect(`/auth/login/?next=${next}`);
  const { rows } = await pool.query(
    `select s.full_name from platform_admin a join staff s on s.id = a.staff_id
      where a.staff_id = $1 and s.disabled_at is null and s.token_version = $2`, [session.staffId, session.tv ?? 0]);
  if (!rows[0]) return Astro.redirect(`/auth/login/?next=${next}&denied=1`);
  return { session, name: rows[0].full_name };
}
