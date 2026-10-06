// Verifier: behaviours the frame could break. node behave.mjs
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%' or key like 'record:%'`);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const fails = [];
const ok = (cond, what, got) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${cond ? '' : ` — got ${JSON.stringify(got)}`}`); if (!cond) fails.push({ what, got }); };
async function ctxFor(email, w = 1440, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fails.push({ what: 'page error', got: String(e) }));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  return { ctx, page };
}
const fresh = async (page, url) => { await page.goto('about:blank'); return page.goto(url, { waitUntil: 'load' }); };
const S = (id, qs = '') => `${BASE}/c/session-road/patients/${id}/${qs}`;
const STATE = () => {
  const sel = document.querySelector('[role="tab"][aria-selected="true"][id^="rec-rec-"]');
  const ae = document.activeElement;
  const bar = document.querySelector('[data-rec-bar]')?.getBoundingClientRect();
  return { tab: sel?.id.replace(/^rec-rec-|-tab$/g, ''), dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), url: location.search + location.hash,
    focus: ae ? `${ae.tagName.toLowerCase()}${ae.id ? '#' + ae.id : ''}${ae.dataset?.fdi ? '[fdi=' + ae.dataset.fdi + ']' : ''}${ae.className && typeof ae.className === 'string' ? '.' + ae.className.split(' ')[0] : ''}` : null,
    barBottom: bar ? Math.round(bar.bottom) : null, scrollY: Math.round(scrollY) };
};
const elTop = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), vis: e.getClientRects().length > 0 && !e.closest('[hidden]') }; };

// 1. Hash landings: the element is shown, in the tab shown, and not under the sticky row.
for (const [w, h] of [[1440, 900], [390, 844], [1366, 768], [820, 1180]]) {
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com', w, h);
  for (const [pid, hash] of [['maria', 'rx'], ['maria', 'letters'], ['maria', 'money'], ['maria', 'treatment'], ['maria', 'health'], ['maria', 'vitals'], ['maria', 'consent'], ['maria', 'consent-paper'], ['maria', 'consent-forms'], ['maria', 'visit-consents'], ['maria', 'recall'], ['maria', 'visits'], ['maria', 'files'], ['maria', 'notes'], ['maria', 'texts'], ['maria', 'treatment-done'], ['rich', 'treatment-lab'], ['rich', 'loas'], ['maria', 'this-visit'], ['maria', 'treatment-record'], ['maria', 'chart'], ['maria', 'patient'], ['maria', 'overview']]) {
    await fresh(page, S(P[pid], `#${hash}`)); await page.waitForTimeout(500);
    const st = await page.evaluate(STATE); const el = await page.evaluate(elTop, hash);
    const good = el && el.vis && el.top >= st.barBottom - 1 && el.top < h;
    ok(good, `${w} #${hash} lands under the row (tab ${st.tab})`, { el, barBottom: st.barBottom, tab: st.tab });
  }
  // head tiles and chips
  await fresh(page, S(P.maria)); await page.waitForTimeout(400);
  for (const href of ['#money', '#consent']) {
    await fresh(page, S(P.maria)); await page.waitForTimeout(300);
    await page.click(`.pt-tiles a[href="${href}"]`); await page.waitForTimeout(500);
    const st = await page.evaluate(STATE); const el = await page.evaluate(elTop, href.slice(1));
    ok(el?.vis && st.tab === (href === '#money' ? 'treatment-record' : 'patient') && el.top >= st.barBottom - 1 && el.top < h, `${w} tile ${href} → its tab, under the row`, { st, el });
  }
  await ctx.close();
}

// 2. Keyboard on the tabs and Add ▾.
{
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com');
  await fresh(page, S(P.maria)); await page.waitForTimeout(400);
  await page.focus('#rec-rec-overview-tab');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  let st = await page.evaluate(STATE); ok(st.tab === 'patient' && st.focus.startsWith('button#rec-rec-patient-tab'), 'ArrowRight → Patient info, focused', st);
  await page.keyboard.press('End'); await page.waitForTimeout(200);
  st = await page.evaluate(STATE); ok(st.tab === 'treatment-record', 'End → Treatment record', st);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  st = await page.evaluate(STATE); ok(st.tab === 'overview', 'ArrowRight wraps → Today', st);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
  st = await page.evaluate(STATE); ok(st.tab === 'treatment-record', 'ArrowLeft wraps → Treatment record', st);
  // Tab key from the selected tab goes to Add ▾ (one tab stop in the tablist)
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  st = await page.evaluate(STATE); ok(/rec-add|button/.test(st.focus) && (await page.evaluate(() => document.activeElement.closest('.rec-add') !== null)), 'Tab from the tablist → Add ▾', st);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const menu = await page.evaluate(() => { const pop = document.querySelector('.rec-add .ws-menu-pop'); return { open: pop && !pop.hidden, items: [...document.querySelectorAll('.rec-add .ws-menu-item')].map((e) => { const r = e.getBoundingClientRect(); return [e.innerText.split('\n')[0], Math.round(r.width), Math.round(r.height)]; }), focus: document.activeElement?.innerText?.split('\n')[0] }; });
  ok(menu.open && menu.items.every(([, w, h]) => w >= 44 && h >= 44), `Add ▾ opens with Enter; ${menu.items.length} items ≥44px`, menu);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  st = await page.evaluate(STATE); const closed = await page.evaluate(() => document.querySelector('.rec-add .ws-menu-pop').hidden);
  ok(closed && (await page.evaluate(() => !!document.activeElement.closest('.rec-add'))), 'Escape closes Add ▾, focus on its button', st);
  // Add ▾ › Prescription over Treatment record, close with Escape → focus back to Add ▾, tab kept
  await page.click('.rec-add-btn'); await page.waitForTimeout(200);
  await page.click('.rec-add [data-ws-open="rec-rx-add"]'); await page.waitForTimeout(400);
  st = await page.evaluate(STATE);
  const back = await page.evaluate(() => { const i = document.querySelector('#rec-rx-add input[name=back]'); return [i?.value, i?.form?.action.split('#')[1]]; });
  ok(st.dialogs.includes('rec-rx-add') && st.tab === 'treatment-record' && back[0] === 'treatment-record' && back[1] === 'treatment-record', 'Add ▾ › Prescription opens over Treatment record with back=treatment-record', { st, back });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  st = await page.evaluate(STATE); ok(!st.dialogs.length && (await page.evaluate(() => !!document.activeElement.closest('.rec-add'))), 'Escape → focus back on Add ▾', st);
  await ctx.close();
}

// 3. Palette: Add to plan / Treatment done / Clinical note from a tooth; close → focus back to the tooth. And a refused
//    plan-add from the palette reopens over Chart & plan and gives focus back to the tooth.
{
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com');
  for (const [label, dlg] of [['Add to plan', 'rec-plan-add'], ['Treatment done', 'rec-done-add'], ['Clinical note', 'rec-note-add']]) {
    await fresh(page, S(P.maria, '#chart')); await page.waitForTimeout(500);
    await page.click('[data-odontogram] button[data-tooth][data-fdi="26"]'); await page.waitForTimeout(300);
    const opener = await page.evaluate((dlg) => { const e = [...document.querySelectorAll('[data-pick-open]')].find((x) => x.getAttribute('data-pick-open') === dlg && x.getClientRects().length); if (e) { e.click(); return e.innerText.trim(); } return null; }, dlg);
    await page.waitForTimeout(400);
    let st = await page.evaluate(STATE);
    const back = await page.evaluate((dlg) => { const f = [...document.querySelectorAll(`#${dlg} form`)].find((f) => f.querySelector('input[name=back]') && !f.hidden && !f.dataset.planFdi); return f ? [f.querySelector('input[name=back]').value, f.action.split('#')[1]] : null; }, dlg);
    ok(opener && st.dialogs.includes(dlg) && st.tab === 'chart' && back?.[0] === 'chart' && back?.[1] === 'chart', `palette ${label} opens over chart, back=chart`, { opener, st, back });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    st = await page.evaluate(STATE); ok(st.focus?.includes('fdi=26'), `palette ${label}: Escape → tooth 26`, st);
  }
  // refused from the palette: plan-add with no catalog and no name
  await fresh(page, S(P.maria, '#chart')); await page.waitForTimeout(500);
  await page.click('[data-odontogram] button[data-tooth][data-fdi="36"]'); await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('[data-pick-open="rec-plan-add"]')].find((x) => x.getClientRects().length).click()); await page.waitForTimeout(400);
  await page.evaluate(() => { const f = document.querySelector('#rec-plan-add form[data-pick-form]'); f.noValidate = true; f.querySelectorAll('[required]').forEach((x) => x.removeAttribute('required')); const s = f.querySelector('select[name=catalog_id]'); if (s) s.value = ''; const n = f.querySelector('[name=name]'); if (n) n.value = ''; });
  await Promise.all([page.waitForNavigation(), page.evaluate(() => document.querySelector('#rec-plan-add form[data-pick-form]').requestSubmit())]);
  await page.waitForTimeout(600);
  let st = await page.evaluate(STATE);
  const txt = await page.evaluate(() => document.querySelector('#rec-plan-add')?.innerText.slice(0, 160));
  ok(st.tab === 'chart' && st.dialogs.includes('rec-plan-add'), 'refused palette plan-add reopens over Chart & plan', { st, txt });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  st = await page.evaluate(STATE); ok(st.focus?.includes('fdi=36'), 'refused palette plan-add: Escape → tooth 36', st);
  await ctx.close();
}

// 4. Refused Edit details from each tab: comes back over that tab, panel open with its problems.
{
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com');
  for (const tab of ['overview', 'patient', 'chart', 'treatment-record']) {
    await fresh(page, S(P.maria, `#${tab}`)); await page.waitForTimeout(400);
    await page.click('.rec-actions [data-ws-open="details"]'); await page.waitForTimeout(300);
    await page.evaluate(() => { const f = document.querySelector('#details form'); f.noValidate = true; f.querySelector('[name=last_name]').removeAttribute('required'); f.querySelector('[name=last_name]').value = ''; });
    await Promise.all([page.waitForNavigation(), page.evaluate(() => document.querySelector('#details form').requestSubmit())]);
    await page.waitForTimeout(500);
    const st = await page.evaluate(STATE);
    const probs = await page.evaluate(() => document.querySelector('#details .ws-callout')?.innerText.slice(0, 80));
    ok(st.tab === tab && st.dialogs.includes('details') && !!probs, `refused details from ${tab} reopens over ${tab}`, { st, probs });
  }
  await ctx.close();
}

// 5. Offline: Add ▾ hidden offline, back online; palette actions hidden offline.
{
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com');
  await fresh(page, S(P.maria, '#chart')); await page.waitForTimeout(500);
  await ctx.setOffline(true); await page.waitForTimeout(300);
  const off = await page.evaluate(() => ({ add: document.querySelector('.rec-add')?.hidden, addVisible: !!document.querySelector('.rec-add')?.getClientRects().length }));
  await page.click('[data-odontogram] button[data-tooth][data-fdi="26"]'); await page.waitForTimeout(300);
  const pal = await page.evaluate(() => [...document.querySelectorAll('[data-pick-open]')].filter((x) => x.getClientRects().length).length);
  ok(off.add && !off.addVisible && pal === 0, 'offline: Add ▾ hidden, palette actions hidden', { off, pal });
  await ctx.setOffline(false); await page.waitForTimeout(300);
  const on = await page.evaluate(() => !!document.querySelector('.rec-add')?.getClientRects().length);
  ok(on, 'online again: Add ▾ back', on);
  await ctx.close();
}

// 6. The dentist without billing: no Money anywhere, no New charge / payment plan in Add ▾, #money → Treatment record top.
{
  const { ctx, page } = await ctxFor('hazel.tabanao@example.com');
  await fresh(page, S(P.maria, '#money')); await page.waitForTimeout(400);
  const st = await page.evaluate(STATE);
  const add = await page.evaluate(() => [...document.querySelectorAll('.rec-add .ws-menu-item')].map((e) => e.innerText.split('\n')[0]));
  const money = await page.evaluate(() => ({ money: !!document.getElementById('money'), charge: !!document.querySelector('a[href*="finances/new"]'), payplan: !!document.getElementById('rec-payplan-add') }));
  ok(st.tab === 'treatment-record' && !money.money && !money.charge && !money.payplan && !add.some((x) => /charge|payment plan/i.test(x)), 'dentist: no Money, no charge, no payment plan; #money → Treatment record', { st, add, money });
  await ctx.close();
}

// 7. Rich: head chips go to their tab; a waiting LOA / plan behind / BP / clearance.
{
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com');
  await fresh(page, S(P.rich)); await page.waitForTimeout(400);
  const chips = await page.evaluate(() => [...document.querySelectorAll('.rec-alerts [data-rec-go]')].map((e, i) => [i, e.dataset.recGo, e.innerText.trim()]));
  for (const [i, go, t] of chips) {
    await fresh(page, S(P.rich)); await page.waitForTimeout(300);
    await page.evaluate((i) => document.querySelectorAll('.rec-alerts [data-rec-go]')[i].click(), i); await page.waitForTimeout(500);
    const st = await page.evaluate(STATE); const el = await page.evaluate(elTop, go);
    const want = { health: 'patient', rx: 'treatment-record', treatment: 'chart' }[go];
    ok(st.tab === want && (!el || (el.vis && el.top >= st.barBottom - 1)), `chip "${t}" → ${want}, #${go} under the row`, { st, el });
  }
  await ctx.close();
}

// 8. The Add ▾ menu at 390: fits the screen, items ≥44, and the menu does not run under the bottom.
{
  const { ctx, page } = await ctxFor('liwayway.domingo@example.com', 390, 844);
  await fresh(page, S(P.maria)); await page.waitForTimeout(400);
  await page.click('.rec-add-btn'); await page.waitForTimeout(400);
  const m = await page.evaluate(() => { const pop = document.querySelector('.rec-add .ws-menu-pop'); const r = pop.getBoundingClientRect(); const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), sh: pop.scrollHeight, ch: pop.clientHeight, barBottom: Math.round(bar.bottom), sw: document.documentElement.scrollWidth, items: [...pop.querySelectorAll('.ws-menu-item')].map((e) => Math.round(e.getBoundingClientRect().height)) }; });
  ok(m.bottom <= 844 && m.left >= 0 && m.right <= 390 && m.sw <= 390 && m.items.every((x) => x >= 44), '390: Add ▾ fits the screen', m);
  await ctx.close();
}

await b.close(); await db.end();
console.log(`\n${fails.length} failing`);
for (const f of fails) console.log('  ', f.what, JSON.stringify(f.got).slice(0, 300));
