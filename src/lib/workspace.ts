// The gate on every workspace page. A session cookie is necessary, not
// sufficient: the staff member must still have access to this branch, checked
// on every request so a revocation takes effect immediately.

import type { AstroGlobal } from 'astro';
import { readSession, canOpen, clearSession, type Session, type OpenBranch } from './auth';
import type { Perm } from './can';
import { pool } from './db';

export interface Workspace {
  session: Session;
  clinic: OpenBranch;
  /** What this person may do at this branch: can(ws, key) in src/lib/can.ts. */
  perms: ReadonlySet<Perm>;
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
  if (!clinic) {
    // Signed out behind their back (a new password, here or by the owner; or switched off): a fresh sign-in,
    // not "not for that branch". /auth/login/ sends them on to their clinic's door.
    const who = (await pool.query('select token_version, disabled_at from staff where id = $1', [session.staffId])).rows[0];
    if (!who || who.disabled_at || who.token_version !== (session.tv ?? 0)) {
      clearSession(Astro.cookies);
      return Astro.redirect(`/auth/login/?next=${next}`);
    }
    return Astro.redirect(`/auth/login/?next=${next}&denied=1`);
  }
  // A password someone else set (a new member, or a reset by the owner): My page first, to choose their own.
  const mine = `/c/${clinic.slug}/account/`;
  if (clinic.must_change && Astro.url.pathname !== mine) return Astro.redirect(`${mine}?first=1#password`);
  const { rows: branches } = await pool.query('select slug, name from staff_branches($1)', [session.staffId]);
  return { session, clinic, branches, perms: clinic.perms };
}
