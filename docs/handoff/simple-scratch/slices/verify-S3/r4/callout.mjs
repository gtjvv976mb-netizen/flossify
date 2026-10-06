import { browser, login, rec, P } from './lib.mjs';
const b = await browser();
const cases = (process.env.CASES_ || '?saved=details#overview|?stale=1#overview').split('|');
for (const [w, h] of [[1440, 900], [1366, 768], [1024, 768], [390, 844]]) for (const scheme of ['light']) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h }, colorScheme: scheme });
  for (const pt of ['maria', '7e57a1c0-0000-4000-8000-00000000fc03', '7e57a1c0-0000-4000-8000-000000000301']) for (const c of cases) {
    await page.goto('about:blank');
    await page.goto(rec(pt, c)); await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const callouts = [...document.querySelectorAll('.ws-callout, [class*=callout]')].filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('dialog') && /saved|Saved|stale|expired|page/i.test(e.textContent));
      const top = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
      const bar = document.querySelector('[data-rec-bar]'); const bb = bar.getBoundingClientRect();
      const pin = document.querySelector('[data-rec-pin]'); const pinned = bar.hasAttribute('data-pinned');
      const pb = pinned ? pin.getBoundingClientRect() : null;
      const coverTop = pinned ? Math.min(pb.top, bb.top) : bb.top;
      return { scrollY, pinned, sel: document.querySelector('[role=tab][aria-selected=true]').id, callouts: callouts.map((e) => { const r = e.getBoundingClientRect(); const cx = r.left + 20, cy = r.top + r.height / 2; const at = document.elementFromPoint(cx, cy); return { t: e.textContent.trim().slice(0, 40), top: Math.round(r.top), bot: Math.round(r.bottom), visible: r.bottom > top && r.top < innerHeight, hitOwn: !!at && e.contains(at) }; }) };
    });
    const bad = r.callouts.length === 0 || r.callouts.some((c) => !c.visible || !c.hitOwn);
    console.log(bad ? 'BAD ' : 'ok  ', w, h, pt.slice(-4), c, JSON.stringify(r));
  }
  await ctx.close();
}
await b.close();
