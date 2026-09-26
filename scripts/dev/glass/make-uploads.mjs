// Test uploads for the throwaway DB flossify_glass: each listed clinic below gets its own "uploaded" photos
// (files in ./uploads/<clinicId>/<uuid>-{1600,640}.webp, keys 'up:<uuid>' first in clinic.photo_keys).
//   session-road       realistic: the reception room, then the treatment room (a clinic that uploaded real photos)
//   marikina-heights   worst case: an all-black photo
//   burnham-smile      worst case: an all-white photo
//   la-trinidad-family worst case: harsh stripes (black, white, red, blue) — busy and high-contrast
//   leonard-wood       no uploads at all (keeps its house photos) — the soft-blur fallback
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const REPO = '/Users/michaelkennethbrillantes/flossify-sample-site';
const ids = Object.fromEntries(readFileSync(new URL('./clinic-ids.txt', import.meta.url), 'utf8').trim().split('\n').map((l) => l.split('|')));
const W = 1600, H = 1200;
const solid = (hex) => sharp({ create: { width: W, height: H, channels: 3, background: hex } }).png().toBuffer();
const stripes = () => { const cols = ['#000000', '#ffffff', '#e00000', '#1030d0']; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${Array.from({ length: 20 }, (_, i) => `<rect x="${i * 80}" y="0" width="80" height="${H}" fill="${cols[i % 4]}"/>`).join('')}</svg>`; return sharp(Buffer.from(svg)).png().toBuffer(); };
const file = (p) => readFileSync(`${REPO}/public/img/ws/${p}`);
const plan = {
  'session-road': [file('reception-1920.webp'), file('chair-1920.webp')],
  'marikina-heights': [await solid('#000000')],
  'burnham-smile': [await solid('#ffffff')],
  'la-trinidad-family': [await stripes()],
};
for (const [slug, imgs] of Object.entries(plan)) {
  const cid = ids[slug]; if (!cid) throw new Error('no clinic ' + slug);
  mkdirSync(`${REPO}/uploads/${cid}`, { recursive: true });
  const keys = [];
  for (const buf of imgs) {
    const u = randomUUID();
    for (const w of [1600, 640]) await sharp(buf).resize({ width: w, height: Math.round(w * 3 / 4), fit: 'cover' }).webp({ quality: 80 }).toFile(`${REPO}/uploads/${cid}/${u}-${w}.webp`);
    keys.push(`up:${u}`);
  }
  const old = execFileSync('psql', ['-d', 'flossify_glass', '-Atc', `select array_to_string(photo_keys, ',') from clinic where slug='${slug}'`], { encoding: 'utf8' }).trim().split(',').filter((k) => k && !k.startsWith('up:'));
  const arr = `{${[...keys, ...old].join(',')}}`;
  execFileSync('psql', ['-d', 'flossify_glass', '-Atc', `update clinic set photo_keys='${arr}' where slug='${slug}'`]);
  console.log(slug, arr);
}
