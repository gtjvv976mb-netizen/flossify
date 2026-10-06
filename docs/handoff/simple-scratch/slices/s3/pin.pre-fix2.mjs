// S3 check: the sticky block (the row, and its pinned safety copy from 768px; the phone's alert line below 768px).
// For each patient × size: at the top of the page (not pinned, copy hidden), then scrolled so the row is stuck (pinned),
// then back at the top. Measures the row's height, the copy's, the whole block from the top of the screen, whether any
// allergy is folded or cut (clipped by its box, or outside the copy), what folded into "+N more", sideways scroll.
// Exit 1 on: an allergy folded or cut; the row + copy over 128px at ≥768 for a patient whose allergies alone fit; the
// copy shown at the top of the page or not shown when stuck; the phone line missing an allergy or clipped.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const P = { rich: '7e57a1c0-0000-4000-8000-000000000001', maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e',
  pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const SIZES = (process.env.SIZES_ ?? '1366x768,1440x900,1280x800,1200x800,1024x768,834x1112,768x1024,390x844,360x740').split(',').map((s) => s.split('x').map(Number));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0; const errors = [];
for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: process.env.DARK_ ? 'dark' : 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', process.env.LOGIN_ || 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  for (const [who, id] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);
    const state = () => page.evaluate(() => {
      const top = document.querySelector('[data-ws-top]').getBoundingClientRect();
      const bar = document.querySelector('[data-rec-bar]'); const br = bar.getBoundingClientRect();
      const pin = bar.querySelector('[data-rec-pin]'); const pr = pin.getBoundingClientRect();
      const pinShown = getComputedStyle(pin).display !== 'none' && getComputedStyle(pin).visibility === 'visible';
      const line = bar.querySelector('.rec-pin-line'); const lineShown = !!line && getComputedStyle(line).display !== 'none';
      const head = [...document.querySelectorAll('[data-rec-safety] .ws-chip')].map((c) => c.textContent.trim());
      const allergies = head.filter((t) => t.startsWith('Allergy: ') || t === 'No known allergies' || t === 'Allergies: not asked yet');
      const chips = [...pin.querySelectorAll('.rec-pin-chip')];
      const pinAllergy = chips.filter((c) => allergies.includes(c.textContent.trim()));
      const cut = pinAllergy.filter((c) => { const r = c.getBoundingClientRect(); return c.hidden || c.scrollWidth > c.clientWidth + 1 || r.right > pr.right + 0.5 || r.bottom > pr.bottom + 0.5 || r.left < pr.left - 0.5; }).map((c) => c.textContent.trim());
      const shownPills = chips.filter((c) => !c.hidden).length;
      const more = pin.querySelector('[data-rec-pin-more]');
      const ltext = line ? line.textContent.replace(/\s+/g, ' ').trim() : '';
      const lineMissing = lineShown ? allergies.map((a) => a.replace(/^Allergy: /, '')).filter((a) => !ltext.includes(a.replace(/^Allergies: /, ''))) : [];
      const lineClipped = lineShown && (line.scrollHeight > line.clientHeight + 1 || line.scrollWidth > line.clientWidth + 1);
      return { stuck: br.top <= top.bottom + 1, pinned: bar.hasAttribute('data-pinned'), pinShown, rowH: Math.round(br.height), pinH: Math.round(pr.height),
        block: Math.round((pinShown ? pr.bottom : br.bottom) - top.bottom), fromTop: Math.round(pinShown ? pr.bottom : br.bottom), allergies: allergies.length, pinAllergy: pinAllergy.length, cut,
        pills: chips.length, shownPills, more: more && !more.hidden ? more.textContent : '', lineShown, ltext, lineMissing, lineClipped,
        stick: getComputedStyle(document.documentElement).getPropertyValue('--rec-stick').trim(), side: document.documentElement.scrollWidth - innerWidth };
    });
    const top0 = await state();
    const barY = await page.evaluate(() => document.querySelector('[data-rec-bar]').getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => scrollTo(0, y), barY + 300); await page.waitForTimeout(250);
    const down = await state();
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250);
    const back = await state();
    const phone = w < 768;
    const bad = [];
    if (!phone) {
      if (top0.pinShown || top0.pinned) bad.push('copy shown at the top');
      if (!down.stuck) bad.push('row not stuck after scrolling');
      else if (!down.pinShown) bad.push('copy not shown while stuck');
      if (back.pinShown) bad.push('copy still shown back at the top');
      if (down.pinAllergy !== down.allergies) bad.push(`allergy pills ${down.pinAllergy}/${down.allergies}`);
      if (down.cut.length) bad.push(`allergy cut: ${down.cut.join(', ')}`);
      if (down.rowH + down.pinH > 128 && down.shownPills > down.allergies) bad.push(`row+copy ${down.rowH + down.pinH} > 128 with non-allergy pills still shown`);
      if (down.rowH + down.pinH > 128 && who !== 'pin') bad.push(`row+copy ${down.rowH + down.pinH} > 128`);
    } else {
      if (!top0.lineShown || !down.lineShown) bad.push('phone line missing');
      if (down.lineMissing.length) bad.push(`phone line lacks ${down.lineMissing.join(', ')}`);
      if (down.lineClipped) bad.push('phone line clipped');
      if (down.pinShown) bad.push('copy shown on a phone');
    }
    if (down.side > 0 || top0.side > 0) bad.push(`sideways ${Math.max(down.side, top0.side)}px`);
    fails += bad.length ? 1 : 0;
    console.log(`${w}x${h} ${who.padEnd(6)} ${phone ? `bar ${down.rowH} (line: "${down.ltext.slice(0, 70)}")` : `row ${down.rowH} + copy ${down.pinH} = ${down.rowH + down.pinH}px`}; block from the top ${down.fromTop}px; --rec-stick ${down.stick}; allergies ${down.allergies}, pills ${down.shownPills}/${down.pills}${down.more ? `, "${down.more}"` : ''} ${bad.length ? 'FAIL ' + bad.join('; ') : 'ok'}`);
  }
  await ctx.close();
}
await b.close();
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(fails ? `${fails} failing` : 'all ok');
process.exit(fails || errors.length ? 1 : 0);
