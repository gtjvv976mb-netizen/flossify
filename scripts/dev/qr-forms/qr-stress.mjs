import jsQR from 'jsqr';
import { PNG } from 'pngjs';
const repo = '/Users/michaelkennethbrillantes/flossify-qr';
const sharp = (await import(repo + '/node_modules/sharp/lib/index.js')).default;
const { qrSvg } = await import(repo + '/src/lib/qr.ts');
const link = 'https://flossify.ph/f/k7m2xq9rtd/';
const svg = qrSvg(link, { px: 400 });
let bad = 0;
for (const [name, f] of [
  ['blur 1.5', (s) => s.blur(1.5)],
  ['rotate 12°', (s) => s.rotate(12, { background: '#fff' })],
  ['rotate 12° + blur 1 + 120px', (s) => s.rotate(12, { background: '#fff' }).blur(1).resize(160)],
  ['jpeg q30', (s) => s.jpeg({ quality: 30 })],
  ['grey paper (#e8e4dc bg)', (s) => s.flatten({ background: '#e8e4dc' })],
]) {
  const out = await f(sharp(Buffer.from(svg))).png().toBuffer();
  const img = PNG.sync.read(await sharp(out).png().toBuffer());
  const code = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  const ok = code?.data === link; if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'BAD'} ${name} → ${code?.data ?? '(no read)'}`);
}
process.exit(bad ? 1 : 0);
