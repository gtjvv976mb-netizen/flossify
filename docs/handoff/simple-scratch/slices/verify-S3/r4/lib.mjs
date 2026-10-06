import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
export const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
export const S = `${BASE}/c/session-road`;
export const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
export const USERS = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com', ramon: 'ramon.cari.o@example.com' };
export const rec = (p, rest = '') => `${S}/patients/${P[p] ?? p}/${rest}`;
export async function db() {
  const c = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: process.env.DB_ || 'flossify_simple' });
  await c.connect();
  return c;
}
export async function clearThrottle() {
  const c = await db();
  await c.query(`delete from throttle where key like 'login:%'`);
  await c.end();
}
export async function browser() { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
export async function login(b, who = 'owner', opts = {}) {
  await clearThrottle();
  const ctx = await b.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 }, serviceWorkers: opts.sw ? 'allow' : 'block', colorScheme: opts.colorScheme ?? 'light', javaScriptEnabled: opts.js ?? true });
  const page = await ctx.newPage();
  const email = USERS[who] ?? who;
  // sign in with scripts on (a separate context when js is off)
  if (opts.js === false) {
    const ctx2 = await b.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/auth/login/?any=1`);
    await p2.fill('#email', email); await p2.fill('#password', 'flossify');
    await Promise.all([p2.waitForNavigation(), p2.click('button[type=submit]')]);
    await ctx.addCookies(await ctx2.cookies());
    await ctx2.close();
    return { ctx, page };
  }
  await page.goto(`${BASE}/auth/login/?any=1`);
  await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  return { ctx, page };
}
export const state = (page) => page.evaluate(() => {
  const sel = document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]');
  const shown = [...document.querySelectorAll('[data-rec-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.recPanel);
  const dialogs = [...document.querySelectorAll('dialog[open]')].map((d) => d.id);
  return { tab: sel?.id.replace(/^rec-rec-|-tab$/g, '') ?? null, shown, dialogs, url: location.pathname + location.search + location.hash, focus: document.activeElement?.id || document.activeElement?.tagName + '.' + (document.activeElement?.className || '').toString().slice(0, 40) };
});
