import { browser, login, rec } from './lib.mjs';
const b = await browser();
for (const [w,h] of [[1440,900],[1366,768],[1024,768],[768,1024]]) for (const p of ['rich','7e57a1c0-0000-4000-8000-000000000301']) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
  await page.goto(rec(p)); await page.waitForTimeout(600);
  const hits = [];
  for (let y = 0; y <= 900; y += 5) {
    await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('[data-rec-bar]'); if (!bar.hasAttribute('data-pinned')) return null;
      const pin = document.querySelector('[data-rec-pin]').getBoundingClientRect();
      const topb = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
      const note = [...document.querySelectorAll('.ws-callout, [role=none]')].find((e) => /Note for the dentist/.test(e.textContent) && !e.closest('[data-rec-bar]'));
      if (!note) return null;
      const n = note.getBoundingClientRect();
      const noteChip = document.querySelector('.rec-pin-note');
      const folded = !noteChip || noteChip.hidden;
      // part of the note visible above the pin (between top bar and pin top) and part covered
      const covered = Math.max(0, Math.min(n.bottom, pin.bottom) - Math.max(n.top, pin.top));
      const visAbove = Math.max(0, Math.min(n.bottom, pin.top) - Math.max(n.top, topb));
      return covered > 0 ? { covered: Math.round(covered), visAbove: Math.round(visAbove), noteH: Math.round(n.height), folded } : null;
    });
    if (r) hits.push({ y, ...r });
  }
  const bad = hits.filter((x) => x.folded);
  console.log(w, h, p.slice(-4), 'scroll positions with the note covered by the copy:', hits.length, 'of which the copy has folded the note:', bad.length, 'y range', hits.length ? `${hits[0].y}-${hits[hits.length-1].y}` : '', JSON.stringify(bad[0] ?? hits[0] ?? null));
  await ctx.close();
}
await b.close();
