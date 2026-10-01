import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:4399', SLUG = 'session-road';
const JOEL = 'b4121c23-8dbc-4f9e-91cc-ea8fbd2df542', VISIT = '1bb3da6b-9e32-4630-a975-e0b69a29f293';
const say = (k, v) => console.log(k + ':', typeof v === 'string' ? v : JSON.stringify(v));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${BASE}/auth/login/?any=1`); await p.fill('#email', 'liwayway.domingo@example.com'); await p.fill('#password', 'flossify');
await Promise.all([p.waitForNavigation(), p.click('button[type="submit"]')]);
// Record a filling on Joel's visit from the strip's panel.
await p.goto(`${BASE}/c/${SLUG}/patients/${JOEL}/?visit=${VISIT}&open=done#treatment-done`, { waitUntil: 'networkidle' });
say('strip lines before', await p.$$eval('#this-visit .vs-line .vs-words', (ls) => ls.map((l) => l.textContent)));
const opt = await p.$$eval('#rec-done-add select[name="catalog_id"] option', (os) => os.map((o) => [o.value, o.textContent.trim()]).find(([, t]) => /filling|restoration|composite/i.test(t)) ?? null);
say('filling option', opt);
await p.selectOption('#rec-done-add select[name="catalog_id"]', opt[0]);
await p.fill('#rec-done-add input[name="fdi"]', '36'); await p.fill('#rec-done-add input[name="surface"]', 'MOD');
const d = await p.$eval('#rec-done-add select[name="dentist"]', (s) => s.value || [...s.options].find((o) => o.value)?.value);
await p.selectOption('#rec-done-add select[name="dentist"]', d);
await Promise.all([p.waitForNavigation(), p.click('#rec-done-add button[type="submit"]')]);
say('done pills', await p.$$eval('#this-visit .vs-done .vs-go', (ps) => ps.map((x) => x.textContent.trim())));
say('consent line', await p.$$eval('#this-visit .vs-line', (ls) => ls.filter((l) => /Consent/.test(l.textContent)).map((l) => l.innerText.replace(/\s+/g, ' '))));
// The charge page with both service= and visit=: the visit's treatment wins.
await p.goto(`${BASE}/c/${SLUG}/finances/new/?patient=${JOEL}&service=${opt[0]}&visit=${VISIT}`, { waitUntil: 'networkidle' });
say('visit note', await p.$eval('[data-visit-note]', (e) => e.textContent.trim().slice(0, 120)).catch(() => 'none'));
say('lines', await p.$$eval('[data-line]', (ls) => ls.map((l) => [l.querySelector('[data-line-desc]').value, l.querySelector('[data-line-price]').value, !!l.querySelector('[data-line-procedure]').value])));
// Save without paying; the line names the treatment.
await Promise.all([p.waitForNavigation(), p.click('[data-bill-save]')]);
say('saved', p.url().replace(BASE, ''));
// Charging the same visit again: nothing left, the booked service as the line.
await p.goto(`${BASE}/c/${SLUG}/finances/new/?patient=${JOEL}&service=${opt[0]}&visit=${VISIT}`, { waitUntil: 'networkidle' });
say('second time note', await p.$eval('[data-visit-note]', (e) => e.textContent.trim().slice(0, 140)).catch(() => 'none'));
say('second time lines', await p.$$eval('[data-line]', (ls) => ls.map((l) => [l.querySelector('[data-line-desc]').value, !!l.querySelector('[data-line-procedure]').value])));
say('errors', errs.length ? errs.join(' || ') : 'none');
await b.close();
