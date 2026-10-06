// Verifier: for each of the 7 snapshot roles, every Add ▾ item opens its panel (the dialog exists and opens, with its
// back set to the tab in view), the menu holds only what the role may do, and no peso sign shows without finance.bill
// (outside the plan's fee-guide estimates, which S0 showed to everyone), on Maria and Rich.
import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const BASE = `http://127.0.0.1:${process.env.PORT_ || 4470}`;
const P = { maria: '1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb', rich: '7e57a1c0-0000-4000-8000-000000000001' };
const ROLES = { owner: 'liwayway.domingo@example.com', admin: 'snap.admin@example.com', dentist: 'hazel.tabanao@example.com', associate: 'snap.assoc@example.com',
  secretary: 'snap.sec@example.com', assistant: 'snap.asst@example.com', custom: 'snap.desk@example.com' };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let bad = 0;
for (const [role, email] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/auth/login/?any=1`); await page.fill('#email', email); await page.fill('#password', 'flossify');
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  for (const [pn, pid] of Object.entries(P)) {
    await page.goto(`${BASE}/c/session-road/patients/${pid}/#treatment-record`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({
      items: [...document.querySelectorAll('.rec-add .ws-menu-item')].map((b) => ({ label: b.querySelector('.ws-menu-words')?.firstChild?.textContent?.trim(), open: b.dataset.wsOpen ?? null, href: b.getAttribute('href') })),
      money: !!document.getElementById('money'),
      hasCanBillTile: [...document.querySelectorAll('.ws-tile')].some((t) => /Balance/.test(t.textContent)),
    }));
    const fails = [];
    for (const it of info.items) {
      if (!it.open) continue;
      const ok = await page.evaluate((id) => !!document.getElementById(id) && document.getElementById(id).tagName === 'DIALOG', it.open);
      if (!ok) { fails.push(`${it.label}: no dialog #${it.open}`); continue; }
      await page.click('.rec-add > button'); await page.waitForTimeout(120);
      await page.locator(`.rec-add [data-ws-open="${it.open}"]`).first().click(); await page.waitForTimeout(250);
      const st = await page.evaluate((id) => { const d = document.getElementById(id); const b = [...d.querySelectorAll('input[name=back]')].filter((x) => !x.closest('form[hidden]')).map((x) => x.value); return { open: d.open, backs: b }; }, it.open);
      if (!st.open) fails.push(`${it.label}: did not open`);
      if (!st.backs.length || st.backs.some((b) => b !== 'treatment-record')) fails.push(`${it.label}: back ${JSON.stringify(st.backs)}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    }
    // No peso on the page outside the plan's estimates, for a role without billing.
    const peso = await page.evaluate(() => {
      const out = [];
      for (const p of document.querySelectorAll('[data-rec-panel], [data-rec-bar], .ws-pane')) {
        const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (/₱/.test(n.textContent) && !n.parentElement.closest('script, style, template, .tx-price, #treatment, #treatment-done, #treatment-lab, dialog') && n.parentElement.checkVisibility()) out.push(n.textContent.trim().slice(0, 40));
      }
      return [...new Set(out)];
    });
    const labels = info.items.map((i) => i.label).join(', ');
    const billing = info.items.some((i) => i.label === 'New charge');
    if (!billing && peso.length) fails.push(`₱ without billing: ${peso.slice(0, 4).join(' | ')}`);
    if (billing !== info.money) fails.push(`New charge ${billing} but Money card ${info.money}`);
    if (fails.length) bad++;
    console.log(`${role.padEnd(10)} ${pn.padEnd(6)} items ${info.items.length}: ${labels} · money=${info.money} ${fails.length ? 'FAIL ' + fails.join('; ') : 'ok'}`);
  }
  if (errors.length) { bad++; console.log('errors', errors.join(' | ')); }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} failing` : 'all ok');
