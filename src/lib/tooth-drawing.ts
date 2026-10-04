// The chart's pictures, drawn once here and reused (src/components/Odontogram.astro): each tooth's side view (labial or
// buccal) as a paper odontogram draws it beside the tooth's box, and the whole mouth seen from above ("Where it is").
// Pure (no Node imports). Line drawings only: path data, no images, no fonts.
//
// A tooth's side view is drawn ONCE per kind, in one box (0 0 24 36) and one way round: crown up, roots down, the
// cervical line at y = 13 (12 for a baby tooth), and the MESIAL side (toward the midline) on the RIGHT — the lower right
// quadrant as a chart shows it. The chart turns it for the other quadrants (`flip`): upper teeth crown down (roots
// pointing away from the midline), the patient's left side mirrored, so the mesial side always faces the midline. The
// roots lean a little distally, as real roots do, which is also what shows a mirror was not missed.
//
// For a dentist to confirm (the review pack, "The chart's pictures"): the shapes are simplified; upper first premolar with two roots, upper
// molars with two buccal roots and the palatal one drawn behind, lower molars with two, third molars with roots
// converging; lower central incisors narrower than the laterals, upper the other way; baby molars with splayed roots.

export const PIC_W = 24;
export const PIC_H = 36;

type Pt = [number, number];
const r = (n: number) => Math.round(n * 100) / 100;
const pt = ([x, y]: Pt) => `${r(x)},${r(y)}`;

/** A smooth line through points (a cardinal spline drawn as cubic Béziers): k 0 is straight segments, ~0.17 is round.
 *  `before`/`after` are the phantom points that set the tangent at each end. Returns the segments only (no M). */
function spline(points: Pt[], k: number, before: Pt, after: Pt): string {
  const all = [before, ...points, after];
  let d = '';
  for (let i = 1; i < all.length - 2; i++) {
    const [p0, p1, p2, p3] = [all[i - 1], all[i], all[i + 1], all[i + 2]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

interface CrownSpec {
  /** Half the crown's width at its contacts, and at the cervical line. */
  w: number; wc: number;
  /** The cervical line (y), and how far the crown bulges just above it (a baby tooth's cervical ridge). */
  cej: number; bulge: number;
  /** The distal and mesial contacts' height. */
  yD: number; yM: number;
  /** The biting edge between the contacts, distal to mesial: cusp tips and the valleys between them. */
  edge: Pt[];
  /** How round the edge is (0 sharp). */
  k: number;
}
const CX = 12;

function crownPath(c: CrownSpec): string {
  const D: Pt = [CX - c.w, c.yD];
  const M: Pt = [CX + c.w, c.yM];
  const side = 2.6;
  return `M${pt([CX - c.wc, c.cej])}`
    + ` C${pt([CX - c.wc - c.bulge, c.cej - side])} ${pt([D[0], D[1] + 3.2])} ${pt(D)}`
    + spline([D, ...c.edge, M], c.k, [D[0], D[1] + 3], [M[0], M[1] + 3])
    + ` C${pt([M[0], M[1] + 3.2])} ${pt([CX + c.wc + c.bulge, c.cej - side])} ${pt([CX + c.wc, c.cej])} Z`;
}

interface RootSpec {
  /** Apices, distal to mesial, and the furcations between neighbours (one fewer). */
  apices: Pt[]; furcs: Pt[];
  /** Half the width of a root at its apex. */
  ra: number;
}

function rootPath(cej: number, wc: number, s: RootSpec): string {
  const start: Pt = [CX - wc, cej];
  const end: Pt = [CX + wc, cej];
  let d = `M${pt(start)}`;
  let from = start;
  s.apices.forEach((a, i) => {
    const down = a[1] - from[1];
    const al: Pt = [a[0] - s.ra, a[1] - s.ra * 0.7];
    const ar: Pt = [a[0] + s.ra, a[1] - s.ra * 0.7];
    // Down the root's distal edge, round the apex, up its mesial edge.
    d += ` C${pt([from[0] + (a[0] - from[0]) * 0.25, from[1] + down * 0.4])} ${pt([al[0], a[1] - down * 0.35])} ${pt(al)}`;
    d += ` Q${pt([a[0], a[1] + s.ra * 0.9])} ${pt(ar)}`;
    const furc = s.furcs[i];
    const to: Pt = furc ? [furc[0] - 0.6, furc[1] + 0.9] : end;
    const up = a[1] - to[1];
    d += ` C${pt([ar[0], a[1] - up * 0.35])} ${pt([to[0] + (a[0] - to[0]) * 0.25, to[1] + up * 0.4])} ${pt(to)}`;
    if (furc) {
      d += ` Q${pt([furc[0], furc[1] - 0.5])} ${pt([furc[0] + 0.6, furc[1] + 0.9])}`;
      from = [furc[0] + 0.6, furc[1] + 0.9];
    }
  });
  return `${d} Z`;
}

/** A root standing behind the others (an upper molar's palatal root, an upper first premolar's palatal one): only the
 *  part below the furcation shows, the rest is hidden behind the front roots and the trunk. */
function backRoot(top: Pt, apex: Pt, half: number, ra: number): string {
  const l: Pt = [top[0] - half, top[1]];
  const rr: Pt = [top[0] + half, top[1]];
  const al: Pt = [apex[0] - ra, apex[1] - ra * 0.7];
  const ar: Pt = [apex[0] + ra, apex[1] - ra * 0.7];
  return `M${pt(l)} C${pt([l[0], l[1] + (apex[1] - l[1]) * 0.5])} ${pt([al[0], apex[1] - 3])} ${pt(al)}`
    + ` Q${pt([apex[0], apex[1] + ra * 0.9])} ${pt(ar)}`
    + ` C${pt([ar[0], apex[1] - 3])} ${pt([rr[0], rr[1] + (apex[1] - rr[1]) * 0.5])} ${pt(rr)} Z`;
}

/** The root canal: a line down the middle of each root, from the pulp chamber. */
function canals(cej: number, apices: Pt[], back?: Pt): string {
  const top: Pt = [CX, cej + 1.2];
  return [...apices, ...(back ? [back] : [])].map((a) => {
    const end: Pt = [a[0], a[1] - 1.6];
    return `M${pt(top)} Q${pt([a[0] + (CX - a[0]) * 0.35, (cej + a[1]) / 2])} ${pt(end)}`;
  }).join(' ');
}

/** An implant: a threaded post where the roots were, under the crown. */
function post(cej: number, depth: number, wTop: number, wBottom: number): string {
  const top = cej + 0.4;
  const steps = Math.max(4, Math.round((depth - top) / 2.2));
  const h = (depth - top) / steps;
  const half = (i: number) => wTop + (wBottom - wTop) * (i / steps);
  let left = `M${pt([CX - half(0), top])}`;
  for (let i = 0; i < steps; i++) {
    left += ` L${pt([CX - half(i + 0.5) - 0.9, top + h * (i + 0.5)])} L${pt([CX - half(i + 1), top + h * (i + 1)])}`;
  }
  left += ` Q${pt([CX, depth + 1.6])} ${pt([CX + half(steps), depth])}`;
  for (let i = steps; i > 0; i--) {
    left += ` L${pt([CX + half(i - 0.5) + 0.9, top + h * (i - 0.5)])} L${pt([CX + half(i - 1), top + h * (i - 1)])}`;
  }
  return `${left} Z`;
}

export interface ToothPicture {
  crown: string;
  root: string;
  /** A root drawn behind the others, if the kind has one. */
  back?: string;
  canal: string;
  post: string;
}

// The kinds: U/L upper or lower, B a baby tooth, then the place from the midline. Numbers are the drawing's units.
type Kind = 'incisor' | 'canine' | 'premolar' | 'molar2' | 'molar3';
interface Spec {
  kind: Kind; w: number; wc: number; top: number; roots: RootSpec; back?: { top: Pt; apex: Pt; half: number };
  /** A canine's or premolar's cusp tip, from the crown's middle (mesial +). Most sit a little mesial; the upper first
   *  premolar's and the upper baby canine's sit distal, their mesial cusp ridge being the longer one. */
  tip?: number;
}

function edgeFor(kind: Kind, w: number, top: number, tip?: number): { edge: Pt[]; yD: number; yM: number; k: number } {
  switch (kind) {
    case 'incisor':
      // A flat incisal edge; the distal corner rounder than the mesial one.
      return { edge: [[CX - w + 1.7, top + 0.25], [CX, top], [CX + w - 1.1, top]], yD: top + 2.8, yM: top + 1.3, k: 0.12 };
    case 'canine':
      // One pointed cusp, a little mesial of the middle as a rule; the mesial ridge shorter than the distal.
      return { edge: [[CX + (tip ?? 0.5), top]], yD: top + 5.2, yM: top + 3.6, k: 0.05 };
    case 'premolar':
      // Seen from the cheek, one buccal cusp with its two cusp ridges, blunter and lower than a canine's; the lingual
      // cusp stands behind it, out of sight, so it is not in the outline.
      return { edge: [[CX + (tip ?? w * 0.1), top]], yD: top + 3.8, yM: top + 3, k: 0.1 };
    case 'molar2':
      // Two buccal cusps (an upper molar, a lower second molar, a baby molar).
      return { edge: [[CX - w * 0.45, top + 0.4], [CX, top + 2.3], [CX + w * 0.42, top]], yD: top + 3.7, yM: top + 3, k: 0.16 };
    case 'molar3':
      // Three buccal cusps (a lower first molar): mesiobuccal, distobuccal and the small distal one.
      return { edge: [[CX - w * 0.72, top + 1.7], [CX - w * 0.42, top + 2.7], [CX - w * 0.1, top + 0.4], [CX + w * 0.22, top + 2.3], [CX + w * 0.55, top]], yD: top + 4, yM: top + 3, k: 0.16 };
  }
}

const one = (x: number, y: number): RootSpec => ({ apices: [[x, y]], furcs: [], ra: 1 });
const two = (d: Pt, m: Pt, f: Pt, ra = 1): RootSpec => ({ apices: [d, m], furcs: [f], ra });

const PERMANENT: Record<string, Spec> = {
  U1: { kind: 'incisor', w: 6.6, wc: 4, top: 1, roots: one(11.2, 33.6) },
  U2: { kind: 'incisor', w: 5.2, wc: 3.3, top: 2, roots: one(11, 32.2) },
  U3: { kind: 'canine', w: 5.8, wc: 3.8, top: 0.6, roots: one(11, 35.3) },
  U4: { kind: 'premolar', w: 5.6, wc: 3.9, top: 1.6, tip: -0.6, roots: two([9.9, 32.4], [13.9, 32.8], [11.9, 23.5], 0.85) },
  U5: { kind: 'premolar', w: 5.4, wc: 3.7, top: 1.8, roots: one(11.2, 33.6) },
  U6: { kind: 'molar2', w: 8.6, wc: 6.4, top: 2, roots: two([6.3, 30.6], [16.8, 31.6], [11.6, 18.2]), back: { top: [12, 17], apex: [12.6, 33.6], half: 2.3 } },
  U7: { kind: 'molar2', w: 8, wc: 6, top: 2.3, roots: two([7.4, 30.2], [15.8, 30.8], [11.6, 20.2]), back: { top: [12, 19], apex: [12.3, 32.6], half: 2.2 } },
  U8: { kind: 'molar2', w: 7, wc: 5.2, top: 2.8, roots: two([9.3, 28.4], [13.3, 28.8], [11.4, 24.5], 0.9) },
  L1: { kind: 'incisor', w: 4.2, wc: 2.8, top: 1.2, roots: one(11.4, 32) },
  L2: { kind: 'incisor', w: 4.6, wc: 3, top: 1, roots: one(11.2, 32.6) },
  L3: { kind: 'canine', w: 5.4, wc: 3.6, top: 0.8, roots: one(11, 34.6) },
  L4: { kind: 'premolar', w: 5.2, wc: 3.6, top: 1.4, roots: one(11, 33) },
  L5: { kind: 'premolar', w: 5.6, wc: 3.8, top: 1.7, roots: one(11.2, 33.3) },
  L6: { kind: 'molar3', w: 9.4, wc: 6.8, top: 2, roots: two([5.6, 32], [16.2, 32.6], [11.4, 19]) },
  L7: { kind: 'molar2', w: 8.8, wc: 6.4, top: 2.2, roots: two([7, 31.4], [15.6, 32], [11.4, 21]) },
  L8: { kind: 'molar2', w: 8, wc: 6, top: 2.6, roots: two([8.8, 29], [13.8, 29.4], [11.3, 24.5], 0.9) },
};
const BABY: Record<string, Spec> = {
  U1: { kind: 'incisor', w: 5.6, wc: 3.4, top: 3, roots: { ...one(11.2, 29), ra: 0.8 } },
  U2: { kind: 'incisor', w: 4.4, wc: 2.8, top: 3.6, roots: { ...one(11.2, 28), ra: 0.75 } },
  U3: { kind: 'canine', w: 5, wc: 3.2, top: 2.6, tip: -0.6, roots: { ...one(11, 30.2), ra: 0.8 } },
  U4: { kind: 'molar2', w: 6.4, wc: 4, top: 4, roots: two([4.6, 25.6], [19, 26.2], [11.8, 15.2], 0.7), back: { top: [11.8, 14.5], apex: [12.2, 27.4], half: 1.5 } },
  U5: { kind: 'molar2', w: 7.6, wc: 5, top: 3.4, roots: two([3.8, 26.6], [20, 27.2], [11.8, 15.6], 0.75), back: { top: [11.8, 15], apex: [12, 28.4], half: 1.7 } },
  L1: { kind: 'incisor', w: 3.6, wc: 2.4, top: 3.4, roots: { ...one(11.4, 27.6), ra: 0.7 } },
  L2: { kind: 'incisor', w: 3.9, wc: 2.6, top: 3.2, roots: { ...one(11.3, 28.2), ra: 0.7 } },
  L3: { kind: 'canine', w: 4.6, wc: 3, top: 2.8, roots: { ...one(11, 29.6), ra: 0.75 } },
  L4: { kind: 'molar2', w: 6.6, wc: 4.4, top: 3.8, roots: two([4.2, 26], [19.6, 26.6], [11.8, 15], 0.7) },
  L5: { kind: 'molar3', w: 8.2, wc: 5.4, top: 3.4, roots: two([3.4, 27], [20.6, 27.6], [11.8, 15.4], 0.75) },
};

function build(s: Spec, baby: boolean): ToothPicture {
  const cej = baby ? 12 : 13;
  const e = edgeFor(s.kind, s.w, s.top, s.tip);
  const crown = crownPath({ w: s.w, wc: s.wc, cej, bulge: baby ? 1.5 : 0.5, yD: e.yD, yM: e.yM, edge: e.edge, k: e.k });
  const root = rootPath(cej, s.wc, s.roots);
  const deepest = Math.max(...s.roots.apices.map((a) => a[1]), s.back?.apex[1] ?? 0);
  return {
    crown,
    root,
    back: s.back ? backRoot(s.back.top, s.back.apex, s.back.half, s.roots.ra) : undefined,
    canal: canals(cej, s.roots.apices, s.back?.apex),
    post: post(cej, deepest - 1, baby ? 2 : Math.min(2.8, s.wc - 0.6), baby ? 1.1 : 1.5),
  };
}

/** The kind of picture for a tooth: 'U6', 'L3', 'BU4' … (upper or lower, baby or not, its place from the midline). */
export function pictureKey(fdi: number): string {
  const q = Math.floor(fdi / 10);
  const pos = fdi % 10;
  const baby = q >= 5;
  const upper = q === 1 || q === 2 || q === 5 || q === 6;
  return `${baby ? 'B' : ''}${upper ? 'U' : 'L'}${pos}`;
}

/** Every kind's drawing, keyed as pictureKey() names them (26 kinds). */
export const PICTURES: Record<string, ToothPicture> = Object.fromEntries([
  ...Object.entries(PERMANENT).map(([k, s]) => [k, build(s, false)]),
  ...Object.entries(BABY).map(([k, s]) => [`B${k}`, build(s, true)]),
]);

/** How a quadrant's picture is turned from the drawn one (crown up, mesial right): upper teeth upside down, the
 *  patient's left side mirrored. An SVG transform for the picture's group. */
export function flipFor(fdi: number): string {
  const q = ((Math.floor(fdi / 10) - 1) % 4) + 1;
  const upper = q === 1 || q === 2;
  const mirror = q === 2 || q === 3;
  return `matrix(${mirror ? -1 : 1},0,0,${upper ? -1 : 1},${mirror ? PIC_W : 0},${upper ? PIC_H : 0})`;
}

/** Which way an impacted tooth's picture leans so that its crown points toward the midline, after flipFor() has turned
 *  it: clockwise for the upper left and the lower right (quadrants 2 and 4, and 6 and 8), counter-clockwise for the
 *  others. */
export function tiltFor(fdi: number): 'cw' | 'ccw' {
  const q = ((Math.floor(fdi / 10) - 1) % 4) + 1;
  return q === 2 || q === 4 ? 'cw' : 'ccw';
}

// --- the whole mouth, seen from above ------------------------------------------------------------------------------
// Both arches as a dentist reads a chart: the patient's right on the viewer's left, the upper arch a U opening downward
// over the lower arch, a U opening upward; each tooth a rounded outline along its arch, as wide (along the arch) and
// as deep (cheek to tongue) as an average tooth of its kind, in millimetres. The baby teeth are a smaller arch inside.

/** Average crown sizes (mm): along the arch, and cheek to tongue; by place from the midline, 1 first. */
const SIZES = {
  upper: [[8.5, 7], [6.5, 6], [7.5, 8], [7, 9], [6.5, 9], [10, 11], [9, 11], [8.5, 10]],
  lower: [[5, 6], [5.5, 6], [7, 7.5], [7, 7.5], [7, 8], [11, 10.5], [10.5, 10], [10, 9.5]],
  babyUpper: [[6.5, 5], [5.1, 4.8], [7, 7], [7.3, 8.5], [8.2, 10]],
  babyLower: [[4.2, 4], [4.1, 4], [5, 5], [7.7, 7], [9.9, 8.7]],
} as const;
const GAP_MM = 0.7;

/** A tooth on the map: its centre (x, y), its size along and across the arch, its corner's rounding and its turn, and
 *  the corner it is drawn from before turning (x0, y0), rounded here so the page carries short numbers. */
export interface MapTooth { fdi: number; x: number; y: number; x0: number; y0: number; w: number; h: number; rx: number; angle: number }

/** Teeth along one half-ellipse arch. `down` true: the upper arch (front at the top). Fixed `scale` (units per mm), or
 *  fit the eight teeth to `endAngle` and return the scale used. */
function arch(cx: number, cy: number, rx: number, ry: number, down: boolean, sizes: readonly (readonly [number, number])[], quads: [number, number], opts: { scale?: number; endAngle?: number }) {
  // Arc length along the ellipse from the front (t = 0) out to each side.
  const N = 800, tMax = Math.PI * 0.7;
  const ts: number[] = [], ls: number[] = [0];
  const at = (t: number): Pt => [rx * Math.sin(t), ry * Math.cos(t)];
  for (let i = 0; i <= N; i++) ts.push((tMax * i) / N);
  for (let i = 1; i <= N; i++) {
    const [a, b] = [at(ts[i - 1]), at(ts[i])];
    ls.push(ls[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const tAt = (len: number) => {
    let i = ls.findIndex((l) => l >= len);
    if (i < 0) i = N;
    if (i === 0) return 0;
    const f = (len - ls[i - 1]) / (ls[i] - ls[i - 1] || 1);
    return ts[i - 1] + f * (ts[i] - ts[i - 1]);
  };
  const totalMm = sizes.reduce((s, [w]) => s + w, 0) + GAP_MM * sizes.length;
  const scale = opts.scale ?? ls[Math.round((N * (opts.endAngle ?? 1.6)) / tMax)] / totalMm;
  const teeth: MapTooth[] = [];
  for (const [side, q] of [[-1, quads[0]], [1, quads[1]]] as const) {
    let s = (GAP_MM / 2) * scale;
    sizes.forEach(([w, h], i) => {
      const mid = s + (w * scale) / 2;
      s += (w + GAP_MM) * scale;
      const t = tAt(mid);
      const [ex, ey] = at(t);
      // Tangent along the arch (dx/dt, dy/dt), as it runs away from the front on this side.
      const dx = side * rx * Math.cos(t);
      const dy = (down ? 1 : -1) * ry * Math.sin(t);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + (side < 0 ? 180 : 0);
      const ww = w * scale, hh = h * scale;
      const kind = i + 1;
      const x = cx + side * ex, y = down ? cy - ey : cy + ey;
      teeth.push({
        fdi: q * 10 + kind,
        x: r(x), y: r(y), x0: r(x - ww / 2), y0: r(y - hh / 2), w: r(ww), h: r(hh),
        // Incisors are a thin rounded sliver from above, molars a rounded square.
        rx: r(Math.min(ww, hh) * (sizes.length === 5 ? (kind <= 2 ? 0.5 : 0.4) : kind <= 2 ? 0.5 : kind === 3 ? 0.45 : 0.36)),
        angle: r(angle),
      });
    });
  }
  return { teeth, scale };
}

function mouthMap() {
  // Half-ellipses ended well before their widest point, so the molars run back and apart as a real arch's do.
  // The upper arch's front at the top, the lower's at the bottom, their last molars 14 units apart.
  const up = arch(100, 94, 66, 84, true, SIZES.upper, [1, 2], { endAngle: 1.22 });
  const low = arch(100, 51.6, 62, 80, false, SIZES.lower, [4, 3], { endAngle: 1.22 });
  const babyUp = arch(100, 84, 36, 58, true, SIZES.babyUpper, [5, 6], { scale: up.scale });
  const babyLow = arch(100, 61.6, 33, 54, false, SIZES.babyLower, [8, 7], { scale: low.scale });
  const all = [...up.teeth, ...low.teeth];
  const pad = 2;
  // The box the permanent teeth need (a tooth's corners, turned), so the map is no taller than it must be.
  const corners = (list: MapTooth[]) => list.flatMap((t) => {
    const a = (t.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([i, j]): Pt => [t.x + (i * t.w * c) / 2 - (j * t.h * s) / 2, t.y + (i * t.w * s) / 2 + (j * t.h * c) / 2]);
  });
  const xs = corners(all).map((c) => c[0]), ys = corners(all).map((c) => c[1]);
  const box = { x: r(Math.min(...xs) - pad), y: r(Math.min(...ys) - pad), w: r(Math.max(...xs) - Math.min(...xs) + 2 * pad), h: r(Math.max(...ys) - Math.min(...ys) + 2 * pad) };
  // The band between the two arches' last molars, as a share of the box's height: where "Right" and "Left" stand.
  const upperEnd = Math.max(...corners(up.teeth).map((c) => c[1]));
  const lowerEnd = Math.min(...corners(low.teeth).map((c) => c[1]));
  const band = r((((upperEnd + lowerEnd) / 2 - box.y) / box.h) * 100);
  return { permanent: all, primary: [...babyUp.teeth, ...babyLow.teeth], box, band };
}

/** The map, worked out once: it never changes. */
export const MOUTH = mouthMap();
