// A real booking through the glass page, then Undo. node book-e2e.mjs <slug> <phone>
import { chromium } from 'playwright';
const [slug = 'session-road', phone = '0917 555 7310'] = process.argv.slice(2);
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const log = [];
p.on('response', async (r) => { if (r.url().includes('/api/bookings')) log.push(`${r.request().method()} ${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`); });
await p.goto(`http://127.0.0.1:4610/find/${slug}/book/`, { waitUntil: 'load' });
await p.waitForTimeout(800);
const next = async () => { await p.tap('[data-next]'); await p.waitForTimeout(600); };
await p.tap('label.chip-radio:has(input[value=consultation])');
await next();                                   // dentist
await p.tap('label.row-radio:nth-child(2)');      // a named dentist
await next();                                   // when
const ws = await p.evaluate(() => document.querySelector('main').dataset.workspace === '1');
if (ws) { await p.waitForSelector('[data-slot-days] .slot-radio'); const slots = await p.$$('[data-slot-days] .slot-radio'); await slots[Math.min(5, slots.length - 1)].tap(); }
else { await p.fill('input[name=reqDate]', new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10)); await p.selectOption('select[name=reqTime]', 'Afternoon'); }
await next();                                   // who
await p.fill('input[name=name]', 'Glass Test'); await p.fill('input[name=phone]', phone);
await p.tap('.pt-consent label');
await next();                                   // confirm
const summary = await p.$$eval('[data-summary] .pt-sum-row', (rs) => rs.map((r) => r.textContent.trim()));
await p.tap('[data-next]');
await p.waitForSelector('[data-done-panel]:not([hidden])', { timeout: 15000 });
await p.waitForTimeout(800);
const done = await p.evaluate(() => ({ title: document.querySelector('[data-done-title]').textContent, text: document.querySelector('[data-done-text]').textContent, ref: document.querySelector('[data-ref]').textContent, focus: document.activeElement?.matches('[data-done-title]'), mine: document.querySelectorAll('[data-mine-list] li').length, ics: !!document.querySelector('[data-ics]').href }));
await p.screenshot({ path: `/private/tmp/claude-502/-Users-michaelkennethbrillantes-flossify/253c9e59-b8a1-43a1-9a1c-9c96c3c08d0d/scratchpad/cl/ss/e2e-${slug}-done.png`, fullPage: true });
await Promise.all([p.waitForNavigation({ timeout: 15000 }), p.tap('[data-undo]')]);
await p.waitForTimeout(800);
const after = await p.evaluate(() => ({ url: location.href, mine: JSON.parse(localStorage.getItem('flossify:bookings') || '[]').length }));
console.log(JSON.stringify({ summary, done, after, log, errs }, null, 1));
await browser.close();
