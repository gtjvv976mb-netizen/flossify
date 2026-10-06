import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ver1: '7e57a1c0-0000-4000-8000-000000000401', pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e' };
const SIZES = (process.env.SIZES ?? '1366x768,1440x900,1024x768,768x1024,390x844,360x740').split(',').map((s) => s.split('x').map(Number));
const LOGIN = process.env.LOGIN || 'liwayway.domingo@example.com';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of (process.env.SCHEMES ?? 'light').split(',')) for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: scheme });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', LOGIN); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  for (const [who, id] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]') && !e.closest('dialog:not([open])'); };
      const facts = document.querySelector('.rec-facts'); const fr = facts.getBoundingClientRect();
      const clipped = [...document.querySelectorAll('.rec-facts-in > span')].filter((s) => { const r = s.getBoundingClientRect(); return r.right > fr.right + 0.5 || r.left < fr.left - 0.5 - 24; }).map((s) => s.textContent.trim() + ` (${Math.round(s.getBoundingClientRect().right - fr.right)}px past)`);
      const facttext = document.querySelector('.rec-facts-in').textContent.replace(/\s+/g, ' ').trim();
      const teal = [...document.querySelectorAll('.ws-btn-primary')].filter(vis).map((e) => e.textContent.trim().slice(0, 30));
      const head = document.querySelector('[data-rec-safety]')?.closest('.ws-pane') ?? document.querySelector('.rec-back').parentElement;
      const headBtns = [...head.querySelectorAll('button, a[href]')].filter(vis).map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
      const small = [...head.querySelectorAll('button, a[href]')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((e) => `${e.textContent.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
      const safety = [...document.querySelectorAll('[data-rec-safety] .ws-chip')].map((c) => c.textContent.trim());
      const desk = document.querySelector('.rec-desk-note')?.textContent.replace(/\s+/g, ' ').trim() ?? null;
      const tealAll = [...document.querySelectorAll('.ws-btn-primary')].filter(vis).length;
      return { facttext, clipped, teal, headBtns, small, safety, desk, side: document.documentElement.scrollWidth - innerWidth, headH: Math.round(head.getBoundingClientRect().height) };
    });
    console.log(`${scheme} ${w}x${h} ${who}: side=${r.side} headH=${r.headH} teal=${JSON.stringify(r.teal)}\n   facts: ${r.facttext}\n   clipped: ${JSON.stringify(r.clipped)} small: ${JSON.stringify(r.small)}\n   head controls: ${JSON.stringify(r.headBtns)}\n   safety: ${JSON.stringify(r.safety)}\n   desk: ${r.desk}`);
  }
  if (errs.length) console.log('ERRORS', errs);
  await ctx.close();
}
await b.close();
