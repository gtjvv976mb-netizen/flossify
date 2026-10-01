// Contrast of every word on the Treatment record against the pixels behind it: light and dark, 1440 and 390.
import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
import sharp from '/home/user/flossify/node_modules/sharp/lib/index.js';
const BASE = 'http://127.0.0.1:4399';
const IDS = ['1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', '9c5cddc3-e786-4050-96eb-9effd1829fba', 'dc9ec446-24d5-439b-999f-9e3013b671f5'];
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ROOT = '#rec-treatment-record';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/auth/login/?any=1`);
await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
let fails = 0;
for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  let worst = 99, worstWhat = '', n = 0;
  for (const id of IDS) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/#treatment-record`, { waitUntil: 'networkidle' });
    await page.evaluate((t) => { localStorage.theme = t; document.documentElement.dataset.theme = t; }, theme);
    const H = await page.evaluate((R) => { const r = document.querySelector(R).getBoundingClientRect(); return [r.top + scrollY, r.height]; }, ROOT);
    for (let y = H[0] - 80; y < H[0] + H[1]; y += 700) {
      await page.evaluate((yy) => scrollTo(0, yy), y);
      await page.waitForTimeout(150);
      const items = await page.evaluate((R) => {
        const out = [];
        const w = document.createTreeWalker(document.querySelector(R), NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          if (!t.textContent.trim()) continue;
          const el = t.parentElement;
          if (el.closest('.sr-only, [hidden]')) continue;
          const th = el.closest('thead'); if (th && th.getBoundingClientRect().width <= 2) continue;
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const rg = document.createRange(); rg.selectNodeContents(t);
          for (const r of rg.getClientRects()) {
            if (!r.width || !r.height || r.top < 64 || r.bottom > innerHeight) continue;
            const m = cs.color.match(/[\d.]+/g).map(Number);
            out.push({ text: t.textContent.replace(/\s+/g, ' ').trim().slice(0, 36), fg: m.slice(0, 3), box: [Math.round(r.left) + 1, Math.round(r.top) + 1, Math.round(r.width) - 2, Math.round(r.height) - 2], size: cs.fontSize });
          }
        }
        const st = document.createElement('style'); st.id = 'mute';
        st.textContent = `${R}, ${R} * { color: transparent !important; text-decoration-color: transparent !important; transition: none !important; } ${R} svg { visibility: hidden !important; }`;
        document.head.append(st);
        return out;
      }, ROOT);
      const png = await page.screenshot({ fullPage: false });
      await page.evaluate(() => document.getElementById('mute')?.remove());
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      for (const it of items) {
        const [x0, y0, w, h] = it.box;
        let lo = 99, hi = -1, loPx, hiPx;
        for (let yy = Math.max(0, y0); yy < Math.min(info.height, y0 + h); yy++) for (let x = Math.max(0, x0); x < Math.min(info.width, x0 + w); x++) {
          const i = (yy * info.width + x) * info.channels; const px = [data[i], data[i + 1], data[i + 2]]; const l = lum(px);
          if (l < lo) { lo = l; loPx = px; } if (l > hi) { hi = l; hiPx = px; }
        }
        if (!loPx) continue;
        const c = Math.min(ratio(it.fg, loPx), ratio(it.fg, hiPx)); n++;
        if (c < worst) { worst = c; worstWhat = `"${it.text}" ${it.size} fg ${it.fg}`; }
        if (c < 4.5) { console.log(`  LOW ${theme} ${width} "${it.text}" ${c.toFixed(2)} fg ${it.fg} lo ${loPx} hi ${hiPx}`); fails++; }
      }
    }
  }
  console.log(`${theme} ${width}: ${n} words, lowest ${worst.toFixed(2)}:1 — ${worstWhat}`);
}
await browser.close();
console.log(`${fails} under 4.5:1`);
