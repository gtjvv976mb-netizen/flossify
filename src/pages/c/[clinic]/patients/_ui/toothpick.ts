// The tooth picker's behaviour (browser only): ToothPick.astro draws the tiles, this wires them.
//
//   - Baby teeth: the group is hidden (the hidden ATTRIBUTE) unless it holds a checked tooth or the typed box names
//     one; the toggle shows and hides it. With scripts off the group is simply shown and the toggle stays hidden.
//   - The typed box and the tiles: typing unticks the tiles and ticks the one (or, for notes, the ones) it names;
//     51–85 opens Baby teeth. A change the PERSON makes on any radio, the pill included, empties the typed box; a
//     tile the typed box ticked does not (a script's `checked = true` fires no change event).
//   - O and I: on an anterior tooth (units 1–3) the occlusal toggle reads I and posts I, as the chart's own
//     occlusalCode does.
//   - Surfaces touched by hand: a person's click on a surface marks the picker (data-tp-surfaces-touched), so a
//     suggestion carried over from the chart never overrides it.
//   - Every change is announced as 'tp:change' (bubbles; detail { teeth, surfaces }).

const FDI = new Set([
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => q * 10 + n)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((n) => q * 10 + n)),
]);
const isBaby = (n: number) => n >= 51;
const occlusalCode = (fdi: number) => (fdi % 10 <= 3 ? 'I' : 'O');
/** "16 17", "16,17" → FDI numbers, in order, no repeats (the server's teethFrom). */
const teethIn = (s: string) => {
  const out: number[] = [];
  for (const m of s.matchAll(/\d{2}/g)) { const n = Number(m[0]); if (FDI.has(n) && !out.includes(n)) out.push(n); }
  return out;
};

const tiles = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('[data-tp-set] input')];
const pill = (root: HTMLElement) => root.querySelector<HTMLInputElement>('.tp-none input');
const typedBox = (root: HTMLElement) => root.querySelector<HTMLInputElement>('[data-tp-typed]');
const surfaceInputs = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('[data-tp-surfaces] input')];
const multiple = (root: HTMLElement) => 'tpMultiple' in root.dataset;

function babyOpen(root: HTMLElement, open: boolean) {
  const group = root.querySelector<HTMLElement>('[data-tp-baby]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-tp-baby-toggle]');
  if (group) group.hidden = !open;
  toggle?.setAttribute('aria-expanded', String(open));
}

/** The occlusal toggle follows the picked tooth: I on an anterior, O otherwise (face and posted value). */
function relabel(root: HTMLElement) {
  const o = root.querySelector<HTMLInputElement>('[data-tp-occlusal]');
  if (!o || multiple(root)) return;
  const t = readTeeth(root)[0];
  const code = t ? occlusalCode(t) : 'O';
  o.value = code;
  const face = o.nextElementSibling;
  if (face) face.textContent = code;
  const word = face?.nextElementSibling;
  if (word) word.textContent = code === 'I' ? 'Incisal' : 'Occlusal';
}

function announce(root: HTMLElement) {
  relabel(root);
  root.dispatchEvent(new CustomEvent('tp:change', { bubbles: true, detail: { teeth: readTeeth(root), surfaces: readSurfaces(root) } }));
}

/** The teeth picked: for one tooth, the typed box when it names a valid one, else the ticked tile; for notes,
 *  every ticked tile and every valid typed number. */
export function readTeeth(root: HTMLElement): number[] {
  const typed = teethIn(typedBox(root)?.value ?? '');
  const ticked = tiles(root).filter((i) => i.checked && i.value).map((i) => Number(i.value));
  if (!multiple(root)) return typed.length ? [typed[0]] : ticked.slice(0, 1);
  return [...new Set([...ticked, ...typed])];
}

/** The surfaces ticked, in the row's order (M, O or I, D, B, L). */
export function readSurfaces(root: HTMLElement): string {
  return surfaceInputs(root).filter((i) => i.checked).map((i) => i.value).join('');
}

/** Ticks those tiles (the first only, for one tooth; none → the pill), opens Baby teeth when one is a baby tooth,
 *  and empties the typed box. */
export function setTeeth(root: HTMLElement, fdis: number[]): void {
  const want = new Set(multiple(root) ? fdis : fdis.slice(0, 1));
  tiles(root).forEach((i) => { i.checked = !!i.value && want.has(Number(i.value)); });
  const p = pill(root);
  if (p) p.checked = want.size === 0;
  const box = typedBox(root);
  if (box) box.value = '';
  if ([...want].some(isBaby)) babyOpen(root, true);
  announce(root);
}

/** Ticks the surfaces named ("MO", "MI"; O and I are the same toggle). Not a change by hand. */
export function setSurfaces(root: HTMLElement, letters: string): void {
  const up = letters.toUpperCase();
  surfaceInputs(root).forEach((i) => {
    i.checked = 'tpOcclusal' in i.dataset ? /[OI]/.test(up) : up.includes(i.value);
  });
  announce(root);
}

export function initToothPick(root: HTMLElement): void {
  const toggle = root.querySelector<HTMLButtonElement>('[data-tp-baby-toggle]');
  const group = root.querySelector<HTMLElement>('[data-tp-baby]');
  const box = typedBox(root);
  const holdsBaby = tiles(root).some((i) => i.checked && isBaby(Number(i.value))) || teethIn(box?.value ?? '').some(isBaby);
  babyOpen(root, holdsBaby);
  if (toggle && group) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => babyOpen(root, group.hidden));
  }
  // A tile or the pill chosen by the person: the typed box empties (its number is no longer what is meant).
  tiles(root).concat(pill(root) ? [pill(root)!] : []).forEach((i) => i.addEventListener('change', () => {
    if (!multiple(root) && box) box.value = '';
    announce(root);
  }));
  box?.addEventListener('input', () => {
    const typed = teethIn(box.value);
    const want = new Set(multiple(root) ? typed : typed.slice(0, 1));
    tiles(root).forEach((i) => { i.checked = !!i.value && want.has(Number(i.value)); });
    const p = pill(root);
    if (p) p.checked = want.size === 0;
    if ([...want].some(isBaby)) babyOpen(root, true);
    announce(root);
  });
  surfaceInputs(root).forEach((i) => i.addEventListener('change', () => {
    root.dataset.tpSurfacesTouched = '';
    announce(root);
  }));
  relabel(root);
}
