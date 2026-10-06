// Verifier contrast: every text in the stuck tab row (Add ▾ closed and open) and in every saved line, light and dark
// (the device's dark AND a chosen dark: data-theme), at 1440 and 390. The background is composited up the ancestors
// (each background-color with its alpha) onto the page; the text colour with its own alpha onto that. Lowest ratio kept.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', RICH = '7e57a1c0-0000-4000-8000-000000000001';
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
const RX = (await db.query(`select id from prescription where patient_id = $1 order by issued_at limit 1`, [MARIA])).rows[0].id;
const LT = (await db.query(`select id from clinical_letter where patient_id = $1 order by created_at limit 1`, [MARIA])).rows[0].id;
await db.end();
const MEASURE = (scopeSel) => {
  const parse = (s) => {
    let m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    m = s.match(/color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
    return null;
  };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (c && c[3] >= 1) break;
      if (e === document.documentElement && (!c || c[3] < 1)) layers.push(parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]);
    }
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const out = [];
  const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  for (const scope of document.querySelectorAll(scopeSel)) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      // visually hidden (sr-only) text is not drawn
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
      const fg = parse(cs.color);
      let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const bg = bgOf(el);
      const f = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      out.push({ text: n.textContent.trim().slice(0, 40), ratio: Math.round(ratio(f, bg) * 100) / 100, size: cs.fontSize, fg: cs.color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(',')})` });
    }
  }
  return out;
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const rows = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const theme of ['light', 'dark-device', 'dark-chosen', 'light-chosen-on-dark-device']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: theme === 'dark-device' || theme === 'light-chosen-on-dark-device' ? 'dark' : 'light' });
    await ctx.addInitScript((t) => { try { if (t === 'dark-chosen') localStorage.setItem('theme', 'dark'); else if (t === 'light-chosen-on-dark-device') localStorage.setItem('theme', 'light'); else localStorage.removeItem('theme'); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
    await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
    const cases = [
      ['row stuck, Today', `${MARIA}/`, null, true, false],
      ['row stuck, Add open', `${MARIA}/`, null, true, true],
      ['row, Chart tab selected', `${MARIA}/#chart`, null, true, false],
      ['saved rx on Today', `${MARIA}/?saved=rx:${RX}&back=overview#overview`, '[data-rec-saved]', false, false],
      ['saved letter on Patient', `${MARIA}/?saved=letter:${LT}&back=patient#patient`, '[data-rec-saved]', false, false],
      ['saved vitals-crisis on Record', `${RICH}/?saved=vitals-crisis&back=treatment-record#treatment-record`, '[data-rec-saved]', false, false],
      ['saved vitals-high on Today', `${RICH}/?saved=vitals-high&back=overview#overview`, '[data-rec-saved]', false, false],
      ['saved recall in card', `${MARIA}/?saved=recall#recall`, '[data-rec-saved]', false, false],
      ['saved plan in card', `${MARIA}/?saved=plan-accepted#treatment`, '[data-rec-saved]', false, false],
      ['saved done at offer', `${RICH}/?saved=done&treated=7e57a1c0-0000-4000-8000-0000000000d1#chart-offer`, '[data-rec-saved], #chart-offer', false, false],
      ['saved payplan on Chart', `${MARIA}/?saved=payplan:0f0f0f0f-1111-4222-8333-444444444444&back=chart#chart`, '[data-rec-saved]', false, false],
    ];
    for (const [name, path, scope, stick, openAdd] of cases) {
      await page.goto('about:blank');
      await page.goto(`${BASE}/c/session-road/patients/${path}`, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      if (stick) { await page.evaluate(() => window.scrollTo(0, Math.min(1400, document.scrollingElement.scrollHeight - innerHeight))); await page.waitForTimeout(200); }
      if (openAdd) { await page.click('.rec-add > button'); await page.waitForTimeout(250); }
      const theme_ = await page.evaluate(() => [document.documentElement.dataset.theme ?? '', getComputedStyle(document.body).backgroundColor]);
      const m = await page.evaluate(MEASURE, scope ?? '[data-rec-bar]');
      const stuck = await page.evaluate(() => { const b = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const t = document.querySelector('[data-ws-top]')?.getBoundingClientRect(); return { barTop: Math.round(b.top), topBar: Math.round(t?.bottom ?? 0), scrollY: Math.round(scrollY) }; });
      const low = m.sort((a, b) => a.ratio - b.ratio)[0];
      rows.push({ w, theme, name, n: m.length, low, under: m.filter((x) => x.ratio < 4.5), stuck, themeAttr: theme_ });
    }
    await ctx.close();
  }
}
await browser.close();
let bad = 0;
for (const r of rows) {
  if (!r.n || r.under.length) bad++;
  console.log(`${String(r.w).padEnd(5)} ${r.theme.padEnd(28)} ${r.name.padEnd(30)} n=${String(r.n).padEnd(4)} lowest ${r.low?.ratio} "${r.low?.text}" ${r.low?.fg} on ${r.low?.bg} ${r.stuck.scrollY ? `stuck bar@${r.stuck.barTop} top@${r.stuck.topBar}` : ''} theme=${r.themeAttr.join(' ')} ${r.under.length ? 'UNDER 4.5: ' + r.under.map((u) => `${u.text} ${u.ratio}`).join(', ') : r.n ? 'ok' : 'NOTHING MEASURED'}`);
}
console.log(`${rows.length} measurements, ${bad} failing`);
