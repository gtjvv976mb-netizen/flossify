// Draws the installable app's icons: a flat #0e0f0f square with one #7df0b4
// bar at the golden section, nothing rounded and no text, so the result is the
// same on every machine (font rendering is not). The maskable icon keeps the
// mark inside a 20% safe margin because launchers crop it to their own shape.
//
//   node scripts/icons.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
const BG = '#0e0f0f';
const MARK = '#7df0b4';
const PHI = (Math.sqrt(5) - 1) / 2; // 0.618…

// `pad` is the fraction of each side kept clear of the mark.
function icon(size, pad = 0) {
  const box = Math.round(size * (1 - 2 * pad));
  const off = Math.round((size - box) / 2);
  const inset = Math.round(box / 8);
  const thick = Math.max(2, Math.round(box / 40));
  const y = off + Math.round(box * PHI - thick / 2);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
      `<rect width="${size}" height="${size}" fill="${BG}"/>` +
      `<rect x="${off + inset}" y="${y}" width="${box - inset * 2}" height="${thick}" fill="${MARK}"/>` +
      `</svg>`,
  );
}

const files = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.2],
  ['apple-touch-icon.png', 180, 0],
];

await mkdir(OUT, { recursive: true });
for (const [name, size, pad] of files) {
  const path = OUT + name;
  await sharp(icon(size, pad)).png({ compressionLevel: 9, palette: true }).toFile(path);
  const meta = await sharp(path).metadata();
  console.log(`wrote public/icons/${name} ${meta.width}x${meta.height}`);
}
