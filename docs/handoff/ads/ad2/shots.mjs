import { chromium } from '/home/user/flossify/node_modules/playwright/index.mjs';
const OUT = '/tmp/claude-0/-home-user-flossify/f4b0cee2-2012-5f9f-a244-94fd3e742817/scratchpad/ad2/';
const BASE = 'http://127.0.0.1:4399';
const HIDE = `.ws-devline, [class*="devline"], .pt-dev, [data-dev-banner] { display: none !important; }`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
// staff: tablet portrait
const ctx = await b.newContext({ viewport: { width: 834, height: 1112 }, deviceScaleFactor: 2, colorScheme: 'light' });
const pg = await ctx.newPage();
await pg.goto(BASE + '/auth/login/?any=1');
await pg.fill('input[name=email], input[type=email]', 'liwayway.domingo@example.com');
await pg.fill('input[type=password]', 'flossify');
await Promise.all([pg.waitForNavigation(), pg.click('button[type=submit]')]);
console.log('after login', pg.url());
await pg.addStyleTag({ content: HIDE });
await pg.goto(BASE + '/c/session-road/'); await pg.addStyleTag({ content: HIDE }); await pg.waitForTimeout(1500);
await pg.screenshot({ path: OUT + 'cal.png' });
await pg.goto(BASE + '/c/session-road/patients/1a1d1c5e-ce1a-4d80-801c-f13fb6ef48cb/#chart'); await pg.addStyleTag({ content: HIDE }); await pg.waitForTimeout(1500);
const chart = await pg.$('#chart'); if (chart) await chart.scrollIntoViewIfNeeded();
await pg.screenshot({ path: OUT + 'chart.png' });
// patient: phone
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'light' });
const pp = await ph.newPage();
await pp.goto(BASE + '/find/session-road/'); await pp.addStyleTag({ content: HIDE }); await pp.waitForTimeout(1500);
await pp.screenshot({ path: OUT + 'find.png' });
const book = await pp.$('a[href*="book"]'); console.log('book link', book && await book.getAttribute('href'));
if (book) { await book.click(); await pp.waitForLoadState('networkidle'); await pp.addStyleTag({ content: HIDE }); await pp.waitForTimeout(1200); await pp.screenshot({ path: OUT + 'book.png' }); }
await b.close();
