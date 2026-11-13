// The website's half of the iPhone app (src/components/app-shell.js, src/components/AppShell.astro, /app/), measured in a phone-
// sized Chromium that carries the app's user agent and a stand-in for the native bridge (window.Capacitor.nativePromise,
// recording every call). What the native half does with each call (mobile/ios/App/App/FlossifyShell.swift) is checked on
// a Mac, in Xcode's simulator: this checks that the page asks for the right thing at the right moment.
//
//   1. An ordinary browser: no data-app, /app-shell.js never requested, window.flossifyApp undefined.
//   2. /app/ in the app: the doors, the launch screen told to go (ready), the status bar told the theme (light and dark); signed in, it goes
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
//  12. What a touch screen needs: touch-action manipulation, no selecting a button's words, fields still selectable, no
//      :hover rule left outside a hover query (and all of that untouched in an ordinary browser).
//  13. The chrome holds still: on a push, a pop and a tab move the top bar and the tab row are their own view-transition
//      groups with both an old and a new picture, the page crossfades by fading the old one off the new, and no
//      element keeps a view-transition-name once the transition ends. A row tapped stays pressed until its page comes.
//      A "Back to …" link to the page just left goes back to it (the history does not grow, the scroll comes back).
//  14. A full-screen panel on a phone: its head stays at the top as it scrolls; the note is drawn over the panel, in it;
//      the app is told something is over the page (overlay). The words the note shows are in the live region.
//  15. Larger Text: 135% (and no more) leaves no sideways scroll at 390 on /app/, Find a clinic, the staff entrance and
//      the Dashboard, keeps fields at 100% or more, and leaves the record's paper sheets as drawn.
//  16. The booking's steps: a name typed stops pull to refresh; from the second step the edge swipe is held; Return on
//      the name goes to the mobile number with no error; the booked moment (the server's answer stood in for, so
//      nothing is booked) draws its mark and lines with their rise. A refused form drawn again counts as typed words.
//  17. The line drops and returns: one note each, in plain words. A download the app could not fetch says so.
//
//   node scripts/dev/app/app-shell-check.mjs [base=http://127.0.0.1:4610]
//   PW_CHROMIUM · DB=flossify_t · PGHOST · PGPORT · PGUSER (local only). Signs in as the seeded owner; changes nothing.
//   (Any Chromium will do for PW_CHROMIUM. Cross-document view transitions, popovers and @starting-style are in it; what
//   WebKit on an iPhone does with them is checked on a Mac, in the simulator.)
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

// Every :hover rule not behind a hover query, and those behind one (the app moves the first kind behind one).
const hoverRules = () => {
  let bare = 0, behind = 0;
  const walk = (rules, inHover) => {
    for (const r of rules) {
      if (typeof r.selectorText === 'string' && r.style) { if (/(^|[^\\]):hover(?![\w-])/.test(r.selectorText)) { if (inHover) behind++; else bare++; } }
      else if (r.cssRules) walk(r.cssRules, inHover || !!(r.media && /hover/.test(r.media.mediaText)));
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, false); } catch (e) { /* another origin's */ } }
  return { bare, behind };
};
// The view transition a page arrived with: its groups and pictures as it starts, and what still carries a name after.
function watchTransition() {
  window.__vt = null;
  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition) return;
    const rec = { parts: [], named: [], after: null };
    window.__vt = rec;
    const named = () => [...document.querySelectorAll('*')].filter((el) => el.style && el.style.viewTransitionName).map((el) => el.style.viewTransitionName);
    e.viewTransition.ready.then(() => {
      rec.nav = document.documentElement.dataset.nav;
      rec.named = named();
      rec.parts = document.getAnimations().map((a) => `${a.effect.pseudoElement || ''} ${a.animationName || ''}`).filter((t) => t.startsWith('::view-transition'));
    }, () => {});
    // (A moment later: this listener was added before the app's own, so its turn comes first.)
    e.viewTransition.finished.then(() => setTimeout(() => { rec.after = named(); }, 50), () => {});
  });
}
const transitionOf = async (p) => {
  await p.waitForLoadState('load');
  await p.waitForFunction(() => window.__vt && window.__vt.after !== null, null, { timeout: 5000 });
  return p.evaluate(() => window.__vt);
};
const sideways = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth || innerWidth > 390);

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
  assert.ok(!asked.some((path) => /app-shell/.test(path)), 'a browser never loads the app\'s script');
  const plain = await p.evaluate(() => ({ touch: getComputedStyle(document.documentElement).touchAction, select: getComputedStyle(document.querySelector('.btn, button')).userSelect, text: document.documentElement.style.getPropertyValue('--app-text'), say: document.querySelectorAll('.app-say, .app-note').length }));
  assert.deepEqual(plain, { touch: 'auto', select: 'auto', text: '', say: 0 }, `a browser: ${JSON.stringify(plain)}`);
  assert.ok((await p.evaluate(hoverRules)).bare > 0, 'a browser keeps its hover rules as written');
  ok('an ordinary browser: no data-app, never the app\'s script, no flossifyApp; touch-action, selection and hover rules as the website has them');
  await ctx.close();
}

// 1b. A theme chosen on this device: the browser's bar follows it on a page without the switch (/app/) as on one with
// it (/find/), and each tag keeps its own colour for when the choice goes back to the device's.
{
  const ctx = await browser.newContext({ ...PHONE, colorScheme: 'light' });
  const p = await ctx.newPage();
  const bar = () => p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m.content, m.dataset.own ?? null]));
  await p.goto(`${base}/find/`);
  await p.evaluate(() => localStorage.setItem('theme', 'dark'));
  for (const path of ['/app/', '/find/']) {
    await p.goto(`${base}${path}`);
    assert.deepEqual(await bar(), [['#15191e', '#f3f5f8'], ['#15191e', '#15191e']], path);
  }
  await p.evaluate(() => localStorage.removeItem('theme'));
  await p.goto(`${base}/app/`);
  assert.deepEqual((await bar()).map(([content]) => content), ['#f3f5f8', '#15191e']);
  ok('a theme chosen on this device: the browser\'s bar follows it on /app/ as on /find/; with none, each tag is its own');
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
  await waitCall(p, 'FlossifyShell', 'ready');
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
  ok(`/app/ (${scheme}): two doors, the launch screen told to go, the status bar told ${scheme}; lowest ${Math.min(...m.lines.map((l) => l.ratio))}:1, 44 px, no sideways scroll`);

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
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.app-note')).opacity === '1'); // its fade in
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

// 12 to 15, 17: signed in, on a phone.
{
  const ctx = await appContext('light');
  await ctx.addInitScript(watchTransition);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (/view-transition|duplicate/i.test(m.text())) errors.push(m.text()); });
  await p.goto(`${base}/auth/login/?any=1`);
  await p.fill('#email', email);
  await p.fill('#password', 'flossify');
  await Promise.all([p.waitForURL(/\/c\//), p.click('[data-go]')]);
  await p.waitForLoadState('load');

  // 12. What a touch screen needs.
  const touch = await p.evaluate(() => ({ touch: getComputedStyle(document.documentElement).touchAction, button: getComputedStyle(document.querySelector('.ws-btn, .btn')).userSelect, field: getComputedStyle(document.querySelector('input:not([type="hidden"])')).userSelect, drag: getComputedStyle(document.querySelector('a')).webkitUserDrag }));
  assert.deepEqual(touch, { touch: 'manipulation', button: 'none', field: 'text', drag: 'none' }, JSON.stringify(touch));
  const hover = await p.evaluate(hoverRules);
  assert.equal(hover.bare, 0, `:hover rules left outside a hover query: ${hover.bare}`);
  assert.ok(hover.behind > 0);
  ok(`touch: touch-action manipulation, a button's words not selectable, a field's are, links not draggable; ${hover.behind} :hover rules, all behind a hover query`);

  // 13. The chrome holds still. A tab move, a push, a pop.
  const has = (t, part) => t.parts.some((x) => x.startsWith(part));
  await p.tap('.ws-tabrow a[href$="/patients/"]');
  await p.waitForURL(/\/patients\/$/);
  const tab = await transitionOf(p);
  assert.equal(tab.nav, 'tab');
  for (const name of ['app-bar', 'app-tabs']) assert.ok(has(tab, `::view-transition-old(${name})`) && has(tab, `::view-transition-new(${name})`), `tab move, ${name} on both sides: ${tab.parts}`);
  assert.ok(has(tab, '::view-transition-old(root) app-fade-out') && !has(tab, '::view-transition-new(root)'), `the old page fades off the new one: ${tab.parts}`);
  assert.deepEqual(tab.after, [], 'no name kept after the transition');
  const pressed = await p.evaluate(async () => {
    const a = document.querySelector('.pts-link');
    a.click();
    await new Promise((r) => setTimeout(r, 10));
    return [...document.querySelectorAll('[data-app-leaving]')].map((e) => e.className);
  }).catch(() => null);
  if (pressed) assert.deepEqual(pressed, ['pts-link'], 'the row tapped stays pressed');
  await p.waitForURL(/\/patients\/[0-9a-f-]+\/$/);
  const push = await transitionOf(p);
  assert.equal(push.nav, 'forward');
  assert.deepEqual([...push.named].sort(), ['app-bar', 'app-tabs']);
  for (const name of ['app-bar', 'app-tabs']) assert.ok(has(push, `::view-transition-old(${name})`) && has(push, `::view-transition-new(${name})`) && !has(push, `::view-transition-new(${name}) app-chrome-in`), `push, ${name} holds still: ${push.parts}`);
  assert.ok(has(push, '::view-transition-new(root) app-in-right') && has(push, '::view-transition-old(root) app-out-left'));
  assert.deepEqual(push.after, []);
  // "Back to Patients": the page just left. It goes back to it.
  const before = await p.evaluate(() => ({ index: navigation.currentEntry.index, entries: navigation.entries().length }));
  await p.evaluate(() => [...document.querySelectorAll('a[href]')].find((a) => /^back\b/i.test((a.getAttribute('aria-label') || a.textContent).trim()) && a.getClientRects().length).click());
  await p.waitForURL(/\/patients\/$/);
  const pop = await transitionOf(p);
  const after = await p.evaluate(() => ({ index: navigation.currentEntry.index, entries: navigation.entries().length }));
  assert.equal(pop.nav, 'back');
  assert.deepEqual(after, { index: before.index - 1, entries: before.entries }, `Back to Patients goes back: ${JSON.stringify([before, after])}`);
  assert.ok(has(pop, '::view-transition-old(app-bar)') && has(pop, '::view-transition-new(app-bar)') && has(pop, '::view-transition-old(root) app-out-right'));
  ok(`the top bar and the tab row hold still on a tab move, a push and a pop (their own groups, both pictures); the tab move fades the old page off the new; no name is kept after${pressed ? '; the row tapped stays pressed' : ''}; "Back to Patients" goes back in the history`);

  // 13'. From a page scrolled down the tab row is above the screen: it is not named there, so nothing flies down across
  // the bar; the next page's row comes in with its page. The bar, which sticks, still holds.
  const scrolledTo = await p.evaluate(async () => {
    const row = document.querySelector('.ws-tabrow');
    if (document.documentElement.scrollHeight < innerHeight + 400) document.querySelector('.ws-main, main').style.paddingBottom = '1200px';
    scrollTo(0, 400);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { y: scrollY, rowBottom: row.getBoundingClientRect().bottom };
  });
  assert.ok(scrolledTo.rowBottom <= 0, `the tab row is scrolled off: ${JSON.stringify(scrolledTo)}`);
  await p.evaluate(() => document.querySelector('.pts-link').click());
  await p.waitForURL(/\/patients\/[0-9a-f-]+\/$/);
  const far = await transitionOf(p);
  assert.equal(far.nav, 'forward');
  for (const name of ['app-tabs', 'ws-tab-on']) assert.ok(!has(far, `::view-transition-old(${name})`), `scrolled, no old ${name} to fly from: ${far.parts}`);
  assert.ok(has(far, '::view-transition-new(app-tabs) app-chrome-in'), `the new row comes with its page: ${far.parts}`);
  assert.ok(has(far, '::view-transition-old(app-bar)') && has(far, '::view-transition-new(app-bar)'), `the bar still holds: ${far.parts}`);
  assert.deepEqual(far.after, []);
  ok(`a push from Patients scrolled to ${scrolledTo.y}: the tab row off screen is not named (no group to fly), the new row comes in with its page, the bar holds`);

  // 13''. A form sent on a line that fails late. The pressed look is let go after ten seconds (shortened here); the
  // app says the page never started well after that. The typed words are protected again and the form can be sent.
  await p.route('**/__app-check-hang', () => {});
  const late = await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => realTimeout(r, ms));
    const realTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => realTimeout(fn, ms === 10000 ? 60 : ms, ...rest);
    const f = document.createElement('form');
    f.method = 'post'; f.action = '/__app-check-hang';
    f.innerHTML = '<input type="text" name="words"><button class="ws-btn">Save</button>';
    document.querySelector('.ws-main, main').append(f);
    const field = f.querySelector('input'), button = f.querySelector('button');
    field.value = 'typed'; field.dispatchEvent(new Event('input', { bubbles: true }));
    const typedStops = !window.flossifyApp.canRefresh();
    button.click();
    await wait(20);
    const sent = { marked: f.hasAttribute('data-app-sent'), busy: button.getAttribute('aria-busy'), free: window.flossifyApp.canRefresh() };
    await wait(300); // the "ten seconds"
    const let_go = { marked: f.hasAttribute('data-app-sent'), busy: button.getAttribute('aria-busy') };
    window.setTimeout = realTimeout;
    window.flossifyApp.lineFailed(false);
    const note = () => document.querySelector('.app-note').textContent;
    const after = { note: note(), protectedAgain: !window.flossifyApp.canRefresh(), marked: f.hasAttribute('data-app-sent'), busy: button.getAttribute('aria-busy') };
    // Sent again: not dropped as a second tap.
    let stopped = null;
    addEventListener('submit', (e) => { stopped = e.defaultPrevented; }, { once: true });
    button.click();
    await wait(20);
    const again = { stopped, marked: f.hasAttribute('data-app-sent') };
    window.flossifyApp.lineFailed('maybe');
    const maybe = note();
    // A link tapped afterwards that fails: no form was sent then, so nothing is said about one.
    window.flossifyApp.lineFailed('maybe');
    const noForm = note();
    f.remove();
    window.flossifyApp.markDirty(false);
    return { typedStops, sent, let_go, after, again, maybe, noForm };
  });
  await p.unroute('**/__app-check-hang');
  assert.deepEqual(late, {
    typedStops: true,
    sent: { marked: true, busy: 'true', free: true },
    let_go: { marked: false, busy: null },
    after: { note: 'Flossify could not be reached. Nothing was sent: what you typed is still here.', protectedAgain: true, marked: false, busy: null },
    again: { stopped: false, marked: true },
    maybe: 'Flossify did not answer. This may not have been saved: check before you send it again.',
    noForm: 'Flossify did not answer. That page could not open: try again in a moment.',
  }, JSON.stringify(late));
  ok('a form sent, the line failing after the ten seconds: the note says nothing was sent (and "may not have been saved" for a line lost part-way), the typed words stop a refresh again, and the form can be sent again; with a line, no "No connection"');

  // 14. A full-screen panel: its head stays, the note is drawn over it, the app is told.
  await p.goto(`${base}/c/${slug}/`);
  await clearCalls(p);
  await p.tap('[data-cal-new]');
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.overlay === true && o.swipeBack === false);
  await p.waitForTimeout(500);
  const panel = await p.evaluate(() => {
    const d = document.querySelector('dialog[open]'), head = d.querySelector('.ws-panel-head'), inner = d.querySelector('.ws-panel-inner');
    inner.scrollTop = 300;
    const f = d.querySelector('input[type="text"], input[type="search"], textarea');
    f.value = 'x'; f.dispatchEvent(new Event('input', { bubbles: true }));
    window.flossifyApp.refreshRefused();
    return { scrolled: inner.scrollTop, headTop: head.getBoundingClientRect().top, closeTop: d.querySelector('[data-ws-close]').getBoundingClientRect().top, same: getComputedStyle(head).backgroundColor === getComputedStyle(d).backgroundColor, enter: getComputedStyle(d).animationDuration };
  });
  assert.ok(panel.scrolled > 0 && panel.headTop === 0 && panel.closeTop >= 0 && panel.same, `the panel's head stays at the top on its own ground: ${JSON.stringify(panel)}`);
  assert.equal(panel.enter, '0.42s');
  await p.waitForSelector('.app-note[data-show]');
  await p.waitForFunction(() => getComputedStyle(document.querySelector('.app-note')).opacity === '1');
  const over = await p.evaluate(() => { const n = document.querySelector('.app-note'), r = n.getBoundingClientRect(); return { open: n.matches(':popover-open'), inPanel: !!n.closest('dialog[open]'), onScreen: r.width > 0 && r.top >= 0 && r.right <= innerWidth, can: window.flossifyApp.canRefresh() }; });
  assert.deepEqual(over, { open: true, inPanel: true, onScreen: true, can: false }, JSON.stringify(over));
  await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] > .app-say')].some((e) => e.textContent.startsWith('Not refreshed')));
  ok('a panel on a phone: 420 ms in, its head and Close stay at the top as it scrolls; the note is a popover inside the panel, so over it; its words are in the panel\'s live region; the app is told overlay');
  await p.evaluate(() => document.querySelector('dialog[open] [data-ws-close]').click());
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.overlay === false);

  // 17. A download the app could not fetch; the line dropping and coming back.
  await p.goto(`${base}/c/${slug}/finances/`);
  await p.evaluate(() => window.flossifyApp.downloadFailed());
  await p.waitForFunction(() => document.querySelector('.app-note[data-show]')?.textContent === 'That file could not be downloaded. Check your connection and try again.');
  await clearCalls(p);
  await ctx.setOffline(true);
  await p.waitForFunction(() => document.querySelector('.app-note[data-show]')?.textContent === 'No connection. What is on screen may be out of date.');
  await waitCall(p, 'FlossifyShell', 'notify', (o) => o.type === 'warning');
  await clearCalls(p);
  await ctx.setOffline(false);
  await p.waitForFunction(() => document.querySelector('.app-note[data-show]')?.textContent === 'Connection is back.');
  assert.deepEqual((await callsOf(p)).filter((c) => c.method === 'notify'), [], 'the line coming back is said, not felt');
  ok('a failed download says so; the line dropping is a warning and one note, its return a note and no haptic');

  // 15. Larger Text.
  await p.evaluate(() => window.flossifyApp.textSize(200));
  assert.equal(await p.evaluate(() => document.documentElement.style.getPropertyValue('--app-text')), '135%', 'capped at 135%');
  const wide = [];
  for (const path of ['/app/', '/find/', '/auth/login/?any=1', `/c/${slug}/`, `/c/${slug}/patients/`, `/c/${slug}/patients/${patientId}/`, `/c/${slug}/finances/`]) {
    await p.goto(`${base}${path}`);
    await p.waitForLoadState('load');
    await p.waitForTimeout(700); // the page's own transition ends
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).textSizeAdjust), '135%', `${path} keeps the size`);
    if (await sideways(p)) wide.push(path);
  }
  assert.deepEqual(wide, [], `sideways scroll at 135%: ${wide}`);
  await p.goto(`${base}/c/${slug}/patients/${patientId}/`);
  const sized = await p.evaluate(() => ({ sheet: getComputedStyle(document.querySelector('.pp-sheet')).textSizeAdjust, field: getComputedStyle(document.querySelector('input:not([type="hidden"])')).textSizeAdjust }));
  assert.deepEqual(sized, { sheet: '100%', field: '135%' }, JSON.stringify(sized));
  await p.evaluate(() => window.flossifyApp.textSize(85));
  const small = await p.evaluate(() => ({ page: getComputedStyle(document.documentElement).textSizeAdjust, field: getComputedStyle(document.querySelector('input:not([type="hidden"])')).textSizeAdjust }));
  assert.deepEqual(small, { page: '85%', field: '100%' }, JSON.stringify(small));
  await p.evaluate(() => window.flossifyApp.textSize(100));
  ok('Larger Text: capped at 135%, kept from page to page, no sideways scroll at 390 on /app/, Find a clinic, the staff entrance, the Dashboard, Patients, the record and Finances; the paper sheets stay at 100%; at 85% fields stay at 100%');
  assert.deepEqual(errors, [], `page errors: ${errors}`);
  await ctx.close();
}

// 16. The booking's steps, and a refused form (no sign-in, so no service worker: the booking's answer is stood in for).
{
  const ctx = await appContext('light');
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/api/bookings', (r) => r.request().method() === 'POST'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ref: 'FL-TEST', cancelToken: 'x', reminder: false }) })
    : r.continue());
  await p.goto(`${base}/find/${slug}/book/`);
  await p.waitForLoadState('load');
  assert.deepEqual(await p.$$eval('a.ws-mark', (els) => els.map((a) => a.getAttribute('href'))).then((h) => [...new Set(h)]), ['/app/'], 'the Flossify mark goes to /app/');
  const shownStep = () => p.evaluate(() => { const f = [...document.querySelectorAll('.cl-book .wiz[data-step]')].find((x) => !x.hidden); return { step: f.dataset.step, rises: getComputedStyle(f).animationName === 'app-step-in' }; });
  assert.deepEqual(await shownStep(), { step: 'reason', rises: false }, 'the first step came with the page');
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.swipeBack === true);
  for (let i = 0; i < 6 && (await shownStep()).step !== 'who'; i++) {
    await p.evaluate(() => { const f = [...document.querySelectorAll('.cl-book .wiz[data-step]')].find((x) => !x.hidden); const r = f.querySelector('input[type="radio"]:not(:checked)') || f.querySelector('input[type="radio"]'); if (r) { r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); } });
    await p.waitForTimeout(700); // the slots for the choice arrive
    await p.tap('[data-next]');
    await p.waitForTimeout(60);
    assert.equal((await shownStep()).rises, true, 'the next step rises into place');
    await p.waitForTimeout(500);
  }
  assert.equal((await shownStep()).step, 'who');
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.swipeBack === false && o.overlay === false);
  assert.equal(await p.evaluate(() => window.flossifyApp.canRefresh()), true, 'choices alone are not typed words');
  await p.fill('input[name="name"]', 'Test Person');
  assert.equal(await p.evaluate(() => window.flossifyApp.canRefresh()), false, 'a name typed stops pull to refresh');
  await clearCalls(p);
  await p.focus('input[name="name"]');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  assert.deepEqual(await p.evaluate(() => [document.activeElement.name, document.querySelector('[data-error]').textContent]), ['phone', ''], 'Return on the name goes to the mobile number, with no error');
  assert.deepEqual((await callsOf(p)).filter((c) => c.method === 'notify'), []);
  await p.fill('input[name="phone"]', '0917 000 0000');
  await p.check('input[name="consent"]');
  await p.tap('[data-next]');
  await p.waitForTimeout(400);
  assert.equal((await shownStep()).step, 'confirm');
  await clearCalls(p);
  await p.tap('[data-next]');
  await p.waitForSelector('[data-done-panel]:not([hidden])');
  const done = await p.evaluate(() => { const d = document.querySelector('[data-done-panel]'); return { mark: getComputedStyle(d.querySelector('.pt-done-mark')).animationName, title: getComputedStyle(d.querySelector('[data-done-title]')).animationName, lastDelay: Math.max(...[...d.children].map((c) => parseFloat(getComputedStyle(c).animationDelay) * 1000)) }; });
  assert.deepEqual(done, { mark: 'app-mark-pop', title: 'app-rise-in', lastDelay: 240 }, JSON.stringify(done));
  await waitCall(p, 'FlossifyShell', 'pattern', (o) => o.name === 'confirm');
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.swipeBack === true && o.typed === false);
  assert.equal(await p.evaluate(() => window.flossifyApp.canRefresh()), true, 'booked: the form is put away');
  await p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
  assert.equal(await sideways(p), false);
  ok('the booking: steps rise in (not the first), the swipe is held from the second step, a typed name stops pull to refresh, Return on the name goes to the number with no error; booked (stood in): the mark pops, the lines follow within 240 ms, the swipe and refresh are free again');

  // A refused form drawn again with its answer: typed words, though no key was pressed on this page.
  await p.goto(`${base}/me/`);
  await p.fill('main form[method="post" i] input[type="tel"], main form[method="post" i] input[type="text"]', '12345');
  await clearCalls(p);
  await Promise.all([p.waitForNavigation(), p.evaluate(() => { const f = document.querySelector('main form[method="post" i]'); f.noValidate = true; f.requestSubmit(); })]);
  await waitCall(p, 'FlossifyShell', 'notify', (o) => o.type === 'error');
  await waitCall(p, 'FlossifyShell', 'setChrome', (o) => o.typed === true);
  assert.equal(await p.evaluate(() => window.flossifyApp.canRefresh()), false);
  const refusal = await p.evaluate(() => document.querySelector('[role="alert"]').textContent.trim());
  await p.waitForFunction((words) => document.querySelector('.app-say[aria-live="assertive"]')?.textContent === words, refusal);
  ok(`a refused form drawn again ("${refusal}"): an error, typed words with no key pressed, and the refusal put in the live region`);
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
  // The app's script, wherever this server puts it (a hashed /assets/ file once built, /src/ on the dev server).
  const kept = await p.evaluate(async () => {
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) if (/app-shell[.\w-]*\.js/.test(new URL(req.url).pathname)) return true;
    }
    return false;
  });
  assert.ok(kept, 'the worker kept the app\'s script');
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
