// Focus after a panel closes: palette panels closed by their Close button and by Escape (1440, 390), a palette
// panel refused and reopened by the server, and every Add ▾ panel refused over each tab, then closed.
import { browser, login, rec, state } from './lib.mjs';
const b = await browser();
const active = (page) => page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; const r = a.getBoundingClientRect(); return `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.dataset?.fdi ? `[fdi=${a.dataset.fdi}]` : ''}${a.classList.contains('rec-add-btn') ? '.rec-add-btn' : ''}${a.dataset?.wsOpen ? `[open=${a.dataset.wsOpen}]` : ''} "${(a.textContent || '').trim().slice(0, 30)}" vis=${a.getClientRects().length > 0} y=${Math.round(r.top)}`; });
const res = [];
const say = (ok, what, got) => { res.push({ ok, what, got }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${got ? ' — ' + got : ''}`); };
for (const vw of process.env.SKIP_PAL ? [] : [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  for (const [panel, fdi] of [['rec-plan-add', '26'], ['rec-done-add', '36'], ['rec-note-add', '46']]) {
    for (const how of vw.width > 800 ? ['close-button', 'escape', 'scrim'] : ['close-button', 'escape']) {
      await page.goto(rec('maria', '#chart'), { waitUntil: 'load' }); await page.waitForTimeout(400);
      await page.click(`[data-odontogram] button[data-tooth][data-fdi="${fdi}"]`); await page.waitForTimeout(400);
      const btn = page.locator(`[data-pick-open="${panel}"]:visible`).first();
      if (!(await btn.count())) { say(false, `${vw.width} palette ${panel} ${fdi}`, 'no visible palette button'); continue; }
      await btn.click(); await page.waitForTimeout(450);
      if (how === 'close-button') await page.locator(`#${panel} [data-ws-close]:visible`).first().click();
      else if (how === 'escape') await page.keyboard.press('Escape');
      else { const box = await page.locator(`#${panel}`).boundingBox(); await page.mouse.click(5, vw.height - 5); }
      await page.waitForTimeout(500);
      const a = await active(page);
      const st = await state(page);
      say(a.startsWith(`button[fdi=${fdi}]`) && st.dialogs.length === 0, `${vw.width} palette ${panel} tooth ${fdi} closed by ${how} → tooth`, a);
    }
  }
  // A palette panel refused: Add to plan on 26 with no name → the server draws it open over the chart; close → tooth.
  {
    await page.goto(rec('maria', '#chart'), { waitUntil: 'load' }); await page.waitForTimeout(400);
    await page.click(`[data-odontogram] button[data-tooth][data-fdi="26"]`); await page.waitForTimeout(400);
    await page.locator(`[data-pick-open="rec-plan-add"]:visible`).first().click(); await page.waitForTimeout(400);
    await page.evaluate(() => { const f = document.querySelector('#rec-plan-add form[data-pick-form]'); f.querySelectorAll('[required]').forEach((x) => x.removeAttribute('required')); f.noValidate = true; f.querySelectorAll('select[name=catalog], [data-fee-pick]').forEach((s) => { s.value = ''; }); const n = f.querySelector('input[name=name]'); if (n) n.value = ''; });
    await Promise.all([page.waitForNavigation(), page.evaluate(() => document.querySelector('#rec-plan-add form[data-pick-form]').requestSubmit())]);
    await page.waitForTimeout(600);
    const st = await state(page);
    const back = await page.evaluate(() => document.querySelector('#rec-plan-add input[name=back]')?.value);
    say(st.tab === 'chart' && st.dialogs.includes('rec-plan-add') && back === 'chart', `${vw.width} palette Add to plan refused → over chart, back=chart`, JSON.stringify({ ...st, back }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const a = await active(page);
    say(a.startsWith('button[fdi=26]'), `${vw.width} refused palette panel closed → tooth 26`, a);
  }
  await ctx.close();
}
// Add ▾ panels refused over each tab, then closed: where does focus go?
const REFUSE = {
  'rec-vitals-add': (f) => { f.querySelectorAll('input').forEach((i) => { if (['sys', 'dia', 'pulse'].includes(i.name)) i.value = ''; }); },
  'rec-rx-add': (f) => { f.querySelectorAll('input[name=drug]').forEach((i) => { i.value = ''; }); },
  'rec-letter-add': (f) => { const t = f.querySelector('textarea'); if (t) t.value = ''; f.querySelectorAll('input[type=date]').forEach((i) => { i.value = '1900-01-01'; }); },
  'rec-lab-add': (f) => { f.querySelectorAll('input[type=text], input:not([type])').forEach((i) => { if (i.name !== 'back') i.value = ''; }); },
  'rec-file-add': () => {},
  'rec-loa-add': (f) => { f.querySelectorAll('select').forEach((s) => { s.value = ''; }); },
  'rec-plan-add': (f) => { f.querySelectorAll('select').forEach((s) => { s.value = ''; }); const n = f.querySelector('input[name=name]'); if (n) n.value = ''; },
  'rec-done-add': (f) => { f.querySelectorAll('select').forEach((s) => { s.value = ''; }); const n = f.querySelector('input[name=name]'); if (n) n.value = ''; },
  'rec-note-add': (f) => { f.querySelectorAll('textarea').forEach((t) => { t.value = ''; }); },
};
for (const vw of [{ width: 1440, height: 900 }]) {
  const { ctx, page } = await login(b, 'owner', { viewport: vw });
  for (const tab of ['overview', 'patient', 'chart', 'treatment-record']) {
    for (const [panel, spoil] of Object.entries(REFUSE)) {
      await page.goto('about:blank'); await page.goto(rec('maria', `#${tab}`), { waitUntil: 'load' }); await page.waitForTimeout(300);
      await page.click('.rec-add-btn'); await page.waitForTimeout(200);
      await page.click(`#rec-add [data-ws-open="${panel}"]`); await page.waitForTimeout(400);
      await page.evaluate(([panel, src]) => { const f = document.querySelector(`#${panel} input[name=intent][value="${panel.replace(/^rec-/, '')}"]`).form; f.querySelectorAll('[required]').forEach((x) => x.removeAttribute('required')); f.noValidate = true; (0, eval)(`(${src})`)(f); }, [panel, spoil.toString()]);
      await Promise.all([page.waitForNavigation(), page.evaluate((panel) => document.querySelector(`#${panel} input[name=intent][value="${panel.replace(/^rec-/, '')}"]`).form.requestSubmit(), panel)]);
      await page.waitForTimeout(500);
      const st = await state(page);
      const reopened = st.dialogs.includes(panel);
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      const a = await active(page);
      say(reopened && st.tab === tab && a !== 'BODY' && a.includes('vis=true'), `refused ${panel} over ${tab} (from Add ▾), reopened=${reopened} tab=${st.tab}; closed → focus`, a);
    }
  }
  await ctx.close();
}
await b.close();
console.log(res.filter((r) => !r.ok).length, 'failing of', res.length);
