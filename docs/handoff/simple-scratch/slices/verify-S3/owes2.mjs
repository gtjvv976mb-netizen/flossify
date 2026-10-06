import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', none: '7e57a1c0-0000-4000-8000-000000000302', ledger: '9ea415bd-4b9e-4725-80e8-391464e2c12e', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const who of ['hazel.tabanao@example.com', 'liwayway.domingo@example.com']) for (const vw of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', who); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  for (const [n, id] of Object.entries(P)) {
    const res = await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' });
    const html = await res.text();
    const r = await page.evaluate(() => ({ head: document.querySelector('.rec-facts')?.textContent.replace(/\s+/g, ' ').trim(), owes: [...document.querySelectorAll('.rec-owes')].map((a) => a.getAttribute('href')), pesoVisible: document.body.innerText.includes('₱') }));
    console.log(who.split('@')[0], vw, n, JSON.stringify(r), 'html has ₱:', html.includes('₱'), 'Owes/credit words:', /Owes|In credit|Nothing owed/.test(html));
  }
  await ctx.close();
}
await b.close();
