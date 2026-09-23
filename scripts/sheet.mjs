// Samples a take at even intervals and lays the frames out as one grid, so
// architectural drift (floors, doors, ceiling height) is visible side by side
// rather than having to be remembered across a 30-second playback.
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';

const src = process.argv[2];
const out = process.argv[3];
const N = 12, DUR = 30;
const tiles = [];
const W = 440, H = 248;

for (let i = 0; i < N; i++) {
  const t = (i * (DUR - 0.4)) / (N - 1);
  const f = `/tmp/fr_${i}.png`;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(t), '-i', src, '-vframes', '1', f]);
  const label = Buffer.from(
    `<svg width="${W}" height="26"><rect width="${W}" height="26" fill="#000" fill-opacity="0.6"/>` +
    `<text x="8" y="18" font-family="monospace" font-size="15" fill="#fff">${t.toFixed(1)}s</text></svg>`
  );
  const img = await sharp(f).resize(W, H, { fit: 'cover' })
    .composite([{ input: label, top: H - 26, left: 0 }]).toBuffer();
  tiles.push({ input: img, left: (i % 2) * W, top: Math.floor(i / 2) * H });
}

await sharp({ create: { width: W * 2, height: H * Math.ceil(N / 2), channels: 3, background: '#111' } })
  .composite(tiles).png().toFile(out);
console.log('wrote', out);
