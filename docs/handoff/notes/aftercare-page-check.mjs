// Signs in to the seeded dev clinic, opens the extraction aftercare sheet at 1440 and 390 in light and
// dark, screenshots it, and measures: no sideways scroll, every text >= 4.5:1 against what is behind it,
// every control >= 44px, the language and visit parameters, print media, and the 404s.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:4411';
const SLUG = 'session-road';
const PID = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const VISIT = '11111111-2222-4333-8444-555555555555';
const OUT = '/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad';
const url = (kind, qs = '') => `${BASE}/c/${SLUG}/patients/${PID}/aftercare/${kind}/${qs}`;

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

const CONTRAST_JS = () => {
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, a, under) => top.map((c, i) => Math.round(c * a + under[i] * (1 - a)));
  const bgOf = (el) => {
    // Composite the backgrounds from the element up to the root; the body's background is the floor.
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) layers.push(c); }
    let bg = [255, 255, 255];
    const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (rootBg && rootBg.a > 0) bg = over(rootBg.rgb, rootBg.a, bg);
    for (const l of layers.reverse()) bg = over(l.rgb, l.a, bg);
    return bg;
  };
  const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
    const el = n.parentElement; const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const fgc = fg.a < 1 ? over(fg.rgb, fg.a, bg) : fg.rgb;
    out.push({ text: t.slice(0, 40), size: parseFloat(cs.fontSize), ratio: +ratio(fgc, bg).toFixed(2), fg: cs.color, bg: `rgb(${bg.join(',')})` });
  }
  return out;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const results = [];
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`);
  await page.fill('input[name="email"]', 'liwayway.domingo@example.com');
  await page.fill('input[name="password"]', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[data-go]')]);
  ok(page.url().includes('/c/'), `${theme}: signed in, landed on ${page.url()}`);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const resp = await page.goto(url('extraction', `?visit=${VISIT}`));
    ok(resp.status() === 200, `${theme} ${width}: extraction sheet is 200`);
    await page.screenshot({ path: `${OUT}/aftercare-${theme}-${width}.png`, fullPage: true });
    const m = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      sheets: [...document.querySelectorAll('article.ac-sheet')].map((a) => ({ lang: a.getAttribute('lang'), w: Math.round(a.getBoundingClientRect().width), x: Math.round(a.getBoundingClientRect().x), h: Math.round(a.getBoundingClientRect().height) })),
      back: document.querySelector('.px-back')?.getAttribute('href'),
      targets: [...document.querySelectorAll('.px-back, .px-print, .ac-langs a')].map((e) => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })),
      current: document.querySelector('.ac-langs a[aria-current="page"]')?.textContent.trim(),
      title: document.title,
      h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      phoneLines: [...document.querySelectorAll('.ac-phone')].map((p) => p.textContent.trim()),
      foots: [...document.querySelectorAll('.ac-foot')].map((p) => p.textContent.trim()),
      lists: [...document.querySelectorAll('.ac-list')].map((u) => u.children.length),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }));
    ok(m.scrollW <= m.innerW, `${theme} ${width}: no sideways scroll (scrollWidth ${m.scrollW} <= ${m.innerW})`);
    ok(m.sheets.length === 2 && m.sheets[0].lang === 'en' && m.sheets[1].lang === 'fil', `${theme} ${width}: two sheets, en then fil: ${JSON.stringify(m.sheets)}`);
    if (width === 1440) ok(m.sheets[1].x > m.sheets[0].x + m.sheets[0].w - 1, `${theme} ${width}: sheets side by side`);
    else ok(m.sheets[1].x === m.sheets[0].x, `${theme} ${width}: sheets stacked`);
    ok(m.back === `/c/${SLUG}/patients/${PID}/?visit=${VISIT}#timeline`, `${theme} ${width}: back link carries the visit: ${m.back}`);
    ok(m.targets.every((t) => t.h >= 44 && t.w >= 44), `${theme} ${width}: every control >= 44px: ${JSON.stringify(m.targets)}`);
    ok(m.current === 'Both', `${theme} ${width}: current language pill is Both`);
    ok(m.lists.length === 6 && m.lists.every((n) => n >= 4 && n <= 8), `${theme} ${width}: six lists of 4 to 8 lines: ${m.lists.join(',')}`);
    const contrast = await page.evaluate(CONTRAST_JS);
    const low = contrast.filter((c) => c.ratio < 4.5);
    const min = Math.min(...contrast.map((c) => c.ratio));
    ok(low.length === 0, `${theme} ${width}: ${contrast.length} text runs measured, lowest ${min}:1${low.length ? ' LOW: ' + JSON.stringify(low.slice(0, 5)) : ''}`);
    results.push({ theme, width, body: m.bodyBg, title: m.title, h1s: m.h1s, phone: m.phoneLines, foots: m.foots, min, count: contrast.length });
  }

  if (theme === 'light') {
    // The chosen theme (localStorage) must match the device theme: chosen dark on a light device.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch {} });
    await page.goto(url('extraction'));
    const chosen = await page.evaluate(() => ({ html: document.documentElement.dataset.theme, bar: getComputedStyle(document.querySelector('.px-bar')).backgroundColor, body: getComputedStyle(document.body).backgroundColor, paper: getComputedStyle(document.querySelector('.ac-sheet')).backgroundColor, ink: getComputedStyle(document.querySelector('.ac-list li')).color }));
    ok(chosen.html === 'dark' && chosen.bar === 'rgb(29, 35, 42)' && chosen.body === 'rgb(21, 25, 30)', `chosen dark on a light device: bar ${chosen.bar}, body ${chosen.body}`);
    ok(chosen.paper === 'rgb(255, 255, 255)' && chosen.ink === 'rgb(31, 41, 55)', `chosen dark: the paper stays white with slate ink (${chosen.paper}, ${chosen.ink})`);
    await page.screenshot({ path: `${OUT}/aftercare-chosen-dark-1440.png`, fullPage: false });
    await page.addInitScript(() => { try { localStorage.removeItem('theme'); } catch {} });

    // ?lang=en and ?lang=fil: one sheet each; a bad lang is both.
    for (const [qs, want] of [['?lang=en', ['en']], ['?lang=fil', ['fil']], ['?lang=zz', ['en', 'fil']]]) {
      await page.goto(url('extraction', qs));
      const langs = await page.evaluate(() => [...document.querySelectorAll('article.ac-sheet')].map((a) => a.getAttribute('lang')));
      const cur = await page.evaluate(() => document.querySelector('.ac-langs a[aria-current="page"]')?.textContent.trim());
      ok(JSON.stringify(langs) === JSON.stringify(want), `${qs}: sheets ${JSON.stringify(langs)}, current pill ${cur}`);
    }
    await page.goto(url('extraction'));
    const back0 = await page.evaluate(() => document.querySelector('.px-back')?.getAttribute('href'));
    ok(back0 === `/c/${SLUG}/patients/${PID}/#timeline`, `no visit: back link is the Timeline: ${back0}`);

    // Print: the bar hides, the sheets stack, and an A5 PDF has one page per language.
    await page.goto(url('extraction'));
    await page.emulateMedia({ media: 'print' });
    const pr = await page.evaluate(() => ({ bar: getComputedStyle(document.querySelector('.px-bar')).display, main: getComputedStyle(document.querySelector('.ac-main')).display, body: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.querySelector('.ac-list li')).color, radius: getComputedStyle(document.querySelector('.ac-sheet')).borderRadius }));
    ok(pr.bar === 'none' && pr.main === 'block' && pr.body === 'rgb(255, 255, 255)' && pr.radius === '0px', `print: bar ${pr.bar}, main ${pr.main}, body ${pr.body}, ink ${pr.ink}, radius ${pr.radius}`);
    const pdf = await page.pdf({ format: 'A5', preferCSSPageSize: true, printBackground: true });
    writeFileSync(`${OUT}/aftercare-extraction.pdf`, pdf);
    const pdfEn = await (async () => { await page.goto(url('extraction', '?lang=en')); return page.pdf({ format: 'A5', preferCSSPageSize: true }); })();
    writeFileSync(`${OUT}/aftercare-extraction-en.pdf`, pdfEn);
    await page.emulateMedia({ media: null });

    // 404s: an unknown kind, an unknown patient, a kind that is not a plain key.
    for (const [u, what] of [[url('nonsense'), 'unknown kind'], [url('toString'), 'a prototype key as kind'], [`${BASE}/c/${SLUG}/patients/00000000-0000-4000-8000-000000000000/aftercare/extraction/`, 'unknown patient'], [`${BASE}/c/${SLUG}/patients/not-a-uuid/aftercare/extraction/`, 'a non-uuid patient']]) {
      const r = await page.goto(u);
      const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent.trim());
      ok(r.status() === 404, `${what}: ${r.status()} (${h1})`);
    }
    // Every kind opens.
    for (const k of ['extraction', 'surgical_extraction', 'root_canal', 'filling', 'cleaning', 'crown', 'denture', 'braces_adjustment', 'whitening']) {
      const r = await page.goto(url(k));
      const cc = r.headers()['cache-control'];
      const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent.trim());
      ok(r.status() === 200 && cc === 'no-store', `${k}: ${r.status()}, Cache-Control ${cc}, "${h1}"`);
    }
    // Signed out, the sheet is not served.
    const anon = await browser.newContext();
    const ar = await anon.request.get(url('extraction'), { maxRedirects: 0 });
    ok(ar.status() >= 300 && ar.status() < 400, `signed out: ${ar.status()} -> ${ar.headers().location}`);
    await anon.close();
  }
  await ctx.close();
}
await browser.close();
console.log('\nsummary:', JSON.stringify(results, null, 1));
console.log(fails ? `\n${fails} FAIL(S)` : '\nALL OK');
process.exit(fails ? 1 : 0);
