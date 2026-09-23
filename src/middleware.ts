// Runs around every page and endpoint the server renders.
//
// 1. The configuration check (src/lib/env.ts). The node adapter imports this
//    file on the first request, so that request is where a production server
//    with an unsafe configuration stops. Every rendered page and endpoint then
//    answers 503 with one plain line (the log has the list of what to fix,
//    repeated at most once a minute while it lasts), and /healthz answers
//    503 {"ok":false}, so a platform's health check fails the deploy. Page
//    code never runs: this answers before it. (src/lib/db.ts checks again
//    before each database connection, for anything that gets past here.)
//    One gap: Astro imports a page's modules before this runs, so a module
//    that throws while it is imported fails first, as a bare 500 with none of
//    the headers below. src/lib/auth.ts does that when SESSION_SECRET is
//    missing (measured). The full list still reaches the log with the first
//    request that gets here, which /healthz always does.
//
// 2. Security headers on the responses the server renders. The
//    Content-Security-Policy carries frame-ancestors and nothing else: pages
//    keep their inline scripts and styles, and no other site may frame them
//    (X-Frame-Options says the same to browsers that predate frame-ancestors).
//    HSTS only on a production server; browsers ignore it over plain http, and
//    on the Mac it has nothing to protect. A header the page already set wins.
//    A page that throws gets them too: outside astro dev the error is logged
//    here and answered as a 500 carrying the headers (astro dev keeps its
//    error overlay). Astro still renders src/pages/500.astro for it if one is
//    ever added; there is none now, so the 500 has no body.
//
// What does not get these headers, because it never reaches this file:
//  - Astro's own Origin check (security.checkOrigin). It runs as Astro's
//    internal middleware ahead of this one, and its 403 ("Cross-site POST
//    form submissions are forbidden", plain text) goes straight out. Checked
//    against the built server. It reads nothing and changes nothing here, and
//    neither does this file touch the X-CSRF double-submit (src/lib/csrf.ts),
//    which each handler reads.
//  - Prerendered pages and public files. The node adapter (standalone,
//    @astrojs/node 11) answers any path that matches a file in dist/client —
//    /, /privacy/, /websites/, /offline/, /samples/…, /fonts/…, /assets/… —
//    from its static handler before the app sees the request (checked:
//    `curl -I /` has no X-Frame-Options, `curl -I /auth/login/` has all of
//    them). Middleware does run for them once, at build time, where the
//    headers are thrown away.
// What that means: the proxy in front should add the same headers to every
// response (Caddy `header`, nginx `add_header … always`), which covers both.
// Until it does, the static pages can be framed and carry no HSTS. It also
// means /websites/ can frame /samples/swiftcare/: that sample is static. If it
// ever moves behind the server, or the proxy adds frame protection, it needs
// frame-ancestors 'self' (SAMEORIGIN), not 'none'.

import './lib/dotenv';
import { defineMiddleware } from 'astro:middleware';
import { assertEnv, isProduction } from './lib/env';

const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
// A year, this host only: clinic sample sites may live on subdomains that are
// not on https yet. No preload; that is a separate, slow-to-undo decision.
const HSTS = 'max-age=31536000';

const HEALTHZ = /^\/healthz\/?$/;

function withHeaders(response: Response, headers: Record<string, string>): Response {
  try {
    for (const [name, value] of Object.entries(headers)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    return response;
  } catch {
    // Response.redirect() and fetched responses have immutable headers: copy.
    const copy = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
    for (const [name, value] of Object.entries(headers)) {
      if (!copy.headers.has(name)) copy.headers.set(name, value);
    }
    return copy;
  }
}

/** When the list of problems last went to the log. assertEnv() logs it the first time. */
let saidAt = 0;
function remind(e: unknown) {
  const now = Date.now();
  if (saidAt === 0) { saidAt = now; return; }
  if (now - saidAt < 60_000) return;
  saidAt = now;
  console.error(`[env] Still refusing to serve pages. ${(e as Error).message}`);
}

const REFUSED = 'Flossify is not available right now.\nThis server is missing settings it needs to run safely; its log lists them.\n';

export const onRequest = defineMiddleware(async (context, next) => {
  // Built, not served: no configuration to check, and the headers would be dropped anyway.
  if (context.isPrerendered) return next();

  const production = isProduction();
  const headers = production ? { ...HEADERS, 'Strict-Transport-Security': HSTS } : HEADERS;

  try {
    assertEnv();
  } catch (e) {
    remind(e);
    // The health check answers in its own terms and says nothing more.
    const health = HEALTHZ.test(context.url.pathname);
    return withHeaders(
      new Response(health ? '{"ok":false}' : REFUSED, {
        status: 503,
        headers: {
          'Content-Type': health ? 'application/json' : 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }),
      headers,
    );
  }

  let response: Response;
  try {
    response = await next();
  } catch (e) {
    if (import.meta.env.DEV) throw e;
    // What Astro would log (the stack); no query string, which can carry a code.
    console.error(`[error] ${context.request.method} ${context.url.pathname}\n${(e as Error)?.stack ?? String(e)}`);
    // No body: Astro renders src/pages/500.astro into it if one exists, keeping these headers.
    response = new Response(null, { status: 500 });
  }
  return withHeaders(response, headers);
});
