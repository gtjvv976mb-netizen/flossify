import { browser, login, rec } from './lib.mjs';
const PTS = { maria: 'maria', ledger: 'ledger', rich: 'rich', pin: '7e57a1c0-0000-4000-8000-000000000301', none: '7e57a1c0-0000-4000-8000-000000000302', ask: '7e57a1c0-0000-4000-8000-000000000303', v6: '7e57a1c0-0000-4000-8000-00000000fc03' };
const SIZES = [[1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [360, 740]];
const b = await browser();
let fails = 0, n = 0;
const report = (ok, msg) => { n++; if (!ok) { fails++; console.log('FAIL', msg); } };
for (const who of ['owner', 'dentist']) for (const scheme of ['light', 'dark']) for (const [w, h] of SIZES) {
  const { ctx, page } = await login(b, who, { viewport: { width: w, height: h }, colorScheme: scheme });
  for (const [k, p] of Object.entries(PTS)) {
    await page.goto('about:blank');
    await page.goto(rec(p)); await page.waitForTimeout(500);
    const first = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(e).visibility !== 'hidden'; };
      const teal = [...document.querySelectorAll('button, a, input[type=submit]')].filter((e) => vis(e) && !e.closest('dialog:not([open])') && !e.closest('[hidden]')).filter((e) => { const bg = getComputedStyle(e).backgroundColor; const m = bg.match(/\d+(\.\d+)?/g); if (!m) return false; const [r, g, bl, a = 1] = m.map(Number); return a > 0.5 && r < 40 && g > 90 && g < 140 && bl > 90 && bl < 140; }).map((e) => e.textContent.trim().slice(0, 30));
      const head = document.querySelector('.rec-back').parentElement;
      const small = [...head.querySelectorAll('a, button, input, select')].filter((e) => vis(e)).map((e) => ({ t: e.textContent.trim().slice(0, 30), r: e.getBoundingClientRect() })).filter((x) => x.r.height < 44 || x.r.width < 24).map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
      const pin = document.querySelector('[data-rec-pin]'), line = document.querySelector('.rec-pin-line');
      const txt = head.innerText + ' ' + (pin?.textContent ?? '') + ' ' + (line?.textContent ?? '');
      return { teal, small, sx: document.documentElement.scrollWidth - innerWidth, money: /₱|Owes|In credit|Nothing owed/.test(txt) };
    });
    report(first.teal.length <= 1, `${who} ${scheme} ${w} ${k} teal on first screen: ${JSON.stringify(first.teal)}`);
    report(first.sx <= 0, `${who} ${scheme} ${w} ${k} sideways scroll ${first.sx}`);
    report(first.small.length === 0, `${who} ${scheme} ${w} ${k} head small targets ${JSON.stringify(first.small)}`);
    if (who === 'dentist') report(!first.money, `${who} ${scheme} ${w} ${k} money words in head/pin`);
    // scrolled: pinned geometry
    for (const y of [300, 700, 1500]) {
      await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const phone = innerWidth < 768;
        const bar = document.querySelector('[data-rec-bar]');
        const pinned = bar.hasAttribute('data-pinned');
        const topb = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
        const bb = bar.getBoundingClientRect();
        if (phone) {
          const l = document.querySelector('.rec-pin-line'); const lr = l.getBoundingClientRect();
          return { phone, pinned, block: Math.round(bb.height), barTop: Math.round(bb.top), topb: Math.round(topb), lineClip: l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1, lineVis: lr.top >= topb - 1 && lr.height > 0, sx: document.documentElement.scrollWidth - innerWidth, text: l.textContent };
        }
        const pin = document.querySelector('[data-rec-pin]'); const pr = pin.getBoundingClientRect();
        const allergies = [...pin.querySelectorAll('.rec-pin-chip')].filter((c) => /Allerg|No known/.test(c.textContent));
        const bad = allergies.filter((c) => { const cr = c.getBoundingClientRect(); return c.hidden || cr.height === 0 || c.scrollWidth > c.clientWidth + 1 || cr.left < pr.left - 1 || cr.right > pr.right + 1 || cr.bottom > pr.bottom + 1; }).map((c) => c.textContent);
        return { phone, pinned, block: Math.round(bb.height + (pinned ? pr.height : 0)), pinTop: Math.round(pr.top), barTop: Math.round(bb.top), topb: Math.round(topb), badAllergy: bad, more: pin.querySelector('[data-rec-pin-more]').hidden ? '' : pin.querySelector('[data-rec-pin-more]').textContent, sx: document.documentElement.scrollWidth - innerWidth };
      });
      const tag = `${who} ${scheme} ${w}x${h} ${k} y=${y}`;
      if (y >= 700) report(r.pinned || r.phone, `${tag} not pinned when scrolled ${JSON.stringify(r)}`);
      report(r.sx <= 0, `${tag} sideways scroll`);
      if (r.phone) report(!r.lineClip && r.lineVis, `${tag} phone line clipped/hidden ${JSON.stringify(r)}`);
      else {
        report(r.badAllergy.length === 0, `${tag} allergy cut ${JSON.stringify(r)}`);
        if (r.pinned) report(Math.abs(r.pinTop - r.topb) <= 1, `${tag} pin not under top bar ${JSON.stringify(r)}`);
        if (r.pinned && w === 1366 && k !== 'pin' && k !== 'v6') report(r.block <= 128, `${tag} block ${r.block} > 128`);
        if (r.pinned && y === 1500) console.log('info', tag, 'block', r.block, r.more);
      }
      if (r.phone && y === 1500 && scheme === 'light' && who === 'owner') console.log('info', tag, 'bar', r.block, r.text);
    }
  }
  await ctx.close();
}
console.log(`${n} checks, ${fails} failing`);
await b.close();
