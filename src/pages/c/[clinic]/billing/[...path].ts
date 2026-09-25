// /c/<slug>/billing/… — where patient money lived before the three tabs. Every
// old address now answers from Finances (docs/workspace-redesign.md,
// "Finances"), with the statement's id in the path and the query kept:
//
//   /billing/                → /finances/               (?view=, ?patient=, ?q=)
//   /billing/new/            → /finances/new/           (?patient=)
//   /billing/<id>/           → /finances/<id>/          (?done=, ?p=, ?missed=, ?stale=)
//   /billing/<id>/print/     → /finances/<id>/print/    (?ack=, ?paper=)
//
// 307, for every method: temporary, never cached (no-store), and the method
// and body go along, so a payment or a void posted from a page left open
// before the move still lands where it is handled (the CSRF token rides in
// the body and the cookie, both unchanged). Nothing here reads the database
// or the session: the page it goes to checks who may see it. The Flossify
// plan is Clinic settings → Your Flossify plan (/settings/billing/), not here.
export const prerender = false;

import type { APIRoute } from 'astro';

const go = (to: string) => new Response(null, { status: 307, headers: { location: to, 'cache-control': 'no-store' } });

export const ALL: APIRoute = ({ params, url }) => {
  const slug = encodeURIComponent(params.clinic ?? '');
  const parts = (params.path ?? '').split('/').filter(Boolean).map((p) => encodeURIComponent(p));
  const base = `/c/${slug}/finances/`;
  let rest = '';
  if (parts.length === 1) rest = `${parts[0]}/`; // new/, or a statement
  else if (parts.length === 2 && parts[1] === 'print') rest = `${parts[0]}/print/`;
  else if (parts.length > 0) return new Response('Not found', { status: 404 });
  return go(base + rest + url.search);
};
