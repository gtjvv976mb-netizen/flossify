// At each landing and every 10px of scroll: is an allergy on screen, and does the pinned copy or the row ever sit over the tab's content?
import { browser, login, rec } from '/tmp/fl-simple-scratch/verify-S3/r2/lib.mjs';
const ids = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001', pin: '7e57a1c0-0000-4000-8000-000000000301', ask: '7e57a1c0-0000-4000-8000-000000000303' };
const b = await browser();
const probe = (page, tid = null) => page.evaluate((tid) => {
  const topb = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
  const bar = document.querySelector('[data-rec-bar]'), pin = bar.querySelector('[data-rec-pin]');
  const r = bar.getBoundingClientRect(), p = pin.getBoundingClientRect();
  const pinned = bar.hasAttribute('data-pinned') && getComputedStyle(pin).visibility === 'visible' && p.height > 0;
  const head = document.querySelector('[data-rec-safety]').getBoundingClientRect();
  const headWhole = head.top >= topb - 0.5 && head.bottom <= innerHeight;
  const panel = document.querySelector('[data-rec-panel]:not([hidden])');
  // the first line of content in the panel: its first visible element's top (the panel's own box)
  let t = tid ? document.getElementById(tid) : null;
  if (!t || t.matches('.rec-anchor, [data-rec-panel]')) t = panel;
  const pr = t.getBoundingClientRect();
  const overContent = Math.max(0, Math.min(r.bottom, pr.bottom) - pr.top);            // row over the panel's top
  const pinOverRow = pinned ? Math.max(0, p.bottom - r.top - 1) : 0;
  const pinUnderTop = pinned ? Math.max(0, topb - p.top) : 0;
  const allergy = headWhole || pinned || (head.bottom > topb + 4 && head.top < innerHeight);
  return { t: t.id, y: Math.round(scrollY), pinned, allergy, rowTop: Math.round(r.top), topb: Math.round(topb), pinTop: Math.round(p.top), panelTop: Math.round(pr.top), overContent: Math.round(overContent), pinOverRow: Math.round(pinOverRow), pinUnderTop: Math.round(pinUnderTop) };
}, tid);
let fails = 0, cases = 0;
for (const [w, h] of [[1440, 900], [1366, 768], [1024, 768], [768, 1024]]) {
  for (const scheme of ['light', 'dark']) {
    const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h }, colorScheme: scheme });
    for (const [n, id] of Object.entries(ids)) {
      const out = [];
      const land = async (label, tid) => { const r = await probe(page, tid); cases++; const bad = !r.allergy || r.overContent > 0 || r.pinOverRow > 0 || r.pinUnderTop > 0; if (bad) { fails++; out.push(`${label} ${JSON.stringify(r)}`); } return r; };
      for (const hs of ['chart', 'treatment-record', 'patient', 'health', 'treatment', 'files']) {
        await page.goto('about:blank'); await page.goto(rec(id, '#' + hs)); await page.waitForTimeout(600);
        await land('#' + hs, hs);
      }
      for (const t of ['chart', 'treatment-record', 'patient', 'overview']) {
        for (const y0 of [0, 150, 400, 900]) {
          await page.goto('about:blank'); await page.goto(rec(id)); await page.waitForTimeout(350);
          await page.evaluate((y) => scrollTo(0, y), y0); await page.waitForTimeout(150);
          await page.click(`#rec-rec-${t}-tab`); await page.waitForTimeout(400);
          await land(`click ${t} from ${y0}`);
        }
      }
      // free scroll: allergies always on screen; the copy never over the row or under the top bar
      await page.goto('about:blank'); await page.goto(rec(id)); await page.waitForTimeout(400);
      let scrollBad = 0, pinOver = 0, maxRowOver = 0;
      for (let y = 0; y <= 900; y += 10) {
        await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(40);
        const r = await probe(page); cases++;
        if (!r.allergy || r.pinOverRow > 0 || r.pinUnderTop > 0) { scrollBad++; fails++; if (scrollBad < 3) out.push(`scroll ${JSON.stringify(r)}`); }
        maxRowOver = Math.max(maxRowOver, r.overContent);
      }
      console.log(w, scheme, n, out.length ? out.join('\n   ') : 'ok', `| free scroll: row over the panel's top up to ${maxRowOver}px`);
    }
    await ctx.close();
  }
}
console.log('cases', cases, 'failing', fails);
await b.close();
