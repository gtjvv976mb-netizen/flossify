import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const OUT = '/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/ad2/';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 834, height: 1112 }, deviceScaleFactor: 2 });
const pg = await ctx.newPage();
await pg.goto('http://127.0.0.1:4399/auth/login/?any=1');
await pg.fill('input[type=email]', 'liwayway.domingo@example.com'); await pg.fill('input[type=password]', 'flossify');
await Promise.all([pg.waitForNavigation(), pg.click('button[type=submit]')]);
for (const d of ['2026-10-06']) {
  await pg.goto('http://127.0.0.1:4399/c/session-road/?date=' + d);
  await pg.addStyleTag({ content: '.ws-devline{display:none!important}' }); await pg.waitForTimeout(1500);
  const h = await pg.$('text=Chair 1'); if (h) await h.evaluate(e => e.scrollIntoView({block:'start'}));
  await pg.evaluate(() => window.scrollBy(0, -200));
  await pg.screenshot({ path: OUT + 'cal-' + d + '.png' });
}
await b.close();
