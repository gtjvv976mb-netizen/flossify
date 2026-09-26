// The QR poster on a <canvas>, in the browser: the PNG the clinic downloads
// ("Download QR (PNG)" on /c/<slug>/patients/qr/). It draws the same steps
// the print page draws as SVG (./_poster.ts, posterLayout on the server), at
// print resolution — A4 at 300 dpi, 2480 × 3508 px — and says so in the file
// (a pHYs chunk), so an image viewer prints it at A4 too.
//
// The QR code is drawn from the server's module matrix (qrMatrix in
// src/lib/qr.ts), the way qrSvg draws it: runs of dark modules, the three
// finder squares softly rounded, the Flossify mark (a Path2D of its tooth) in
// the cleared middle. Module edges are snapped to whole pixels, so no hairline
// seams show between rows. The fonts are loaded before anything is drawn.
import type { Poster, PosterOp } from './_poster';
import { FONTS } from './_poster';

/** A rounded rectangle path (canvas roundRect is not in every browser a clinic may have). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** The CSS font shorthand, falling back to a plainer stack where the canvas refuses a family keyword. */
function setFont(ctx: CanvasRenderingContext2D, weight: number, px: number, font: 'sans' | 'mono') {
  const want = `${weight} ${px.toFixed(2)}px ${FONTS[font]}`;
  ctx.font = want;
  if (!ctx.font.includes(px.toFixed(0)) && !ctx.font.includes(px.toFixed(2))) {
    ctx.font = `${weight} ${px.toFixed(2)}px ${font === 'mono' ? '"IBM Plex Mono", Menlo, monospace' : 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'}`;
  }
}

function drawMark(ctx: CanvasRenderingContext2D, p: Poster, x: number, y: number, size: number) {
  const k = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  rr(ctx, 0, 0, 32, 32, p.mark.radius);
  ctx.fillStyle = p.mark.fill;
  ctx.fill();
  ctx.fillStyle = p.mark.toothFill;
  ctx.fill(new Path2D(p.mark.tooth));
  ctx.restore();
}

/** The code with its quiet zone, `size` px square at x, y — as qrSvg draws it. */
function drawQr(ctx: CanvasRenderingContext2D, p: Poster, x: number, y: number, size: number) {
  const { rows, quiet, hole } = p.qr;
  const count = p.qr.size;
  const total = count + 2 * quiet;
  const m = size / total;
  // Grid lines on whole pixels: neighbours share an edge exactly.
  const gx = (i: number) => Math.round(x + i * m);
  const gy = (i: number) => Math.round(y + i * m);
  ctx.fillStyle = p.qr.light;
  ctx.fillRect(gx(0), gy(0), gx(total) - gx(0), gy(total) - gy(0));

  const finders: [number, number][] = [[0, 0], [0, count - 7], [count - 7, 0]];
  const inFinder = (r: number, c: number) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  ctx.fillStyle = p.qr.dark;
  for (let r = 0; r < count; r++) {
    const row = rows[r];
    for (let c = 0; c < count;) {
      if (row[c] !== '1' || inFinder(r, c)) { c++; continue; }
      let e = c;
      while (e < count && row[e] === '1' && !inFinder(r, e)) e++;
      ctx.fillRect(gx(c + quiet), gy(r + quiet), gx(e + quiet) - gx(c + quiet), gy(r + 1 + quiet) - gy(r + quiet));
      c = e;
    }
  }
  // The finders: a ring of 7, a light 5, an eye of 3, rounded like the SVG's (rx 1.6, 1, 0.8 modules).
  for (const [fr, fc] of finders) {
    const at = (dr: number, dc: number, s: number, rad: number, fill: string) => {
      const x0 = gx(fc + quiet + dc), y0 = gy(fr + quiet + dr);
      rr(ctx, x0, y0, gx(fc + quiet + dc + s) - x0, gy(fr + quiet + dr + s) - y0, rad * m);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    at(0, 0, 7, 1.6, p.qr.dark);
    at(1, 1, 5, 1, p.qr.light);
    at(2, 2, 3, 0.8, p.qr.dark);
  }
  if (hole) {
    const inset = 0.8;
    const side = (hole.size - 2 * inset) * m;
    drawMark(ctx, p, x + (hole.at + quiet + inset) * m, y + (hole.at + quiet + inset) * m, side);
  }
}

function drawText(ctx: CanvasRenderingContext2D, op: Extract<PosterOp, { t: 'text' }>, k: number) {
  setFont(ctx, op.weight, op.size * k, op.font);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const widths = op.runs.map((r) => ctx.measureText(r.s).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const max = op.max ? op.max * k : Infinity;
  const squeeze = total > max ? max / total : 1;
  const x = op.x * k, y = op.y * k;
  const start = op.anchor === 'middle' ? x - (total * squeeze) / 2 : x;
  ctx.save();
  ctx.translate(start, y);
  ctx.scale(squeeze, 1);
  let at = 0;
  op.runs.forEach((r, i) => {
    ctx.fillStyle = r.fill;
    ctx.fillText(r.s, at, 0);
    at += widths[i];
  });
  ctx.restore();
}

/** Load the fonts the poster uses, so the first draw is not in a fallback face. */
export async function posterFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('500 48px "IBM Plex Mono"'),
      document.fonts.load(`700 48px ${FONTS.sans}`),
      document.fonts.load(`500 48px ${FONTS.sans}`),
    ]);
    await document.fonts.ready;
  } catch {
    /* a font that cannot load: the fallback face draws it */
  }
}

/** Draw the poster onto `canvas` at `dpi` (300: 2480 × 3508 for A4). */
export function drawPoster(canvas: HTMLCanvasElement, p: Poster, dpi = 300): void {
  const k = dpi / 25.4; // px per mm
  canvas.width = Math.round(p.w * k);
  canvas.height = Math.round(p.h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.imageSmoothingEnabled = true;
  for (const op of p.ops) {
    switch (op.t) {
      case 'rect':
        rr(ctx, op.x * k, op.y * k, op.w * k, op.h * k, (op.r ?? 0) * k);
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
        if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = (op.sw ?? 0.3) * k; ctx.stroke(); }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(op.cx * k, op.cy * k, op.r * k, 0, Math.PI * 2);
        ctx.fillStyle = op.fill;
        ctx.fill();
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(op.x1 * k, op.y1 * k);
        ctx.lineTo(op.x2 * k, op.y2 * k);
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = Math.max(1, op.sw * k);
        ctx.stroke();
        break;
      case 'text':
        drawText(ctx, op, k);
        break;
      case 'mark':
        drawMark(ctx, p, op.x * k, op.y * k, op.size * k);
        break;
      case 'qr':
        drawQr(ctx, p, op.x * k, op.y * k, op.size * k);
        break;
    }
  }
}

// --- the PNG, with its print size ------------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** The PNG with a pHYs chunk saying `dpi`, right after the header, so it prints at its real size. */
export async function withDpi(png: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await png.arrayBuffer());
  // 8 bytes of signature, then IHDR (4 length + 4 type + 13 data + 4 CRC).
  const at = 8 + 25;
  if (src.length < at || String.fromCharCode(...src.slice(12, 16)) !== 'IHDR') return png;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // per metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(src.subarray(at), at + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

/** Draw, encode and hand the PNG to the browser to save. */
export async function downloadPoster(p: Poster, filename: string, dpi = 300): Promise<void> {
  await posterFonts();
  const canvas = document.createElement('canvas');
  drawPoster(canvas, p, dpi);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('The picture could not be made');
  const file = await withDpi(blob, dpi);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  // Free the big canvas.
  canvas.width = canvas.height = 0;
}
