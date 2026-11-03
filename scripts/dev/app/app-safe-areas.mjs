// The iPhone app draws pages edge to edge (mobile/capacitor.config.json, contentInset "never"), so the page itself must
// keep clear of the clock and Dynamic Island at the top and the home indicator at the bottom. public/app-shell.js does
// that with rules only the app loads (html[data-app]). This measures it: Chromium is given an iPhone's insets (59 px top,
// 34 px bottom, the iPhone 15 Pro's) and an iPad's (24 px, 20 px) through the DevTools protocol, and on each page:
//
//   - at the top of the page, no control, heading or label starts under the status bar;
//   - scrolled to the very end, none ends inside the home indicator's band;
//   - the drawer (phone) and a side panel: the same, with their own scrolling;
//   - a page with no bar that sticks to the top has the frosted band under the clock;
//   - no sideways scroll;
//   - an ordinary browser given the same insets is unchanged (no padding from these rules).
//
//   node scripts/dev/app/app-safe-areas.mjs [base=http://127.0.0.1:4610]
//   PW_CHROMIUM · DB=flossify_t · PGHOST · PGPORT · PGUSER (local only). Signs in as the seeded owner; changes nothing.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';

const [base = 'http://127.0.0.1:4610'] = process.argv.slice(2);
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, database: process.env.DB ?? 'flossify_t' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const slug = 'session-road';
const email = 'liwayway.domingo@example.com';
const patientId = (await q(`select p.id from patient p join clinic c on c.id = p.clinic_id where c.slug = $1 order by p.chart_no limit 1`, [slug]))[0].id;
await db.end();

const UA = {
  phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlossifyApp/1',
  pad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlossifyApp/1',
};
const DEVICES = [
  { name: 'iPhone 390', ua: UA.phone, viewport: { width: 390, height: 844 }, insets: { top: 59, bottom: 34, left: 0, right: 0 }, phone: true },
  { name: 'iPad 820', ua: UA.pad, viewport: { width: 820, height: 1180 }, insets: { top: 24, bottom: 20, left: 0, right: 0 }, phone: false },
];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failures = 0;
const ok = (s) => console.log(`  ok  ${s}`);
const bad = (s) => { failures++; console.log(`  FAIL ${s}`); };

function bridge() {
  window.Capacitor = { isNativePlatform: () => true, nativePromise: () => Promise.resolve({}) };
}
async function context(d, app = true, scheme = 'light') {
  const ctx = await browser.newContext({ viewport: d.viewport, isMobile: true, hasTouch: true, colorScheme: scheme, ...(app ? { userAgent: d.ua } : {}) });
  if (app) await ctx.addInitScript(bridge);
  return ctx;
}
async function page(ctx, d) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: d.insets });
  return p;
}

/** What sits in the status bar's band or the home indicator's, for the document or for one scrolling box. */
function zones({ top, bottom, scope, end }) {
  const H = innerHeight;
  const root = scope ? document.querySelector(scope) : document;
  const box = scope ? root : document.scrollingElement;
  if (end) box.scrollTop = box.scrollHeight; else box.scrollTop = 0;
  const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], h1, h2, h3, label';
  const under = [], over = [];
  let lowest = -Infinity;
  for (const el of root.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (el.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])')) continue;
    if (!scope && el.closest('dialog[open], .ws-side[data-open]')) continue;
    if (el.closest('.sr-only, .ws-skip')) continue;
    if (r.bottom <= 0 || r.top >= H) continue;
    // Something drawn over it (a sticky bar it has scrolled under) hides it: only what can be seen counts.
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const yMid = Math.min(Math.max(r.top + r.height / 2, 1), H - 1);
    const hit = document.elementFromPoint(x, yMid);
    if (!hit || !el.contains(hit)) continue;
    const fold = el.closest('details:not([open])');
    if (fold && !el.closest('summary')) continue;
    const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 36);
    if (!end && r.top < top - 0.5) under.push(`${name} (top ${Math.round(r.top)})`);
    if (end) lowest = Math.max(lowest, r.bottom);
    if (end && r.bottom > H - bottom + 0.5) over.push(`${name} (bottom ${Math.round(r.bottom)} of ${H})`);
  }
  return { under, over, lowest: Math.round(lowest), sideways: document.documentElement.scrollWidth > innerWidth + 1 };
}

async function check(p, d, label, scope) {
  const at = { top: d.insets.top, bottom: d.insets.bottom, scope };
  const head = await p.evaluate(zones, { ...at, end: false });
  const foot = await p.evaluate(zones, { ...at, end: true });
  const problems = [];
  if (head.under.length) problems.push(`under the status bar: ${head.under.slice(0, 4).join('; ')}`);
  if (foot.over.length) problems.push(`in the home indicator's band: ${foot.over.slice(0, 4).join('; ')}`);
  if (head.sideways) problems.push('sideways scroll');
  if (problems.length) bad(`${d.name} ${label}: ${problems.join(' · ')}`);
  else ok(`${d.name} ${label}: clear of the status bar and the home indicator (last control ends ${d.viewport.height - foot.lowest} px above the edge)`);
  if (!scope) await p.evaluate(() => { document.scrollingElement.scrollTop = 0; });
}

async function band(p, d, label, want) {
  // The band is the body's ::before (public/app-shell.js): fixed at the top, as tall as the status bar.
  const got = await p.evaluate(() => {
    const b = getComputedStyle(document.body, '::before');
    if (b.content === 'none' || b.content === 'normal' || b.position !== 'fixed') return null;
    return { top: b.top, height: Math.round(parseFloat(b.height)), bg: b.backgroundColor };
  });
  if (want && !(got && got.top === '0px' && got.height === d.insets.top)) bad(`${d.name} ${label}: no band under the clock (${JSON.stringify(got)})`);
  else if (!want && got) bad(`${d.name} ${label}: a band where the bar already covers the clock`);
}

const PUBLIC = [
  { path: '/app/', label: '/app/ (the start page)', bare: true },
  { path: '/', label: 'the home page' },
  { path: '/find/', label: 'Find a clinic' },
  { path: `/find/${slug}/`, label: "a clinic's page" },
  { path: `/find/${slug}/book/`, label: 'booking' },
  { path: '/auth/login/', label: 'the staff entrance', bare: true },
  { path: '/me/', label: 'My visits (the door)' },
  { path: '/offline/', label: 'the offline page', bare: true },
];
const STAFF = [
  { path: `/c/${slug}/`, label: 'the Dashboard', drawer: true, panel: '[data-cal-new]' },
  { path: `/c/${slug}/patients/`, label: 'Patients' },
  { path: `/c/${slug}/patients/${patientId}/`, label: 'the patient record' },
  { path: `/c/${slug}/patients/${patientId}/treatment-record/`, label: 'the Treatment record (a paper)', bare: true },
  { path: `/c/${slug}/finances/`, label: 'Finances' },
  { path: `/c/${slug}/settings/`, label: 'Clinic settings' },
];

for (const d of DEVICES) {
  console.log(`\n${d.name} (insets ${d.insets.top} / ${d.insets.bottom})`);
  const ctx = await context(d);
  const p = await page(ctx, d);
  for (const it of PUBLIC) {
    await p.goto(base + it.path, { waitUntil: 'load' });
    await p.waitForTimeout(700);
    await check(p, d, it.label);
    await band(p, d, it.label, !!it.bare);
  }
  if (d.phone) {
    await p.goto(`${base}/find/`, { waitUntil: 'load' });
    await p.tap('.site-top .site-menu-btn');
    await p.waitForSelector('.site-drawer[open]');
    await p.waitForTimeout(450);
    await check(p, d, 'the public drawer', '.site-drawer-inner');
  }

  // Signed in.
  await p.goto(`${base}/auth/login/?any=1`);
  await p.fill('#email', email);
  await p.fill('#password', 'flossify');
  await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
  for (const it of STAFF) {
    await p.goto(base + it.path, { waitUntil: 'load' });
    await p.waitForTimeout(700);
    await check(p, d, it.label);
    await band(p, d, it.label, !!it.bare);
    if (it.drawer && d.phone) {
      await p.tap('.ws-bar .ws-side-open');
      await p.waitForSelector('.ws-side[data-open]');
      await p.waitForTimeout(450);
      await check(p, d, `${it.label}: the drawer`, '.ws-side');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
    }
    if (it.panel) {
      await p.tap(it.panel);
      await p.waitForSelector('dialog.ws-panel[open]');
      await p.waitForTimeout(500);
      const id = await p.evaluate(() => document.querySelector('dialog.ws-panel[open]').id);
      await check(p, d, `${it.label}: a side panel (#${id})`, `dialog.ws-panel[open] .ws-panel-inner`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(400);
    }
  }

  // On paper there is no clock: printing in the app adds none of this (a paper on its own page, the workspace's bar).
  for (const path of [`/c/${slug}/patients/${patientId}/treatment-record/`, `/c/${slug}/`]) {
    await p.goto(base + path, { waitUntil: 'load' });
    await p.emulateMedia({ media: 'print' });
    const paper = await p.evaluate(() => ({
      top: getComputedStyle(document.body).paddingTop,
      bottom: getComputedStyle(document.body).paddingBottom,
      band: getComputedStyle(document.body, '::before').position === 'fixed',
      bar: document.querySelector('.ws-top') ? getComputedStyle(document.querySelector('.ws-top')).paddingTop : '0px',
    }));
    await p.emulateMedia({ media: 'screen' });
    if (paper.top !== '0px' || paper.bottom !== '0px' || paper.band || paper.bar !== '0px') bad(`${d.name} printing ${path}: ${JSON.stringify(paper)}`);
    else ok(`${d.name} printing ${path}: no inset padding and no band on paper`);
  }
  await ctx.close();

  // A full-height page whose content fits does not scroll by the inset (the staff entrance; the workspace places its
  // own foot).
  if (!d.phone) {
    const fresh = await context(d);
    const q2 = await page(fresh, d);
    await q2.goto(`${base}/auth/login/`, { waitUntil: 'load' });
    await q2.waitForTimeout(500);
    const extra = await q2.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    if (extra > 1) bad(`${d.name} the staff entrance scrolls by ${extra} px though it fits`);
    else ok(`${d.name} the staff entrance fits the screen: no scroll added by the inset`);
    await fresh.close();
  }

  // An ordinary browser with the same insets: none of this applies.
  const plain = await context(d, false);
  const b = await page(plain, d);
  await b.goto(`${base}/find/`, { waitUntil: 'load' });
  const looks = await b.evaluate(() => ({
    app: document.documentElement.hasAttribute('data-app'),
    bar: getComputedStyle(document.querySelector('.site-top')).paddingTop,
    body: getComputedStyle(document.body).paddingBottom,
    band: getComputedStyle(document.body, '::before').position === 'fixed',
  }));
  if (looks.app || looks.bar !== '0px' || looks.body !== '0px' || looks.band) bad(`${d.name}: an ordinary browser changed: ${JSON.stringify(looks)}`);
  else ok(`${d.name}: an ordinary browser given the same insets is unchanged (bar padding 0, body padding 0, no band)`);
  await plain.close();
}

await browser.close();
if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
