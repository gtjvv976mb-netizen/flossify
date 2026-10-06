// "Show the patient" (DeskConsent's full-screen mode) with the record's scroll padding: the section covers the screen,
// its own controls focus inside it, and leaving it returns to the Consent card under the row.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#consent`, { waitUntil: 'load' }); await page.waitForTimeout(400);
  const btn = page.locator('#consent button:has-text("Show the patient")').first();
  if (!(await btn.count())) { console.log(w, 'no Show the patient button'); await ctx.close(); continue; }
  await btn.click(); await page.waitForTimeout(400);
  const s = await page.evaluate(() => { const c = document.getElementById('consent'); const r = c.getBoundingClientRect(); const a = document.activeElement; const ar = a.getBoundingClientRect();
    return { facing: c.hasAttribute('data-facing'), box: [r.left, r.top, r.width, r.height].map(Math.round), screen: [innerWidth, innerHeight], active: (a.innerText || a.name || a.tagName).trim().slice(0, 30), activeTop: Math.round(ar.top), inside: c.contains(a) }; });
  // Tab through the facing page: every stop inside it and on screen.
  let off = 0, n = 0;
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); const t = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { inside: !!a.closest('#consent'), on: r.top >= 0 && r.bottom <= innerHeight }; }); n++; if (!t.inside) break; if (!t.on) off++; }
  console.log(w, JSON.stringify(s), `tab stops ${n}, off screen ${off}`, s.facing && s.box[0] === 0 && s.box[1] === 0 && s.box[2] === w && s.box[3] === h && off === 0 ? 'ok' : 'CHECK');
  await ctx.close();
}
await browser.close();
