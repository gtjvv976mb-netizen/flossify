// Verifier: the offline kept copy with the REAL service worker (public/sw.js), at 1440 and 390. Open Maria's record
// online (twice, so the worker keeps it), go offline, open it again (bare, and with #treatment-record and #patient):
// the copy must open on Chart & plan with Add ▾ hidden and the palette's record actions hidden; back online, Add ▾ shows.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const URL_ = `${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(URL_, { waitUntil: 'load' });
  await page.evaluate(async () => { if (navigator.serviceWorker) { await navigator.serviceWorker.ready; } });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  const cached = await page.evaluate(async () => (await caches.keys()).join(','));
  for (const hash of ['', '#treatment-record', '#patient', '#overview']) {
    await ctx.setOffline(true);
    await page.goto('about:blank').catch(() => {});
    await page.goto(URL_ + hash, { waitUntil: 'load' }).catch((e) => errors.push('goto ' + e));
    await page.waitForTimeout(900);
    const s = await page.evaluate(() => {
      const vis = (el) => !!el && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
      const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
      return {
        copy: document.documentElement.dataset.offlineCopy ?? null, title: document.title,
        tab: sel ? sel.id.replace(/^rec-rec-|-tab$/g, '') : null,
        panelShown: [...document.querySelectorAll('[data-rec-panel]')].filter((p) => !p.hidden).map((p) => p.dataset.recPanel),
        addHidden: document.querySelector('.rec-add')?.hidden ?? 'no menu',
        addVisible: vis(document.querySelector('.rec-add > button')),
        paletteActions: [...document.querySelectorAll('[data-pick-open]')].filter(vis).length,
        chartTop: Math.round(document.getElementById('rec-chart')?.getBoundingClientRect().top ?? -1),
        barBottom: Math.round(document.querySelector('[data-rec-bar]')?.getBoundingClientRect().bottom ?? -1),
        sideways: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
        barCols: getComputedStyle(document.querySelector('[data-rec-bar]')).gridTemplateColumns,
      };
    });
    // Tap a tooth: the palette's record actions must stay hidden on the copy.
    await page.locator('[data-odontogram] button[data-tooth][data-fdi="26"]').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    const pal = await page.evaluate(() => [...document.querySelectorAll('[data-pick-open]')].filter((el) => el.checkVisibility() && el.getClientRects().length).length);
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ addHidden: document.querySelector('.rec-add')?.hidden }));
    const fail = [];
    if (!s.copy) fail.push('not the kept copy');
    if (s.tab !== 'chart') fail.push(`tab ${s.tab}`);
    if (s.addHidden !== true || s.addVisible) fail.push('Add ▾ shown');
    if (pal) fail.push(`${pal} palette record actions shown after a tap`);
    if (s.sideways > 0) fail.push(`sideways ${s.sideways}`);
    if (s.chartTop < s.barBottom - 2) fail.push(`chart tab top ${s.chartTop} under the row ${s.barBottom}`);
    if (fail.length) bad++;
    console.log(`${w} ${hash || '(bare)'} controlled=${controlled} caches=${cached} copy=${s.copy ? 'yes' : 'no'} tab=${s.tab} shown=${s.panelShown} addHidden=${s.addHidden} palette=${pal} chartTop=${s.chartTop} bar=${s.barBottom} cols=${s.barCols} online→addHidden=${back.addHidden} ${fail.length ? 'FAIL ' + fail.join('; ') : 'ok'}`);
  }
  console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} failing` : 'all ok');
