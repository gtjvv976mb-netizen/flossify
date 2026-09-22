import { chromium } from 'playwright';
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// Selectors are pinned to the heading text, not to element order: the first
// <table> on the workspace is the HMO claims table, which is how the "today"
// tab ended up showing claims.
const grab = async (url, locate, out) => {
  await p.goto(`http://localhost:4321${url}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const el = await locate(p);
  await el.screenshot({ path: `/tmp/shot-${out}.png` });
  await sharp(`/tmp/shot-${out}.png`).resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 84, effort: 6 }).toFile(`public/shots/${out}.webp`);
  const m = await sharp(`public/shots/${out}.webp`).metadata();
  console.log(out.padEnd(10), `${m.width}x${m.height}`, ' from', url);
};

await grab('/c/session-road/',
  (pg) => pg.locator('section').filter({ has: pg.locator('h2', { hasText: 'Queue' }) }).first(), 'queue');
await grab('/c/session-road/patients/', (pg) => pg.locator('table').first(), 'patients');
await grab('/c/session-road/', (pg) => pg.locator('dl').first(), 'tiles');

const lqip = JSON.parse(await readFile('src/data/lqip.json', 'utf8'));
const sizes = {};
for (const k of ['queue', 'patients', 'tiles']) {
  const m = await sharp(`public/shots/${k}.webp`).metadata();
  sizes[k] = [m.width, m.height];
  const blur = await sharp(`public/shots/${k}.webp`).resize({ width: 20 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  lqip[`shot-${k}`] = `data:image/webp;base64,${blur.toString('base64')}`;
}
await writeFile('src/data/lqip.json', JSON.stringify(lqip, null, 2) + '\n');
await writeFile('src/data/shot-size.json', JSON.stringify(sizes, null, 2) + '\n');
console.log('sizes', sizes);
await b.close();
