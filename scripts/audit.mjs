import { chromium } from 'playwright';
// Screenshots land in ./shots, which .gitignore keeps out of the repo.
const OUT = process.env.SHOT_DIR || 'shots';
await (await import('node:fs/promises')).mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const lum = (c) => {
  const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
    v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
};
const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const scheme of ['light', 'dark']) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);

  const samples = await p.evaluate(() => {
    const pick = (sel, label) => {
      const el = document.querySelector(sel); if (!el) return null;
      // Only rgb() backgrounds can be read numerically. A translucent
      // masthead computes to oklab(), whose three numbers are NOT r/g/b —
      // parsing them as such produced a fake contrast failure. Walk past
      // anything that is not rgb and fall back to the page ground.
      let bg = '', n = el;
      while (n) {
        const c = getComputedStyle(n).backgroundColor;
        if (c.startsWith('rgb') && !c.endsWith(', 0)')) { bg = c; break; }
        n = n.parentElement;
      }
      if (!bg) bg = getComputedStyle(document.body).backgroundColor;
      return { label, fg: getComputedStyle(el).color, bg };
    };
    return [
      pick('#hero-title', 'hero headline'),
      pick('main p.text-ink-2', 'body copy'),
      pick('.meta', 'mono metadata'),
      pick('.sec-no', 'section number'),
      pick('.meta-accent', 'accent metadata'),
      pick('.btn-primary', 'primary button'),
      pick('.on-invert h2', 'inverted headline'),
      pick('.idx-title', 'services title'),
    ].filter(Boolean);
  });

  console.log(`\n=== ${scheme.toUpperCase()} — contrast ===`);
  for (const s of samples) {
    const r = ratio(s.fg, s.bg);
    console.log(`${r >= 4.5 ? 'PASS' : r >= 3 ? 'LARGE-ONLY' : 'FAIL'}  ${r.toFixed(2).padStart(6)}  ${s.label}`);
  }

  await p.screenshot({ path: `${OUT}/${scheme}-hero.png` });
  await p.evaluate(() => scrollTo(0, document.querySelector('#services').offsetTop - 60));
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/${scheme}-services.png` });
  await p.close();
}

// --- reduced motion: the tour must still be readable, nothing left invisible
const rm = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await rm.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await rm.waitForTimeout(500);
const rmState = await rm.evaluate(() => {
  const invisible = [];
  for (const el of document.querySelectorAll('main *')) {
    const s = getComputedStyle(el);
    if (parseFloat(s.opacity) < 0.05 && el.getBoundingClientRect().height > 4 && !el.closest('[hidden]'))
      invisible.push(el.tagName + '.' + String(el.className).slice(0, 44));
  }
  const film = document.querySelector('[data-film]');
  return {
    filmHeight: film.offsetHeight,
    videoHidden: getComputedStyle(document.querySelector('video')).display === 'none',
    invisible: invisible.slice(0, 6),
  };
});
console.log('\n=== REDUCED MOTION ===');
console.log(rmState);
await rm.screenshot({ path: `${OUT}/reduced-motion.png`, fullPage: false });
await rm.close();

// --- keyboard
const kb = await b.newPage({ viewport: { width: 1440, height: 900 } });
await kb.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
const order = [];
for (let i = 0; i < 12; i++) {
  await kb.keyboard.press('Tab');
  order.push(await kb.evaluate(() => {
    const a = document.activeElement;
    const s = getComputedStyle(a);
    return `${a.tagName}[${(a.textContent || '').trim().slice(0, 26)}] outline=${s.outlineWidth}`;
  }));
}
console.log('\n=== TAB ORDER ===');
order.forEach((o, i) => console.log(String(i + 1).padStart(2), o));

// arrow keys on the product rail
await kb.evaluate(() => document.querySelector('[data-rail]').focus());
await kb.keyboard.press('ArrowDown');
console.log('\nrail after ArrowDown:', await kb.evaluate(() => {
  const sel = [...document.querySelectorAll('[data-rail]')].findIndex(r => r.getAttribute('aria-selected') === 'true');
  const shown = [...document.querySelectorAll('[role=tabpanel]')].findIndex(p => !p.hidden);
  return { selectedTab: sel, visiblePanel: shown, match: sel === shown };
}));
await kb.close();

// --- mobile
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
await m.waitForTimeout(400);
console.log('\n=== MOBILE 390 ===');
console.log(await m.evaluate(() => ({
  horizontalScroll: document.documentElement.scrollWidth > innerWidth
    ? `OVERFLOW by ${document.documentElement.scrollWidth - innerWidth}px` : 'none',
  videoSrc: (document.querySelector('video').getAttribute('src') || 'none').split('/').pop(),
  filmSticky: getComputedStyle(document.querySelector('.film-stage')).position,
})));
await m.screenshot({ path: `${OUT}/mobile-hero.png` });
await m.evaluate(() => scrollTo(0, document.querySelector('#tour').offsetTop + 200));
await m.waitForTimeout(500);
await m.screenshot({ path: `${OUT}/mobile-tour.png` });
await m.close();
await b.close();
