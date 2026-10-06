import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', ver1: '7e57a1c0-0000-4000-8000-000000000401', pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const SIZES = (process.env.SIZES ?? '1366x768,1440x900,1280x720,1024x768,800x600,768x1024').split(',').map((s) => s.split('x').map(Number));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: process.env.DARK ? 'dark' : 'light' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  for (const [who, id] of Object.entries(P)) for (const tab of ['overview', 'patient', 'chart', 'treatment-record']) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/#${tab}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    let worst = { h: 0 }, probs = new Set(), sawPinned = false;
    for (let y = 0; y <= maxY; y += 60) {
      await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(60);
      const s = await page.evaluate(() => {
        const top = document.querySelector('[data-ws-top]').getBoundingClientRect();
        const bar = document.querySelector('[data-rec-bar]'); const br = bar.getBoundingClientRect();
        const pin = bar.querySelector('[data-rec-pin]'); const pr = pin.getBoundingClientRect();
        const shown = getComputedStyle(pin).visibility === 'visible' && getComputedStyle(pin).display !== 'none';
        const head = document.querySelector('[data-rec-safety]').getBoundingClientRect();
        const headGone = head.bottom <= top.bottom + 1;
        const stuck = br.top <= top.bottom + 1;
        const allergies = [...pin.querySelectorAll('.rec-pin-chip')].filter((c) => /^Allergy: |^No known|^Allergies: not/.test(c.textContent.trim()));
        const cut = allergies.filter((c) => c.hidden || c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().bottom > pr.bottom + 0.5 || c.getBoundingClientRect().right > pr.right + 0.5).map((c) => c.textContent.trim());
        const headAll = [...document.querySelectorAll('[data-rec-safety] .ws-chip')].filter((c) => /^Allergy: |^No known|^Allergies: not/.test(c.textContent.trim())).length;
        const stick = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rec-stick'));
        return { shown, headGone, stuck, block: Math.round(br.height + (shown ? pr.height : 0)), rowPin: Math.round(br.height + pr.height), cut, nAll: allergies.length, headAll, stickOk: Math.abs(stick - (top.height + br.height + pr.height)) < 2, stick, calc: top.height + br.height + pr.height };
      });
      if (s.shown) sawPinned = true;
      if (s.block > worst.h) worst = { h: s.block, y };
      if (s.shown !== (s.stuck && s.headGone)) probs.add(`pinned=${s.shown} but stuck=${s.stuck} headGone=${s.headGone} at y=${y}`);
      if (s.shown && s.cut.length) probs.add(`allergy cut ${s.cut}`);
      if (s.nAll !== s.headAll) probs.add(`pin allergies ${s.nAll}/${s.headAll}`);
      if (!s.stickOk) probs.add(`--rec-stick ${s.stick} vs ${s.calc}`);
    }
    console.log(`${w}x${h} ${who} ${tab}: maxY=${maxY} worst block ${worst.h}px (y=${worst.y}) sawPinned=${sawPinned} ${probs.size ? 'PROB ' + [...probs].slice(0, 4).join(' | ') : 'ok'}`);
  }
  await ctx.close();
}
await b.close();
