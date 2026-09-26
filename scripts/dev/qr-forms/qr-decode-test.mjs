// Renders qrSvg() for several links at several sizes and decodes each PNG with jsQR.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
const repo = '/Users/michaelkennethbrillantes/flossify-qr';
const sharp = (await import(repo + '/node_modules/sharp/lib/index.js')).default;
const { qrSvg, qrMatrix } = await import(repo + '/src/lib/qr.ts');

const links = [
  'https://flossify.ph/f/k7m2xq9rtd/',
  'https://flossify.ph/f/abcdefghjk/',
  'https://flossify.ph/f/zzzzzzzzzz/',
  'http://127.0.0.1:4620/f/k7m2xq9rtd/',
  'https://flossify.ph/f/23456789ab/',
];
let bad = 0;
for (const link of links) {
  const m = qrMatrix(link);
  for (const px of [150, 240, 600]) {
    for (const soft of [true, false]) {
      const svg = qrSvg(link, { px, soft });
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const img = PNG.sync.read(png);
      const code = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
      const ok = code?.data === link;
      if (!ok) bad++;
      console.log(`${ok ? 'ok ' : 'BAD'} v${m.version} ${m.size}x${m.size} hole ${m.hole?.size}x${m.hole?.size} ${px}px soft=${soft} → ${code?.data ?? '(no read)'}`);
      if (px === 600 && soft && link === links[0]) writeFileSync('qr-sample.png', png);
    }
  }
}
// Also without the mark hole, bigger hole stress: check a mark-less version decodes too.
console.log(bad ? `${bad} FAILED` : 'all decoded to the exact link');
process.exit(bad ? 1 : 0);
