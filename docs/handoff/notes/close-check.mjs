// Close the day — measured: the owner's flow (count ₱200 short, the sentence, Closed by, print), the
// dentist's (no amounts, no form), contrast ≥ 4.5:1 light and dark at 1440 and 390, targets ≥ 44px,
// no sideways scroll at 390.
import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:4412';
const URL = `${BASE}/c/session-road/finances/close/`;
const T = JSON.parse(process.env.TRUTH);
const out = [];
const say = (k, v) => { out.push([k, v]); console.log(k.padEnd(44), typeof v === 'object' ? JSON.stringify(v) : v); };
const fails = [];
const must = (cond, what) => { if (!cond) fails.push(what); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function signIn(ctx, email, password) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth/login/?any=1`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
  await p.close();
}

// --- contrast --------------------------------------------------------------------------------
const CONTRAST_JS = `(() => {
  const parse = (s) => { const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const over = (top, under) => { const a = top[3]; return [top[0]*a + under[0]*(1-a), top[1]*a + under[1]*(1-a), top[2]*a + under[2]*(1-a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05); };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || [255,255,255,1];
  const htmlBg = parse(getComputedStyle(document.documentElement).backgroundColor);
  const base = htmlBg && htmlBg[3] > 0 ? over(bodyBg, htmlBg) : bodyBg;
  // The background behind an element: its ancestors' backgrounds (and a .ws-glass card's ::before), composited bottom-up over the page.
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (e.classList.contains('ws-glass')) { const b = parse(getComputedStyle(e, '::before').backgroundColor); if (b && b[3] > 0) layers.push(b); }
    }
    let bg = base;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const rows = [];
  const walker = document.createTreeWalker(document.querySelector('.dc-page'), NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue;
    const el = n.parentElement; if (seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (el.closest('[hidden]')) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const fgc = fg[3] < 1 ? over(fg, bg) : fg;
    rows.push({ text: t.slice(0, 40), cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 40) : el.tagName, ratio: +ratio(fgc, bg).toFixed(2), size: cs.fontSize });
  }
  rows.sort((a, b) => a.ratio - b.ratio);
  return rows;
})()`;

const TARGETS_JS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('.dc-page a, .dc-page button, .dc-page input, .dc-page [role="button"]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 && r.height === 0) continue;
    out.push({ what: (el.textContent || el.name || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
})()`;

async function measure(ctx, label, width, url = URL) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height: 900 });
  await p.goto(url);
  if (await p.locator('[data-dc-counted]').count()) {
    for (const [v, tone] of [['1300', 'short'], ['1700', 'over'], ['1500', 'match']]) {
      await p.fill('[data-dc-counted]', v);
      const r = await p.evaluate((sel) => {
        const parse = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
        const over = (t, u) => { const a = t[3]; return [t[0]*a + u[0]*(1-a), t[1]*a + u[1]*(1-a), t[2]*a + u[2]*(1-a), 1]; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
        const el = document.querySelector(sel);
        const pane = el.closest('.ws-glass');
        const page = parse(getComputedStyle(document.body).backgroundColor);
        let bg = over(parse(getComputedStyle(pane, '::before').backgroundColor), page);
        bg = over(parse(getComputedStyle(el).backgroundColor), bg);
        const fg = parse(getComputedStyle(el).color);
        const l1 = lum(fg), l2 = lum(bg);
        return { tone: el.dataset.tone, ratio: +(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)), text: el.textContent.trim().slice(0, 30) };
      }, '[data-dc-variance]');
      say(`${label} variance ${tone}`, r);
      must(r.tone === tone && r.ratio >= 4.5, `${label}: variance ${tone} ${JSON.stringify(r)}`);
    }
    await p.fill('[data-dc-counted]', '');
  }
  const rows = await p.evaluate(CONTRAST_JS);
  const worst = rows.slice(0, 3);
  say(`${label} contrast: lines measured`, rows.length);
  say(`${label} contrast: lowest`, worst);
  const bad = rows.filter((r) => r.ratio < 4.5);
  must(bad.length === 0, `${label}: ${bad.length} lines under 4.5:1 ${JSON.stringify(bad.slice(0, 5))}`);
  const targets = await p.evaluate(TARGETS_JS);
  const small = targets.filter((t) => t.h < 44 || t.w < 44);
  say(`${label} targets`, `${targets.length} checked, ${small.length} under 44px ${JSON.stringify(small.slice(0, 6))}`);
  must(small.length === 0, `${label}: targets under 44px ${JSON.stringify(small)}`);
  const scroll = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  say(`${label} sideways`, scroll);
  must(scroll.sw <= scroll.iw, `${label}: sideways scroll ${JSON.stringify(scroll)}`);
  await p.screenshot({ path: `/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/close-${label.replace(/\W+/g, '-')}.png`, fullPage: true });
  await p.close();
}

// --- the owner -------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(ctx, 'liwayway.domingo@example.com', 'flossify');
  const p = await ctx.newPage();

  // The Finances page has the quiet link.
  await p.goto(`${BASE}/c/session-road/finances/`);
  const link = p.locator('a[data-fin-close]');
  say('finances: Close the day link', await link.count());
  must((await link.count()) === 1, 'Finances page has no Close the day link');
  const linkCls = await link.getAttribute('class');
  must(/ws-btn-quiet/.test(linkCls) && !/primary/.test(linkCls), 'Close the day link is not quiet');
  await Promise.all([p.waitForNavigation(), link.click()]);
  say('finances: link goes to', p.url());
  must(p.url() === URL, 'link did not land on the close page');

  // One teal button on the screen.
  const teal = await p.locator('.ws-btn-primary:visible').count();
  say('owner: teal buttons on screen', teal);
  must(teal === 1, `teal buttons: ${teal}`);
  const tealText = (await p.locator('.ws-btn-primary:visible').first().textContent()).trim();
  say('owner: the teal button', tealText);

  // The takings by method.
  const methods = await p.$$eval('[data-dc-methods] tbody tr', (trs) => trs.map((tr) => Array.from(tr.querySelectorAll('th,td')).map((c) => c.textContent.trim())));
  say('owner: methods table', methods);
  const cash = methods.find((r) => r[0] === 'Cash');
  must(cash && cash[1] === '2' && cash[2] === '₱1,500.00', `cash row wrong: ${JSON.stringify(cash)}`);
  const gcash = methods.find((r) => r[0] === 'GCash');
  must(gcash && gcash[1] === '1' && gcash[2] === '₱100.00', `gcash row wrong: ${JSON.stringify(gcash)}`);
  const total = await p.$eval('[data-dc-total]', (e) => e.textContent.trim());
  const totalN = await p.$eval('[data-dc-total-n]', (e) => e.textContent.trim());
  say('owner: total', `${totalN} payments, ${total}`);
  must(total === '₱1,600.00' && totalN === '3', 'total wrong');
  say('owner: expected cash', await p.$eval('[data-dc-expected]', (e) => e.textContent.trim()));

  // Still open: the five groups' counts.
  const counts = await p.$$eval('.dc-h', (hs) => hs.map((h) => [h.childNodes[0].textContent.trim(), h.querySelector('.dc-count').textContent.trim()]));
  say('owner: still open counts', counts);
  const c = Object.fromEntries(counts);
  say('database truth', T);
  must(c['Still in the clinic'] === String(T.inclinic), 'in clinic count vs database');
  must(c['Done, not charged'] === String(T.uncharged), 'uncharged count vs database');
  must(c['Charged, nothing paid yet'] === String(T.unpaid), 'unpaid count vs database');
  must(c['Left owing'] === String(T.owing_n), 'owing count vs database');
  must(c['Did not come'] === String(T.missed), 'missed count vs database');
  const owingRows = await p.$$eval('#dc-h-owing ~ ul .dc-row', (rows) => rows.map((r) => [r.querySelector('.dc-name').textContent.trim(), r.querySelector('.dc-owes').textContent.trim()]));
  say('owner: left owing rows', owingRows);
  const anna = owingRows.find((r) => r[0] === 'Anna Patricia Reyes');
  must(anna && anna[1] === `Owes ${T.anna_owes}`, `owing amount for Anna: ${JSON.stringify(anna)} vs ${T.anna_owes}`);
  const visitLinks = await p.$$eval('#dc-h-visits ~ ul a.dc-name', (as) => as.map((a) => a.getAttribute('href')));
  say('owner: in-clinic visit links', visitLinks);
  must(visitLinks.some((l) => /\/c\/session-road\/\?date=\d{4}-\d{2}-\d{2}&booking=dc000000-0000-4000-8000-000000000011$/.test(l)), 'visit link to the Dashboard with ?booking=');
  const chargeLink = await p.$eval('#dc-h-uncharged ~ ul a.dc-go', (a) => a.getAttribute('href'));
  say('owner: charge link', chargeLink);

  // Tomorrow.
  const tiles = await p.$$eval('[data-dc-tomorrow] .ws-tile', (ts) => ts.map((t) => [t.querySelector('.meta')?.textContent.trim(), t.querySelector('.ws-tile-value')?.textContent.trim(), t.querySelector('.ws-tile-note')?.textContent.trim()]));
  say('owner: tomorrow tiles', tiles);
  const tv = Object.fromEntries(tiles.map((t) => [t[0], t]));
  must(tv['Visits'] && tv['Visits'][1] === String(T.tm_n) && tv['Visits'][2] === `First at ${T.tm_first}`, `tomorrow visits vs database ${JSON.stringify(tv['Visits'])}`);
  must(tv['Not confirmed'] && tv['Not confirmed'][1] === String(T.tm_unconfirmed), 'tomorrow unconfirmed vs database');
  must(tv['No mobile on file'] && tv['No mobile on file'][1] === String(T.tm_nophone), 'tomorrow no phone vs database');

  // The live sentence, then the close.
  say('owner: closed-by before', await p.locator('[data-dc-closed-by]').count());
  await p.fill('[data-dc-counted]', '1300');
  const live = await p.$eval('[data-dc-variance]', (e) => [e.textContent.trim(), e.dataset.tone]);
  say('owner: live variance', live);
  must(live[0] === '₱200.00 short of the ₱1,500.00 expected.' && live[1] === 'short', 'live variance');
  await p.fill('input[name="note"]', 'Float of ₱200 taken to buy gloves');
  await Promise.all([p.waitForNavigation(), p.click('[data-dc-close]')]);
  say('owner: after close url', p.url());
  must(p.url() === `${URL}?closed=1`, 'redirect after close');
  const done = await p.$eval('[data-dc-done]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  say('owner: done callout', done);
  must(/The day is closed\. Closed by Dr\. Liwayway Domingo at \d{1,2}:\d{2} [ap]m — the drawer is ₱200\.00 short\./.test(done), 'done callout words');
  const closedBy = await p.$eval('[data-dc-closed-by]', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  say('owner: closed-by line', closedBy);
  must(/Closed by Dr\. Liwayway Domingo at .*counted ₱1,300\.00 against ₱1,500\.00 expected — ₱200\.00 short\. Note: Float of ₱200 taken to buy gloves/.test(closedBy), 'closed-by words');
  say('owner: form still there', await p.locator('[data-dc-form]').count());
  must((await p.locator('[data-dc-form]').count()) === 1, 'form gone after close');
  say('owner: the teal button now', (await p.locator('.ws-btn-primary:visible').first().textContent()).trim());

  // A bad count is refused with a sentence; nothing is written.
  await p.fill('[data-dc-counted]', 'abc');
  await p.evaluate(() => document.querySelector('[data-dc-counted]').removeAttribute('required'));
  await Promise.all([p.waitForNavigation(), p.click('[data-dc-close]')]);
  const prob = await p.$eval('[data-dc-problem]', (e) => e.textContent.trim());
  say('owner: bad count', prob);
  must(/Type the cash in the drawer as an amount/.test(prob), 'bad count sentence');

  // A stale token: back with the CSRF sentence.
  const stale = await p.evaluate(async (url) => {
    const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ intent: 'close', cash_counted: '1', _csrf: 'nope' }), redirect: 'follow', credentials: 'same-origin' });
    return { url: r.url, has: (await r.text()).includes('The page had gone stale') };
  }, URL);
  say('owner: stale post', stale);
  must(stale.url.endsWith('?stale=1') && stale.has, 'stale post handling');

  // Print: the shell hides, the form hides, the paper head shows, black on white.
  await p.goto(URL);
  await p.emulateMedia({ media: 'print' });
  const pr = await p.evaluate(() => {
    const d = (sel) => { const e = document.querySelector(sel); return e ? (e.getClientRects().length === 0 ? 'none' : getComputedStyle(e).display) : 'missing'; };
    const h = document.querySelector('.dc-print-title');
    return {
      side: d('.ws-side'), top: d('.ws-top'), form: d('[data-dc-form]'), print: d('[data-dc-print]'), head: d('.dc-print-head'),
      title: h && h.textContent, titleColor: h && getComputedStyle(h).color, paneBg: getComputedStyle(document.querySelector('.ws-pane')).backgroundColor,
      sign: d('.dc-sign'), tableRows: document.querySelectorAll('[data-dc-methods] tbody tr').length,
    };
  });
  say('owner: print view', pr);
  must(pr.side === 'none' && pr.top === 'none' && pr.form === 'none' && pr.print === 'none', 'print: shell or form still shown');
  must(pr.head === 'block' && /Close the day — /.test(pr.title) && pr.titleColor === 'rgb(0, 0, 0)' && pr.paneBg === 'rgb(255, 255, 255)', 'print: paper not black on white');
  await p.pdf({ path: '/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/close-print.pdf', format: 'A4' });
  await p.emulateMedia({ media: 'screen' });
  await p.close();

  await measure(ctx, 'owner light 1440', 1440);
  await measure(ctx, 'owner light 390', 390);
  await measure(ctx, 'owner light 1440 closed', 1440, `${URL}?closed=1`);
  await ctx.close();

  const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await signIn(dark, 'liwayway.domingo@example.com', 'flossify');
  await measure(dark, 'owner dark 1440', 1440);
  await measure(dark, 'owner dark 390', 390);
  await measure(dark, 'owner dark 390 closed', 390, `${URL}?closed=1`);
  await dark.close();
}

// --- the dentist -----------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(ctx, 'ramon.cari.o@example.com', 'flossify');
  const p = await ctx.newPage();
  const r = await p.goto(URL);
  say('dentist: status', r.status());
  const text = await p.$eval('.dc-page', (e) => e.textContent.replace(/\s+/g, ' ').trim());
  say('dentist: page words', text.slice(0, 160));
  must(/Closing the day is for the desk, the owner, the admin/.test(text), 'dentist: no sentence');
  must(!text.includes('₱'), 'dentist: an amount is shown');
  must((await p.locator('[data-dc-form]').count()) === 0, 'dentist: form shown');
  must((await p.locator('[data-dc-methods]').count()) === 0, 'dentist: methods shown');
  // A forged post is refused too: nothing written.
  const forged = await p.evaluate(async (url) => {
    const csrf = document.cookie.match(/(?:^|; )fl_csrf=([^;]+)/)?.[1] ?? '';
    const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ intent: 'close', cash_counted: '1', _csrf: decodeURIComponent(csrf) }), redirect: 'follow', credentials: 'same-origin' });
    return r.url;
  }, URL);
  say('dentist: forged post lands on', forged);
  await measure(ctx, 'dentist light 1440', 1440);
  await ctx.close();
}

await browser.close();
console.log('\nFAILS', fails.length, fails);
process.exit(fails.length ? 1 : 0);
