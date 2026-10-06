import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [w, h] of [[1440, 900], [390, 844], [1024, 768]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const qs of ['', '?saved=details#overview', '?saved=note&back=overview#overview', '?saved=vitals&back=patient#patient', '?back=chart', '#chart', '?visit=1b9c069c-4521-41fc-b079-559aaa843e6a']) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/${qs}`, { waitUntil: 'load' }); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const bar = document.querySelector('[data-rec-bar]').getBoundingClientRect(); const sel = document.querySelector('[role=tab][aria-selected=true]'); const line = document.querySelector('[data-rec-panel]:not([hidden]) > .ws-callout, [data-rec-panel]:not([hidden]) > div > .ws-callout'); const lr = line?.getBoundingClientRect(); return { y: Math.round(scrollY), hash: location.hash, tab: sel?.id, bar: [Math.round(bar.top), Math.round(bar.bottom)], savedLine: lr ? [Math.round(lr.top), Math.round(lr.bottom), line.innerText.slice(0, 40)] : null, dlg: [...document.querySelectorAll('dialog[open]')].map((d) => d.id) }; });
    console.log(w, qs || '(plain)', JSON.stringify(r));
  }
  await ctx.close();
}
await b.close();
