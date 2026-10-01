// The review's fixes: charge once (a treatment already on a live statement is refused), the prefill's zero and
// out-of-range prices, Paid now landing on ?done=paid, and the walk-in's Filipino name split.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4399', SLUG = 'session-road';
const CARLOS = '9c5cddc3-e786-4050-96eb-9effd1829fba', CVISIT = '4399b808-189a-4294-9035-2668462613ae';
const JOEL = 'b4121c23-8dbc-4f9e-91cc-ea8fbd2df542', JVISIT = '1bb3da6b-9e32-4630-a975-e0b69a29f293';
const CHARGED = '0409ae28-74e2-4496-8538-a4b04425a62b';
const say = (k, v) => console.log(k + ':', typeof v === 'string' ? v : JSON.stringify(v));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${BASE}/auth/login/?any=1`); await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);

// 1. Prefill: 3000 is above the guide's 1,500–2,500 → a free line; 0 → price left blank.
await p.goto(`${BASE}/c/${SLUG}/finances/new/?patient=${CARLOS}&visit=${CVISIT}`, { waitUntil: 'networkidle' });
say('prefill lines [desc, price, catalog, procedure]', await p.$$eval('[data-line]', (ls) => ls.map((l) => [l.querySelector('[data-line-desc]').value, l.querySelector('[data-line-price]').value, !!l.querySelector('[data-line-catalog]').value, !!l.querySelector('[data-line-procedure]').value])));
// Fill the blank price, pay now in cash.
const blanks = await p.$$('[data-line] [data-line-price]');
for (const i of blanks) if (!(await i.inputValue())) await i.fill('500');
await p.check('[data-pay-now]'); await p.waitForTimeout(150);
say('pay amount', await p.$eval('[data-pay-amount]', (i) => i.value));
await Promise.all([p.waitForNavigation(), p.click('[data-bill-save]')]);
say('after save', p.url().replace(BASE, ''));
say('page says', await p.$eval('main', (e) => (e.innerText.match(/acknowledg[^\n]{0,60}/i) ?? ['(none)'])[0]));

// 2. Charge once: put Joel's already-charged treatment on a new statement → refused, nothing saved.
await p.goto(`${BASE}/c/${SLUG}/finances/new/?patient=${JOEL}&visit=${JVISIT}`, { waitUntil: 'networkidle' });
const n = await p.$$eval('[data-line]', (ls) => ls.length);
if (!n) { await p.click('[data-bill-add-free]'); await p.fill('[data-line] [data-line-desc]', 'Filling again'); await p.fill('[data-line] [data-line-price]', '2000'); }
await p.$eval('[data-line] [data-line-procedure]', (i, v) => { i.value = v; }, CHARGED);
await Promise.all([p.waitForNavigation(), p.click('[data-bill-save]')]);
say('double charge url', p.url().replace(BASE, ''));
say('double charge problems', await p.$$eval('[data-bill-problems] li', (ls) => ls.map((l) => l.textContent.trim())));

// 3. Walk-in name: "Maria Cristina Dela Cruz Jr." through the schedule API.
await p.goto(`${BASE}/c/${SLUG}/`, { waitUntil: 'networkidle' });
const csrf = await p.evaluate(() => document.cookie.match(/fl_csrf=([^;]+)/)?.[1] ?? document.querySelector('input[name="_csrf"]')?.value ?? '');
const token = csrf || await p.evaluate(async () => { const r = await fetch(location.pathname); const t = await r.text(); return t.match(/"csrf":"([^"]+)"/)?.[1] ?? ''; });
const res = await p.evaluate(async ([t, slug]) => {
  const at = new Date(Date.now() + 5 * 60e3); at.setSeconds(0, 0); at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5);
  const r = await fetch('/api/schedule', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf': t }, body: JSON.stringify({ clinic: slug, newPatient: { name: 'Maria Cristina Dela Cruz Jr.', phone: '09175550777' }, chair: 3, startsAt: at.toISOString(), minutes: 30, reason: 'Walk-in check', status: 'arrived' }) });
  return [r.status, await r.text()];
}, [token, SLUG]);
say('walk-in api', `${res[0]} ${res[1].slice(0, 160)}`);
say('errors', errs.length ? errs.join(' || ') : 'none');
await b.close();
