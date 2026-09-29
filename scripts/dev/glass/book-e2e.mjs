// A real booking through the glass page, then Undo.
//   node book-e2e.mjs <slug> <phone> [base=http://127.0.0.1:4610] [slot] [outdir=os.tmpdir()]
// With `slot` (an ISO time as the /find/ cards write it, "2026-09-24T09:30:00+08:00") the page opens with that
// time held: it must never show the When step while the time still fits (the strip has no data-tone).
// The steps are driven from whichever fieldset is visible, never from a fixed order, so the run walks three to
// five steps as the clinic has them. Prints the visited steps, the done screen, the calendar file's DTSTART and
// what Undo left behind. Set PW_CHROMIUM to a Chromium binary when Playwright's own is not installed.
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [slug = 'session-road', phone = '0917 555 7310', base = 'http://127.0.0.1:4610', slot = '', outdir = tmpdir()] = process.argv.slice(2);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const log = [];
p.on('response', async (r) => { if (r.url().includes('/api/bookings')) log.push(`${r.request().method()} ${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`); });
await p.goto(`${base}/find/${slug}/book/${slot ? `?slot=${encodeURIComponent(slot)}` : ''}`, { waitUntil: 'load' });
await p.waitForTimeout(800);
const next = async () => { await p.tap('[data-next]'); await p.waitForTimeout(700); };
const visited = [];
let summary = [];
for (let turn = 0; turn < 8; turn++) {
  const step = await p.evaluate(() => document.querySelector('fieldset[data-step]:not([hidden])')?.dataset.step ?? null);
  if (!step || !(await p.isVisible('[data-wizard]'))) break;
  visited.push(step);
  if (step === 'reason') await p.tap('label.chip-radio:has(input[value=consultation])');
  else if (step === 'dentist') await p.tap(slot ? 'label.row-radio:has(input[name=dentist][value=""])' : 'label.row-radio:nth-child(2)');
  else if (step === 'when') {
    const held = await p.evaluate(() => { const s = document.querySelector('[data-slot-strip]'); return s ? !s.dataset.tone : false; });
    if (held) throw new Error('The When step was shown while the held time still fits.');
    const ws = await p.evaluate(() => document.querySelector('main').dataset.workspace === '1');
    if (ws) { await p.waitForSelector('[data-slot-days] .slot-radio'); const slots = await p.$$('[data-slot-days] .slot-radio'); await slots[Math.min(5, slots.length - 1)].tap(); }
    else { await p.fill('input[name=reqDate]', new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10)); await p.selectOption('select[name=reqTime]', 'Afternoon'); }
  } else if (step === 'who') {
    await p.fill('input[name=name]', 'Glass Test'); await p.fill('input[name=phone]', phone);
    await p.tap('.pt-consent label');
  } else if (step === 'confirm') {
    summary = await p.$$eval('[data-summary] .pt-sum-row', (rs) => rs.map((r) => r.textContent.trim()));
    await p.tap('[data-next]');
    break;
  }
  await next();
}
await p.waitForSelector('[data-done-panel]:not([hidden])', { timeout: 15000 });
await p.waitForTimeout(800);
const done = await p.evaluate(() => ({ title: document.querySelector('[data-done-title]').textContent, text: document.querySelector('[data-done-text]').textContent, ref: document.querySelector('[data-ref]').textContent, focus: document.activeElement?.matches('[data-done-title]'), mine: document.querySelectorAll('[data-mine-list] li').length, ics: document.querySelector('[data-ics]').href }));
const dtstart = decodeURIComponent(done.ics.replace(/^data:text\/calendar;charset=utf-8,/, '')).split('\r\n').find((l) => l.startsWith('DTSTART')) ?? null;
delete done.ics;
const shot = join(outdir, `e2e-${slug}-done.png`);
await p.screenshot({ path: shot, fullPage: true });
await Promise.all([p.waitForNavigation({ timeout: 15000 }), p.tap('[data-undo]')]);
await p.waitForTimeout(800);
const after = await p.evaluate(() => ({ url: location.href, mine: JSON.parse(localStorage.getItem('flossify:bookings') || '[]').length }));
console.log(JSON.stringify({ visited, summary, done, dtstart, after, shot, log, errs }, null, 1));
await browser.close();
