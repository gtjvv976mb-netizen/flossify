// The website's half of the iPhone app (public/app-shell.js, src/components/AppShell.astro, /app/), measured in a phone-
// sized Chromium that carries the app's user agent and a stand-in for the native bridge (window.Capacitor.nativePromise,
// recording every call). What the native half does with each call (mobile/ios/App/App/FlossifyShell.swift) is checked on
// a Mac, in Xcode's simulator: this checks that the page asks for the right thing at the right moment.
//
//   1. An ordinary browser: no data-app, /app-shell.js never requested, window.flossifyApp undefined.
//   2. /app/ in the app: the doors, the splash hidden, the status bar told the theme (light and dark); signed in, it goes
//      straight to the clinic's Dashboard.
//   3. Motion: a tap on a door is a forward page transition, Back a backward one (the view transition and data-nav).
//   4. Haptics: a choice ticks (selection), the main button taps (impact light) under a touch, a panel opening taps
//      (impact soft), a refusal drawn by the server is an error, a save that lands (?saved=) a success, an API refusal
//      an error.
//   5. print() fires beforeprint, then asks for the print sheet on the page's paper (A4 on the Treatment record).
//   6. A download the page makes (a detached <a download> with a blob, a data: .ics) goes to saveFile with its name.
//   7. A link to another website opens in the in-app browser, and the page stays.
//   8. Typed words in a form stop pull to refresh, and say so.
//   9. The start page and the refresh note: every line ≥ 4.5:1 against its background, light and dark; targets ≥ 44 px;
//      no sideways scroll at 390.
//
//   node scripts/dev/app/app-shell-check.mjs [base=http://127.0.0.1:4610]
//   PW_CHROMIUM · DB=flossify_t · PGHOST · PGPORT · PGUSER (local only). Signs in as the seeded owner; changes nothing.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import pg from 'pg';

const [base = 'http://127.0.0.1:4610'] = process.argv.slice(2);
const HOST = process.env.PGHOST ?? '/var/run/postgresql';
if (!HOST.startsWith('/') && !['localhost', '127.0.0.1', '::1'].includes(HOST)) throw new Error('refusing: not a local database');
const db = new pg.Client({ host: HOST, port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined, user: process.env.PGUSER, database: process.env.DB ?? 'flossify_t' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const ok = (s) => console.log(`  ok  ${s}`);
const slug = 'session-road';
const email = 'liwayway.domingo@example.com';
const patientId = (await q(`select p.id from patient p join clinic c on c.id = p.clinic_id where c.slug = $1 order by p.chart_no limit 1`, [slug]))[0].id;
await db.end();

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FlossifyApp/1';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

/** The app's bridge, as Capacitor injects it at document start, but recording instead of calling native code. */
function bridge() {
  const calls = JSON.parse(sessionStorage.getItem('__calls') || '[]');
  window.__calls = calls;
  window.Capacitor = {
    isNativePlatform: () => true,
    nativePromise: (plugin, method, options) => {
      calls.push({ plugin, method, options: options || {}, at: location.pathname + location.search });
      try { sessionStorage.setItem('__calls', JSON.stringify(calls)); } catch (e) { /* full */ }
      return Promise.resolve({});
    },
  };
  window.__reveal = null;
  addEventListener('pagereveal', (e) => { window.__reveal = { vt: !!e.viewTransition }; });
}
async function appContext(colorScheme = 'light') {
  const ctx = await browser.newContext({ ...PHONE, userAgent: UA, colorScheme });
  await ctx.addInitScript(bridge);
  return ctx;
}
const callsOf = (p) => p.evaluate(() => window.__calls);
const clearCalls = (p) => p.evaluate(() => { window.__calls.length = 0; sessionStorage.setItem('__calls', '[]'); });
async function waitCall(p, plugin, method, test = () => true, ms = 3000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const hit = (await callsOf(p)).find((c) => c.plugin === plugin && c.method === method && test(c.options));
    if (hit) return hit;
    await p.waitForTimeout(60);
  }
  throw new Error(`no ${plugin}.${method} call${test.toString() !== '() => true' ? ' matching ' + test : ''}; calls: ${JSON.stringify(await callsOf(p))}`);
}

// Contrast, the way the other checks measure it: each line's colour against the colour behind it (opaque layers only).
const measure = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const behind = (el) => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.9) return c; } return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 }; };
  const out = [];
  for (const el of document.querySelectorAll('main *, .app-note')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).opacity === '0') continue;
    const fg = parse(getComputedStyle(el).color), bg = behind(el);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    out.push({ text: el.textContent.trim().slice(0, 40), ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100 });
  }
  const small = [...document.querySelectorAll('main a, main button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height < 44; }).map((e) => e.textContent.trim().slice(0, 30));
  return { lines: out, small, sideways: document.documentElement.scrollWidth > innerWidth };
};

// 1. An ordinary browser.
{
  const ctx = await browser.newContext({ ...PHONE });
  const p = await ctx.newPage();
  const asked = [];
  p.on('request', (r) => asked.push(new URL(r.url()).pathname));
  await p.goto(`${base}/app/`);
  await p.goto(`${base}/find/`);
  assert.equal(await p.evaluate(() => document.documentElement.hasAttribute('data-app')), false);
  assert.equal(await p.evaluate(() => typeof window.flossifyApp), 'undefined');
  assert.ok(!asked.includes('/app-shell.js'), 'a browser never loads /app-shell.js');
  ok('an ordinary browser: no data-app, no /app-shell.js, no flossifyApp');
  await ctx.close();
}

for (const scheme of ['light', 'dark']) {
  // 2. The start page.
  const ctx = await appContext(scheme);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/app/`);
  assert.equal(await p.evaluate(() => document.documentElement.hasAttribute('data-app')), true);
  assert.equal(await p.evaluate(() => typeof window.flossifyApp.haptic.select), 'function');
  await waitCall(p, 'SplashScreen', 'hide');
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.dark === (scheme === 'dark'));
  const doors = await p.$$eval('[data-app-door]', (els) => els.map((e) => ({ key: e.dataset.appDoor, h: e.getBoundingClientRect().height })));
  assert.deepEqual(doors.map((d) => d.key), ['patient', 'clinic']);
  assert.ok(doors.every((d) => d.h >= 44));
  // The rise (each line in turn, the last ends at 960 ms): measure once every animation has finished, or a line still
  // at 98.5% of its size reads under 44 px.
  await p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  const m = await p.evaluate(measure);
  const low = m.lines.filter((l) => l.ratio < 4.5);
  assert.deepEqual(low, [], `contrast on /app/ (${scheme}): ${JSON.stringify(low)}`);
  assert.deepEqual(m.small, [], `targets under 44 px on /app/: ${m.small}`);
  assert.equal(m.sideways, false);
  ok(`/app/ (${scheme}): two doors, the splash hidden, the status bar told ${scheme}; lowest ${Math.min(...m.lines.map((l) => l.ratio))}:1, 44 px, no sideways scroll`);

  if (scheme === 'light') {
    // 3. Motion: forward to Find a clinic, back to the start.
    await clearCalls(p);
    await p.tap('[data-app-door="patient"]');
    await p.waitForURL(/\/find\/$/);
    await p.waitForLoadState('load');
    const fwd = await p.evaluate(() => ({ nav: document.documentElement.dataset.nav, reveal: window.__reveal }));
    assert.equal(fwd.nav, 'forward');
    assert.equal(fwd.reveal?.vt, true, 'a view transition ran into /find/');
    await p.goBack();
    await p.waitForURL(/\/app\/$/);
    await p.waitForLoadState('load');
    const back = await p.evaluate(() => ({ nav: document.documentElement.dataset.nav, reveal: window.__reveal }));
    assert.equal(back.nav, 'back');
    ok('a door pushes forward with a view transition; Back pops backward');

    // 4a. A choice ticks; 7. another website opens in the in-app browser.
    await p.goto(`${base}/find/`);
    await clearCalls(p);
    // A real tap (a click a script makes is not felt): a chip that says it is pressed, or a radio or checkbox.
    const choice = (await p.$$('button[aria-pressed], [role="tab"], .ws-seg a, input[type="radio"], input[type="checkbox"]'))[0];
    assert.ok(choice, 'a choice on /find/');
    await choice.scrollIntoViewIfNeeded();
    await choice.tap({ force: true });
    await waitCall(p, 'FlossifyShell', 'selection');
    ok('a choice on Find a clinic ticks (selection)');
    await p.goto(`${base}/find/`);
    await clearCalls(p);
    await p.evaluate(() => { const a = document.createElement('a'); a.href = 'https://example.com/elsewhere'; a.textContent = 'x'; a.id = 'away'; document.body.append(a); });
    await p.click('#away');
    await waitCall(p, 'Browser', 'open', (o) => o.url === 'https://example.com/elsewhere');
    assert.ok(p.url().endsWith('/find/'), 'the page stays');
    ok('a link to another website opens in the in-app browser, and the page stays');

    // 6. Downloads the page makes.
    await clearCalls(p);
    await p.evaluate(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['poster'], { type: 'image/png' }));
      a.download = 'Flossify QR poster.png';
      a.click();
    });
    const png = await waitCall(p, 'FlossifyShell', 'saveFile');
    assert.equal(png.options.filename, 'Flossify QR poster.png');
    assert.equal(atob(png.options.data), 'poster');
    await clearCalls(p);
    await p.evaluate(() => { const a = document.createElement('a'); a.href = 'data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR'; a.download = 'flossify-visit.ics'; a.id = 'ics'; a.textContent = 'Add to calendar'; document.body.append(a); });
    await p.click('#ics');
    const ics = await waitCall(p, 'FlossifyShell', 'saveFile');
    assert.equal(ics.options.filename, 'flossify-visit.ics');
    assert.ok(p.url().endsWith('/find/'));
    ok('a blob download (the QR poster) and a data: .ics (Add to calendar) go to saveFile with their names');

    // 4b. A refusal the server draws is an error; then sign in.
    await p.goto(`${base}/auth/login/?any=1`);
    await clearCalls(p);
    await p.fill('#email', email);
    await p.fill('#password', 'not the password');
    await Promise.all([p.waitForNavigation(), p.click('[data-go]')]);
    await waitCall(p, 'FlossifyShell', 'notify', (o) => o.type === 'error');
    ok('a wrong password: the refusal arrives with an error haptic');
    await p.fill('#password', 'flossify');
    await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
    await p.goto(`${base}/app/`);
    await p.waitForURL(new RegExp(`/c/${slug}/$`));
    ok('signed in, /app/ opens the clinic\'s Dashboard');

    // 4c. The main button taps under a touch, once: the panel it opens is the same moment, so no second tap.
    await clearCalls(p);
    await p.tap('[data-cal-new]');
    await waitCall(p, 'FlossifyShell', 'impact', (o) => o.style === 'light');
    await p.waitForTimeout(500);
    const impacts = (await callsOf(p)).filter((c) => c.method === 'impact').map((c) => c.options.style);
    assert.deepEqual(impacts, ['light'], `one tap for New booking and its panel: ${impacts}`);
    ok('New booking: one light tap under the finger, none again as its panel opens');
    await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.swipeBack === false);
    await clearCalls(p);
    await p.keyboard.press('Escape');
    await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.swipeBack === true);
    ok('while the panel is open the edge swipe does not go back; once it closes it does again');

    // 4d. An API refusal (no CSRF header: 403) to something the person pressed is an error; the same refusal to the
    // page's own background work (the chart's queue retrying) is not felt.
    await p.waitForTimeout(1600);
    await clearCalls(p);
    await p.evaluate(() => fetch('/api/recall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}));
    await p.waitForTimeout(700);
    assert.deepEqual((await callsOf(p)).filter((c) => c.method === 'notify'), [], 'background work is not felt');
    await p.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'press-api'; b.textContent = 'Press'; b.style.cssText = 'position:fixed;left:8px;top:200px;z-index:99999;min-height:44px';
      b.addEventListener('click', () => fetch('/api/recall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}));
      document.body.append(b);
    });
    await p.tap('#press-api');
    await waitCall(p, 'FlossifyShell', 'notify', (o) => o.type === 'error');
    ok('an API refusal to a press: an error haptic; the same refusal to background work: nothing');

    // 4e. A save that lands is a success.
    await clearCalls(p);
    await p.goto(`${base}/c/${slug}/patients/${patientId}/?saved=details`);
    await waitCall(p, 'FlossifyShell', 'notify', (o) => o.type === 'success');
    assert.ok(!(await callsOf(p)).some((c) => c.method === 'notify' && c.options.type === 'error'), 'the allergy line is not a refusal');
    ok('a save that lands (?saved=): a success haptic, and the record\'s allergy line stays quiet');

    // 4e'. "Nothing was saved" is not a save; a fold the page opens by itself is not a touch.
    await clearCalls(p);
    await p.goto(`${base}/c/${slug}/patients/${patientId}/?saved=nothing`);
    await p.waitForTimeout(900);
    await p.evaluate(() => { const d = document.querySelector('details:not([open])'); if (d) d.open = true; });
    await p.waitForTimeout(900);
    const quiet = (await callsOf(p)).filter((c) => c.method === 'notify' || c.method === 'impact');
    assert.deepEqual(quiet, [], `?saved=nothing and a fold a script opens are not felt: ${JSON.stringify(quiet)}`);
    ok('?saved=nothing is not felt as a save, and a fold the page opens by itself does not tap');

    // 4f. A panel opened by a plain button (not the teal one) opens with a soft tap.
    await p.waitForTimeout(500);
    await clearCalls(p);
    const opener = await p.evaluateHandle(() => [...document.querySelectorAll('button[data-ws-open]')]
      .find((b) => b.getClientRects().length && !b.matches('.btn-primary, .ws-btn-primary, .ws-btn-danger')));
    assert.ok(await opener.evaluate((b) => !!b), 'a plain button that opens a panel on the record');
    const openerName = await opener.evaluate((b) => b.textContent.trim().replace(/\s+/g, ' '));
    await opener.asElement().tap();
    await waitCall(p, 'FlossifyShell', 'impact', (o) => o.style === 'soft');
    await p.keyboard.press('Escape');
    ok(`a panel opened by a plain button ("${openerName}"): a soft tap`);

    // 8. Typed words stop pull to refresh, and say so.
    const typed = await p.evaluate(() => {
      const field = [...document.querySelectorAll('form[method="post" i] input[type="text"], form[method="post" i] textarea')][0];
      if (!field) return null;
      field.value = 'typed';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    assert.ok(typed, 'a POST form on the record');
    assert.equal(await p.evaluate(() => window.flossifyApp.canRefresh()), false);
    await p.evaluate(() => window.flossifyApp.refreshRefused());
    await p.waitForSelector('.app-note[data-show]');
    const note = await p.evaluate(measure);
    const noteLine = note.lines.find((l) => l.text.startsWith('Not refreshed'));
    assert.ok(noteLine && noteLine.ratio >= 4.5, `the note's contrast: ${JSON.stringify(noteLine)}`);
    ok(`typed words: no refresh, and the note says so (${noteLine.ratio}:1)`);

    // 5. print() on the Treatment record (A4).
    await p.goto(`${base}/c/${slug}/patients/${patientId}/treatment-record/`);
    await clearCalls(p);
    await p.evaluate(() => { window.__before = 0; addEventListener('beforeprint', () => window.__before++); window.print(); });
    const printed = await waitCall(p, 'FlossifyShell', 'print');
    assert.ok(await p.evaluate(() => window.__before) >= 1, 'beforeprint fired first');
    assert.ok(Math.abs(printed.options.paperWidth - 595.28) < 1 && Math.abs(printed.options.paperHeight - 841.89) < 1, `A4: ${JSON.stringify(printed.options)}`);
    ok(`print() on the Treatment record: beforeprint, then the print sheet on A4 (${printed.options.paperWidth} × ${printed.options.paperHeight} pt)`);
  }
  assert.deepEqual(errors, [], `page errors: ${errors}`);
  await ctx.close();
}

// 10. Offline: the service worker keeps the app's script, so the offline page it answers with still has the app's half.
{
  const ctx = await appContext('light');
  const p = await ctx.newPage();
  await p.goto(`${base}/auth/login/?any=1`);
  await p.fill('#email', email);
  await p.fill('#password', 'flossify');
  await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => null);
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  await p.goto(`${base}/c/${slug}/patients/`);
  const kept = await p.evaluate(async () => !!(await caches.match('/app-shell.js')));
  assert.ok(kept, 'the worker kept /app-shell.js');
  await ctx.setOffline(true);
  await p.goto(`${base}/c/${slug}/finances/`).catch(() => {});
  await p.waitForLoadState('load');
  const offline = await p.evaluate(() => ({ title: document.title, app: typeof window.flossifyApp, data: document.documentElement.hasAttribute('data-app') }));
  assert.equal(offline.app, 'object', `offline: ${JSON.stringify(offline)}`);
  await ctx.setOffline(false);
  ok(`offline: the worker answers with its offline page ("${offline.title}"), and the app's script runs on it from the worker's copy`);
  await ctx.close();
}

// 11. The calendar's drag on an iPad: the card lifts, ticks as it crosses quarter hours, and settles when let go. It is
// let go off the grid, so nothing moves (the calendar puts it back without asking the server).
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true, userAgent: UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS') });
  await ctx.addInitScript(bridge);
  const p = await ctx.newPage();
  await p.goto(`${base}/auth/login/?any=1`);
  await p.fill('#email', email);
  await p.fill('#password', 'flossify');
  await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
  await p.waitForSelector('.cal-card[data-id]');
  const found = await p.evaluate(() => {
    // A visit still ahead (one in the chair or finished does not move).
    const b = [...document.querySelectorAll('.cal-frame .cal-card[data-id]')].find((e) => e.getClientRects().length && ['booked', 'confirmed'].includes(e.dataset.status));
    if (!b) return false;
    b.setAttribute('data-test-drag', '');
    b.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  });
  assert.ok(found, 'a visit on the calendar to drag');
  await p.waitForTimeout(400); // the calendar's own scrolling settles
  const card = await p.evaluate(() => {
    const r = document.querySelector('[data-test-drag]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await clearCalls(p);
  const asked = [];
  p.on('request', (r) => { if (r.url().includes('/api/schedule') && r.method() !== 'GET') asked.push(r.method()); });
  await p.mouse.move(card.x, card.y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(card.x, card.y + i * 9);
  await waitCall(p, 'FlossifyShell', 'pattern', (o) => o.name === 'lift');
  await waitCall(p, 'FlossifyShell', 'selection');
  await p.mouse.move(card.x, 4, { steps: 6 });
  await p.mouse.up();
  await waitCall(p, 'FlossifyShell', 'pattern', (o) => o.name === 'drop');
  await p.waitForTimeout(300);
  assert.deepEqual(asked, [], 'let go off the grid: nothing sent');
  const ticks = (await callsOf(p)).filter((c) => c.method === 'selection').length;
  ok(`the calendar's drag (iPad): a lift, ${ticks} quarter-hour tick${ticks === 1 ? '' : 's'}, a drop; let go off the grid, nothing moved`);
  await ctx.close();
}

// 9 (dark): the refresh note in dark.
{
  const ctx = await appContext('dark');
  const p = await ctx.newPage();
  await p.goto(`${base}/find/`);
  await p.evaluate(() => window.flossifyApp.refreshRefused());
  await p.waitForSelector('.app-note[data-show]');
  await p.waitForTimeout(300);
  const line = (await p.evaluate(measure)).lines.find((l) => l.text.startsWith('Not refreshed'));
  assert.ok(line && line.ratio >= 4.5, `the note in dark: ${JSON.stringify(line)}`);
  ok(`the refresh note in dark: ${line.ratio}:1`);
  await ctx.close();
}

await browser.close();
console.log('all passed');
