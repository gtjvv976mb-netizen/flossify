import { browser, login, rec } from './lib.mjs';
const b = await browser();
const PATS = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', pin: '7e57a1c0-0000-4000-8000-000000000301', rich: '7e57a1c0-0000-4000-8000-000000000001', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const sizes = [[1366,768],[1440,900],[1280,800],[1024,768],[800,1280],[768,1024],[767,1024],[390,844]];
let fails = 0;
for (const scheme of ['light','dark']) for (const [w,h] of sizes) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h }, colorScheme: scheme });
  for (const [k, id] of Object.entries(PATS)) for (const tab of ['chart', 'treatment-record']) {
    await page.goto(rec(id, `#${tab}`));
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 1500); await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('[data-rec-bar]');
      const pin = document.querySelector('[data-rec-pin]');
      const line = document.querySelector('.rec-pin-line');
      const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
      const top = document.querySelector('header, .ws-top, [data-ws-top]');
      const pinned = bar.hasAttribute('data-pinned');
      const br = bar.getBoundingClientRect();
      const pr = pin.getBoundingClientRect();
      const chips = [...pin.querySelectorAll('.rec-pin-chip')];
      const allergy = chips.filter((c) => /^Allerg/.test(c.textContent.trim()));
      const clipped = allergy.filter((c) => { if (c.hidden || !vis(c)) return true; const r = c.getBoundingClientRect(); return r.right > pr.right + 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || c.scrollWidth > c.clientWidth + 1; }).map((c) => c.textContent.trim().slice(0, 30));
      const hiddenN = chips.filter((c) => c.hidden).length;
      const more = pin.querySelector('[data-rec-pin-more]');
      const moreN = more && !more.hidden ? Number((more.textContent.match(/\+(\d+)/) || [])[1]) : 0;
      const stickBottom = pinned && vis(pin) ? Math.max(br.bottom, pr.bottom) : br.bottom;
      const lineShown = vis(line);
      const lr = lineShown ? line.getBoundingClientRect() : null;
      const lineClip = lineShown ? (line.scrollWidth > line.clientWidth + 1 || line.scrollHeight > line.clientHeight + 1) : null;
      return { pinned, pinVis: vis(pin), barTop: Math.round(br.top), barH: Math.round(br.height), pinH: Math.round(pr.height), block: Math.round(stickBottom - br.top), clipped, hiddenN, moreN, lineShown, lineH: lr && Math.round(lr.height), lineClip, sideways: document.documentElement.scrollWidth > innerWidth, y: Math.round(scrollY) };
    });
    const bad = [];
    if (w >= 768) { if (!r.pinned || !r.pinVis) bad.push('not pinned'); if (r.clipped.length) bad.push('allergy clipped ' + r.clipped); if (r.hiddenN !== r.moreN) bad.push('more count'); if (w===1366 && h===768 && r.block > 128 && k !== 'pin') bad.push('block>128'); }
    else { if (!r.lineShown) bad.push('no line'); if (r.lineClip) bad.push('line clipped'); }
    if (r.sideways) bad.push('sideways');
    if (bad.length) fails++;
    console.log(scheme, `${w}x${h}`, k, tab, JSON.stringify(r), bad.length ? 'FAIL ' + bad.join(',') : 'ok');
  }
  await ctx.close();
}
console.log('fails', fails);
await b.close();
