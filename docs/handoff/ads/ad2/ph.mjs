import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const OUT = '/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/ad2/';
const HIDE = '.ws-callout[data-tone="warn"]{display:none!important}';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const pp = await ph.newPage();
await pp.goto('http://127.0.0.1:4399/find/session-road/book/'); await pp.addStyleTag({ content: HIDE }); await pp.waitForTimeout(800);
await pp.click('text=Toothache', { force: true }); await pp.waitForTimeout(300);
const c = await pp.$('button:has-text("Continue")'); if (c) { await c.click(); await pp.waitForTimeout(900); }
await pp.addStyleTag({ content: HIDE });
await pp.screenshot({ path: OUT + 'book2.png' });
const c2 = await pp.$('button:has-text("Continue")'); if (c2) { await c2.click(); await pp.waitForTimeout(1200); }
await pp.addStyleTag({ content: HIDE });
await pp.screenshot({ path: OUT + 'book3.png' });
await b.close();
