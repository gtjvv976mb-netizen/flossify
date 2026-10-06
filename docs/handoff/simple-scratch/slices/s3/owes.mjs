// S3 check: what the patient owes is in the head only for people who may bill here (finance.bill: the same people the
// Treatment record's Statements card is drawn for), and no amount reaches the head or the row otherwise. Every role
// of the 030 snapshot × Maria (owes), T-NONE (in credit), Rich (nothing owed).
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = 'http://127.0.0.1:4470';
const WHO = { owner: 'liwayway.domingo@example.com', dentist: 'hazel.tabanao@example.com', ramon: 'ramon.cari.o@example.com',
  admin: 'snap.admin@example.com', assoc: 'snap.assoc@example.com', sec: 'snap.sec@example.com', asst: 'snap.asst@example.com', desk: 'snap.desk@example.com' };
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', none: '7e57a1c0-0000-4000-8000-000000000302', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0;
for (const [who, email] of Object.entries(WHO)) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/auth/login/?any=1'); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
  for (const [k, id] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${id}/`, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => {
      const head = document.querySelector('.rec-back')?.closest('.ws-pane');
      const bar = document.querySelector('[data-rec-bar]');
      const txt = (e) => (e?.textContent ?? '').replace(/\s+/g, ' ');
      const facts = txt(document.querySelector('.rec-facts'));
      const link = document.querySelector('.rec-owes');
      return { facts: facts.trim(), headPeso: /₱/.test(txt(head)), rowPeso: /₱/.test(txt(bar)), owesWords: /Owes|In credit|Nothing owed/.test(txt(head)),
        link: link ? link.getAttribute('href') : null, money: !!document.getElementById('money'), mark: document.body.innerHTML.includes('rec-owes') };
    });
    const expectOwes = r.money;
    const bad = expectOwes ? (!r.owesWords ? 'no owes words for a person who bills' : k !== 'rich' && !r.link?.includes(`?patient=${id}&view=all`) ? 'no link to the statements' : null)
      : (r.owesWords || r.headPeso || r.rowPeso || r.mark ? 'money in the head or row for a person who may not bill' : null);
    if (bad) fails++;
    console.log(`${who.padEnd(7)} ${k.padEnd(6)} bills=${r.money} facts="${r.facts}" ${r.link ? `link ${r.link.replace(/^.*finances\//, 'finances/')}` : ''} ${bad ? 'FAIL ' + bad : 'ok'}`);
  }
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failing` : 'all ok');
process.exit(fails ? 1 : 0);
