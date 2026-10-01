// Count tabs and buttons on the patient record, per region and per section, as a person sees them.
import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:4471';
const PID = process.argv[2] ?? '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const EMAIL = process.argv[3] ?? 'liwayway.domingo@example.com';
const SLUG = process.argv[4] ?? 'session-road';
const W = Number(process.argv[5] ?? 1440);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`);
await page.fill('#email', EMAIL);
await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
await page.goto(`${BASE}/c/${SLUG}/patients/${PID}/`);
await page.waitForLoadState('networkidle');

const count = async (label) => page.evaluate((label) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[hidden]') && !el.closest('dialog:not([open])'); };
  const q = (root, sel) => [...root.querySelectorAll(sel)].filter(vis);
  const ACT = 'button, a[href], select, input[type=checkbox], input[type=radio], [role=tab]';
  const main = document.querySelector('.rec-main');
  const head = document.querySelector('.rec-back')?.closest('[class]')?.parentElement;
  const rec = {};
  const headPane = document.querySelector('.rec-who')?.closest('section, div.ws-pane, [aria-label$="patient record"]') ?? document.querySelector('.rec-who')?.parentElement?.parentElement;
  const panel = [...document.querySelectorAll('[data-rec-panel]')].find((p) => !p.hidden);
  const strip = document.querySelector('#this-visit');
  const nav = document.querySelector('.rec-nav');
  rec.section = panel?.dataset.recPanel;
  rec.head = headPane ? q(headPane, ACT).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)) : null;
  rec.nav = nav ? q(nav, '[role=tab]').length : 0;
  rec.strip = strip ? q(strip, ACT).map((e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)) : null;
  rec.panel = panel ? q(panel, ACT).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)) : null;
  rec.panelH = panel ? Math.round(panel.getBoundingClientRect().height) : 0;
  rec.headH = headPane ? Math.round(headPane.getBoundingClientRect().height) : 0;
  rec.stripH = strip ? Math.round(strip.getBoundingClientRect().height) : 0;
  rec.docH = document.documentElement.scrollHeight;
  // Side panels (dialogs) on the page, drawn or not: each is a place a form lives.
  rec.dialogs = [...document.querySelectorAll('dialog')].map((d) => d.id).filter(Boolean);
  return rec;
}, label);

const tabs = await page.$$eval('.rec-nav [role=tab]', (t) => t.map((x) => x.id.replace(/^rec-rec-|-tab$/g, '')));
const out = { width: W, tabs, sections: {} };
for (const t of tabs) {
  await page.click(`#rec-rec-${t}-tab`);
  await page.waitForTimeout(150);
  const r = await count(t);
  out.sections[t] = { n: r.panel?.length ?? 0, h: r.panelH, items: r.panel };
  if (t === tabs[0]) { out.head = r.head; out.strip = r.strip; out.nav = r.nav; out.headH = r.headH; out.stripH = r.stripH; out.dialogs = r.dialogs; }
}
// The More menu's items.
out.more = await page.$$eval('#rec-more [class*=ws-menu-item]', (xs) => xs.map((x) => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)));
console.log(JSON.stringify(out, null, 1));
await browser.close();
