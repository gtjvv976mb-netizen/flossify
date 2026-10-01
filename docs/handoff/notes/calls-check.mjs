// Calls page checks: sign in as the owner, the flows, the print view, and the measurements
// (contrast against the pixels behind every line, targets ≥ 44px, no sideways scroll) at 1440/390, light/dark.
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4413';
const OUT = process.env.OUT ?? '.';
const SLUG = 'session-road';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const lum = ([r, g, bl]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const parseRgb = (s) => { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };

async function signIn(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth/login/?any=1`);
  await p.fill('#email', 'liwayway.domingo@example.com');
  await p.fill('#password', 'flossify');
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  await p.close();
}

async function measure(ctx, theme, width, tag) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  await p.addInitScript((t) => { try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch {} }, theme);
  await p.goto(`${BASE}/c/${SLUG}/calls/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/calls-${tag}.png`, fullPage: true });
  const scroll = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight }));
  // Text elements: every element with a non-blank direct text node, visible; their colour and document rect.
  const texts = await p.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const rect = r.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (el.closest('.sr-only, .cs-sheet, [hidden], dialog:not([open]), script, style, noscript')) continue;
      if (cs.clipPath !== 'none' || cs.clip !== 'auto') continue;
      // The shell's skip link waits above the page until it is focused: not on screen.
      if (rect.bottom + scrollY <= 0 || rect.right <= 0) continue;
      out.push({ sel: el.className?.baseVal ?? el.className, tag: el.tagName, text: n.textContent.trim().slice(0, 40), color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight, x: rect.left + scrollX, y: rect.top + scrollY, w: rect.width, h: rect.height });
    }
    return out;
  });
  // Targets: links, buttons, fields.
  const targets = await p.evaluate(() => [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button]')].map((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), cls: el.className?.baseVal ?? el.className, w: r.width, h: r.height, visible: !!(r.width && r.height) && cs.visibility !== 'hidden' && !el.closest('.sr-only, .cs-sheet, [hidden], dialog:not([open])') };
  }).filter((t) => t.visible));
  // Hide every word (and the icons drawn in currentColor), shoot, and sample what is behind each line.
  await p.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; text-shadow: none !important; } svg { visibility: hidden !important; }' });
  await p.waitForTimeout(150);
  const png = await p.screenshot({ fullPage: true });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { x = Math.min(info.width - 1, Math.max(0, Math.round(x))); y = Math.min(info.height - 1, Math.max(0, Math.round(y))); const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const fails = [];
  let lowest = { r: 99, text: '' };
  for (const t of texts) {
    const fg = parseRgb(t.color); if (!fg) continue;
    let min = 99, worst = null;
    const stepX = Math.max(1, t.w / 24), stepY = Math.max(1, t.h / 6);
    for (let y = t.y + 1; y < t.y + t.h - 1; y += stepY) for (let x = t.x + 1; x < t.x + t.w - 1; x += stepX) {
      const bg = px(x, y); const r = ratio(fg, bg); if (r < min) { min = r; worst = bg; }
    }
    if (min < lowest.r) lowest = { r: min, text: t.text, cls: t.sel, color: t.color, bg: worst };
    if (min < 4.5) fails.push({ text: t.text, cls: t.sel, tag: t.tag, color: t.color, bg: worst, ratio: +min.toFixed(2), size: t.size, weight: t.weight });
  }
  // The shell's own search field (42px, every workspace page) is the layout's, not this page's: named apart.
  const small = targets.filter((t) => (t.w < 44 || t.h < 44) && !/ws-search-input/.test(t.cls));
  const shellSmall = targets.filter((t) => (t.w < 44 || t.h < 44) && /ws-search-input/.test(t.cls)).length;
  if (shellSmall) console.log(`   (shell: ${shellSmall} target under 44px belongs to the layout's search field)`);
  console.log(`[${tag}] ${texts.length} lines, lowest ${lowest.r.toFixed(2)}:1 ("${lowest.text}" ${lowest.cls} ${lowest.color} over rgb(${lowest.bg})), ${fails.length} under 4.5; ${targets.length} targets, ${small.length} under 44px; scrollWidth ${scroll.sw} / innerWidth ${scroll.iw}${scroll.sw > scroll.iw ? '  SIDEWAYS SCROLL' : ''}`);
  for (const f of fails) console.log('   FAIL', JSON.stringify(f));
  for (const s of small) console.log('   SMALL', JSON.stringify(s));
  await p.close();
  return { lines: texts.length, lowest: +lowest.r.toFixed(2), fails: fails.length, targets: targets.length, small: small.length, sideways: scroll.sw > scroll.iw };
}

const ctx = await b.newContext({ ignoreHTTPSErrors: true });
await signIn(ctx);

const post = async (p, fields) => {
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle' }), p.evaluate(([here, fields]) => {
    const f = document.createElement('form'); f.method = 'post'; f.action = here;
    for (const [k, v] of fields) { const i = document.createElement('input'); i.name = k; i.value = v; f.appendChild(i); }
    document.body.appendChild(f); f.submit();
  }, [`/c/${SLUG}/calls/`, fields])]);
};

if (!process.env.MEASURE_ONLY) {
  // --- the flows ---
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto(`${BASE}/c/${SLUG}/calls/`, { waitUntil: 'networkidle' });
  console.log('title:', await p.title(), '| h1:', await p.locator('h1').first().textContent());
  const rowsBefore = await p.locator('#confirm .cs-row').count();
  console.log('rows still to confirm:', rowsBefore, '| days:', await p.locator('.cs-day-head').allTextContents());
  console.log('call back rows:', await p.locator('#callback .cs-row').count(), await p.locator('#callback .cs-name').allTextContents());
  console.log('reminder lines:', await p.locator('.cs-rem').allTextContents());
  console.log('tel links:', await p.locator('.cs-tel').evaluateAll((as) => as.map((a) => a.getAttribute('href'))));
  console.log('book again:', await p.locator('#callback a.ws-btn').evaluateAll((as) => as.map((a) => a.getAttribute('href'))));

  // Confirmed on the first single row (one person on the number).
  const target = p.locator('#confirm .cs-row:not([data-family])').first();
  const targetId = await target.locator('input[name=visit]').first().inputValue();
  const targetName = await target.locator('.cs-name').first().innerText();
  console.log('target row:', targetName, targetId);
  await Promise.all([p.waitForNavigation(), target.locator('button', { hasText: 'Confirmed' }).first().click()]);
  console.log('after Confirmed → url', p.url(), '| status callout:', await p.locator('[role=status]').first().textContent());
  console.log('rows still holding that visit:', await p.locator(`#confirm input[name=visit][value="${targetId}"]`).count(), '| rows:', await p.locator('#confirm .cs-row').count());
  console.log('CONFIRMED_ID', targetId);

  // Left message on the family row (Joel + Bea, one number).
  const fam = p.locator('#confirm .cs-row[data-family]').first();
  console.log('family row names:', await fam.locator('.cs-name').allTextContents(), '| confirmed buttons in it:', await fam.locator('button', { hasText: 'Confirmed' }).count());
  await Promise.all([p.waitForNavigation(), fam.locator('button', { hasText: 'Left message' }).click()]);
  console.log('after Left message → url', p.url(), '| callout:', await p.locator('[role=status]').first().textContent());
  console.log('attempt line:', await p.locator('#confirm .cs-row[data-family] .cs-tried').allTextContents());
  await Promise.all([p.waitForNavigation(), p.locator('#confirm .cs-row[data-family]').first().locator('button', { hasText: 'No answer' }).click()]);
  console.log('attempt line after No answer:', await p.locator('#confirm .cs-row[data-family] .cs-tried').allTextContents());

  // A confirm posted for a completed visit: refused with the server's sentence, no crash.
  const csrf = await p.locator('input[name=_csrf]').first().inputValue();
  await post(p, [['_csrf', csrf], ['intent', 'confirm'], ['visit', '4399b808-189a-4294-9035-2668462613ae']]);
  console.log('completed→confirm: title', await p.title(), '| alert:', await p.locator('[role=alert]').first().textContent().catch(() => '(none)'));
  await post(p, [['_csrf', csrf], ['intent', 'left_message'], ['visit', '4399b808-189a-4294-9035-2668462613ae']]);
  console.log('completed→left_message alert:', await p.locator('[role=alert]').first().textContent().catch(() => '(none)'));
  await post(p, [['_csrf', 'nope'], ['intent', 'confirm'], ['visit', 'aad5f277-da1f-4505-b6b9-87e7085cd534']]);
  console.log('bad csrf alert:', await p.locator('[role=alert]').first().textContent().catch(() => '(none)'));
  await post(p, [['_csrf', csrf], ['intent', 'wrong_number'], ['visit', 'aad5f277-da1f-4505-b6b9-87e7085cd534']]);
  console.log('unknown intent alert:', await p.locator('[role=alert]').first().textContent().catch(() => '(none)'));

  // Print view.
  await p.goto(`${BASE}/c/${SLUG}/calls/`, { waitUntil: 'networkidle' });
  await p.emulateMedia({ media: 'print' });
  const pr = await p.evaluate(() => {
    const vis = (s) => { const el = document.querySelector(s); if (!el) return 'missing'; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== 'none' && r.height > 0 ? `shown ${Math.round(r.width)}x${Math.round(r.height)}` : 'hidden'; };
    return { sheet: vis('.cs-sheet'), side: vis('.ws-side'), top: vis('.ws-top'), screen: vis('.cs-screen'), tabrow: vis('.ws-tabrow'), backdrop: vis('.ws-backdrop'), rows: document.querySelectorAll('.cs-sheet tbody tr').length, tables: document.querySelectorAll('.cs-sheet-table').length, color: getComputedStyle(document.querySelector('.cs-sheet td')).color, bodyBg: getComputedStyle(document.body).backgroundColor, heads: [...document.querySelectorAll('.cs-sheet th')].map((t) => t.textContent) };
  });
  console.log('print:', JSON.stringify(pr));
  await p.setViewportSize({ width: 794, height: 1123 });
  await p.screenshot({ path: `${OUT}/calls-print.png`, fullPage: true });
  await p.pdf({ path: `${OUT}/calls-print.pdf`, format: 'A4' });
  await p.emulateMedia({ media: 'screen' });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await p.click('[data-cs-print]');
  console.log('print button calls window.print:', await p.evaluate(() => window.__printed));
  await p.close();
}

// --- measurements ---
const res = {};
for (const [theme, width, tag] of [['light', 1440, 'light-1440'], ['dark', 1440, 'dark-1440'], ['light', 390, 'light-390'], ['dark', 390, 'dark-390']]) res[tag] = await measure(ctx, theme, width, tag);
console.log('SUMMARY', JSON.stringify(res));
await b.close();
