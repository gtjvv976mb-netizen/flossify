// QR codes, drawn on the server as SVG: the clinic's patient forms poster
// (src/lib/patient-forms.ts, /c/<slug>/patients/qr/). No client library.
//
// The encoder is qrcode-generator (Kazuhiko Arase's, MIT, no dependencies,
// pinned in package.json); this file only draws its module matrix:
//
//   qrSvg(text)      an <svg> string: error correction H, a four-module quiet
//                    zone, the three finder squares softly rounded, and the
//                    Flossify mark (the teal rounded square with the white
//                    tooth, as on the staff entrance) in a white hole in the
//                    middle. H restores up to 30% of the code; the hole takes
//                    about 7% of the modules and never a finder, timing or
//                    alignment pattern (see holeFor), so the code still reads.
//   qrMatrix(text)   the same code as rows of '0' and '1' (the hole already
//                    cleared) plus where the hole is, for a page that draws it
//                    on a <canvas> itself (a PNG download).
//
// Whatever calls this must check that the result still decodes to the exact
// link after any change to the drawing (the scratchpad's decoder check does:
// jsQR over a rendered PNG). A code that looks right and does not scan is the
// one failure a poster on a desk cannot have.

import qrcode from 'qrcode-generator';

export type Ecc = 'L' | 'M' | 'Q' | 'H';

/**
 * The Flossify mark: a rounded square and a tooth, on a 32 × 32 grid (StaffEntrance.astro,
 * .entrance-mark-sq). qrSvg draws it in the code's middle; the poster (patients/qr/_poster.ts) draws
 * it from these same numbers beside the word flossify.ph.
 */
export const MARK = {
  viewBox: '0 0 32 32',
  radius: 9,
  tooth: 'M9 8h14v11c0 3-1.6 5-3.2 5S17 22.4 17 20.4v-2.2h-2v2.2c0 2-1.2 3.6-2.8 3.6S9 22 9 19z',
  /** The teal fill under white (--en-teal-fill; 5.3:1 against the white tooth). */
  fill: '#0e7471',
  toothFill: '#ffffff',
} as const;

export interface QrMatrix {
  /** QR version, 1–40. A forms link (about 33 characters) is version 4 at H: 33 × 33 modules. */
  version: number;
  /** Modules per side, without the quiet zone. */
  size: number;
  /** size strings of size characters, '1' dark; the hole for the mark is already '0'. */
  rows: string[];
  /** The square cleared for the mark: its first row/column and its side, in modules. Null: no mark. */
  hole: { at: number; size: number } | null;
}

/**
 * The square in the middle to clear for the mark, or null. Odd, so it sits
 * on the centre module; about a quarter of the side (7% of the modules).
 * Versions 1–6 only: from version 7 an alignment pattern sits in the middle
 * of the code and must not be covered (the version information blocks start
 * there too). Up to version 6 the middle is data only: the timing patterns
 * run along row and column 6, the one alignment pattern sits near the
 * bottom-right corner.
 */
function holeFor(version: number, size: number): QrMatrix['hole'] {
  if (version >= 7) return null;
  const side = version <= 3 ? 5 : 2 * Math.round(size * 0.12) + 1;
  return { at: (size - side) / 2, size: side };
}

/** The module matrix for `text`, error correction `ecc` (H unless told otherwise), with the hole for the mark cleared. */
export function qrMatrix(text: string, opts: { ecc?: Ecc; mark?: boolean } = {}): QrMatrix {
  const ecc = opts.ecc ?? 'H';
  const q = qrcode(0, ecc);
  q.addData(text, 'Byte');
  q.make();
  const size = q.getModuleCount();
  const version = (size - 17) / 4;
  // A mark over a code with less than H to spare would cost it the data.
  const hole = opts.mark === false || ecc !== 'H' ? null : holeFor(version, size);
  const inHole = (r: number, c: number) => !!hole && r >= hole.at && r < hole.at + hole.size && c >= hole.at && c < hole.at + hole.size;
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    let line = '';
    for (let c = 0; c < size; c++) line += q.isDark(r, c) && !inHole(r, c) ? '1' : '0';
    rows.push(line);
  }
  return { version, size, rows, hole };
}

export interface QrSvgOptions {
  ecc?: Ecc;
  /** Width and height attributes, in px. Omitted: the SVG fills its box (viewBox only). */
  px?: number;
  /** Quiet zone in modules; 4 is the standard's minimum. */
  quiet?: number;
  /** Module colour. Dark slate (#1f2937) on white reads like black to a scanner (14.7:1). */
  dark?: string;
  light?: string;
  /** The Flossify mark in the middle (error correction H only). Default true. */
  mark?: boolean;
  /** Soft finder squares (rounded corners). Default true; scanners read them like square ones. */
  soft?: boolean;
  /** The accessible name; default "QR code for <text>". */
  label?: string;
}

/** `text` as a QR code in one <svg> string. */
export function qrSvg(text: string, opts: QrSvgOptions = {}): string {
  const m = qrMatrix(text, { ecc: opts.ecc, mark: opts.mark });
  const quiet = Math.max(0, Math.floor(opts.quiet ?? 4));
  const dark = opts.dark ?? '#1f2937';
  const light = opts.light ?? '#ffffff';
  const soft = opts.soft ?? true;
  const n = m.size + 2 * quiet;

  // The three finder squares (top left, top right, bottom left), each 7 × 7.
  const finders: [number, number][] = [[0, 0], [0, m.size - 7], [m.size - 7, 0]];
  const inFinder = (r: number, c: number) => soft && finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

  // Data modules: one path, each row's runs of dark merged into one rectangle.
  let d = '';
  for (let r = 0; r < m.size; r++) {
    const row = m.rows[r];
    for (let c = 0; c < m.size; ) {
      if (row[c] !== '1' || inFinder(r, c)) { c++; continue; }
      let e = c;
      while (e < m.size && row[e] === '1' && !inFinder(r, e)) e++;
      d += `M${c + quiet} ${r + quiet}h${e - c}v1h${c - e}z`;
      c = e;
    }
  }

  let parts = `<rect width="${n}" height="${n}" fill="${light}"/>`;
  if (d) parts += `<path d="${d}" fill="${dark}" shape-rendering="crispEdges"/>`;
  if (soft) {
    for (const [fr, fc] of finders) {
      const x = fc + quiet, y = fr + quiet;
      // Ring 7 (dark) − 5 (light) + eye 3 (dark). Rounded, the 1:1:3:1:1 run through the middle stays exact.
      parts += `<rect x="${x}" y="${y}" width="7" height="7" rx="1.6" fill="${dark}"/>`
        + `<rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1" fill="${light}"/>`
        + `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.8" fill="${dark}"/>`;
    }
  }
  if (m.hole) {
    // The mark, with a little white around it inside the cleared square.
    const inset = 0.8;
    const side = m.hole.size - 2 * inset;
    const x = m.hole.at + quiet + inset, y = m.hole.at + quiet + inset;
    parts += `<g transform="translate(${x} ${y}) scale(${+(side / 32).toFixed(5)})">`
      + `<rect width="32" height="32" rx="${MARK.radius}" fill="${MARK.fill}"/><path d="${MARK.tooth}" fill="${MARK.toothFill}"/></g>`;
  }

  const wh = opts.px ? ` width="${opts.px}" height="${opts.px}"` : '';
  const label = opts.label ?? `QR code for ${text}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${wh} role="img" aria-label="${esc(label)}">${parts}</svg>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
