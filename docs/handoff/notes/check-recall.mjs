// The recall list on the Patients tab, measured: pills and counts, each filter's rows, the row lines,
// the live search, pill clicks (and the sort a filter starts with), the no-JS parts, contrast of every
// new line (light and dark, 1440 and 390) and no sideways scroll at 390.
import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:4415';
const LIST = `${BASE}/c/session-road/patients/`;
let fails = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Sign in as the owner on the email door.
await page.goto(`${BASE}/auth/login/?any=1`);
await page.fill('#email', 'liwayway.domingo@example.com');
await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
await page.goto(LIST);
ok(page.url().startsWith(LIST), `signed in and on the list: ${page.url()}`);

const pills = async () => page.$$eval('a[data-pts-f]', (as) => as.map((a) => ({
  f: a.dataset.ptsF, label: a.querySelector('.ws-seg-label').textContent.trim(), n: Number(a.querySelector('.ws-seg-count').textContent), current: a.getAttribute('aria-current') === 'page',
})));
const rows = async () => page.$$eval('tr.pts-row', (trs) => trs.map((tr) => ({
  name: tr.querySelector('.pts-name').textContent.trim(),
  visits: [...tr.querySelectorAll('.pts-c-visits .pts-line')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()),
  check: tr.querySelector('.pts-c-check').textContent.replace(/\s+/g, ' ').trim(),
})));

console.log('\n--- pills ---');
const P = await pills();
for (const p of P) console.log(`  ${p.f.padEnd(10)} ${p.label.padEnd(20)} ${p.n}`);
ok(P.map((p) => p.f).join(' ') === 'all today new due quiet balance attention', 'pill order: All · Today · New · Due for check-up · Not seen in a year · With balance · Needs attention');
const count = (f) => P.find((p) => p.f === f).n;

console.log('\n--- each filter ---');
const seen = {};
for (const f of ['all', 'today', 'new', 'due', 'quiet', 'balance', 'attention']) {
  await page.goto(`${LIST}?f=${f}`);
  const rs = await rows();
  seen[f] = rs;
  const said = await page.$eval('[data-pts-said]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
  console.log(`  ${f}: ${rs.length} rows — ${rs.map((r) => r.name).join(', ')}`);
  console.log(`     said: ${said}`);
  ok(rs.length === count(f), `${f}: the pill says ${count(f)} and the list has ${rs.length}`);
  const pp = await pills();
  ok(pp.find((p) => p.f === f).current, `${f}: its pill is current`);
}
ok(seen.due.map((r) => r.name).join(' | ') === 'Recall Overdue | Recall Soon', `due: Recall Overdue (most overdue) then Recall Soon — got ${seen.due.map((r) => r.name).join(' | ')}`);
ok(seen.quiet.map((r) => r.name).join(' | ') === 'Quiet Fourteen', `quiet: only Quiet Fourteen — got ${seen.quiet.map((r) => r.name).join(' | ')}`);
ok(seen.attention.some((r) => r.name === 'Stale History'), 'attention: includes Stale History');
ok(!seen.attention.some((r) => ['Recall Soon', 'Recall Overdue', 'Quiet Fourteen'].includes(r.name)), 'attention: the other three seeded records are complete');
const sortWord = async () => page.$eval('[data-pts-sort-word]', (e) => e.textContent.trim());
await page.goto(`${LIST}?f=due`);
ok((await sortWord()) === 'Check-up due', `due filter starts sorted by Check-up due (sort word: ${await sortWord()})`);
ok(!(await page.$('[data-pts-keep="sort"]')), 'due filter: no hidden sort input at its default');

console.log('\n--- row lines ---');
const soon = seen.due.find((r) => r.name === 'Recall Soon');
const over = seen.due.find((r) => r.name === 'Recall Overdue');
const quiet = seen.quiet[0];
const stale = seen.attention.find((r) => r.name === 'Stale History');
for (const r of [soon, over, quiet, stale]) console.log(`  ${r.name}: ${r.visits.join(' / ')} — ${r.check}`);
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const [ty, tm, td] = today.split('-').map(Number);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayShort = (d) => { const x = new Date(Date.UTC(ty, tm - 1, td + d)); return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
ok(soon.visits.includes(`Check-up due ${dayShort(10)} · cleaning`), `Recall Soon: "Check-up due ${dayShort(10)} · cleaning"`);
ok(!soon.visits.some((v) => v.startsWith('Texted')), 'Recall Soon: no Texted line (never texted)');
ok(over.visits.includes(`Check-up overdue since ${dayShort(-20)} · Periodontal maintenance`), `Recall Overdue: "Check-up overdue since ${dayShort(-20)} · Periodontal maintenance"`);
ok(over.visits.some((v) => v.startsWith('Texted 24 Sep')), 'Recall Overdue: "Texted 24 Sep"');
ok(quiet.visits.some((v) => /^Last seen 14 months ago · \d+ \w+ 2025$/.test(v)), `Quiet Fourteen on quiet: "Last seen 14 months ago · <date>" — ${quiet.visits[1]}`);
ok(stale.check === 'Needs health history update', `Stale History: "Needs health history update" — ${stale.check}`);
const all = seen.all;
ok(all.find((r) => r.name === 'Quiet Fourteen').visits[1].startsWith('Last ') && !all.find((r) => r.name === 'Quiet Fourteen').visits[1].includes('ago'), 'Quiet Fourteen on All: the plain date, no age');
const overdueWord = await page.$eval('tr.pts-row .pts-overdue', (e) => e.textContent);
ok(overdueWord === 'overdue', 'the amber word is "overdue" (words, not colour alone)');

console.log('\n--- live search and pill clicks (script) ---');
await page.goto(LIST);
await page.evaluate(() => { window.__marker = 1; });
await page.fill('[data-pts-q]', 'Recall');
await page.waitForFunction(() => document.querySelectorAll('tr.pts-row').length === 2 && location.search === '?q=Recall');
ok(await page.evaluate(() => window.__marker === 1), 'typing "Recall": the list swapped in place (no navigation)');
ok((await rows()).map((r) => r.name).join(' | ') === 'Recall Overdue | Recall Soon', `typing "Recall": Recall Overdue, Recall Soon — ${(await rows()).map((r) => r.name).join(' | ')}`);
const P2 = await pills();
ok(P2.find((p) => p.f === 'due').n === 2 && P2.find((p) => p.f === 'quiet').n === 0 && P2.find((p) => p.f === 'all').n === 2, `typing "Recall": the pills count the search (all 2, due 2, quiet 0)`);
await page.click('a[data-pts-f="due"]');
await page.waitForFunction(() => location.search === '?q=Recall&f=due');
ok(await page.evaluate(() => window.__marker === 1), 'clicking Due for check-up: in place');
ok((await sortWord()) === 'Check-up due', `clicking Due for check-up: the sort word becomes Check-up due (${await sortWord()})`);
ok((await rows()).map((r) => r.name).join(' | ') === 'Recall Overdue | Recall Soon', 'clicking Due for check-up: most overdue first');
ok(await page.evaluate(() => document.activeElement?.dataset.ptsF === 'due'), 'focus stays on the chosen pill');
await page.click('a[data-pts-f="all"]');
await page.waitForFunction(() => location.search === '?q=Recall');
ok((await sortWord()) === 'Last name', `back to All: the sort word is Last name again (${await sortWord()})`);
// A sort the person chose stays across filters.
await page.click('.pts-sort-btn');
await page.click('.pts-sort-menu a[data-pts-sort="last"]');
await page.waitForFunction(() => location.search === '?q=Recall&sort=last');
await page.click('a[data-pts-f="due"]');
await page.waitForFunction(() => location.search === '?q=Recall&f=due&sort=last');
ok((await sortWord()) === 'Last visit', `a chosen sort (Last visit) stays on Due for check-up (${await sortWord()})`);
ok(await page.$eval('[data-pts-keep="sort"]', (e) => e.value) === 'last', 'the search form keeps sort=last as a hidden input');
await page.fill('[data-pts-q]', '');
await page.waitForFunction(() => location.search === '?f=due&sort=last');
ok((await rows()).length === 2, 'clearing the search on Due: both due patients again');
// A search that matches someone in All but nobody on Due offers all patients.
await page.fill('[data-pts-q]', 'Quiet');
await page.waitForFunction(() => document.querySelectorAll('tr.pts-row').length === 0 && location.search === '?q=Quiet&f=due&sort=last');
const emptyText = await page.$eval('.pts-empty', (e) => e.textContent.replace(/\s+/g, ' ').trim());
ok(emptyText.replace('.Look', '. Look') === 'No patient matches “Quiet” in Due for check-up. Look in all patients', `empty search on Due says so and offers all patients — "${emptyText}"`);
ok(await page.$eval('.pts-empty a', (a) => a.getAttribute('href')) === '/c/session-road/patients/?q=Quiet&sort=last', 'and that link keeps the search and the chosen sort');

console.log('\n--- no JavaScript (parts and plain links, fetched as the page does) ---');
const get = (url) => page.evaluate(async (u) => { const r = await fetch(u, { credentials: 'same-origin' }); return { status: r.status, cc: r.headers.get('cache-control'), text: await r.text() }; }, url);
const part = await get(`${LIST}?part=list&f=quiet`);
ok(part.status === 200 && part.text.includes('Quiet Fourteen') && !part.text.includes('<html'), '?part=list&f=quiet is the bare part with Quiet Fourteen');
ok(part.cc === 'no-store', 'the part is no-store');
const plain = (await get(`${LIST}?f=due`)).text;
ok(plain.includes('href="/c/session-road/patients/?f=due&amp;sort=name"') && /href="\/c\/session-road\/patients\/\?f=due" aria-current="page" data-pts-sort="due"/.test(plain), 'on Due the sort menu links Last name as ?f=due&sort=name and Check-up due (current) as ?f=due');
ok(/href="\/c\/session-road\/patients\/\?f=quiet"/.test(plain), 'on Due the Not seen in a year pill links ?f=quiet (its own default sort, nothing written)');
ok(/href="\/c\/session-road\/patients\/\?f=due"/.test((await get(LIST)).text), 'on All the Due pill links ?f=due alone');
const odd = (await get(`${LIST}?f=nonsense&sort=whatever`)).text;
ok(odd.includes('aria-current="page" data-pts-f="all"') && odd.includes('aria-current="page" data-pts-sort="name"'), 'unknown ?f and ?sort fall back to All by name');
const withSort = (await get(`${LIST}?f=all&sort=last`)).text;
ok(/href="\/c\/session-road\/patients\/\?f=due&amp;sort=last"/.test(withSort), 'a chosen sort (last) is carried by the Due pill link');

console.log('\n--- contrast and width ---');
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Every text node of the new lines and pills: its colour, and the colour behind it (ancestors' backgrounds composited).
const SEL = '.pts-recall, .pts-recall > *, .pts-overdue, .pts-c-visits .pts-line, .pts-c-visits .pts-line > *, .pts-need, .pts-need + *, a[data-pts-f="due"] > *, a[data-pts-f="quiet"] > *, .pts-said, .pts-rule';
const measure = async () => page.evaluate((SEL) => {
  const parse = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return m.length === 3 ? [...m, 1] : m; };
  const behind = (el) => {
    let out = [255, 255, 255];
    const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e);
    for (const e of chain.reverse()) {
      const [r, g, b, a] = parse(getComputedStyle(e).backgroundColor);
      if (a > 0) out = [r, g, b].map((c, i) => Math.round(c * a + out[i] * (1 - a)));
    }
    return out;
  };
  const list = [];
  for (const el of document.querySelectorAll(SEL)) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    const cs = getComputedStyle(el);
    list.push({ text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), fg: parse(cs.color).slice(0, 3), bg: behind(el.parentElement), size: cs.fontSize, cls: el.className });
  }
  return list;
}, SEL);
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => { localStorage.theme = t; document.documentElement.dataset.theme = t; }, theme);
    let worst = 99, worstWhat = '';
    let n = 0;
    for (const f of ['due', 'quiet', 'attention']) {
      await page.goto(`${LIST}?f=${f}`);
      for (const m of await measure()) {
        const c = ratio(m.fg, m.bg); n++;
        if (c < worst) { worst = c; worstWhat = `${f} "${m.text}" ${m.size} fg ${m.fg} on ${m.bg}`; }
        if (c < 4.5) console.log(`  LOW ${theme} ${width} ${f} "${m.text}" ${c.toFixed(2)} ${m.cls}`);
      }
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth, document.body.scrollWidth]);
      ok(sw[0] <= sw[1] && sw[2] <= sw[1], `${theme} ${width} ${f}: no sideways scroll (scrollWidth ${sw[0]}, innerWidth ${sw[1]})`);
    }
    ok(worst >= 4.5, `${theme} ${width}: ${n} lines measured, lowest ${worst.toFixed(2)}:1 — ${worstWhat}`);
    if (width === 1440) { await page.goto(`${LIST}?f=due`); console.log('  behind the overdue word: ' + (await page.evaluate(() => { const out = []; for (let e = document.querySelector('.pts-overdue'); e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b !== 'rgba(0, 0, 0, 0)') out.push(`${e.tagName}.${e.className.split(' ')[0]} ${b}`); } return out.join(' < '); }))); }
    if (width === 390) {
      await page.goto(`${LIST}?f=due`);
      await page.screenshot({ path: `/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/due-${theme}-390.png`, fullPage: false });
    } else {
      await page.goto(`${LIST}?f=due`);
      await page.screenshot({ path: `/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/due-${theme}-1440.png`, fullPage: false });
    }
  }
}
// Targets: every pill at least 44px tall.
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(LIST);
const short = await page.$$eval('a[data-pts-f]', (as) => as.map((a) => [a.dataset.ptsF, a.getBoundingClientRect().height]).filter(([, h]) => h < 44));
ok(short.length === 0, `every pill ≥ 44px at 390 (${short.map((s) => s.join(':')).join(', ') || 'none short'})`);

await browser.close();
console.log(`\n${fails} failures`);
process.exit(fails ? 1 : 0);
