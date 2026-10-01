// Text a patient: recipients with reasons, templates, sending, refusals, permission, contrast and targets.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:4414';
const MSG = `${BASE}/c/session-road/messages/`;
const CARLA = '78b698dd-06d4-4f80-9eca-f4e0f5b6a4d5';
const psql = (sql) => execSync(`psql -U root -h /var/run/postgresql -d flossify_dev -X -A -t -c "${sql.replace(/"/g, '\\"')}"`).toString().trim();
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok ' : 'BAD'} ${what}`); if (!ok) fails.push(what); };

// A patient with no reason at all, for ?to=.
psql(`insert into patient (clinic_id, chart_no, first_name, last_name, phone, birth_date) select id, 'T-904', 'Fe', 'Lim', '0921 555 0194', date '1990-01-01' from clinic where slug = 'session-road' on conflict do nothing`);
const FE = psql(`select id from patient where chart_no = 'T-904'`);

async function signIn(context, email, viewport) {
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  await page.goto(`${BASE}/auth/login/?any=1`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  return page;
}

const MEASURE = () => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (s) => { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.99) return c; e = e.parentElement; } return [255, 255, 255, 1]; };
  const ratio = (a, b) => { const la = lum(...a), lb = lum(...b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const dialog = document.getElementById('send');
  const out = [];
  const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || el.closest('option, optgroup')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fg = parse(cs.color); const bg = bgOf(el);
    const fgc = fg[3] < 1 ? fg.slice(0, 3).map((c, i) => Math.round(c * fg[3] + bg[i] * (1 - fg[3]))) : fg.slice(0, 3);
    out.push({ text: t.slice(0, 36), ratio: +ratio(fgc, bg).toFixed(2), size: cs.fontSize, el: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') });
  }
  for (const sel of ['select[data-send-patient]', 'textarea[data-send-body]']) {
    const el = dialog.querySelector(sel); if (!el) continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = parse(cs.backgroundColor);
    const b = bg && bg[3] > 0.99 ? bg : bgOf(el.parentElement);
    out.push({ text: sel, ratio: +ratio(fg.slice(0, 3), b).toFixed(2), size: cs.fontSize, el: sel });
  }
  const chips = [...document.querySelectorAll('[data-send-template]')].map((b) => { const r = b.getBoundingClientRect(); return { label: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }; });
  const body = dialog.querySelector('.ws-panel-body');
  const send = dialog.querySelector('button[type="submit"]').getBoundingClientRect();
  return {
    theme: document.documentElement.dataset.theme || 'device', width: innerWidth,
    lines: out, chips, sendH: Math.round(send.height),
    pageScroll: document.documentElement.scrollWidth <= innerWidth, panelScroll: body ? body.scrollWidth <= body.clientWidth : true,
  };
};

async function openAndFill(page) {
  await page.click('[data-ws-open="send"]');
  await page.waitForSelector('#send[open]');
  await page.selectOption('select[data-send-patient]', CARLA);
  await page.click('[data-send-template="lab"]');
}

async function measureAt(page, label) {
  await openAndFill(page);
  const m = await page.evaluate(MEASURE);
  const min = m.lines.reduce((a, l) => (l.ratio < a.ratio ? l : a), { ratio: 99 });
  const lows = m.lines.filter((l) => l.ratio < 4.5);
  check(lows.length === 0, `${label} (${m.theme}, ${m.width}px): ${m.lines.length} lines measured, lowest ${min.ratio}:1 (${min.el} "${min.text}" ${min.size})${lows.length ? ' LOW: ' + JSON.stringify(lows) : ''}`);
  const small = m.chips.filter((c) => c.h < 44 || c.w < 44);
  check(m.chips.length === 8 && small.length === 0, `${label}: ${m.chips.length} chips, heights ${[...new Set(m.chips.map((c) => c.h))].join('/')}px, narrowest ${Math.min(...m.chips.map((c) => c.w))}px; send button ${m.sendH}px`);
  check(m.pageScroll && m.panelScroll, `${label}: no sideways scroll (page ${m.pageScroll}, panel ${m.panelScroll})`);
  await page.keyboard.press('Escape');
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const before = Number(psql(`select count(*) from message_log where kind = 'manual'`));

// --- The owner -----------------------------------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context, 'liwayway.domingo@example.com');
  await page.goto(MSG);
  check(await page.locator('[data-ws-open="send"]').count() === 1, 'owner: Text a patient button is there');
  check((await page.locator('#send [data-ws-meta]').textContent()).trim() === 'Anyone with a reason to hear from you', 'owner: panel meta line');
  await page.click('[data-ws-open="send"]');
  await page.waitForSelector('#send[open]');
  const groups = await page.$$eval('select[data-send-patient] optgroup', (gs) => gs.map((g) => `${g.label} (${g.querySelectorAll('option').length})`));
  console.log('    groups:', groups.join(' · '));
  const options = await page.$$eval('select[data-send-patient] option', (os) => os.filter((o) => o.value).map((o) => o.textContent.trim()));
  console.log('    options:', options.join(' | '));
  check(['On the book', 'Seen recently', 'Due for a check-up', 'Lab work back'].every((g) => groups.some((x) => x.startsWith(g))), 'owner: the four reason groups are listed');
  const carlaGroup = await page.$eval(`option[value="${CARLA}"]`, (o) => o.closest('optgroup').label);
  check(carlaGroup === 'Seen recently', `owner: Carla (completed visit 6 days ago) is under "${carlaGroup}"`);
  const chipsShown = await page.$eval('[data-send-chips]', (el) => !el.hidden);
  const listHidden = await page.$eval('[data-send-template-list]', (el) => el.hidden);
  check(chipsShown && listHidden, 'owner: scripts on — chips shown, plain list hidden');
  await page.selectOption('select[data-send-patient]', CARLA);
  await page.click('[data-send-template="lab"]');
  const filled = await page.inputValue('textarea[data-send-body]');
  const count = await page.textContent('[data-send-count]');
  const note = await page.textContent('[data-send-note]');
  console.log('    filled:', filled);
  check(filled === 'Hi Carla, your lab work is back. Call 0917 555 0100 to book the fitting.', 'owner: Lab work back fills the box with her name and the clinic phone');
  check(Number(count) === filled.length, `owner: live count ${count} = ${filled.length}`);
  check(note.includes('Lab work back filled in') && note.includes('No lab work is marked back'), `owner: note says "${note}"`);
  // Choosing another patient refills an untouched template.
  const ellen = await page.$eval('select[data-send-patient]', (s) => [...s.options].find((o) => o.textContent.includes('Ellen')).value);
  await page.selectOption('select[data-send-patient]', ellen);
  const refilled = await page.inputValue('textarea[data-send-body]');
  const note2 = await page.textContent('[data-send-note]');
  check(refilled.startsWith('Hi Ellen,') && note2.includes('Change any words'), `owner: picking Ellen (lab back) refills: "${refilled.slice(0, 20)}…", note "${note2}"`);
  // Balance shows only with finance.money (the owner has it): Maria owes 3,250 and the option carries it.
  const amount = await page.$eval('select[data-send-patient]', (s) => [...s.options].find((o) => o.textContent.includes('Maria'))?.dataset.amount);
  check(amount === 'PHP 3,250', `owner: Maria's option carries data-amount "${amount}"`);
  await page.selectOption('select[data-send-patient]', CARLA);
  await page.click('[data-send-template="balance"]');
  const bal = await page.inputValue('textarea[data-send-body]');
  check(bal.includes('the amount on your statement'), `owner: Balance for someone with none says plain words: "${bal.slice(0, 70)}…"`);
  // Send it.
  await page.click('[data-send-template="lab"]');
  await Promise.all([page.waitForNavigation(), page.click('#send form button[type="submit"]')]);
  check(page.url().includes('done=sent'), `owner: sent → ${page.url()}`);
  const first = page.locator('.msg-row').first();
  const firstText = (await first.locator('.msg-text').textContent()).trim();
  const firstChip = (await first.locator('.ws-chip, [class*="chip"]').first().textContent()).trim();
  check(firstText === 'Session Road Dental: Hi Carla, your lab work is back. Call 0917 555 0100 to book the fitting.', `owner: log's first row "${firstText}"`);
  check(firstChip.includes('Waiting to send'), `owner: status "${firstChip}"`);
  const row = psql(`select status || ' | ' || kind || ' | ' || to_address || ' | ' || body from message_log where kind = 'manual' order by created_at desc limit 1`);
  check(row.startsWith('queued | manual | 09175550191 | Session Road Dental: Hi Carla'), `db: ${row}`);
  // A link is refused.
  await page.click('[data-ws-open="send"]');
  await page.waitForSelector('#send[open]');
  await page.selectOption('select[data-send-patient]', CARLA);
  await page.fill('textarea[data-send-body]', 'See www.example.com for the details');
  await Promise.all([page.waitForNavigation(), page.click('#send form button[type="submit"]')]);
  await page.waitForSelector('#send[open]');
  const alert = (await page.textContent('#send [role="alert"]')).trim();
  const kept = await page.inputValue('textarea[data-send-body]');
  check(alert.startsWith('Take the link out'), `owner: link refused in the panel: "${alert.slice(0, 40)}…", draft kept: ${kept.includes('example')}`);
  check(Number(psql(`select count(*) from message_log where kind = 'manual'`)) === before + 1, 'db: exactly one manual text queued');
  // ?to= opens the panel on a patient with no reason.
  await page.goto(`${MSG}?to=${FE}`);
  await page.waitForSelector('#send[open]');
  const feGroup = await page.$eval(`option[value="${FE}"]`, (o) => ({ group: o.closest('optgroup').label, selected: o.selected, text: o.textContent.trim() }));
  check(feGroup.group === 'From the record' && feGroup.selected, `owner: ?to= → "${feGroup.text}" under "${feGroup.group}", selected ${feGroup.selected}`);
  await page.click('[data-send-template="recall"]');
  await Promise.all([page.waitForNavigation(), page.click('#send form button[type="submit"]')]);
  check(page.url().includes('done=sent'), 'owner: ?to= patient can be texted');
  check(Number(psql(`select count(*) from message_log where kind = 'manual'`)) === before + 2, 'db: the ?to= text queued');
  // A forged patient id that is nobody's reason and not the ?to= one is refused.
  const csrf = (await context.cookies()).find((c) => c.name === 'fl_csrf').value;
  const r = await page.evaluate(async ([url, tok, patient]) => {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ _csrf: tok, act: 'send', patient, body: 'hello' }), redirect: 'follow' });
    return { status: res.status, url: res.url, text: await res.text() };
  }, [MSG, csrf, FE]);
  check(r.status === 200 && !r.url.includes('done=') && r.text.includes('That patient is not in the list'), `owner: a post for a patient with no reason and no ?to= is refused (${r.status} ${r.url})`);
  check(Number(psql(`select count(*) from message_log where kind = 'manual'`)) === before + 2, 'db: nothing queued by it');

  // Contrast, targets, scroll: light and dark, 1440 and 390.
  await page.goto(MSG);
  await measureAt(page, 'desk light');
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await measureAt(page, 'desk dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await measureAt(page, 'phone dark');
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await measureAt(page, 'phone light');

  // Scripts off: chips hidden, the templates listed as text.
  const off = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  await off.addCookies(await context.cookies());
  const p2 = await off.newPage();
  await p2.goto(MSG);
  const offChips = await p2.$eval('[data-send-chips]', (el) => el.hasAttribute('hidden'));
  const offList = await p2.$eval('[data-send-template-list]', (el) => ({ hidden: el.hasAttribute('hidden'), n: el.querySelectorAll('li').length }));
  check(offChips && !offList.hidden && offList.n === 8, `scripts off: chips hidden ${offChips}, list shown with ${offList.n} templates`);
  await off.close();
  await context.close();
}

// --- The dentist (no messages.send) --------------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await signIn(context, 'ramon.cari.o@example.com');
  await page.goto(MSG);
  check(await page.locator('[data-ws-open="send"]').count() === 0, 'dentist: no Text a patient button');
  const lede = (await page.textContent('.msg-lede')).trim();
  check(lede.includes('Only members whose role may text patients can send one'), `dentist: the page says so: "${lede.slice(-80)}"`);
  const panelWords = (await page.textContent('#send .ws-panel-body')).trim();
  check(panelWords.includes('Only members whose role may text patients') && !(await page.locator('#send form').count()), 'dentist: the panel holds no form');
  await page.goto(`${MSG}?to=${CARLA}`);
  check(!(await page.locator('#send[open]').count()), 'dentist: ?to= opens nothing');
  const csrf = (await context.cookies()).find((c) => c.name === 'fl_csrf').value;
  const n0 = Number(psql(`select count(*) from message_log where kind = 'manual'`));
  const r = await page.evaluate(async ([url, tok, patient]) => {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ _csrf: tok, act: 'send', patient, body: 'hello from a forged post' }), redirect: 'follow' });
    return { status: res.status, url: res.url, redirected: res.redirected };
  }, [MSG, csrf, CARLA]);
  check(r.redirected && r.url.includes('missed=send'), `dentist: forged send → redirected to ${r.url}`);
  check(Number(psql(`select count(*) from message_log where kind = 'manual'`)) === n0, 'db: the forged post queued nothing');
  await page.goto(`${MSG}?missed=send`);
  const notice = (await page.textContent('[role="status"].ws-callout')).trim();
  check(notice.includes('Only members whose role may text patients'), `dentist: the page then says "${notice.slice(0, 60)}…"`);
  await context.close();
}

await browser.close();
console.log(fails.length ? `\nFAIL ${fails.length}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
