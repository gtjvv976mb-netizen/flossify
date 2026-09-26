// The QR poster for a clinic's desk, as data: one A4 page (210 × 297 mm) of
// simple drawing steps, so the poster is drawn exactly the same way three
// times — the preview on /c/<slug>/patients/qr/, the print page (…/qr/print/,
// SVG, so it prints sharp and "Save as PDF" keeps it vector), and the PNG the
// clinic downloads (drawn on a <canvas> in the browser by ./_draw.ts from the
// same steps, at 300 dpi). The owner's brief: "with your design, with
// flossify.ph logo so that anyone who's using it will see it's Flossify".
//
// What is on it, top to bottom: the Flossify mark and the word flossify.ph;
// "Welcome to <clinic>"; "New patient? Scan to fill in your forms."; the big
// QR code (src/lib/qr.ts: error correction H, a four-module quiet zone, the
// Flossify mark in the middle) on a white card; the short link for anyone who
// cannot scan; three small steps; "Powered by Flossify · flossify.ph".
//
// Read from across a desk: the headline 15 mm, the brand's word 9.4 mm beside
// a 14 mm mark, the three steps 5.5 mm semi-bold, the link 6.6 mm; nothing
// smaller than the footer's 4.4 mm. The code is 110 mm with its quiet zone.
//
// Every position is in millimetres on the page. Only the server calls
// posterLayout() and posterSvg() (the QR's SVG comes from qrSvg()); the
// browser receives the finished steps as JSON and draws them. The one thing
// that depends on the font — how wide a line is — is decided here with a
// fixed estimate (widthOf), the same on every machine, so the preview, the
// paper and the PNG break the clinic's name in the same place; the drawers
// only squeeze a line that would still run past its `max`.
//
// No Node imports: ./_draw.ts (browser) imports the types from here.

import type { QrMatrix } from '../../../../../lib/qr';

export const PAGE = { w: 210, h: 297 } as const;

/** The poster's colours: the site's slate words and calm teal, on white paper. */
export const INK = {
  ink: '#1f2937',
  ink2: '#475467',
  teal: '#0e7471', // the mark's square, the step numbers (white words on it: 5.3:1)
  tealInk: '#0d706d', // teal words
  tealLine: '#14908f',
  tint: '#e8f6f5', // the soft panel behind the headline and the code
  hair: '#d0d5dd',
  paper: '#ffffff',
} as const;

/** The friendly sans (Inter where the device has it, the system's UI face otherwise) and the mono for the link. */
export const FONTS = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

export type Weight = 400 | 500 | 600 | 700;

export type PosterOp =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  /** A line of words; `runs` are drawn one after another (the ".ph" in teal). `max`: squeeze to this width if it would run past. */
  | { t: 'text'; x: number; y: number; runs: { s: string; fill: string }[]; size: number; weight: Weight; font: 'sans' | 'mono'; anchor: 'start' | 'middle'; max?: number }
  /** The Flossify mark, `size` mm square, its top left at x, y. */
  | { t: 'mark'; x: number; y: number; size: number }
  /** The QR code with its quiet zone, `size` mm square. */
  | { t: 'qr'; x: number; y: number; size: number };

export interface Poster {
  w: number; h: number;
  ops: PosterOp[];
  /** What the QR code holds, exactly. */
  url: string;
  /** The code's modules (qrMatrix: '1' dark, the middle already cleared for the mark), for the canvas. */
  qr: { size: number; rows: string[]; hole: QrMatrix['hole']; quiet: number; dark: string; light: string };
  /** The mark (src/lib/qr.ts MARK): a rounded square and a tooth on a 32 × 32 grid. */
  mark: { radius: number; tooth: string; fill: string; toothFill: string };
  /** The accessible name of the whole poster. */
  label: string;
}

// ---------------------------------------------------------------------------
// Widths, estimated: em per character of a friendly sans (Inter's and San
// Francisco's advance widths, rounded up). Deliberately a little generous, so
// a real line comes out no wider than planned.
// ---------------------------------------------------------------------------
const EM: Record<string, number> = {
  a: 0.56, b: 0.6, c: 0.54, d: 0.6, e: 0.57, f: 0.35, g: 0.6, h: 0.58, i: 0.25, j: 0.26, k: 0.53, l: 0.25, m: 0.87,
  n: 0.58, o: 0.59, p: 0.6, q: 0.6, r: 0.37, s: 0.51, t: 0.36, u: 0.58, v: 0.53, w: 0.79, x: 0.53, y: 0.53, z: 0.51,
  ' ': 0.27, '.': 0.27, ',': 0.27, '’': 0.22, "'": 0.22, '-': 0.4, '&': 0.68, '·': 0.3, '?': 0.5, '!': 0.3, '(': 0.34, ')': 0.34, '/': 0.36,
};
const UPPER: Record<string, number> = { I: 0.29, J: 0.52, M: 0.86, W: 0.98, O: 0.77, Q: 0.77, C: 0.72, D: 0.74, G: 0.76, N: 0.76, H: 0.75, U: 0.73 };

/** How wide `s` is, in mm, at `size` mm and `weight` (an estimate: see above). */
export function widthOf(s: string, size: number, weight: Weight = 400, font: 'sans' | 'mono' = 'sans'): number {
  if (font === 'mono') return [...s].length * 0.6 * size;
  let em = 0;
  for (const ch of s) {
    if (EM[ch] !== undefined) em += EM[ch];
    else if (/[A-Z]/.test(ch)) em += UPPER[ch] ?? 0.68;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else if (/\p{L}/u.test(ch)) em += 0.6;
    else em += 0.45;
  }
  return em * size * (weight >= 600 ? 1.06 : 1) * 1.03;
}

/** The clinic's name on one line (as big as it fits, 8.4 mm down to 6.4 mm), or two at 6.4 mm, or two squeezed. */
function nameLines(name: string, max: number): { lines: string[]; size: number } {
  for (let size = 8.4; size >= 6.4; size -= 0.2) {
    if (widthOf(name, size, 700) <= max) return { lines: [name], size: +size.toFixed(1) };
  }
  const words = name.split(/\s+/).filter(Boolean);
  let best: string[] = [name];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const w = Math.max(widthOf(a, 6.4, 700), widthOf(b, 6.4, 700));
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  return { lines: best, size: 6.4 };
}

export interface PosterInput {
  clinicName: string;
  /** The exact link the code holds (https://flossify.ph/f/<key>/). */
  url: string;
  /** Printed under the code (flossify.ph/f/<key>). */
  short: string;
  matrix: QrMatrix;
  mark: Poster['mark'];
}

/** The poster, as drawing steps. Server side. */
export function posterLayout(p: PosterInput): Poster {
  const ops: PosterOp[] = [];
  const cx = PAGE.w / 2;
  const text = (x: number, y: number, s: string, size: number, weight: Weight, fill: string, o: { anchor?: 'start' | 'middle'; font?: 'sans' | 'mono'; max?: number } = {}) =>
    ops.push({ t: 'text', x, y, runs: [{ s, fill }], size, weight, font: o.font ?? 'sans', anchor: o.anchor ?? 'middle', max: o.max });

  ops.push({ t: 'rect', x: 0, y: 0, w: PAGE.w, h: PAGE.h, fill: INK.paper });

  // The brand, top left: the mark and flossify.ph (".ph" in teal), big enough to read from the waiting area.
  ops.push({ t: 'mark', x: 15, y: 14, size: 14 });
  ops.push({ t: 'text', x: 32, y: 24.5, runs: [{ s: 'flossify', fill: INK.ink }, { s: '.ph', fill: INK.tealInk }], size: 9.4, weight: 700, font: 'sans', anchor: 'start' });

  // The soft panel behind the welcome, the headline and the code.
  ops.push({ t: 'rect', x: 14, y: 32, w: 182, h: 210, r: 10, fill: INK.tint });

  // Welcome to <clinic>.
  const name = nameLines(p.clinicName.trim(), 168);
  if (name.lines.length === 1) {
    text(cx, 44.5, 'Welcome to', 5, 500, INK.ink2);
    text(cx, 55.5, name.lines[0], name.size, 700, INK.ink, { max: 172 });
  } else {
    text(cx, 40.8, 'Welcome to', 4.6, 500, INK.ink2);
    text(cx, 49.8, name.lines[0], name.size, 700, INK.ink, { max: 172 });
    text(cx, 57.4, name.lines[1], name.size, 700, INK.ink, { max: 172 });
  }

  // The headline.
  text(cx, 77, 'New patient?', 15, 700, INK.ink, { max: 176 });
  text(cx, 88.5, 'Scan to fill in your forms.', 8, 600, INK.tealInk, { max: 176 });

  // The code on a white card with a teal edge. The card's edge sits outside the code's own quiet zone.
  ops.push({ t: 'rect', x: 46, y: 95.5, w: 118, h: 118, r: 8, fill: INK.paper, stroke: INK.tealLine, sw: 1.1 });
  ops.push({ t: 'qr', x: 50, y: 99.5, size: 110 });

  // For anyone who cannot scan.
  text(cx, 224, 'Can’t scan? Type this into your browser:', 4.8, 500, INK.ink2);
  text(cx, 233.5, p.short, 6.6, 500, INK.ink, { font: 'mono', max: 170 });

  // Three steps, short enough to read from a metre away.
  const steps: [string, string][] = [
    ['Scan with', 'your camera'],
    ['Fill in', 'your forms'],
    ['Tell the desk', 'you’re done'],
  ];
  steps.forEach(([a, b], i) => {
    const x = cx + (i - 1) * 60;
    ops.push({ t: 'circle', cx: x, cy: 251, r: 5, fill: INK.teal });
    text(x, 252.95, String(i + 1), 5.4, 700, INK.paper);
    text(x, 262.5, a, 5.5, 600, INK.ink, { max: 56 });
    text(x, 269.3, b, 5.5, 600, INK.ink, { max: 56 });
  });

  // Powered by Flossify, centred as a group: the mark, then the words right after it.
  ops.push({ t: 'line', x1: 14, y1: 279, x2: 196, y2: 279, stroke: INK.hair, sw: 0.3 });
  const foot = 'Powered by Flossify · flossify.ph';
  const footW = 5.6 + 2.4 + widthOf(foot, 4.4, 500);
  const fx = cx - footW / 2;
  ops.push({ t: 'mark', x: fx, y: 284.2, size: 5.6 });
  text(fx + 8, 288.6, foot, 4.4, 500, INK.ink2, { anchor: 'start' });

  return {
    w: PAGE.w, h: PAGE.h, ops, url: p.url,
    qr: { size: p.matrix.size, rows: p.matrix.rows, hole: p.matrix.hole, quiet: 4, dark: INK.ink, light: INK.paper },
    mark: p.mark,
    label: `Poster for ${p.clinicName}: New patient? Scan to fill in your forms. The QR code opens ${p.url}`,
  };
}

// ---------------------------------------------------------------------------
// SVG (server side): the preview and the print page.
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(3);

/**
 * The poster as one <svg>. `qrSvg` is src/lib/qr.ts's drawing of the same
 * link (placed where the 'qr' step says), so the paper carries exactly the
 * code that was decoded in tests. `size`: the <svg>'s width and height
 * attributes ('210mm' / '297mm' for paper; omitted for a preview that fills
 * its box).
 */
export function posterSvg(p: Poster, qrSvg: string, opts: { size?: { w: string; h: string }; id?: string } = {}): string {
  // Drawn in tenths of a millimetre: a browser lays words out at their font size in the drawing's own
  // units and only then scales them, rounding each letter's advance on the way; at 4 or 15 units the
  // rounding shows as letter-spacing, at 40 or 150 it does not.
  const S = 10;
  const u = (v: number) => n(v * S);
  let body = '';
  for (const op of p.ops) {
    switch (op.t) {
      case 'rect':
        body += `<rect x="${u(op.x)}" y="${u(op.y)}" width="${u(op.w)}" height="${u(op.h)}"${op.r ? ` rx="${u(op.r)}"` : ''} fill="${op.fill ?? 'none'}"${op.stroke ? ` stroke="${op.stroke}" stroke-width="${u(op.sw ?? 0.3)}"` : ''}/>`;
        break;
      case 'circle':
        body += `<circle cx="${u(op.cx)}" cy="${u(op.cy)}" r="${u(op.r)}" fill="${op.fill}"/>`;
        break;
      case 'line':
        body += `<line x1="${u(op.x1)}" y1="${u(op.y1)}" x2="${u(op.x2)}" y2="${u(op.y2)}" stroke="${op.stroke}" stroke-width="${u(op.sw)}"/>`;
        break;
      case 'text': {
        const runs = op.runs.map((r) => `<tspan fill="${r.fill}">${esc(r.s)}</tspan>`).join('');
        body += `<text x="${u(op.x)}" y="${u(op.y)}" font-size="${u(op.size)}" font-weight="${op.weight}" font-family="${esc(FONTS[op.font])}" text-anchor="${op.anchor}"${op.max ? ` data-max="${u(op.max)}"` : ''}>${runs}</text>`;
        break;
      }
      case 'mark': {
        const k = n((op.size * S) / 32);
        body += `<g transform="translate(${u(op.x)} ${u(op.y)}) scale(${k})"><rect width="32" height="32" rx="${p.mark.radius}" fill="${p.mark.fill}"/><path d="${p.mark.tooth}" fill="${p.mark.toothFill}"/></g>`;
        break;
      }
      case 'qr':
        // The QR's own <svg>, placed and sized; its role and name stay (the page's words say what it opens).
        body += qrSvg.replace('<svg ', `<svg x="${u(op.x)}" y="${u(op.y)}" width="${u(op.size)}" height="${u(op.size)}" `);
        break;
    }
  }
  const wh = opts.size ? ` width="${opts.size.w}" height="${opts.size.h}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.w * S} ${p.h * S}"${wh}${opts.id ? ` id="${opts.id}"` : ''} text-rendering="geometricPrecision" role="img" aria-label="${esc(p.label)}" data-poster>${body}</svg>`;
}
