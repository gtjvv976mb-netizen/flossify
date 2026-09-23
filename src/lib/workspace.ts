// The gate on every workspace page. A session cookie is necessary, not
// sufficient: the staff member must still have access to this branch, checked
// on every request so a revocation takes effect immediately.

import type { AstroGlobal } from 'astro';
import { readSession, canOpen, type Session } from './auth';
import { pool } from './db';

export interface Workspace {
  session: Session;
  clinic: { id: string; slug: string; name: string; group_id: string; can_view_finance: boolean };
  /** Every branch this staff member may open, for the switcher. */
  branches: { slug: string; name: string }[];
}

/** Returns the workspace, or a Response that redirects to sign-in. */
export async function requireWorkspace(Astro: AstroGlobal): Promise<Workspace | Response> {
  const session = readSession(Astro.cookies);
  const slug = Astro.params.clinic ?? '';
  const next = encodeURIComponent(Astro.url.pathname);
  if (!session) return Astro.redirect(`/auth/login/?next=${next}`);
  const clinic = await canOpen(session, slug);
  if (!clinic) return Astro.redirect(`/auth/login/?next=${next}&denied=1`);
  const { rows: branches } = await pool.query('select slug, name from staff_branches($1)', [session.staffId]);
  return { session, clinic, branches };
}
