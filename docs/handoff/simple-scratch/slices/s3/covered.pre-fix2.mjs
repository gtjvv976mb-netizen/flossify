// S3 check: nothing the record lands on or opens is covered by the sticky block (the top bar, the row, and its pinned
// safety copy). Bounding rectangles and hit tests:
//  A. landings: ?treated=…#chart-offer (the chart's offer), and cards by their anchor (#files #loas #treatment-lab
//     #payplans #notes #rx #letters #texts #health #vitals #consent #recall #visits) — the card's top is below the block
//     (and on screen), and a hit test at its top finds the card.
//  B. side panels opened while the row is pinned (Add ▾'s items, Edit details, This visit's buttons): the panel's title is
//     on screen and a hit test at its middle finds the panel (a dialog in the top layer).
//  C. the chart's palette opened on a tooth just below the pinned block, and on one the page scrolled under it first:
//     the palette's title and its first action are hit where they are drawn.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const RICH = '7e57a1c0-0000-4000-8000-000000000001', PIN = '7e57a1c0-0000-4000-8000-000000000301', MARIA = '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb';
const SIZES = (process.env.SIZES_ ?? '1366x768,1440x900,1024x768,768x1024,390x844').split(',').map((s) => s.split('x').map(Number));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0, n = 0; const errors = [];
const report = (w, h, who, what, bad, info) => { n++; if (bad) fails++; if (bad || process.env.V_) console.log(`${w}x${h} ${who} ${what}: ${bad ? 'FAIL ' + bad : 'ok'} ${info ?? ''}`); };
const blockBottom = `(() => { const t = document.querySelector('[data-ws-top]').getBoundingClientRect(); const bar = document.querySelector('[data-rec-bar]'); const br = bar.getBoundingClientRect();
  const pin = bar.querySelector('[data-rec-pin]'); const pinned = getComputedStyle(pin).visibility === 'visible' && getComputedStyle(pin).display !== 'none';
  const stuck = br.top <= t.bottom + 1; return Math.max(t.bottom, stuck ? (pinned ? pin.getBoundingClientRect().bottom : br.bottom) : 0); })()`;
for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  // A. landings
  const landings = [[RICH, '?treated=7e57a1c0-0000-4000-8000-0000000000d1#chart-offer', 'chart-offer'], [RICH, '?saved=done&treated=7e57a1c0-0000-4000-8000-0000000000d1#chart-offer', 'chart-offer'],
    [PIN, '?treated=7e57a1c0-0000-4000-8000-0000000000d1#chart-offer', null],
    ...['files', 'loas', 'treatment-lab', 'treatment', 'notes', 'rx', 'letters', 'texts', 'health', 'vitals', 'consent', 'recall', 'visits', 'money'].flatMap((a) => [[RICH, `#${a}`, a], [PIN, `#${a}`, a]])];
  for (const [id, q, el] of landings) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/${id}/${q}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    const r = await page.evaluate(([el, bb]) => {
      const e = el && document.getElementById(el); if (!e || !e.checkVisibility()) return { none: true };
      const cover = eval(bb); const rect = e.getBoundingClientRect();
      const x = rect.left + Math.min(40, rect.width / 2), y = rect.top + 4;
      const hit = document.elementFromPoint(x, y);
      return { top: Math.round(rect.top), cover: Math.round(cover), onScreen: rect.top < innerHeight - 40, hit: !!hit && (e.contains(hit) || hit === e), pinned: document.querySelector('[data-rec-bar]').hasAttribute('data-pinned') };
    }, [el, blockBottom]);
    const who = id === RICH ? 'rich' : 'pin ';
    if (r.none) { report(w, h, who, `land ${q}`, null, '(no such card here)'); continue; }
    report(w, h, who, `land ${q}`, r.top < r.cover ? `top ${r.top} under the block ${r.cover}` : !r.hit ? 'hit test missed the card' : !r.onScreen ? 'below the screen' : null, `top ${r.top}, block ends ${r.cover}${r.pinned ? ' (pinned)' : ''}`);
  }
  // B. panels, opened while pinned
  for (const id of [RICH, PIN]) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' });
    const opens = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-rec-add-item], .rec-actions [data-ws-open], #this-visit [data-ws-open]')].map((x) => x.getAttribute('data-ws-open')))]);
    for (const o of opens) {
      await page.evaluate(() => { const y = document.querySelector('[data-rec-bar]').getBoundingClientRect().top + scrollY; scrollTo(0, y + 400); });
      await page.waitForTimeout(250);
      const pinned = await page.evaluate(() => document.querySelector('[data-rec-bar]').hasAttribute('data-pinned'));
      await page.evaluate((o) => { const d = document.getElementById(o); const opener = document.querySelector(`[data-ws-open="${o}"]`); if (opener) opener.click(); }, o);
      await page.waitForTimeout(300);
      const r = await page.evaluate((o) => {
        const d = document.getElementById(o); if (!d || !d.open) return { closed: true };
        const t = d.querySelector('h2, h3, [data-ws-panel-title], .ws-panel-title') ?? d; const rect = t.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { top: Math.round(rect.top), hit: !!hit && d.contains(hit), text: t.textContent.trim().slice(0, 30) };
      }, o);
      const who = id === RICH ? 'rich' : 'pin ';
      report(w, h, who, `panel ${o}`, r.closed ? 'did not open' : !r.hit ? 'title not hit' : r.top < 0 ? 'title above the screen' : null, `"${r.text}" top ${r.top}${pinned ? ' (pinned behind)' : ''}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
  }
  // C. the palette, on the Chart & plan tab, pinned
  if (w >= 768) for (const id of [RICH, PIN]) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/#chart`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    for (const mode of ['just below', 'under then clicked']) {
      const tooth = await page.evaluate(([mode, bb]) => {
        const teeth = [...document.querySelectorAll('[data-tooth]')].filter((t) => t.checkVisibility());
        const t = teeth.find((x) => x.closest('[data-arch]')?.dataset.arch !== 'lower') ?? teeth[0];
        const y = t.getBoundingClientRect().top + scrollY;
        // Put the tooth just under where the pinned block ends (the block's height is --rec-stick when pinned).
        const stick = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rec-stick'));
        scrollTo(0, mode === 'just below' ? y - stick - 6 : y - stick + 40);
        return teeth.indexOf(t);
      }, [mode, blockBottom]);
      await page.waitForTimeout(300);
      // 'under then clicked': the tooth is under the block; a person cannot reach it there — scrolled in by focus (Tab), then Enter.
      const clickable = await page.evaluate(([i, bb]) => { const t = [...document.querySelectorAll('[data-tooth]')].filter((x) => x.checkVisibility())[i]; const r = t.getBoundingClientRect(); const cover = eval(bb);
        return { top: Math.round(r.top), cover: Math.round(cover), under: r.top < cover }; }, [tooth, blockBottom]);
      if (clickable.under) { await page.evaluate((i) => { const t = [...document.querySelectorAll('[data-tooth]')].filter((x) => x.checkVisibility())[i]; t.focus(); }, tooth); await page.keyboard.press('Enter'); }
      else await page.evaluate((i) => [...document.querySelectorAll('[data-tooth]')].filter((x) => x.checkVisibility())[i].click(), tooth);
      await page.waitForTimeout(400);
      const r = await page.evaluate((bb) => {
        const p = document.querySelector('[data-palette]'); if (!p || !p.matches(':popover-open')) return { closed: true };
        const t = p.querySelector('[data-palette-title]'); const rt = t.getBoundingClientRect(); const rp = p.getBoundingClientRect();
        const hit = document.elementFromPoint(rt.left + 10, rt.top + rt.height / 2);
        const act = [...p.querySelectorAll('button')].find((x) => x.checkVisibility()); const ra = act?.getBoundingClientRect();
        const hitA = ra ? document.elementFromPoint(ra.left + ra.width / 2, ra.top + ra.height / 2) : null;
        const pinned = document.querySelector('[data-rec-bar]').hasAttribute('data-pinned');
        return { top: Math.round(rp.top), bottom: Math.round(rp.bottom), cover: Math.round(eval(bb)), hit: !!hit && p.contains(hit), hitA: !act || (!!hitA && p.contains(hitA)), pinned, tooth: document.activeElement?.getAttribute('aria-label')?.slice(0, 20) };
      }, blockBottom);
      const who = id === RICH ? 'rich' : 'pin ';
      report(w, h, who, `palette (${mode}, tooth y${clickable.top}${clickable.under ? ', under the block: focused' : ''})`, r.closed ? 'did not open' : !r.hit ? 'title covered' : !r.hitA ? 'first action covered' : null,
        `palette y${r.top}–${r.bottom}, block ends ${r.cover}${r.pinned ? ' (pinned)' : ''}${r.top < r.cover ? ' — drawn over the block (top layer)' : ''}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
  }
  await ctx.close();
}
await b.close();
console.log(`page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
console.log(`${n} cases, ${fails} failing`);
process.exit(fails || errors.length ? 1 : 0);
