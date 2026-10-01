// Contrast of every new line on the Patients tab against the pixels actually behind it (the card is
// frosted glass over the workspace's photo): the words are made transparent, the page is screenshotted,
// and each word's colour is measured against the lightest and the darkest pixel inside its own box.
// Light and dark, 1440 and 390, on Due for check-up, Not seen in a year and Needs attention.
import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
import sharp from '/home/user/flossify/node_modules/sharp/lib/index.js';

const BASE = 'http://127.0.0.1:4415';
const LIST = `${BASE}/c/session-road/patients/`;
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// The words that are new or changed: the check-up and texted lines, the overdue word, the quiet "seen … ago",
// the record check's "update", the two new pills (label and count, chosen or not) and the rule sentence.
const SEL = '.pts-recall > *, .pts-overdue, .pts-c-visits .pts-line > *, .pts-need, .pts-ok, a[data-pts-f="due"] > *, a[data-pts-f="quiet"] > *, .pts-said, .pts-rule, .pts-k';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`);
await page.fill('#email', 'liwayway.domingo@example.com');
await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);

let fails = 0;
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    let worst = 99, worstWhat = '', n = 0;
    for (const f of ['due', 'quiet', 'attention']) {
      await page.goto(`${LIST}?f=${f}`);
      await page.evaluate((t) => { localStorage.theme = t; document.documentElement.dataset.theme = t; }, theme);
      await page.waitForTimeout(250);
      // Each word's colour, box and text, then the words go transparent (icons too) and the page is shot.
      const items = await page.evaluate((SEL) => {
        const out = [];
        for (const el of document.querySelectorAll(SEL)) {
          const own = [...el.childNodes].some((k) => k.nodeType === 3 && k.textContent.trim());
          if (!own || el.closest('.sr-only')) continue;
          const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
          const cs = getComputedStyle(el);
          const m = cs.color.match(/[\d.]+/g).map(Number);
          out.push({ text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 36), fg: m.slice(0, 3), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], size: cs.fontSize });
        }
        const st = document.createElement('style');
        st.textContent = `${SEL}, ${SEL.split(', ').map((s) => s + ' *').join(', ')} { color: transparent !important; } .ws-icon { visibility: hidden !important; }`;
        document.head.append(st);
        return out;
      }, SEL);
      const png = await page.screenshot({ fullPage: false });
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      for (const it of items) {
        const [x0, y0, w, h] = it.box;
        let lo = 99, hi = 0, loPx, hiPx;
        for (let y = Math.max(0, y0); y < Math.min(info.height, y0 + h); y++) {
          for (let x = Math.max(0, x0); x < Math.min(info.width, x0 + w); x++) {
            const i = (y * info.width + x) * info.channels;
            const px = [data[i], data[i + 1], data[i + 2]];
            const l = lum(px);
            if (l < lo) { lo = l; loPx = px; }
            if (l > hi) { hi = l; hiPx = px; }
          }
        }
        if (!loPx) continue;
        const c = Math.min(ratio(it.fg, loPx), ratio(it.fg, hiPx));
        n++;
        if (c < worst) { worst = c; worstWhat = `${f} "${it.text}" ${it.size} fg ${it.fg} worst px ${ratio(it.fg, loPx) < ratio(it.fg, hiPx) ? loPx : hiPx}`; }
        if (c < 4.5) { console.log(`  LOW ${theme} ${width} ${f} "${it.text}" ${c.toFixed(2)} fg ${it.fg} lo ${loPx} hi ${hiPx}`); fails++; }
      }
    }
    console.log(`${theme} ${width}: ${n} words measured against their own pixels, lowest ${worst.toFixed(2)}:1 — ${worstWhat}`);
  }
}
await browser.close();
console.log(`${fails} under 4.5:1`);
process.exit(fails ? 1 : 0);
