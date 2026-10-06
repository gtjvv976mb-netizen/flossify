import { browser, login, rec } from './lib.mjs';
const b = await browser();
const probe = (page) => page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]'); const sh = document.querySelector('[data-rec-safety]').getBoundingClientRect(); const st = document.querySelector('[data-rec-stuck]').getBoundingClientRect(); const top = document.querySelector('.ws-top, header')?.getBoundingClientRect();
  return { y: Math.round(scrollY), pinned: bar.hasAttribute('data-pinned'), bar: [Math.round(bar.getBoundingClientRect().top), Math.round(bar.getBoundingClientRect().bottom)], safety: [Math.round(sh.top), Math.round(sh.bottom)], stuckMark: Math.round(st.top), topbar: top && Math.round(top.bottom), copy: document.documentElement.dataset.offlineCopy ?? null, stick: getComputedStyle(document.documentElement).getPropertyValue('--rec-stick') }; });
for (const off of [false, true]) {
  const { ctx, page } = await login(b, 'owner', { sw: true, viewport: { width: 1440, height: 900 } });
  await page.goto(rec('maria')); await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.goto(rec('maria', '#rx')); await page.waitForTimeout(800);
  if (off) { await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(900); }
  console.log(off ? 'offline' : 'online', JSON.stringify(await probe(page)));
  await page.mouse.wheel(0, 600); await page.waitForTimeout(600);
  console.log(off ? 'offline+600' : 'online+600', JSON.stringify(await probe(page)));
  await ctx.close();
}
await b.close();
