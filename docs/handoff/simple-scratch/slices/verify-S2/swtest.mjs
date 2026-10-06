// The real kept copy: the service worker keeps the record page, the line drops, a reload is served the copy.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const REC = `${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h, qs] of [[1440, 900, ''], [390, 844, ''], [1440, 900, '?saved=note&back=overview#overview'], [1440, 900, '#treatment-record']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(REC + qs, { waitUntil: 'load' });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  const kept = await page.evaluate(async () => { const c = await caches.open('flossify-record-v2'); return (await c.keys()).map((r) => r.url); });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch((e) => errs.push('reload: ' + e.message)); await page.waitForTimeout(1200);
  const st = await page.evaluate(() => {
    const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
    const chart = document.getElementById('rec-chart');
    const note = [...document.querySelectorAll('[data-copy-note]')].filter((n) => !n.hidden).map((n) => n.innerText.slice(0, 80));
    return { copy: document.documentElement.dataset.offlineCopy ?? null, tab: sel?.id, chartShown: chart && !chart.hidden, add: document.querySelector('.rec-add')?.hidden,
      addVisible: !!document.querySelector('.rec-add')?.getClientRects().length, teeth: document.querySelectorAll('[data-odontogram] button[data-tooth]').length, note, url: location.search + location.hash,
      barTop: Math.round(document.querySelector('[data-rec-bar]').getBoundingClientRect().top), chartTop: Math.round(chart.getBoundingClientRect().top), stick: getComputedStyle(document.documentElement).getPropertyValue('--rec-stick') };
  });
  // a tooth still takes a finding offline (the chart's own logic)
  await page.click('[data-odontogram] button[data-tooth][data-fdi="17"]').catch((e) => errs.push('tooth: ' + e.message.slice(0, 80)));
  await page.waitForTimeout(300);
  const pal = await page.evaluate(() => ({ palette: [...document.querySelectorAll('[data-pick-open]')].filter((x) => x.getClientRects().length).length, states: [...document.querySelectorAll('[data-state-btn], [data-set-state], [data-palette] button')].filter((x) => x.getClientRects().length).length }));
  console.log(`${w} ${qs || '(plain)'}: kept ${kept.length} → ${JSON.stringify(st)} palette ${JSON.stringify(pal)} errors ${JSON.stringify(errs)}`);
  await ctx.close();
}
await b.close();
