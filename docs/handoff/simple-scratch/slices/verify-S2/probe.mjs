// Verifier probe for S2: per role × patient × tab × width × theme: sideways scroll, contrast of every text in the
// head, the row and the tab (composited over its ancestors' backgrounds), targets under 44px, teal buttons (per tab and
// per screen), the row's geometry. node probe.mjs <out.json> [--quick]
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
import { writeFileSync } from 'node:fs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const OUT = process.argv[2] ?? '/tmp/fl-simple-scratch/verify-S2/probe.json';
const QUICK = process.argv.includes('--quick');
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`); await db.end();
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const WHO = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com' };
const TABS = ['overview', 'patient', 'chart', 'treatment-record'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = [];
const combos = [];
for (const who of ['owner', 'dentist']) for (const patient of ['maria', 'rich', 'ledger']) for (const [w, h] of [[1440, 900], [390, 844]]) for (const theme of ['light', 'dark-device', 'dark-chosen']) {
  if (QUICK && (patient !== 'maria' || theme === 'dark-chosen')) continue;
  if (who === 'dentist' && theme !== 'light' && patient !== 'maria') continue;
  combos.push({ who, patient, w, h, theme });
}
for (const [w, h] of [[1366, 768], [1280, 800], [1200, 800], [1024, 768], [768, 1024]]) combos.push({ who: 'owner', patient: 'maria', w, h, theme: 'light' });
const MEASURE = (tab) => {
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const stack = []; let root = true, image = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !cs.backgroundImage.startsWith('url(')) image = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) { root = false; break; } }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) out = over(c, out);
    return { bg: out, root, image };
  };
  const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const head = document.querySelector('[data-pts-back]')?.closest('.ws-pane');
  const bar = document.querySelector('[data-rec-bar]');
  const panel = document.getElementById(`rec-${tab}`);
  const regions = [head, bar, panel].filter(Boolean);
  const inRegion = (e) => regions.some((r) => r.contains(e));
  const lbl = (e) => (e.innerText || e.getAttribute('aria-label') || e.value || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 50);
  // contrast
  const texts = [];
  for (const r of regions) for (const e of r.querySelectorAll('*')) {
    if (!vis(e)) continue;
    if (![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const cs = getComputedStyle(e);
    const rect = e.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1 || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    if (e.closest('svg')) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const { bg, root, image } = bgOf(e);
    const op = (() => { let o = 1; for (let x = e; x; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o; })();
    const L1 = lum(over({ ...fg, a: fg.a * op }, bg)), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    texts.push({ t: [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(' ').replace(/\s+/g, ' ').trim().slice(0, 50), ratio: Math.round(ratio * 100) / 100, size: cs.fontSize, root, image, where: e.closest('[data-rec-bar]') ? 'row' : e.closest('[data-rec-panel]') ? 'tab' : 'head', cls: (e.className?.baseVal ?? e.className ?? '').toString().slice(0, 40) });
  }
  // targets
  const small = [];
  const ctrls = [...new Set(regions.flatMap((r) => [...r.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab]')]))].filter(vis);
  for (const e of ctrls) {
    const r = e.getBoundingClientRect();
    if (e.type === 'checkbox' || e.type === 'radio') { const l = e.closest('label'); if (l) { const lr = l.getBoundingClientRect(); if (lr.height >= 44) continue; } }
    if (r.width < 44 || r.height < 44) small.push({ t: lbl(e), tag: e.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), where: e.closest('[data-rec-bar]') ? 'row' : e.closest('[data-rec-panel]') ? 'tab' : 'head', cls: String(e.className).slice(0, 40) });
  }
  // teal fills
  const tealOf = (e) => { const c = parse(getComputedStyle(e).backgroundColor); return c && c.a > 0.9 && c.g > c.r + 40 && c.b > c.r + 30 && Math.abs(c.g - c.b) < 30 && lum(c) < 0.25; };
  const teal = [...new Set(regions.flatMap((r) => [...r.querySelectorAll('a, button')]))].filter((e) => vis(e) && tealOf(e)).map((e) => { const r = e.getBoundingClientRect(); return { t: lbl(e), y: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), where: e.closest('[data-rec-bar]') ? 'row' : e.closest('[data-rec-panel]') ? 'tab' : 'head' }; });
  const top = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
  const br = bar?.getBoundingClientRect();
  return { texts, small, teal, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, sh: document.documentElement.scrollHeight, topBar: top ? [Math.round(top.top), Math.round(top.bottom)] : null, bar: br ? [Math.round(br.top), Math.round(br.bottom)] : null, theme: document.documentElement.dataset.theme ?? '', dark: matchMedia('(prefers-color-scheme: dark)').matches };
};
for (const c of combos) {
  const ctx = await b.newContext({ viewport: { width: c.w, height: c.h }, serviceWorkers: 'block', colorScheme: c.theme === 'dark-device' ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', WHO[c.who]); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  if (c.theme === 'dark-chosen') await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
  await page.goto(`${BASE}/c/session-road/patients/${P[c.patient]}/`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  for (const tab of TABS) {
    await page.evaluate((t) => { document.getElementById(`rec-rec-${t}-tab`).click(); scrollTo(0, 0); }, tab); await page.waitForTimeout(250);
    const m = await page.evaluate(MEASURE, tab);
    // per screen: teal buttons in view, and the row's place, scrolling down the tab
    const screens = [];
    for (let y = 0; y < m.sh; y += Math.round(c.h * 0.6)) {
      await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(60);
      screens.push(await page.evaluate(() => {
        const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const top = document.querySelector('[data-ws-top]')?.getBoundingClientRect();
        const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
        const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
        const tealOf = (e) => { const c = parse(getComputedStyle(e).backgroundColor); return c && c.a > 0.9 && c.g > c.r + 40 && c.b > c.r + 30 && Math.abs(c.g - c.b) < 30 && (c.r + c.g + c.b) < 400; };
        const inView = [...document.querySelectorAll('main a, main button')].filter((e) => { if (!vis(e) || !tealOf(e)) return false; const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 30));
        return { y: Math.round(scrollY), bar: [Math.round(bar.top), Math.round(bar.bottom)], top: top ? [Math.round(top.top), Math.round(top.bottom)] : null, teal: inView };
      }));
    }
    await page.evaluate(() => scrollTo(0, 0));
    results.push({ ...c, tab, ...m, screens, errors: [...errors] });
    const lowT = m.texts.filter((t) => t.ratio < 4.5);
    const maxTeal = Math.max(0, ...screens.map((s) => s.teal.length));
    console.log(`${c.who} ${c.patient} ${c.w} ${c.theme} ${tab}: sw ${m.sw}/${m.iw}; texts ${m.texts.length}, <4.5: ${lowT.length} (${lowT.slice(0, 4).map((t) => `"${t.t}" ${t.ratio}${t.root ? ' root' : ''}`).join('; ')}); small ${m.small.length}; teal tab ${m.teal.length}, max/screen ${maxTeal} [${[...new Set(screens.flatMap((s) => s.teal))].join(' | ')}]`);
  }
  await ctx.close();
}
await b.close();
writeFileSync(OUT, JSON.stringify(results, null, 1));
