// Reproduce the first focus2 run's palette part, logging every POST (which form, what it posted) and what was clicked.
import { browser, login, rec, state, db } from './lib.mjs';
const b = await browser();
const c = await db();
const plan = async () => (await c.query(`select name, status from treatment_plan_item where patient_id = $1 order by created_at, name`, ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb'])).rows.map((r) => `${r.name}:${r.status}`).join(', ');
console.log('start', await plan());
for (const vw of [{ width: 1440, height: 900 }]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/patients/')) console.log('   POST', r.url().slice(-40), (r.postData() || '').replace(/_csrf=[^&]+&?/, '').slice(0, 200)); });
  for (const [panel, fdi] of [['rec-plan-add', '26'], ['rec-done-add', '36'], ['rec-note-add', '46']]) {
    for (const how of ['close-button', 'escape', 'scrim']) {
      await page.goto(rec('maria', '#chart'), { waitUntil: 'load' }); await page.waitForTimeout(400);
      const u0 = page.url();
      await page.click(`[data-odontogram] button[data-tooth][data-fdi="${fdi}"]`); await page.waitForTimeout(400);
      const btn = page.locator(`[data-pick-open="${panel}"]:visible`).first();
      await btn.click(); await page.waitForTimeout(450);
      const what = await page.evaluate((panel) => { const d = document.getElementById(panel); const forms = [...d.querySelectorAll('form')].filter((f) => f.getClientRects().length).map((f) => f.querySelector('[name=intent]')?.value + (f.dataset.planFdi ? `@${f.dataset.planFdi}` : '')); return { open: d.open, forms }; }, panel);
      if (how === 'close-button') await page.locator(`#${panel} [data-ws-close]:visible`).first().click();
      else if (how === 'escape') await page.keyboard.press('Escape');
      else { const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}#${e?.id}.${(e?.className || '').toString().slice(0, 40)} "${(e?.textContent || '').trim().slice(0, 30)}"`; }, [5, vw.height - 5]); console.log('   scrim point hits', hit); await page.mouse.click(5, vw.height - 5); }
      await page.waitForTimeout(500);
      const st = await state(page);
      console.log(`${panel} ${fdi} ${how}: url0=${u0.slice(-30)} forms=${JSON.stringify(what)} → ${JSON.stringify(st)} | plan: ${await plan()}`);
    }
  }
  await ctx.close();
}
await c.end(); await b.close();
