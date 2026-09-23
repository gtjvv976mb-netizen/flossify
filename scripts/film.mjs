// Measures the whole-page film against a running preview: document scroll ->
// currentTime, the frame actually shown at each stop (mean luminance, so two
// stops on the same frame would be caught), the header's room, panes, that
// nothing is fixed to the foot,
// under normal and Reduce Motion at 1440px, and at 390px.
// Headless Chromium has no H.264, so the two MP4s are redirected to a VP9 copy
// the server itself serves (a fulfilled body has no byte ranges and cannot be
// seeked). Make one with:
//   ffmpeg -i public/video/tour-960.mp4 -an -c:v libvpx-vp9 -crf 34 -b:v 0 -g 5 dist/client/video/tour-test.webm
// Usage: node scripts/film.mjs <shot-dir> [preview-url]
import { chromium } from 'playwright';
const S = process.argv[2] || 'shots', BASE = process.argv[3] || 'http://localhost:4399/';
await (await import('node:fs/promises')).mkdir(S, { recursive: true });
const b = await chromium.launch();
const route = (p) => p.route('**/video/tour-*.mp4', (r) => r.continue({ url: new URL('/video/tour-test.webm', BASE).href }));
const report = {};
const FR = [0, 0.08, 0.17, 0.3, 0.42, 0.55, 0.7, 0.8, 0.9, 1];

const scrub = async (p, tag) => {
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v && isFinite(v.duration) && v.duration > 0 && v.seekable.length > 0; }, null, { timeout: 20000 });
  const rows = [];
  for (const f of FR) {
    await p.evaluate((f) => scrollTo(0, Math.round(f * (document.documentElement.scrollHeight - innerHeight))), f);
    await p.waitForTimeout(400);
    rows.push(await p.evaluate((f) => {
      const v = document.querySelector('video');
      const stop = document.querySelector('[data-room]')?.textContent.trim();
      const sec = document.querySelector('[data-readout]')?.textContent;
      const vr = v.getBoundingClientRect();
      const c = document.createElement('canvas'); c.width = 32; c.height = 18; const g = c.getContext('2d');
      let lum = null;
      try { g.drawImage(v, 0, 0, 32, 18); const d = g.getImageData(0, 0, 32, 18).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; lum = Math.round(s / (d.length / 4)); } catch (e) { lum = 'err ' + e.message; }
      return { f, t: +v.currentTime.toFixed(2), stop, sec, lum, bar: document.querySelector('[data-progress]').style.width, videoCovers: vr.width >= innerWidth - 1 && vr.height >= innerHeight - 1 };
    }, f));
    if (tag && [0, 0.3, 0.55, 0.9].includes(f)) await p.screenshot({ path: `${S}/walk-${tag}-${f}.png` });
  }
  return rows;
};

const layout = (p) => p.evaluate(() => {
  scrollTo(0, document.documentElement.scrollHeight);
  // The owner removed the footer and the bottom rail: nothing may sit fixed at the foot.
  const fixedAtFoot = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); if (cs.position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.height > 0 && r.height < innerHeight && r.bottom >= innerHeight - 1; }).map((e) => e.className);
  return {
    overflowX: document.documentElement.scrollWidth - innerWidth,
    footers: document.querySelectorAll('footer').length, fixedAtFoot,
    panes: [...document.querySelectorAll('.pane')].map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { w: Math.round(r.width), bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow }; }),
    filmFixed: getComputedStyle(document.querySelector('.film-bg')).position,
    posterHidden: document.querySelector('.film-poster').hasAttribute('data-hide'),
    hintHidden: document.querySelector('[data-film-hint]').hasAttribute('data-hide'),
    docScreens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1),
  };
});

const hero = (p) => p.evaluate(() => {
  const h1 = document.querySelector('#hero-title'); const cs = getComputedStyle(h1);
  return { color: cs.color, size: cs.fontSize, isIn: h1.classList.contains('is-in'), spans: [...document.querySelectorAll('#hero-title .line-clip > span')].map((s) => getComputedStyle(s).transform) };
});

for (const [name, opts] of [['desktop', {}], ['reduced', { reducedMotion: 'reduce' }]]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, ...opts });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e).split('\n')[0])); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
  await route(p); await p.goto(BASE, { waitUntil: 'load' });
  const rows = await scrub(p, name === 'desktop' ? 'desktop' : null);
  const lay = await layout(p);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(900);
  const h = await hero(p);
  if (name === 'reduced') await p.screenshot({ path: `${S}/walk-reduced-top.png` });
  // keyboard order from the top
  const order = [];
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => { const a = document.activeElement; return `${a.tagName}[${(a.textContent || '').trim().slice(0, 22)}] outline=${getComputedStyle(a).outlineWidth}`; })); }
  report[name] = { scrub: rows, layout: lay, hero: h, tabOrder: order, errors };
  await p.close();
}
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await route(p); await p.goto(BASE, { waitUntil: 'load' });
  const rows = await scrub(p, null);
  const lay = await layout(p);
  const src = await p.evaluate(() => document.querySelector('video').getAttribute('src'));
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
  await p.screenshot({ path: `${S}/walk-phone-top.png` });
  await p.evaluate(() => scrollTo(0, Math.round(0.3 * (document.documentElement.scrollHeight - innerHeight)))); await p.waitForTimeout(500);
  await p.screenshot({ path: `${S}/walk-phone-mid.png` });
  report.phone = { scrub: rows.filter((r, i) => i % 3 === 0), layout: lay, src, errors };
  await p.close();
}
await b.close();
console.log(JSON.stringify(report, null, 1));
