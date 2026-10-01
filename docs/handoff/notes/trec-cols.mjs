import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4399';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(`${BASE}/auth/login/?any=1`);
await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
for (const w of [1440, 1366, 1920]) {
  await p.setViewportSize({ width: w, height: 900 });
  await p.goto(`${BASE}/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#treatment-record`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const t = document.querySelector('#rec-treatment-record table.trec');
    const wrap = t.parentElement.getBoundingClientRect().width;
    const cols = [...t.querySelectorAll('thead th')].map((th) => `${th.textContent.trim().slice(0, 10)}=${Math.round(th.getBoundingClientRect().width)}`);
    const lab = document.querySelector('#rec-rec-treatment-record-tab .rec-nav-label');
    const lr = lab.getBoundingClientRect();
    const clone = lab.cloneNode(true); clone.style.whiteSpace = 'nowrap'; clone.style.position = 'absolute'; clone.style.flex = 'none'; lab.parentElement.append(clone);
    const need = clone.getBoundingClientRect().width; clone.remove();
    return { wrap: Math.round(wrap), table: Math.round(t.getBoundingClientRect().width), cols: cols.join(' '), label: `${Math.round(lr.width)}x${Math.round(lr.height)} needs ${Math.round(need)}`, font: getComputedStyle(document.body).fontFamily.slice(0, 40) };
  });
  console.log(w, JSON.stringify(r));
}
await b.close();
