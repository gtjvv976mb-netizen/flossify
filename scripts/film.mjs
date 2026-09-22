// Measures the film against a running preview: scroll position -> currentTime,
// caption switching, the headline reveal, the phone layout and reduced motion.
// Headless Chromium has no H.264, so the two MP4s are redirected to a VP9 copy
// the server itself serves (a fulfilled body has no byte ranges and cannot be
// seeked). Make one with:
//   ffmpeg -i public/video/tour-960.mp4 -an -c:v libvpx-vp9 -crf 34 -b:v 0 -g 5 dist/video/tour-test.webm
// Usage: node scripts/film.mjs <shot-dir> [preview-url]
import { chromium } from 'playwright';
const S = process.argv[2] || 'shots', URL = process.argv[3] || 'http://localhost:4321/';
await (await import('node:fs/promises')).mkdir(S, { recursive: true });
const b = await chromium.launch();
// Redirect to the server's own copy so byte-range requests work; a fulfilled body is not seekable.
const route = async (p) => p.route('**/video/tour-*.mp4', r => r.continue({ url: new URL('/video/tour-test.webm', URL).href }));
const report = {};

// 1. desktop scrub + reveal
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await route(p); await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => { const v = document.querySelector('video'); return v && isFinite(v.duration) && v.duration > 0 && v.seekable.length > 0; }, null, { timeout: 15000 });
  const rows = [];
  for (const f of [0, 0.1, 0.17, 0.3, 0.42, 0.6, 0.8, 0.95, 1]) {
    await p.evaluate((f) => { const film = document.querySelector('[data-film]'); scrollTo(0, Math.round(film.offsetTop + f * (film.offsetHeight - innerHeight))); }, f);
    await p.waitForTimeout(450);
    rows.push(await p.evaluate((f) => { const v = document.querySelector('video'); return { f, t: +v.currentTime.toFixed(2), cap: [...document.querySelectorAll('.film-cap')].findIndex(c => c.hasAttribute('data-on')), rail: [...document.querySelectorAll('[data-film-stop]')].findIndex(c => c.hasAttribute('data-on')) }; }, f));
    if (f === 0.6) await p.screenshot({ path: `${S}/pw-desktop-corridor.png` });
    if (f === 0.95) await p.screenshot({ path: `${S}/pw-desktop-chair.png` });
  }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200);
  report.desktop = {
    scrub: rows,
    h1: await p.evaluate(() => ({ isIn: document.querySelector('#hero-title').classList.contains('is-in'), spans: [...document.querySelectorAll('#hero-title .line-clip > span')].map(s => getComputedStyle(s).transform) })),
    posterHidden: await p.evaluate(() => document.querySelector('.film-poster').hasAttribute('data-hide')),
    errors,
  };
  await p.screenshot({ path: `${S}/pw-desktop-top.png` });
  // keyboard order
  const order = [];
  for (let i = 0; i < 7; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => { const a = document.activeElement; return `${a.tagName}[${(a.textContent || '').trim().slice(0, 24)}] outline=${getComputedStyle(a).outlineWidth}`; })); }
  report.desktop.tabOrder = order;
  await p.close();
}
// 2. mobile
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await route(p); await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  report.mobile = await p.evaluate(() => {
    const hint = document.querySelector('[data-film-hint]').getBoundingClientRect(); const rail = document.querySelector('.film-rail').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, src: document.querySelector('video').getAttribute('src'), isIn: document.querySelector('#hero-title').classList.contains('is-in'), h1px: getComputedStyle(document.querySelector('#hero-title')).fontSize, railLabelsHidden: [...document.querySelectorAll('.film-stop-label')].every(l => getComputedStyle(l).display === 'none'), hintClearOfRail: hint.bottom <= rail.top, capBottom: Math.round(document.querySelector('.film-cap[data-on]').getBoundingClientRect().bottom), hintTop: Math.round(hint.top) };
  });
  await p.screenshot({ path: `${S}/pw-mobile-top.png` });
  await p.close();
}
// 3. reduced motion
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await route(p); await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(600);
  report.reduced = await p.evaluate(() => {
    const invisible = [];
    for (const el of document.querySelectorAll('main *')) { const s = getComputedStyle(el); if (parseFloat(s.opacity) < 0.05 && el.getBoundingClientRect().height > 4 && !el.closest('[hidden]') && s.visibility !== 'hidden' && s.display !== 'none') invisible.push(el.tagName + '.' + String(el.className).slice(0, 40)); }
    return { videoSrc: document.querySelector('video').getAttribute('src'), videoHidden: getComputedStyle(document.querySelector('video')).display === 'none', filmHeight: document.querySelector('[data-film]').offsetHeight, capsVisible: [...document.querySelectorAll('.film-cap')].map(c => getComputedStyle(c).visibility), h1Color: getComputedStyle(document.querySelector('#hero-title')).color, btnFilm: getComputedStyle(document.querySelector('.btn-film')).backgroundColor, invisible: invisible.slice(0, 6) };
  });
  await p.screenshot({ path: `${S}/pw-reduced.png`, fullPage: false });
  await p.close();
}
await b.close();
console.log(JSON.stringify(report, null, 1));
