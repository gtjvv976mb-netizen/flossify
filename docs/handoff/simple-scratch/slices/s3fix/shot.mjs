import { chromium } from '/home/user/fl-simple/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
await page.goto('http://127.0.0.1:4470/auth/login/?any=1'); await page.fill('#email', 'liwayway.domingo@example.com'); await page.fill('#password', 'flossify');
await Promise.all([page.waitForNavigation(), page.click('[data-go]')]);
await page.goto('http://127.0.0.1:4470/c/session-road/patients/7e57a1c0-0000-4000-8000-000000000401/', { waitUntil: 'networkidle' });
await page.locator('.rec-who').screenshot({ path: '/tmp/fl-simple-scratch/s3fix/facts-390.png' });
await b.close();
