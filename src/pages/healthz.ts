// GET /healthz — for the platform's health check and uptime monitors.
//
// 200 {"ok":true} when this process can reach the database as a role that
// row-level security applies to; 503 {"ok":false} when it cannot, or when the
// server's configuration is unsafe (src/middleware.ts answers that one before
// this runs). Never anything else: no version, no host, no reason. The reason
// goes to the server's log (src/lib/db.ts, ping).

export const prerender = false;

import type { APIRoute } from 'astro';

const answer = (ok: boolean) =>
  new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const GET: APIRoute = async () => {
  try {
    // Imported here, not at the top, so a database module that cannot load
    // (DATABASE_URL missing on the Mac) is a 503 like any other failure.
    const { ping } = await import('../lib/db');
    return answer(await ping());
  } catch {
    return answer(false);
  }
};
