// S2 checks in the browser: the palette hands focus back to the tooth; Add ▾ gets focus back when its panel closes (and
// the arrow keys walk it); the kept copy opens on Chart & plan with Add ▾ hidden; offline hides Add ▾ and online shows
// it again; a tab chosen scrolls only when needed. node focus.mjs
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
import pg from '/home/user/fl-simple/node_modules/pg/lib/index.js';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const REC = `${BASE}/c/session-road/patients/${MARIA}/`;
const db = new pg.Client({ host: '/var/run/postgresql', user: 'root', database: 'flossify_simple' }); await db.connect();
await db.query(`delete from throttle where key like 'login:%'`); await db.end();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
const say = (ok, what, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); };
async function signed(w = 1440, h = 900) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  return { ctx, page, errs };
}
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.dataset?.fdi ? `[fdi=${a.dataset.fdi}]` : ''}${a.classList.contains('rec-add-btn') ? '.rec-add-btn' : ''}` : null; });

// 1. The palette: open a tooth, press Add to plan / Treatment done / Clinical note, close with Escape → the tooth.
{
  const { ctx, page, errs } = await signed();
  for (const [panel, fdi] of [['rec-plan-add', '26'], ['rec-done-add', '36'], ['rec-note-add', '46']]) {
    await page.goto(`${REC}#chart`, { waitUntil: 'load' }); await page.waitForTimeout(400);
    await page.click(`[data-odontogram] button[data-tooth][data-fdi="${fdi}"]`);
    await page.waitForTimeout(500);
    const btn = page.locator(`[data-palette] [data-pick-open="${panel}"]`);
    await btn.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    if (!(await btn.isVisible())) { say(false, `palette ${panel} on ${fdi}`, 'the palette action is not shown'); continue; }
    await btn.click(); await page.waitForTimeout(400);
    const st = await page.evaluate((panel) => { const d = document.getElementById(panel); const f = d?.querySelector('form[data-pick-form], form'); return { open: d?.open, back: f?.querySelector('input[name=back]')?.value, hash: f ? new URL(f.action).hash : null }; }, panel);
    say(st.open && st.back === 'chart' && st.hash === '#chart', `palette → ${panel} on tooth ${fdi} opens with back=chart, #chart`, JSON.stringify(st));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const a = await active(page);
    say(a === `button[fdi=${fdi}]`, `closing ${panel} gives focus back to tooth ${fdi}`, a);
  }
  say(!errs.length, 'no page errors (palette)', errs.join(' | '));
  await ctx.close();
}

// 2. Add ▾: its items open panels over the tab in view; closing one gives focus back to Add ▾; arrow keys walk it.
{
  const { ctx, page, errs } = await signed();
  for (const tab of ['overview', 'patient', 'chart', 'treatment-record']) {
    await page.goto(`${REC}#${tab}`, { waitUntil: 'load' }); await page.waitForTimeout(300);
    await page.click('.rec-add-btn'); await page.waitForTimeout(250);
    const items = await page.evaluate(() => [...document.querySelectorAll('#rec-add .ws-menu-item')].map((i) => [i.getAttribute('data-ws-open') ?? i.getAttribute('href'), (i.querySelector('.ws-menu-words')?.firstChild?.textContent ?? '').trim(), Math.round(i.getBoundingClientRect().height)]));
    if (tab === 'overview') console.log('     Add ▾ items:', items.map((i) => `${i[1]} (${i[2]}px)`).join(' · '));
    say(items.every((i) => i[2] >= 44), `Add ▾ items are at least 44px (${tab})`, items.filter((i) => i[2] < 44).map((i) => i[1]).join(', '));
    await page.click('#rec-add [data-ws-open="rec-rx-add"]'); await page.waitForTimeout(400);
    const st = await page.evaluate(() => { const d = document.getElementById('rec-rx-add'); const f = d.querySelector('form'); const sel = document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]'); return { open: d.open, back: f.querySelector('input[name=back]').value, hash: new URL(f.action).hash, tab: sel.id.replace(/^rec-rec-|-tab$/g, '') }; });
    say(st.open && st.back === tab && st.hash === `#${tab}` && st.tab === tab, `Add ▾ › Prescription over ${tab}: back=${tab}, #${tab}, the tab stays`, JSON.stringify(st));
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    const a = await active(page);
    say(a === 'button.rec-add-btn', `closing it gives focus back to Add ▾ (${tab})`, a);
  }
  // Keyboard: Add ▾ opens with the down arrow on its first item; Escape closes it back onto the button.
  await page.goto(REC, { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.focus('.rec-add-btn'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
  const first = await page.evaluate(() => document.activeElement?.closest('#rec-add') ? (document.activeElement.textContent ?? '').trim().slice(0, 20) : null);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  const second = await page.evaluate(() => (document.activeElement?.textContent ?? '').trim().slice(0, 20));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  say(!!first && second !== first && (await active(page)) === 'button.rec-add-btn', 'Add ▾ by keyboard: ↓ opens on the first item, ↓ moves, Escape returns to the button', `${first} → ${second}`);
  // The tabs by keyboard: → and ← move between the four, Home and End.
  await page.focus('#rec-rec-overview-tab');
  const order = [];
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'End', 'Home']) { await page.keyboard.press(k); await page.waitForTimeout(80); order.push((await page.evaluate(() => document.activeElement?.id ?? '')).replace(/^rec-rec-|-tab$/g, '')); }
  say(order.join(' ') === 'patient chart treatment-record overview treatment-record treatment-record overview', 'tabs by keyboard: → → → → ← End Home', order.join(' '));
  say(!errs.length, 'no page errors (Add ▾)', errs.join(' | '));
  await ctx.close();
}

// 3. The kept copy: opens on Chart & plan, Add ▾ hidden. 4. Offline: Add ▾ hidden, and back when online.
{
  const { ctx, page, errs } = await signed();
  await page.route((u) => u.pathname === `/c/session-road/patients/${MARIA}/`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/<html\b/i, `<html data-offline-copy="${Date.now()}"`) });
  });
  await page.goto(REC, { waitUntil: 'load' }); await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ tab: document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]')?.id, addHidden: document.querySelector('.rec-add')?.hidden, addShown: document.querySelector('.rec-add')?.getClientRects().length }));
  say(st.tab === 'rec-rec-chart-tab' && st.addHidden && !st.addShown, 'the kept copy opens on Chart & plan, Add ▾ hidden', JSON.stringify(st));
  await page.unrouteAll();
  await page.goto(REC, { waitUntil: 'load' }); await page.waitForTimeout(300);
  const on1 = await page.evaluate(() => !document.querySelector('.rec-add').hidden);
  await ctx.setOffline(true); await page.waitForTimeout(300);
  const off = await page.evaluate(() => document.querySelector('.rec-add').hidden);
  await ctx.setOffline(false); await page.waitForTimeout(300);
  const on2 = await page.evaluate(() => !document.querySelector('.rec-add').hidden);
  say(on1 && off && on2, 'Add ▾ hides offline and comes back online', JSON.stringify({ on1, off, on2 }));
  say(!errs.length, 'no page errors (offline)', errs.join(' | '));
  await ctx.close();
}

// 5. A tab chosen scrolls only when needed: with its top on screen under the row nothing moves; scrolled down (its top
// under the row) or too low to see, it starts just under the row. Pressed as a person does (element.click(): Playwright's
// own click scrolls the page to the button first).
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { ctx, page } = await signed(w, h);
  const press = (id) => page.evaluate((id) => document.getElementById(id).click(), id);
  const at = () => page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const p = document.querySelector('[data-rec-panel]:not([hidden])').getBoundingClientRect(); return { y: Math.round(scrollY), barBottom: Math.round(bar.bottom), tab: Math.round(p.top), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  await page.goto(REC, { waitUntil: 'load' }); await page.waitForTimeout(300);
  // Scroll just enough that the row is on screen with room under it (as a person reaching for it), then choose a tab.
  await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]'); const r = bar.getBoundingClientRect(); if (r.bottom > innerHeight - 200) scrollBy(0, r.bottom - (innerHeight - 200)); });
  const a0 = await at();
  await press('rec-rec-patient-tab'); await page.waitForTimeout(250);
  const a1 = await at();
  say(a1.y === a0.y && a1.tab >= a1.barBottom && a1.tab < h, `${w}: the row on screen with room under it: choosing a tab does not scroll`, `${JSON.stringify(a0)} → ${JSON.stringify(a1)}`);
  await press('rec-rec-overview-tab'); await page.waitForTimeout(150);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150);
  await press('rec-rec-chart-tab'); await page.waitForTimeout(300);
  const m = await at();
  say(m.tab >= m.barBottom && m.tab - m.barBottom <= 20, `${w}: scrolled down, the chosen tab starts just under the row`, JSON.stringify(m));
  // At the top of the page on a phone the row is low: a tab chosen there comes up under the row, never off screen.
  await page.goto(REC, { waitUntil: 'load' }); await page.waitForTimeout(300);
  await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]'); const r = bar.getBoundingClientRect(); if (r.bottom > innerHeight - 20) scrollBy(0, r.bottom - (innerHeight - 20)); });
  await press('rec-rec-treatment-record-tab'); await page.waitForTimeout(300);
  const lo = await at();
  say(lo.tab >= lo.barBottom && lo.tab <= h - 96, `${w}: the row at the foot of the screen: the chosen tab comes up where it can be seen`, JSON.stringify(lo));
  say(m.sw <= m.iw && lo.sw <= lo.iw, `${w}: no sideways scroll`, JSON.stringify(m));
  await ctx.close();
}
// 6. ?open=… (the Dashboard's links): the panel opens over Today and saves back to Today.
{
  const { ctx, page, errs } = await signed();
  for (const [k, id] of [['vitals', 'rec-vitals-add'], ['note', 'rec-note-add'], ['rx', 'rec-rx-add'], ['done', 'rec-done-add'], ['file', 'rec-file-add'], ['details', 'details']]) {
    await page.goto(`${REC}?open=${k}`, { waitUntil: 'load' }); await page.waitForTimeout(500);
    const st = await page.evaluate((id) => { const d = document.getElementById(id); const f = d?.querySelector('form:not([hidden]):not([data-plan-fdi])'); const sel = document.querySelector('[role=tab][aria-selected=true][id^=rec-rec-]'); return { open: d?.open, back: f?.querySelector('input[name=back]')?.value, hash: f ? new URL(f.action).hash : null, tab: sel?.id.replace(/^rec-rec-|-tab$/g, '') }; }, id);
    say(st.open && st.tab === 'overview' && st.back === 'overview' && st.hash === '#overview', `?open=${k}: ${id} over Today, back=overview, #overview`, JSON.stringify(st));
  }
  say(!errs.length, 'no page errors (?open=)', errs.join(' | '));
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} failing` : 'all ok');
if (bad) process.exit(1);
