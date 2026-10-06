// The real flow: Edit details → Save (name kept, a note changed) and a birth-date change, at 4 sizes: the callout on screen and not covered.
import { browser, login, rec, db } from '/tmp/fl-simple-scratch/verify-S3/r4/lib.mjs';
const b = await browser(); const c = await db();
const [{ birth, notes }] = (await c.query(`select birth_date::text birth, notes from patient where id=$1`, ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb'])).rows;
let bad = 0;
for (const [w, h] of [[1440, 900], [1366, 768], [1024, 768], [390, 844]]) for (const kind of ['details', 'birth']) {
  const { ctx, page } = await login(b, 'owner', { viewport: { width: w, height: h } });
  await page.goto(rec('maria')); await page.waitForTimeout(400);
  await page.evaluate(() => scrollTo(0, 400));
  await page.click('.rec-actions [data-ws-open=details]'); await page.waitForTimeout(300);
  if (kind === 'birth') await page.fill('#rec-birth', w % 2 ? '1988-02-03' : '1988-02-04');
  else { const n = page.locator('#details [data-rec-details-notes]'); await n.fill(`Note ${w}`); }
  await Promise.all([page.waitForNavigation(), page.locator('#details button[type=submit]').last().click()]);
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => { const e = document.querySelector('[data-rec-said]'); const b = e?.getBoundingClientRect(); const topb = document.querySelector('[data-ws-top]').getBoundingClientRect().bottom;
    const at = b && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { url: location.search + location.hash, text: e?.innerText.slice(0, 40), top: b && Math.round(b.top), bot: b && Math.round(b.bottom), ok: !!b && b.top >= topb && b.bottom <= innerHeight && !!at && e.contains(at) }; });
  if (!r.ok) bad++;
  console.log(r.ok ? 'ok ' : 'BAD', w, h, kind, JSON.stringify(r));
  await ctx.close();
}
await c.query(`update patient set birth_date=$2, notes=$3 where id=$1`, ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', birth, notes]);
console.log('failing', bad); await c.end(); await b.close();
