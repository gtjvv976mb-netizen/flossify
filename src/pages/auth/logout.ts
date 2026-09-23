// POST /auth/logout — clear the session cookie and go home.
export const prerender = false;

import type { APIRoute } from 'astro';
import { clearSession } from '../../lib/auth';

export const POST: APIRoute = ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/', 303);
};
